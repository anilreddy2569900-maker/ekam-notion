/**
 * EKAM SWARM - Engine
 * 
 * Core swarm execution - simplified for reliability
 * Runs multiple specialist agents in parallel and synthesizes their insights
 */

import { GenerativeModel, GenerateContentRequest, GenerateContentResult, Part } from '@google-cloud/vertexai';
import * as logger from 'firebase-functions/logger';
import { getGenerativeModel, getGroundedModel, getFallbackModel } from '../utils/vertexai';
import { AGENT_TIERS, AI_CONFIG } from '../config/ai_config';
import { AGENT_PROMPTS } from './agents';
import { routeToAgents } from './router';
import {
    AgentKey,
    AgentResult,
    SwarmResult,
    UserProfile,
    UserLocation
} from './types';

// Weather data is now handled by Google Search grounding in the environment agent

/**
 * Format user profile into a context string for agents
 */
function formatProfileContext(profile?: UserProfile): string {
    if (!profile) return '';

    const parts: string[] = [];
    if (profile.gender) parts.push(`Gender: ${profile.gender}`);
    if (profile.dateOfBirth) parts.push(`Date of Birth: ${profile.dateOfBirth}`);
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
 * Retry wrapper for Vertex AI generation
 */
async function generateWithRetry(model: GenerativeModel, request: GenerateContentRequest, maxRetries = 3, initialDelay = 1000): Promise<GenerateContentResult> {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await model.generateContent(request);
        } catch (error: any) {
            lastError = error;
            // Check for 429 Resource exhausted
            if (error.code === 429 || error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes('429')) {
                logger.warn(`[Engine] Rate limit hit. Retrying in ${initialDelay * Math.pow(2, i)}ms...`);
                await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, i)));
                continue;
            }
            throw error; // Rethrow other errors
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
    peerContext?: string, // New: Context from other agents for Phase 2
    attachments?: { fileUri: string; mimeType: string }[] // New: Multimodal Files
): Promise<AgentResult> {
    const systemInstruction = AGENT_PROMPTS[agentKey];

    // Get appropriate model type based on agent complexity (TIERED SYSTEM)
    // Configured in ai_config.ts
    const tier = AGENT_TIERS[agentKey] || 'FLASH'; // Default to Flash if missing

    let model: GenerativeModel;

    if (agentKey === 'environment') {
        model = getGroundedModel(systemInstruction);
    } else {
        // Use the Tiered Factory
        // For PRO tier (Gemini 3 Pro), enforce LOW THINKING as requested
        model = getGenerativeModel({
            systemInstruction,
            tier,
            thinkingLevel: tier === 'PRO' ? 'low' : undefined
        });
    }

    const usedModelId = AI_CONFIG.models[tier];

    // Build prompt text with enhanced deep thinking prompt
    const promptText = `
**User Query:** ${userMessage}

${userContext || ''}
${location && agentKey === 'environment' ? `**USER CURRENT LOCATION:** Latitude: ${location.lat}, Longitude: ${location.lng}\n(Use Google Search to find real-time Air Quality, UV, and weather for THESE COORDINATES)` : ''}

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
Based on what you see, what is the user's "Hidden Story"?
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

    // Add Multimodal Attachments (Vault Files)
    // Only Agents with "High Visual Aptitude" should arguably get them, but Gemini 3 is efficient.
    // We give access to ALL selected agents.
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
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts }],
            generationConfig: {
                maxOutputTokens: agentKey === 'environment' ? 4096 : 3000, // Boost Environment agent tokens
                temperature: 1,
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
        logger.warn(`[Agent] ${agentKey} primary model (${usedModelId}) failed, falling back to Gemini 1.5 Flash...`);

        try {
            // Fallback to Gemini 1.5 Flash (us-central1 / Stable Tier)
            const fallbackModel = getFallbackModel({ systemInstruction, model: 'gemini-1.5-flash' });

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

1. **START by answering the user's intent** - The specialists have identified the likely issue. Tell the user what is happening and what to do. Provide the "Hidden Story" immediately.

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
                maxOutputTokens: 4096,
                temperature: 1,
            }
        }, 5, 2000);

        const response = result.response;

        if (result.response?.usageMetadata) {
            logger.info(`[Orchestrator] Token Usage:`, JSON.stringify(result.response.usageMetadata));
        }

        return response?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "I apologize, but I'm having trouble synthesizing the analysis. Please try again.";
    } catch (error) {
        console.warn(`[Orchestrator] Primary Tier failed, falling back to Gemini 1.5 Flash...`);

        try {
            // Fallback to Gemini 1.5 Flash (us-central1)
            const fallbackModel = getFallbackModel({ systemInstruction, model: 'gemini-1.5-flash' });
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
    mode: 'SIMPLE' | 'CRITICAL' = 'CRITICAL', // Default to full power if unsure
    attachments?: { fileUri: string; mimeType: string }[] // New schema
): Promise<SwarmResult> {

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

    // 2. ROUTE TO AGENTS
    const selectedAgents = routeToAgents(query);
    logger.info(`[Swarm] Selected agents: ${selectedAgents.join(', ')}`);

    // 3. RUN AGENTS IN PARALLEL (PHASE 1 - BRAINSTORM)
    logger.info('[Swarm] Starting Phase 1: Brainstorming...');
    const phase1Promises = selectedAgents.map(agent =>
        runAgent(
            agent,
            query,
            contextString,
            location,
            agent !== 'environment' ? imageBase64 : undefined,
            agent !== 'environment' ? imageMimeType : undefined,
            undefined, // No peer context yet
            attachments // Pass files
        )
    );

    const phase1Results = await Promise.all(phase1Promises);
    const successfulPhase1 = phase1Results.filter(r => !r.note.includes('unavailable') && !r.note.includes('error'));
    logger.info(`[Swarm] Phase 1: ${successfulPhase1.length}/${phase1Promises.length} agents responded`);

    // 4. ROUND TABLE PHASE (PHASE 2 - PEER REVIEW)
    let finalAgentNotes = successfulPhase1;

    if (successfulPhase1.length > 1) {
        logger.info('[Swarm] Starting Phase 2: Peer Review (Round Table)...');

        // Construct peer context for each agent (showing others' notes)
        const phase2Promises = successfulPhase1.map(currentAgentResult => {
            const peers = successfulPhase1.filter(r => r.agent !== currentAgentResult.agent);
            const peerContext = peers.map(p => `**${p.agent.toUpperCase()}:** ${p.note.substring(0, 800)}...`).join('\n\n');

            return runAgent(
                currentAgentResult.agent,
                query,
                contextString,
                location,
                currentAgentResult.agent !== 'environment' ? imageBase64 : undefined,
                currentAgentResult.agent !== 'environment' ? imageMimeType : undefined,
                peerContext,
                attachments
            );
        });

        const phase2Results = await Promise.all(phase2Promises);
        finalAgentNotes = phase2Results.filter(r => !r.note.includes('unavailable') && !r.note.includes('error'));
        logger.info('[Swarm] Phase 2 Complete.');
    }

    // 5. ORCHESTRATOR SYNTHESIZES
    let finalResponse: string;

    if (finalAgentNotes.length === 0) {
        finalResponse = "I apologize, but I'm having technical difficulties right now. Please try again in a moment, or rephrase your question.";
    } else {
        // Synthesize the FINAL notes
        try {
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
