/**
 * EKAM SWARM - Engine
 * 
 * Core swarm execution — runs multiple specialist agents in parallel
 * and synthesizes their insights via SiliconFlow.
 * 
 * Architecture:
 *   - CORE (gpt-oss-120b): Orchestrator + all text specialists
 *   - LITE (Llama 8B): Express Lane, Environment
 *   - DERM (Qwen VL 7B): Default dermatologist (vision)
 *   - DERM_ESCALATION (GLM-4.5V): Heavy derm only on escalation
 */

import * as logger from '../utils/logger';
import { chatCompletion, chatCompletionWithRetry, buildVisionMessage, ChatMessage } from '../utils/siliconflow';
import { getCurrentWeather, formatWeatherForContext } from '../utils/weather';
import { AGENT_TIERS, AI_CONFIG } from '../config/ai_config';
import { AGENT_PROMPTS } from './agents';
import { classifyAndRoute } from './router';
import {
    AgentKey,
    AgentResult,
    SwarmResult,
    UserProfile,
    UserLocation
} from './types';
import { ModelTier } from '../config/ai_config';

// Progress callback type for live thinking stream
export type ProgressCallback = (update: {
    phase: 'routing' | 'brainstorming' | 'peer_review' | 'synthesizing';
    agents?: Record<string, { status: 'thinking' | 'done'; snippet?: string }>;
    selectedAgents?: string[];
}) => Promise<void>;

/**
 * Format user profile into a context string for agents
 */
export function formatProfileContext(profile?: UserProfile): string {
    if (!profile) return '';

    const parts: string[] = [];
    if (profile.gender) parts.push(`Gender: ${profile.gender}`);
    if (profile.age) {
        parts.push(`Age: ${profile.age}`);
    } else if (profile.dateOfBirth) {
        parts.push(`Date of Birth: ${profile.dateOfBirth}`);
        // Calculate exact age dynamically
        const dob = new Date(profile.dateOfBirth);
        if (!isNaN(dob.getTime())) {
            const now = new Date();
            let years = now.getFullYear() - dob.getFullYear();
            let months = now.getMonth() - dob.getMonth();
            let days = now.getDate() - dob.getDate();

            if (days < 0) {
                months--;
                days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
            }
            if (months < 0) {
                years--;
                months += 12;
            }

            parts.push(`Current Date (System Context): ${now.toISOString().split('T')[0]}`);
            parts.push(`Exact Calculated Age: ${years} years, ${months} months, and ${days} days`);
        }
    }
    if (profile.height) parts.push(`Height: ${profile.height}cm`);
    if (profile.weight) parts.push(`Weight: ${profile.weight}kg`);
    if (profile.diet) parts.push(`Diet: ${profile.diet}`);
    if (profile.skinType) parts.push(`Skin Type: ${profile.skinType}`);
    if (profile.hairType) parts.push(`Hair Type: ${profile.hairType}`);
    if (profile.allergies) parts.push(`Allergies: ${profile.allergies}`);
    if (profile.conditions) parts.push(`Known Conditions: ${profile.conditions}`);
    if (profile.medications) parts.push(`Medications: ${profile.medications}`);
    if (profile.goals) parts.push(`Health Goals: ${profile.goals}`);

    // Dynamic Clinical Memory (Akasha Context Layer)
    const standardKeys = ['gender', 'dateOfBirth', 'height', 'weight', 'diet', 'skinType', 'hairType', 'allergies', 'conditions', 'medications', 'goals'];
    const dynamicFacts: string[] = [];

    Object.entries(profile).forEach(([key, value]) => {
        if (!standardKeys.includes(key) && typeof value === 'string' && value.trim().length > 0) {
            const readableKey = key.replace(/([A-Z])/g, ' $1').trim();
            const formattedKey = readableKey.charAt(0).toUpperCase() + readableKey.slice(1);
            dynamicFacts.push(`- **${formattedKey}:** ${value}`);
        }
    });

    if (dynamicFacts.length > 0) {
        parts.push('\n**CLINICAL MEMORY & FACTS:**');
        parts.push(...dynamicFacts);
    }

    return parts.length > 0 ? `**User Profile:**\n${parts.join('\n')}` : '';
}

// ============================================================================
// AGENT RUNNER
// ============================================================================

/**
 * Run a single specialist agent
 */
