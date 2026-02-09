/**
 * EKAM SWARM - Semantic Router
 * 
 * Classifies user queries to determine the appropriate processing lane.
 * LOW LATENCY is the priority here.
 */

import { GenerativeModel } from '@google-cloud/vertexai';
import * as logger from 'firebase-functions/logger';
import { getGenerativeModel } from '../utils/vertexai';
import { AgentKey } from './types';

export type QueryComplexity = 'SIMPLE' | 'CRITICAL';

export interface RouterResult {
    type: QueryComplexity;
    reason?: string;
}

/**
 * Classifies the complexity of a user query
 */
export async function classifyQuery(text: string): Promise<RouterResult> {
    const systemInstruction = `
    You are a Semantic Router for a health AI.
    Classify the user query into one of two categories:

    SIMPLE:
    - Greetings ("Hi", "Hello", "Thanks")
    - General knowledge ("What is protein?", "Benefits of water")
    - UI navigation ("Where is my profile?", "How do I upload?")
    - Compliments / Small talk
    - **Personal Profile Questions** ("What is my age?", "What is my weight?", "My location?")

    CRITICAL:
    - Symptoms ("My chest hurts", "I feel dizzy")
    - Medical history ("I have diabetes", "I had surgery")
    - Lab report interpretation
    - Personal health advice ("Diet for my condition")
    - Complex multi-part questions

    Output JSON ONLY: { "type": "SIMPLE" } or { "type": "CRITICAL" }
    `;

    // Use Tier LITE (Flash Lite 2.0) for max speed and cost efficiency
    const model: GenerativeModel = getGenerativeModel({
        systemInstruction,
        tier: 'LITE' as any // Cast to any as LITE is new
    });

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: {
                maxOutputTokens: 20, // Extremely short response
                temperature: 0, // Deterministic
                responseMimeType: 'application/json'
            }
        });

        const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
            // Default to CRITICAL for safety if classification fails
            return { type: 'CRITICAL', reason: 'Empty response' };
        }

        const parsed = JSON.parse(responseText) as RouterResult;
        return parsed;

    } catch (error) {
        logger.error('[Router] Classification failed:', error);
        // Fail safe: assume CRITICAL to ensure full analysis
        return { type: 'CRITICAL', reason: 'Error' };
    }
}

/**
 * Routes the query to the appropriate specialists
 */
export function routeToAgents(query: string): AgentKey[] {
    const q = query.toLowerCase();
    const agents: Set<AgentKey> = new Set();

    // Always include Environment for context (it's cheap/fast)
    agents.add('environment');

    // Simple keyword mapping (Fast & Deterministic)
    // In a future update, this could be an LLM call, but regex is faster for now

    if (/(heart|cardio|chest|pulse|bp|blood pressure)/.test(q)) agents.add('vitalist');
    if (/(skin|rash|itch|derm|hair|face)/.test(q)) agents.add('dermatologist');
    if (/(sleep|insomnia|tired|fatigue|energy|mood|stress|anxiety)/.test(q)) agents.add('neuro');
    if (/(stomach|gut|digest|eat|food|diet|weight|bloat)/.test(q)) agents.add('metabolic');
    if (/(hormone|thyroid|sugar|diabetes|period|cycle)/.test(q)) agents.add('endocrine');

    // Default to Vitalist (General GP) if no specific match
    if (agents.size === 1) { // Only environment
        agents.add('vitalist');
    }

    // Agent "Guardian" is implicit in the Orchestrator's safety check, so we don't explicitly route to it 
    // unless strictly needed, but for now let's keep it simple.

    return Array.from(agents);
}
