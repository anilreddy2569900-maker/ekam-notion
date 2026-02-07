/**
 * EKAM SWARM - Engine
 * 
 * Core swarm execution - simplified for reliability
 * Runs multiple specialist agents in parallel and synthesizes their insights
 */

import { GenerativeModel, GenerateContentRequest, GenerateContentResult, Part } from '@google-cloud/vertexai';
import * as logger from 'firebase-functions/logger';
import { getGenerativeModel, getGroundedModel, getFallbackModel, BOSS_MODEL, AGENT_MODEL, ENON_MODEL, GEMINI_2_FLASH } from '../utils/vertexai';
import { AGENT_PROMPTS } from './agents';
import { routeToAgents } from './router';
import {
    AgentKey,
    AgentResult,
    SwarmResult,
    UserProfile,
    UserLocation,
    ChatMessage
} from './types';

// WeatherAPI Configuration
// TODO: Move this to Firebase Secrets or Environment Variables for production security
const WEATHER_API_KEY = '5fd051d625454ade86985011260702';
const WEATHER_API_BASE = 'http://api.weatherapi.com/v1/current.json';

/**
 * Fetch real-time weather data
 */
async function fetchCurrentWeather(lat: number, lng: number): Promise<string> {
    try {
        logger.info(`[Engine] Fetching weather for ${lat},${lng}...`);
        const url = `${WEATHER_API_BASE}?key=${WEATHER_API_KEY}&q=${lat},${lng}&aqi=yes`;
        const response = await fetch(url);

        if (!response.ok) {
            logger.warn(`[Engine] Weather API error: ${response.status} ${response.statusText}`);
            return '';
        }

        const data = await response.json();
        const current = data.current;
        const location = data.location;

        return `
**REAL-TIME WEATHER DATA (${location.name}, ${location.region}):**
- Temperature: ${current.temp_c}°C (${current.temp_f}°F)
- Condition: ${current.condition.text}
- Humidity: ${current.humidity}%
- UV Index: ${current.uv}
- Wind: ${current.wind_kph} kph (${current.wind_dir})
- Air Quality (US - EPA Index): ${current.air_quality ? current.air_quality['us-epa-index'] : 'N/A'}
- Last Updated: ${current.last_updated}
`;
    } catch (error) {
        logger.error('[Engine] Failed to fetch weather:', error);
        return '';
    }
}

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
    query: string,
    userContext?: string,
    location?: UserLocation,
    imageBase64?: string,
    imageMimeType?: string,
    peerContext?: string // New: Context from other agents for Phase 2
): Promise<AgentResult> {
    const systemInstruction = AGENT_PROMPTS[agentKey];

    // Get appropriate model
    let model: GenerativeModel;
    let modelId = agentKey === 'environment' ? ENON_MODEL : AGENT_MODEL;

    if (agentKey === 'environment') {
        model = getGroundedModel(systemInstruction);
    } else {
        model = getGenerativeModel({ systemInstruction, model: modelId });
    }

    // New: Fetch specific weather details if Environment Agent
    let weatherContext = '';
    if (agentKey === 'environment' && location) {
        weatherContext = await fetchCurrentWeather(location.lat, location.lng);
    }

    // Build prompt text with enhanced deep thinking prompt
    const promptText = `
**User Query:** ${query}

${userContext || ''}
${location && agentKey === 'environment' ? `**USER CURRENT LOCATION:** Latitude: ${location.lat}, Longitude: ${location.lng}\n${weatherContext || '(Use Google Search to find real-time Air Quality, UV, and weather for THESE COORDINATES)'}` : ''}

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

### STEP 2 - CLINICAL REASONING  
Think through the possibilities step-by-step.

### STEP 3 - CROSS-DOMAIN CONNECTIONS
${peerContext ? '**CRITICAL:** specificially reference your colleagues findings.' : 'Consider the bigger picture.'}

### STEP 4 - CRITICAL QUESTIONS
What specific information do you NEED from the user?

### STEP 5 - PRELIMINARY ASSESSMENT
State your working hypothesis.

---

**Remember:** Think like you're presenting at a case conference. Be thorough but clear.
`;

    // Build request content
    const parts: Part[] = [{ text: promptText }];

    // Add image if provided
    if (imageBase64 && imageMimeType) {
        parts.push({
            inlineData: {
                data: imageBase64,
                mimeType: imageMimeType
            }
        });
        logger.info(`[Agent] Image attached for ${agentKey}`);
    }

    try {
        // Add random jitter delay to prevent thundering herd on quota
        const jitter = Math.floor(Math.random() * 500);
        await new Promise(resolve => setTimeout(resolve, jitter));

        logger.info(`[Agent] Trying ${agentKey} with ${modelId}...`);
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
        logger.warn(`[Agent] ${agentKey} primary model (${modelId}) failed, falling back to Gemini 2.0 Flash...`);

        try {
            // Fallback to Gemini 2.0 Flash (us-central1)
            const fallbackModel = getFallbackModel({ systemInstruction, model: GEMINI_2_FLASH });

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
    query: string,
    agentNotes: AgentResult[],
    userContext?: string
): Promise<string> {
    const systemInstruction = AGENT_PROMPTS['orchestrator'];
    // "Boss" uses Pro model with "High Thinking"
    const model: GenerativeModel = getGenerativeModel({ systemInstruction, model: BOSS_MODEL });

    // Format agent notes for orchestrator
    const notesFormatted = agentNotes
        .map(n => `**${n.agent.toUpperCase()} ANALYSIS:**\n${n.note}`)
        .join('\n\n---\n\n');

    const promptText = `
**Original User Query:** ${query}

${userContext || ''}

---

**SPECIALIST ANALYSES:**

${notesFormatted}

---

**YOUR SYNTHESIS TASK:**

Based on all the specialist analyses above, create a unified, helpful response for the user. You MUST:

1. **START by asking clarifying questions** - The specialists have identified areas needing more information. Present the most important 2-3 questions to the user FIRST.

2. **Acknowledge patterns** - Note how different symptoms may be connected across specialties.

3. **Provide preliminary insights** - Share what the specialists' combined analysis suggests, while noting this is not a final diagnosis.

4. **Keep it conversational** - Don't just list bullet points. Speak naturally and empathetically.

5. **Never give a definitive diagnosis** - Always recommend professional consultation for serious concerns.

Format your response in a warm, professional tone. Start with the clarifying questions before providing any assessment.
`;

    try {
        logger.info(`[Orchestrator] Trying with ${BOSS_MODEL}...`);
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
        console.warn(`[Orchestrator] ${BOSS_MODEL} failed, falling back to Gemini 2.0 Flash...`);

        try {
            // Fallback to Gemini 2.0 Flash (us-central1)
            const fallbackModel = getFallbackModel({ systemInstruction, model: GEMINI_2_FLASH });
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
    history?: ChatMessage[],
    userProfile?: UserProfile,
    location?: UserLocation,
    imageBase64?: string,
    imageMimeType?: string,
    chatHistorySummary?: string
): Promise<SwarmResult> {
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
            agent !== 'environment' ? imageMimeType : undefined
        )
    );

    const phase1Results = await Promise.all(phase1Promises);
    const successfulPhase1 = phase1Results.filter(r => !r.note.includes('unavailable') && !r.note.includes('error'));
    logger.info(`[Swarm] Phase 1: ${successfulPhase1.length}/${phase1Promises.length} agents responded`);

    // 4. ROUND TABLE PHASE (PHASE 2 - PEER REVIEW)
    let finalAgentNotes = successfulPhase1;

    // Only run Round Table if multiple agents successfully responded
    if (successfulPhase1.length > 1) {
        logger.info('[Swarm] Starting Phase 2: Peer Review (Round Table)...');

        // Construct peer context for each agent (showing others' notes)
        const phase2Promises = successfulPhase1.map(currentAgentResult => {
            // Get all OTHER agents' notes
            const peers = successfulPhase1.filter(r => r.agent !== currentAgentResult.agent);
            // Create a summary context (truncate to avoid huge tokens)
            const peerContext = peers.map(p => `**${p.agent.toUpperCase()}:** ${p.note.substring(0, 800)}...`).join('\n\n');

            return runAgent(
                currentAgentResult.agent,
                query,
                contextString,
                location,
                currentAgentResult.agent !== 'environment' ? imageBase64 : undefined,
                currentAgentResult.agent !== 'environment' ? imageMimeType : undefined,
                peerContext // Pass the new context
            );
        });

        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));

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
        finalResponse = await runOrchestrator(query, finalAgentNotes, contextString);
    }

    return {
        response: finalResponse,
        agentNotes: finalAgentNotes.map(r => ({ agent: r.agent, note: r.note })),
        symptoms: []
    };
}
