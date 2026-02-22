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
 * Routes the query to the appropriate specialists using LLM reasoning
 * Tier: LITE (Fast & Cost Effective)
 */
export async function routeToAgents(query: string, imageBase64?: string, imageMimeType?: string, fileContext?: string): Promise<AgentKey[]> {
    const q = query.toLowerCase();

    // 1. FAST PATH: Simple Greetings / Small Talk -> Just Orchestrator
    // Only if NO IMAGE and NO FILE CONTEXT
    if (!imageBase64 && !fileContext && /^(hi|hello|hey|greetings|good morning|good evening)$/.test(q)) {
        return ['orchestrator', 'environment']; // Env always included for context
    }

    // 2. INTELLIGENT ROUTING: Use Gemini Flash Lite
    const systemInstruction = `
    You are the **Chief Medical Dispatcher** for Ekam Health.
    Your Goal: Select the **exact set of specialists** required to fully address the user's query and any attached image or file.

    ### RULES:
    1. **Precision:** Select ONLY the agents whose domain is RELEVANT to the query, image, or file content.
    2. **No Limits:** 
       - If the query/image/file is simple (e.g., "My knee hurts"), select **1 agent** (Somatic).
       - If complex, select **ALL relevant agents**.
       - If it affects everything, use **ALL 8**.
    3. **Context:** 'Environment' agent is auto-included, do not list it.

    ### VISUAL ANALYSIS (If Image/File Provided):
    - **Skin/Rash/Nail/Hair:** -> **dermatologist** (Primary)
    - **Swollen Joint/Posture/Injury:** -> **somatic**
    - **Visible Thyroid (Goiter)/Eyes:** -> **endocrine**
    - **Report/Lab Result:** -> **guardian** + relevant specialist (e.g. Lipid Profile -> Metabolic, ECG -> Vitalist)
    - **Food/Meal:** -> **metabolic**

    ### AGENT ROSTER:
    - **vitalist**: Heart, Blood Pressure, Circulation, Stamina.
    - **dermatologist**: Skin, Hair, Nails, Rashes.
    - **metabolic**: Digestion, Diet, Weight, Gut Health, Bloating, Energy (fuel).
    - **somatic**: Muscles, Joints, Pain, Posture, Movement, Injury.
    - **neuro**: Brain, Sleep, Stress, Anxiety, Headache, Focus, Mood.
    - **endocrine**: Hormones, Thyroid, Period/Menstrual, Diabetes, Temperature regulation.
    - **guardian**: **SAFETY FIRST**. Use this if the user mentions ANY "Red Flag" or if the image/file looks serious.

    ### INPUT:
    Query: "${query}"
    Image: ${imageBase64 ? "Yes" : "No"}
    File Context: "${fileContext || "None"}"

    ### OUTPUT:
    Return JSON ONLY: { "agents": ["agent1", "agent2"] }
    `;

    try {
        const model = getGenerativeModel({
            systemInstruction,
            tier: 'LITE' as any, // Flash Lite
            model: 'gemini-2.0-flash-lite-preview-02-05'
        });

        const contents = [{ role: 'user', parts: [] as any[] }];
        contents[0].parts.push({ text: `Query: ${query || "Check attachment"}\nFile Analysis: ${fileContext || "No files analyzed."}` });

        if (imageBase64 && imageMimeType) {
            contents[0].parts.push({
                inlineData: {
                    data: imageBase64,
                    mimeType: imageMimeType
                }
            });
        }

        const result = await model.generateContent({
            contents,
            generationConfig: {
                maxOutputTokens: 100,
                temperature: 0.0, // Strict deterministic
                responseMimeType: 'application/json'
            }
        });

        const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) throw new Error("Empty response from Router");

        const parsed = JSON.parse(responseText);
        let selectedAgents: AgentKey[] = parsed.agents || [];

        // Validate agents
        const validAgents = new Set<AgentKey>(['vitalist', 'dermatologist', 'metabolic', 'somatic', 'neuro', 'endocrine', 'guardian']);
        selectedAgents = selectedAgents.filter(a => validAgents.has(a));

        // ALWAYS include Environment (Context) and Orchestrator (Manager)
        if (!selectedAgents.includes('environment')) selectedAgents.push('environment');

        // FALLBACK: If LLM returns nothing but query was not empty, default to Guardian (Safety)
        if (selectedAgents.length <= 1) { // Only env
            logger.warn('[Router] LLM returned no agents. Defaulting to Guardian.');
            selectedAgents.push('guardian');
            // If image is present and failed, add dermatologist as safe bet for visual queries
            if (imageBase64) selectedAgents.push('dermatologist');
        }

        return selectedAgents;

    } catch (error) {
        logger.error('[Router] LLM Routing failed, using fallback:', error);
        // CRITICAL FALLBACK (Regex or safe default)
        const fallbackAgents: AgentKey[] = ['environment', 'guardian']; // Safety first
        if (/(skin|hair|face)/.test(q) || imageBase64) fallbackAgents.push('dermatologist'); // Assume image = derm in worst case
        if (/(heart|chest)/.test(q)) fallbackAgents.push('vitalist');
        return fallbackAgents;
    }
}