async function runAgent(
    agentKey: AgentKey,
    userMessage: string,
    userContext?: string,
    location?: UserLocation,
    imageBase64?: string,
    imageMimeType?: string,
    peerContext?: string,
    attachments?: { fileUri: string; mimeType: string }[],
    godMode?: boolean
): Promise<AgentResult> {
    const systemInstruction = AGENT_PROMPTS[agentKey];

    // Determine tier: God Mode forces CORE on everything except environment
    let tier: ModelTier;
    if (agentKey === 'dermatologist') {
        tier = 'DERM'; // Vision model for derm
    } else if (godMode && agentKey !== 'environment') {
        tier = 'CORE';
    } else {
        tier = AGENT_TIERS[agentKey] || 'CORE';
    }

    const usedModelId = AI_CONFIG.models[tier];

    // Pre-fetch Weather Data if applicable
    let weatherContext = '';
    if (agentKey === 'environment' && location) {
        try {
            const weatherData = await getCurrentWeather(`${location.lat},${location.lng}`);
            weatherContext = formatWeatherForContext(weatherData);
        } catch (e) {
            logger.error('[Engine] Failed to fetch weather:', e);
            weatherContext = "Weather data unavailable due to error.";
        }
    }

    // Build prompt text
    const promptText = `
**User Query:** ${userMessage}

${userContext || ''}
${location && agentKey === 'environment' ? `**USER CURRENT LOCATION:** Latitude: ${location.lat}, Longitude: ${location.lng}\n\n${weatherContext}` : ''}

${peerContext ? `
---
**IMPORTANT: ROUND TABLE REVIEW PHASE**
Your colleagues have provided their initial thoughts. Review them below and REFINE your analysis.
Did you miss anything? Do you agree with their findings?
    
**COLLEAGUE INSIGHTS:**
${peerContext}
---
` : ''}

---

## YOUR TASK: COMPREHENSIVE SPECIALIST ANALYSIS
${peerContext ? '(REFINED BASED ON COLLEAGUE INPUT)' : ''}

### STEP 1 - DEEP OBSERVATION
Carefully identify ALL relevant symptoms, patterns, and clues.

### STEP 2 - ACTIONABLE INSIGHTS (VALUE FIRST)
Based on what you see, what is the underlying issue or root cause?
What should they DO right now? Provide specific advice.

### STEP 3 - CROSS-DOMAIN CONNECTIONS
${peerContext ? '**CRITICAL:** specifically reference your colleagues findings.' : 'Consider the bigger picture.'}

### STEP 4 - REFINEMENT (OPTIONAL)
State your working hypothesis.
Reference specific missing data ONLY if it blocks safety or critical advice.
Limit to 1 question MAX.

---

**Remember:** Think like you're presenting at a case conference. Be thorough but clear.
`;

    // Token limits
    const agentTokens = agentKey === 'environment' ? 2000 : 2000;

    try {
        logger.info(`[Agent] Trying ${agentKey} with Tier ${tier} (${usedModelId})...`);

        // Build user messages
        let messages: ChatMessage[];
        if (imageBase64 && imageMimeType && agentKey !== 'environment') {
            // Vision message for image-capable agents
            messages = [buildVisionMessage(promptText, imageBase64, imageMimeType)];
        } else {
            messages = [{ role: 'user', content: promptText }];
        }

        const result = await chatCompletionWithRetry({
            tier,
            systemInstruction,
            messages,
            maxTokens: agentTokens,
            temperature: 1,
        });

        if (!result.text) throw new Error('Empty response');

        logger.info(`[Agent] ${agentKey} completed analysis`);
        if (result.usage) {
            logger.info(`[Agent] ${agentKey} Token Usage:`, JSON.stringify(result.usage));
        }

        return { agent: agentKey, note: result.text };

    } catch (error) {
        logger.warn(`[Agent] ${agentKey} primary model (${usedModelId}) failed, falling back to LITE...`);

        try {
            // Fallback to LITE
            const result = await chatCompletionWithRetry({
                tier: 'LITE',
                systemInstruction,
                messages: [{ role: 'user', content: promptText }],
                maxTokens: 3000,
                temperature: 1,
            });

            if (result.text) {
                logger.info(`[Agent] ${agentKey} fallback completed successfully`);
                return { agent: agentKey, note: result.text };
            }
        } catch (fallbackError) {
            logger.error(`[Agent] ${agentKey} fallback also failed:`, fallbackError);
        }

        return { agent: agentKey, note: `[${agentKey} temporarily unavailable]` };
    }
}

