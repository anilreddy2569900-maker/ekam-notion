/**
 * EKAM SWARM - Engine
 * 
 * Core swarm execution - simplified for reliability
 * Runs multiple specialist agents in parallel and synthesizes their insights
 */

import { GenerativeModel, GenerateContentRequest, GenerateContentResult, Part } from '@google-cloud/vertexai';
import * as logger from 'firebase-functions/logger';
import { getGenerativeModel, getThinkingConfig } from '../utils/vertexai';
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

// ============================================================================
// GLOBAL CONCURRENCY CONTROL — SCALABILITY
// Limits total simultaneous Vertex AI API calls across ALL requests.
// Prevents RESOURCE_EXHAUSTED (429) under heavy load.
// ============================================================================
const MAX_CONCURRENT_AI_CALLS = 50; // Tune based on your Vertex AI quota
let activeAICalls = 0;
const aiCallQueue: Array<{ resolve: () => void }> = [];

async function acquireAISlot(): Promise<void> {
    if (activeAICalls < MAX_CONCURRENT_AI_CALLS) {
        activeAICalls++;
        return;
    }
    // Wait in queue until a slot opens
    return new Promise<void>((resolve) => {
        aiCallQueue.push({ resolve });
    });
}

function releaseAISlot(): void {
    activeAICalls--;
    if (aiCallQueue.length > 0 && activeAICalls < MAX_CONCURRENT_AI_CALLS) {
        const next = aiCallQueue.shift();
        if (next) {
            activeAICalls++;
            next.resolve();
        }
    }
}

// Progress callback type for live thinking stream
export type ProgressCallback = (update: {
    phase: 'routing' | 'brainstorming' | 'peer_review' | 'synthesizing';
    agents?: Record<string, { status: 'thinking' | 'done'; snippet?: string }>;
    selectedAgents?: string[];
}) => Promise<void>;

// Weather data is now handled by Google Search grounding in the environment agent

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
                // Get days in previous month
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
            // Format key from camelCase to Title Case (e.g., 'injuryHistory' -> 'Injury History')
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

/**
 * Circuit Breaker state — fast-fails when Vertex AI is overwhelmed
 */
let circuitBreakerFailures = 0;
let circuitBreakerResetTime = 0;
const CIRCUIT_BREAKER_THRESHOLD = 5; // After 5 consecutive 429s, open circuit
const CIRCUIT_BREAKER_COOLDOWN_MS = 15000; // Wait 15s before retrying

/**
 * Retry wrapper for Vertex AI generation with global concurrency control
 * - Acquires a concurrency slot before calling Vertex AI
 * - Uses circuit breaker to fast-fail when API is overwhelmed
 * - Shorter retry delays to minimize idle billing time
 */