// ============================================================================
// TWO-TIER DERMATOLOGY
// ============================================================================

/**
 * Run the Dermatologist with escalation logic:
 * 1. Always run Qwen VL (DERM tier) first
 * 2. If confidence is low or guardian flagged high-risk → escalate to GLM-4.5V
 */
async function runDermatologyPipeline(
    userMessage: string,
    userContext?: string,
    location?: UserLocation,
    imageBase64?: string,
    imageMimeType?: string,
    guardianFlaggedHighRisk?: boolean,
): Promise<AgentResult> {
    // Phase 1: Default Derm (Qwen VL 7B) — cheap, fast
    const phase1Result = await runAgent(
        'dermatologist',
        userMessage,
        userContext,
        location,
        imageBase64,
        imageMimeType,
    );

    // Check if escalation is needed
    const needsEscalation =
        guardianFlaggedHighRisk ||
        phase1Result.note.toLowerCase().includes('unsure') ||
        phase1Result.note.toLowerCase().includes('unclear') ||
        phase1Result.note.toLowerCase().includes('cannot determine') ||
        phase1Result.note.toLowerCase().includes('low confidence') ||
        phase1Result.note.toLowerCase().includes('needs further');

    if (!needsEscalation || !imageBase64) {
        return phase1Result;
    }

    // Phase 2: Escalation Derm (GLM-4.5V) — heavy, SOTA
    logger.info('[Derm] Escalating to GLM-4.5V for deeper analysis...');

    try {
        const escalationPrompt = `
You are the **Senior Dermatology Consultant** at Ekam Health performing an ESCALATED analysis.

A junior colleague has already reviewed this case but was uncertain. Here is their initial assessment:

---
**JUNIOR ASSESSMENT:**
${phase1Result.note}
---

Now perform YOUR independent, deeper analysis. Look for:
1. More specific differential diagnoses
2. Subtle patterns the junior may have missed
3. Cross-reference with patient history (age, location, comorbidities)

Provide your expert clinical note.

**User Query:** ${userMessage}
${userContext || ''}
`;

        const messages = imageBase64 && imageMimeType
            ? [buildVisionMessage(escalationPrompt, imageBase64, imageMimeType)]
            : [{ role: 'user' as const, content: escalationPrompt }];

        const escalationResult = await chatCompletionWithRetry({
            tier: 'DERM_ESCALATION',
            systemInstruction: AGENT_PROMPTS['dermatologist'],
            messages,
            maxTokens: 3000,
            temperature: 0.7,
        });

        if (escalationResult.text) {
            logger.info('[Derm] Escalation completed successfully');
            return {
                agent: 'dermatologist',
                note: `**[ESCALATED ANALYSIS — GLM-4.5V]**\n\n${escalationResult.text}`,
            };
        }
    } catch (error) {
        logger.error('[Derm] Escalation failed, using Phase 1 result:', error);
    }

    // Return Phase 1 result if escalation fails
    return phase1Result;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Run the Orchestrator to synthesize all agent insights into a cohesive response
 */
async function runOrchestrator(
    userMessage: string,
    agentNotes: AgentResult[],
    userContext?: string
): Promise<string> {
    const systemInstruction = AGENT_PROMPTS['orchestrator'];

    // Format agent notes for orchestrator
    const notesFormatted = agentNotes
        .map(n => `**${n.agent.toUpperCase()} ANALYSIS:**\n${n.note}`)
        .join('\n\n---\n\n');

    const promptText = `
**Original User Query:** ${userMessage}

${userContext || ''}

---

**SPECIALIST ANALYSES:**

${notesFormatted}

---

**YOUR SYNTHESIS TASK:**

Based on all the specialist analyses above, create a unified, helpful response for the user. You MUST:

1. **START by answering the user's intent** - The specialists have identified the likely issue. Tell the user what is happening and what to do immediately in a natural, conversational way.

2. **Acknowledge patterns** - Note how different symptoms may be connected across specialties.

3. **Provide PRELIMINARY ADVICE** - Share actionable steps they can take TODAY based on current data. Do not wait for more info.

4. **Keep it conversational** - Don't just list bullet points. Speak naturally and empathetically.

5. **Refinement (Optional)** - Only if absolutely necessary, ask ONE clarifying question at the very end.

### ACTIVE LISTENING & MEMORY UPDATE (CRITICAL)
If the user mentions a NEW medical fact, preference, or update (e.g., "I stopped eating dairy", "I have a new injury on my left knee", "My skin is now dry"), you MUST update their profile.
Append this exact tag at the END of your response (hidden from user):
||PROFILE_UPDATE: {"Category": "Value"}||

Examples:
- User: "I'm vegan now." -> ||PROFILE_UPDATE: {"diet": "Vegan"}||
- User: "I broke my arm." -> ||PROFILE_UPDATE: {"injuryHistory": "Broken Arm (Current)"}||
- User: "I hate pills." -> ||PROFILE_UPDATE: {"medicationPreference": "Avoid pills if possible"}||

Format your response in a warm, professional tone. Start with the INSIGHTS regarding their situation.
`;

    try {
        logger.info(`[Orchestrator] Synthesizing with CORE tier...`);
        const result = await chatCompletionWithRetry({
            tier: 'CORE',
            systemInstruction,
            messages: [{ role: 'user', content: promptText }],
            maxTokens: 3000,
            temperature: 1,
        }, 5, 2000);

        if (result.usage) {
            logger.info(`[Orchestrator] Token Usage:`, JSON.stringify(result.usage));
        }

        return result.text || "I apologize, but I'm having trouble synthesizing the analysis. Please try again.";

    } catch (error) {
        logger.warn(`[Orchestrator] Primary Tier failed, falling back to LITE...`);

        try {
            const result = await chatCompletionWithRetry({
                tier: 'LITE',
                systemInstruction,
                messages: [{ role: 'user', content: promptText }],
                maxTokens: 4096,
                temperature: 1,
            }, 3, 1000);

            if (result.text) {
                logger.info('[Orchestrator] Fallback completed successfully');
                return result.text;
            }
        } catch (fallbackError) {
            logger.error('[Orchestrator] Fallback also failed:', fallbackError);
        }

        return "I apologize, but I encountered an error. Please try your question again.";
    }
}

// ============================================================================
// FILE ANALYST
// ============================================================================

/**
 * File Analyst - Summarizes files for the Router
 */
async function analyzeFiles(attachments: { fileUri: string; mimeType: string }[]): Promise<string> {
    if (!attachments || attachments.length === 0) return "";

    logger.info(`[Engine] Analyzing ${attachments.length} files for routing...`);

    try {
        // Note: SiliconFlow models cannot access gs:// URIs directly.
        // File analysis now relies on text context passed from Firestore metadata.
        const fileList = attachments.map(a => `- ${a.fileUri} (${a.mimeType})`).join('\n');

        const result = await chatCompletion({
            tier: 'LITE',
            systemInstruction: "You are a Medical File Analyst. Based on the file metadata below, classify the likely document type (Lab Report, ECG, Prescription, Image) and suggest which medical specialists should review it. Output ONLY a 1-2 sentence summary.",
            messages: [{ role: 'user', content: `Files:\n${fileList}` }],
            maxTokens: 512,
            temperature: 0.1,
        });

        logger.info(`[Engine] File Analysis: ${result.text}`);
        return result.text;

    } catch (e) {
        logger.error('[Engine] File analysis failed:', e);
        return "Contains medical attachments.";
    }
}

// ============================================================================
// MAIN SWARM ENGINE
// ============================================================================

/**
 * Run the full Swarm Engine
 */
export async function runSwarm(
    query: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [],
    userProfile?: UserProfile,
    location?: UserLocation,
    imageBase64?: string,
    imageMimeType?: string,
    chatHistorySummary?: string,
    mode: 'SIMPLE' | 'CRITICAL' = 'CRITICAL',
    attachments?: { fileUri: string; mimeType: string }[],
    onProgress?: ProgressCallback,
    godMode?: boolean
): Promise<SwarmResult> {

    // Safe progress helper
    const reportProgress = async (update: Parameters<ProgressCallback>[0]) => {
        if (!onProgress) return;
        try { await onProgress(update); } catch (e) { logger.warn('[Swarm] Progress write failed:', e); }
    };

    // ------------------------------------------------------------------
    // LANE 1: SIMPLE / EXPRESS (LITE — High Speed, Context Aware)
    // ------------------------------------------------------------------
    if (mode === 'SIMPLE') {
        let simpleContext = formatProfileContext(userProfile);

        if (userProfile?.dateOfBirth && !simpleContext.includes('Date of Birth')) {
            simpleContext += `\nDate of Birth: ${userProfile.dateOfBirth}`;
        }

        if (location) {
            simpleContext += `\n\n**USER LOCATION:** Latitude: ${location.lat}, Longitude: ${location.lng}`;
        }

        const expressPrompt = `
        You are Ekam, a helpful and friendly health assistant.
        The user has asked a simple question.
        
        **USER PROFILE CONTEXT:**
        ${simpleContext}

        **INSTRUCTIONS:**
        - Answer concisely, warmly, and directly.
        - Use the user's profile data (Age, Weight, Location, etc.) if asked.
        - Do NOT analyze symptoms in depth (defer to Critical mode for that).
        - If the user asks "What is my age?", calculate it from Date of Birth or state it directly.
        
        User Query: ${query}
        `;

        // Convert history to SiliconFlow format
        const chatHistory: ChatMessage[] = history.map(h => ({
            role: h.role === 'user' ? 'user' as const : 'assistant' as const,
            content: h.parts.map(p => p.text).join('\n'),
        }));

        try {
            const result = await chatCompletion({
                tier: 'LITE',
                messages: [...chatHistory, { role: 'user', content: expressPrompt }],
            });

            return {
                response: result.text || "I'm here to help!",
                agentNotes: [],
                symptoms: [],
                consultations: [],
                usedCouncil: false
            };
        } catch (e) {
            console.error('[Ekam Express] Failed, falling back to Swarm:', e);
        }
    }

    // ------------------------------------------------------------------
    // LANE 2: CRITICAL / COUNCIL (CORE — Deep Reasoning + Round Table)
    // ------------------------------------------------------------------
    logger.info('[Ekam] Starting Swarm Execution (Critical Lane)...');

    // 1. BUILD CONTEXT
    let contextString = formatProfileContext(userProfile);
    if (location) {
        contextString += `\n\n**USER LOCATION:** Latitude: ${location.lat}, Longitude: ${location.lng}`;
    }
    if (chatHistorySummary) {
        contextString += `\n\n**Previous Conversation Context:**\n${chatHistorySummary}`;
    }

    // 2. UNIFIED CLASSIFY + ROUTE (Single AI call)
    if (onProgress) await onProgress({ phase: 'routing' });

    // 2a. FILE ANALYSIS (If attachments exist)
    let fileAnalysis = "";
    if (attachments && attachments.length > 0) {
        fileAnalysis = await analyzeFiles(attachments);
    }

    // Single call: classifies AND picks agents
    const routeResult = await classifyAndRoute(query, imageBase64, imageMimeType, fileAnalysis);

    // If the unified router says SIMPLE, redirect to Express Lane
    if (routeResult.type === 'SIMPLE') {
        logger.info('[Engine] Unified router classified as SIMPLE → Express Lane');

        let simpleContext = formatProfileContext(userProfile);
        if (location) {
            simpleContext += `\n\n**USER LOCATION:** Latitude: ${location.lat}, Longitude: ${location.lng}`;
        }

        const expressPrompt = `
        You are Ekam, a helpful and friendly health assistant.
        The user has asked a simple question.
        
        **USER PROFILE CONTEXT:**
        ${simpleContext}

        **INSTRUCTIONS:**
        - Answer concisely, warmly, and directly.
        - Use the user's profile data (Age, Weight, Location, etc.) if asked.
        - Do NOT analyze symptoms in depth (defer to Critical mode for that).
        - If the user asks "What is my age?", calculate it from Date of Birth or state it directly.
        
        User Query: ${query}
        `;

        const chatHistory: ChatMessage[] = history.map(h => ({
            role: h.role === 'user' ? 'user' as const : 'assistant' as const,
            content: h.parts.map(p => p.text).join('\n'),
        }));

        try {
            const result = await chatCompletion({
                tier: 'LITE',
                messages: [...chatHistory, { role: 'user', content: expressPrompt }],
            });

            return {
                response: result.text || "I'm here to help!",
                agentNotes: [],
                symptoms: [],
                consultations: [],
                usedCouncil: false
            };
        } catch (e) {
            logger.error('[Engine] Express Lane failed after unified routing, continuing to Council:', e);
        }
    }

    // CRITICAL path: use the agents from the unified router
    const selectedAgents = routeResult.agents || ['environment', 'orchestrator', 'guardian'];

    logger.info(`[Engine] Routed to: ${selectedAgents.join(', ')}`);

    // Report routing progress
    const agentProgress: Record<string, { status: 'thinking' | 'done'; snippet?: string }> = {};
    selectedAgents.forEach(a => { agentProgress[a] = { status: 'thinking' }; });

    if (onProgress) await onProgress({
        phase: 'routing',
        selectedAgents,
        agents: { ...agentProgress }
    });

    // 3. RUN AGENTS IN PARALLEL (PHASE 1 - BRAINSTORM)
    logger.info('[Swarm] Starting Phase 1: Brainstorming...');
    await reportProgress({ phase: 'brainstorming', selectedAgents, agents: { ...agentProgress } });

    const phase1Promises = selectedAgents.map(agent => {
        let promise: Promise<AgentResult>;

        if (agent === 'dermatologist') {
            // Use 2-tier derm pipeline
            promise = runDermatologyPipeline(
                query,
                contextString,
                location,
                imageBase64,
                imageMimeType,
                false, // Guardian hasn't run yet — will be checked post-hoc
            );
        } else {
            promise = runAgent(
                agent,
                query,
                contextString,
                location,
                agent !== 'environment' ? imageBase64 : undefined,
                agent !== 'environment' ? imageMimeType : undefined,
                undefined,
                attachments,
                godMode
            );
        }

        // Track individual agent completion for live progress
        promise.then(result => {
            const snippet = result.note.substring(0, 120).replace(/\n/g, ' ').trim();
            agentProgress[agent] = { status: 'done', snippet: snippet + '...' };
            reportProgress({ phase: 'brainstorming', selectedAgents, agents: { ...agentProgress } });
        }).catch(() => { });
        return promise;
    });

    const phase1Results = await Promise.all(phase1Promises);
    const finalAgentNotes = phase1Results.filter(r => !r.note.includes('unavailable') && !r.note.includes('error'));
    logger.info(`[Swarm] Phase 1: ${finalAgentNotes.length}/${phase1Promises.length} agents responded`);

    // 5. ORCHESTRATOR SYNTHESIZES
    let finalResponse: string;

    if (finalAgentNotes.length === 0) {
        // EMERGENCY FALLBACK
        const emergencyKeywords = ['breathing', 'choking', 'chest pain', 'unconscious', 'bleeding', 'swelling', 'lips', 'throat', 'allergic', 'emergency', 'dizzy'];
        const isEmergency = emergencyKeywords.some(k => query.toLowerCase().includes(k));

        if (isEmergency) {
            finalResponse = "⚠️ **EMERGENCY ADVICE:** Based on your symptoms (difficulty breathing, swelling), this could be a severe allergic reaction (anaphylaxis) or another serious medical emergency. \n\n**PLEASE CALL EMERGENCY SERVICES (911 OR YOUR LOCAL EQUIVALENT) IMMEDIATELY.** \n\nDo not wait. Do not attempt to treat this yourself with home remedies until you have spoken with emergency responders.";
        } else {
            finalResponse = "I apologize, but I'm having technical difficulties right now. Please try again in a moment, or rephrase your question.";
        }
    } else {
        // Synthesize the FINAL notes
        try {
            await reportProgress({ phase: 'synthesizing', selectedAgents, agents: { ...agentProgress } });
            finalResponse = await runOrchestrator(query, finalAgentNotes, contextString);
        } catch (orchError) {
            logger.error('[Swarm] Critical Orchestrator Failure:', orchError);
            finalResponse = "I apologize, but I encountered an unexpected error while finalizing your answer. Please try again.";
        }
    }

    logger.info(`[Swarm] Execution Complete.`);

    return {
        response: finalResponse,
        agentNotes: finalAgentNotes.map(r => ({ agent: r.agent, note: r.note })),
        symptoms: [],
        consultations: [],
        usedCouncil: true
    };
}