async function generateWithRetry(model: GenerativeModel, request: GenerateContentRequest, maxRetries = 3, initialDelay = 500): Promise<GenerateContentResult> {
    // Circuit breaker check — fast-fail if API is overwhelmed
    if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        if (Date.now() < circuitBreakerResetTime) {
            throw new Error(`[CircuitBreaker] Vertex AI overwhelmed. Fast-failing. Retry after ${Math.ceil((circuitBreakerResetTime - Date.now()) / 1000)}s.`);
        }
        // Cooldown elapsed — reset and try again
        circuitBreakerFailures = 0;
        logger.info('[CircuitBreaker] Cooldown elapsed, resetting circuit breaker.');
    }

    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        // Acquire global concurrency slot (waits if at capacity)
        await acquireAISlot();
        try {
            const result = await model.generateContent(request);

            // Check for safety filter blocks (FinishReason.SAFETY)
            const candidate = result.response.candidates?.[0];
            if (candidate?.finishReason === 'SAFETY') {
                const ratings = candidate.safetyRatings?.map((r: any) => `${r.category}: ${r.probability}`).join(', ');
                logger.warn(`[Engine] Safety block detected. Reason: SAFETY. Ratings: ${ratings}`);
                throw new Error('SAFETY_BLOCK');
            }

            // Success — reset circuit breaker
            circuitBreakerFailures = 0;
            return result;
        } catch (error: any) {
            lastError = error;

            // Handle safety blocks as specific errors
            if (error.message === 'SAFETY_BLOCK') {
                throw error; // Propagate safety blocks immediately
            }

            // Check for 429 Resource exhausted
            if (error.code === 429 || error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes('429')) {
                circuitBreakerFailures++;
                circuitBreakerResetTime = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
                logger.warn(`[Engine] Rate limit hit (${circuitBreakerFailures}/${CIRCUIT_BREAKER_THRESHOLD}). Retrying in ${initialDelay * Math.pow(2, i)}ms...`);
                await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, i)));
                continue;
            }
            throw error; // Rethrow other errors
        } finally {
            releaseAISlot(); // Always release the slot
        }
    }
    throw lastError;
}

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
    peerContext?: string, // Context from other agents for Phase 2
    attachments?: { fileUri: string; mimeType: string }[], // Multimodal Files
    godMode?: boolean // When true: override to PRO tier + medium thinking
): Promise<AgentResult> {
    const systemInstruction = AGENT_PROMPTS[agentKey];

    // God Mode: force all agents to PRO tier (except environment stays FLASH for speed)
    const tier = godMode && agentKey !== 'environment'
        ? 'PRO'
        : (AGENT_TIERS[agentKey] || 'FLASH');

    let model: GenerativeModel;

    if (agentKey === 'environment') {
        model = getGenerativeModel({
            systemInstruction,
            tier: 'FLASH', // Environment is always Flash
        });
    } else {
        model = getGenerativeModel({
            systemInstruction,
            tier,
        });
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

    // Build prompt text with enhanced deep thinking prompt
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
${peerContext ? '**CRITICAL:** specificially reference your colleagues findings.' : 'Consider the bigger picture.'}

### STEP 4 - REFINEMENT (OPTIONAL)
State your working hypothesis.
Reference specific missing data ONLY if it blocks safety or critical advice.
Limit to 1 question MAX.

---

**Remember:** Think like you're presenting at a case conference. Be thorough but clear.
`;

    // Build request content
    const parts: Part[] = [{ text: promptText }];

    // Add image if provided (Legacy/Direct Image)
    if (imageBase64 && imageMimeType) {
        parts.push({
            inlineData: {
                data: imageBase64,
                mimeType: imageMimeType
            }
        });
        logger.info(`[Agent] Image attached for ${agentKey}`);
    }

    // Add Attachments (Smart Selection)
    if (attachments && attachments.length > 0) {
        attachments.forEach(file => {
            parts.push({
                fileData: {
                    fileUri: file.fileUri,
                    mimeType: file.mimeType
                }
            });
        });
        logger.info(`[Agent] ${agentKey} received ${attachments.length} vault files.`);
    }

    try {
        logger.info(`[Agent] Trying ${agentKey} with Tier ${tier} (${usedModelId})...`);
        // Opt 4: Reduced token limits — specialists write concise clinical notes (not essays)
        // Orchestrator receives cleaner, more signal-dense input this way.
        const agentTokens = agentKey === 'environment' ? 2000
            : (tier === 'PRO' ? 2000 : 1500);

        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts }],
            generationConfig: {
                maxOutputTokens: agentTokens,
                temperature: 1,
                // Thinking config per agent:
                // - God Mode agents: medium thinking (PRO on all agents)
                // - Dermatologist (PRO): medium thinking
                // - FLASH agents: high thinking
                ...(godMode && agentKey !== 'environment' && agentKey !== 'dermatologist'
                    ? getThinkingConfig('medium')
                    : agentKey === 'dermatologist'
                        ? getThinkingConfig('medium')
                        : tier === 'FLASH' ? getThinkingConfig('high') : {}),
            }
        });

        const response = result.response;
        const textResponse = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!textResponse) throw new Error('Empty response');

        logger.info(`[Agent] ${agentKey} completed analysis`);
        if (result.response?.usageMetadata) {
            logger.info(`[Agent] ${agentKey} Token Usage:`, JSON.stringify(result.response.usageMetadata));
        }

        return { agent: agentKey, note: textResponse };

    } catch (error) {
        logger.warn(`[Agent] ${agentKey} primary model (${usedModelId}) failed, falling back to Gemini 3 Flash...`);

        try {
            // Fallback to Gemini 3 Flash (Global)
            const fallbackModel = getGenerativeModel({ systemInstruction, tier: 'FLASH' });

            const result = await generateWithRetry(fallbackModel, {
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    maxOutputTokens: 3000,
                    temperature: 1,
                }
            });

            const textResponse = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (textResponse) {
                logger.info(`[Agent] ${agentKey} fallback completed successfully`);
                return { agent: agentKey, note: textResponse };
            }
        } catch (fallbackError) {
            logger.error(`[Agent] ${agentKey} fallback also failed:`, fallbackError);
        }

        return { agent: agentKey, note: `[${agentKey} temporarily unavailable]` };
    }
}

/**
 * Run the Orchestrator to synthesize all agent insights into a cohesive response
 */
async function runOrchestrator(
    userMessage: string,
    agentNotes: AgentResult[],
    userContext?: string
): Promise<string> {
    const systemInstruction = AGENT_PROMPTS['orchestrator'];

    // Orchestrator uses PRO + High Thinking for maximum synthesis quality
    const tier = AGENT_TIERS['orchestrator'];
    const model: GenerativeModel = getGenerativeModel({
        systemInstruction,
        tier,
        thinkingLevel: 'high'
    });

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
        logger.info(`[Orchestrator] Trying with Tier ${tier} (PRO + High Thinking)...`);
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: {
                maxOutputTokens: 3000,
                temperature: 1,
                // High thinking: Orchestrator connects all specialist dots, resolves conflicts, and
                // synthesizes a final user-facing answer — this is where depth matters most.
                ...getThinkingConfig('high'),
            }
        }, 5, 2000);

        const response = result.response;

        if (result.response?.usageMetadata) {
            logger.info(`[Orchestrator] Token Usage:`, JSON.stringify(result.response.usageMetadata));
        }

        // Filter out "thought" parts — when includeThoughts is true they appear first and
        // parts[0].text would return the internal monologue instead of the actual answer.
        const allParts = response?.candidates?.[0]?.content?.parts || [];
        const realTextPart = allParts.find((p: any) => !p.thought && p.text);
        return realTextPart?.text ||
            allParts[0]?.text ||
            "I apologize, but I'm having trouble synthesizing the analysis. Please try again.";
    } catch (error) {
        console.warn(`[Orchestrator] Primary Tier failed, falling back to Gemini 3 Flash...`);

        try {
            // Fallback to Gemini 3 Flash (Global)
            const fallbackModel = getGenerativeModel({ systemInstruction, tier: 'FLASH' });
            const result = await generateWithRetry(fallbackModel, {
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
                generationConfig: {
                    maxOutputTokens: 4096,
                    temperature: 1,
                }
            }, 3, 1000);

            const textResponse = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (textResponse) {
                logger.info('[Orchestrator] Fallback completed successfully');
                return textResponse;
            }
        } catch (fallbackError) {
            logger.error('[Orchestrator] Fallback also failed:', fallbackError);
        }

        return "I apologize, but I encountered an error. Please try your question again.";
    }
}

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
    godMode?: boolean // When true: all agents use PRO tier + medium thinking
): Promise<SwarmResult> {

    // Safe progress helper — never let progress writes break the main flow
    const reportProgress = async (update: Parameters<ProgressCallback>[0]) => {
        if (!onProgress) return;
        try { await onProgress(update); } catch (e) { logger.warn('[Swarm] Progress write failed:', e); }
    };

    // ----------------------------------------------------------------------
    // LANE 1: SIMPLE / EXPRESS (Flash 3 - High Speed, Context Aware)
    // ----------------------------------------------------------------------
    if (mode === 'SIMPLE') {
        // USE TIER 1 (FLASH)
        const model = getGenerativeModel({ tier: 'FLASH' });

        // Build Context even for Simple queries (as requested)
        let simpleContext = formatProfileContext(userProfile);

        // Add DOB explicitly if missing from formatProfileContext (double safety)
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

        try {
            const result = await model.generateContent({
                contents: [
                    ...history,
                    { role: 'user', parts: [{ text: expressPrompt }] }
                ],
            });

            const response = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here to help!";

            return {
                response,
                agentNotes: [],
                symptoms: [],
                consultations: [],
                usedCouncil: false
            };
        } catch (e) {
            console.error('[Ekam Express] Failed, falling back to Swarm:', e);
            // Fallback to CRITICAL execution if Express fails
        }
    }

    // ----------------------------------------------------------------------
    // LANE 2: CRITICAL / COUNCIL (Pro 3 - Deep Reasoning + Round Table)
    // ----------------------------------------------------------------------
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
        const model = getGenerativeModel({ tier: 'FLASH' });
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
        try {
            const result = await model.generateContent({
                contents: [
                    ...history,
                    { role: 'user', parts: [{ text: expressPrompt }] }
                ],
            });
            const response = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here to help!";
            return {
                response,
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
        const promise = runAgent(
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
    // Opt 1: Phase 2 (Round Table peer review) removed.
    // The Orchestrator already performs conflict resolution as part of its synthesis instructions.
    // Removing Phase 2 saves ~20-25s and actually improves note quality (no echo-chamber contamination).

    // 5. ORCHESTRATOR SYNTHESIZES
    let finalResponse: string;

    if (finalAgentNotes.length === 0) {
        // EMERGENCY FALLBACK: If all agents were blocked or failed, check for emergency keywords
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

    // Log total execution time
    logger.info(`[Swarm] Execution Complete.`);

    return {
        response: finalResponse,
        agentNotes: finalAgentNotes.map(r => ({ agent: r.agent, note: r.note })),
        symptoms: [],
        consultations: [],
        usedCouncil: true // Always true for Critical Lane
    };
}

/**
 * NEW: File Analyst - Summarizes files for the Router
 */
async function analyzeFiles(attachments: { fileUri: string; mimeType: string }[]): Promise<string> {
    if (!attachments || attachments.length === 0) return "";

    logger.info(`[Engine] Analyzing ${attachments.length} files for routing...`);

    try {
        const model = getGenerativeModel({
            systemInstruction: "You are a Medical File Analyst. Summarize these documents in 1-2 sentences. Identify the TYPE (Lab Report, ECG, Prescription) and KEY ABNORMALITIES. Output ONLY the summary.",
            tier: 'FLASH'
        });

        const parts: Part[] = [{ text: "Analyze these files:" }];
        attachments.forEach(a => {
            parts.push({ fileData: { fileUri: a.fileUri, mimeType: a.mimeType } });
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                maxOutputTokens: 512,
                temperature: 0.1,
            }
        });

        const summary = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
        logger.info(`[Engine] File Analysis: ${summary}`);
        return summary;

    } catch (e) {
        logger.error('[Engine] File analysis failed:', e);
        return "Contains medical attachments.";
    }
}
