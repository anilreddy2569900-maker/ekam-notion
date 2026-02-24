/**
 * EKAM SWARM - Unified Semantic Router
 * 
 * Single AI call that BOTH classifies query complexity AND routes to agents.
 * LOW LATENCY is the priority here.
 */

import { GenerativeModel } from '@google-cloud/vertexai';
import * as logger from 'firebase-functions/logger';
import { getGenerativeModel } from '../utils/vertexai';
import { AgentKey } from './types';

export type QueryComplexity = 'SIMPLE' | 'CRITICAL';

export interface RouterResult {
    type: QueryComplexity;
    agents?: AgentKey[];
    reason?: string;
}

/**
 * UNIFIED: Classifies query AND routes to agents in a SINGLE AI call.
 * - SIMPLE queries → { type: "SIMPLE" } → Express Lane (no agents needed)
 * - CRITICAL queries → { type: "CRITICAL", agents: [...] } → Council with specific agents
 */
export async function classifyAndRoute(
    query: string,
    imageBase64?: string,
    imageMimeType?: string,
    fileContext?: string
): Promise<RouterResult> {
    const q = query.toLowerCase().trim();

    // FAST PATH: Simple greetings & profile questions → skip AI call entirely
    if (!imageBase64 && !fileContext) {
        // Greetings
        if (/^(hi|hello|hey|greetings|good morning|good evening|thanks|thank you|ok|bye)$/i.test(q)) {
            return { type: 'SIMPLE' };
        }
        // Profile questions (age, weight, height, etc.)
        if (/^(what is my (age|weight|height|name|profile|location|bmi)|how old am i|my age|my weight|my height|my bmi|tell me my age)\b/i.test(q)) {
            return { type: 'SIMPLE' };
        }
        // Short non-medical messages (1-3 words, no medical keywords)
        const wordCount = q.split(/\s+/).length;
        if (wordCount <= 3 && !/\b(hurt|pain|ache|dizzy|rash|symptom|blood|nausea|anxiety|fatigue|thyroid|pregnant|allerg|diabetes)\b/i.test(q)) {
            return { type: 'SIMPLE' };
        }
    }

    const systemInstruction = `
    You are the **Chief Medical Dispatcher** for Ekam Health.
    You have TWO jobs in ONE response:

    ### JOB 1: CLASSIFY the query as SIMPLE or CRITICAL

    **SIMPLE** (Express Lane — no specialists needed):
    - Greetings ("Hi", "Hello", "Thanks")
    - General knowledge ("What is protein?", "Benefits of water")
    - UI navigation ("Where is my profile?", "How do I upload?")
    - Compliments / Small talk
    - Personal profile questions ("What is my age?", "What is my weight?")

    **CRITICAL** (Council Lane — specialists needed):
    - Any symptom, pain, or discomfort
    - Medical history or conditions
    - Lab report / image analysis
    - Personal health advice (diet, exercise, treatment)
    - Complex multi-part health questions

    ### JOB 2: If CRITICAL, select the EXACT specialists needed

    **RULES:**
    1. Select ONLY agents whose domain is RELEVANT to the query/image/file.
    2. If simple (e.g., "My knee hurts") → 1-2 agents. If complex → more agents. If affects everything → ALL.
    3. 'environment' and 'orchestrator' are auto-included — do NOT list them.

    **VISUAL ANALYSIS (If Image/File Provided):**
    - Skin/Rash/Nail/Hair → dermatologist (Primary)
    - Swollen Joint/Posture/Injury → somatic
    - Visible Thyroid (Goiter)/Eyes → endocrine
    - Report/Lab Result → guardian + relevant specialist
    - Food/Meal → metabolic

    **AGENT ROSTER:**
    - **vitalist**: Heart, Blood Pressure, Circulation, Stamina.
    - **dermatologist**: Skin, Hair, Nails, Rashes.
    - **metabolic**: Digestion, Diet, Weight, Gut Health, Bloating, Energy.
    - **somatic**: Muscles, Joints, Pain, Posture, Movement, Injury.
    - **neuro**: Brain, Sleep, Stress, Anxiety, Headache, Focus, Mood.
    - **endocrine**: Hormones, Thyroid, Period/Menstrual, Diabetes, Temperature regulation.
    - **guardian**: SAFETY FIRST. Use if ANY "Red Flag" or serious concern.

    ### OUTPUT FORMAT (JSON ONLY):
    - Simple: { "type": "SIMPLE" }
    - Critical: { "type": "CRITICAL", "agents": ["somatic", "guardian"] }
    `;

    try {
        const model: GenerativeModel = getGenerativeModel({
            systemInstruction,
            tier: 'LITE', // Gemini Flash Lite — ultra-fast for classification (outputs tiny JSON only)
        });

        const contents = [{ role: 'user', parts: [] as any[] }];
        contents[0].parts.push({
            text: `Query: ${query || "Check attachment"}\nImage: ${imageBase64 ? "Yes" : "No"}\nFile Context: ${fileContext || "None"}`
        });

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
                temperature: 0,
                responseMimeType: 'application/json'
            }
        });

        let responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) throw new Error("Empty response from Router");

        // Strip markdown backticks if present
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(responseText) as RouterResult;

        // If SIMPLE, return immediately (no agents needed)
        if (parsed.type === 'SIMPLE') {
            logger.info('[Router] Classified as SIMPLE → Express Lane');
            return { type: 'SIMPLE' };
        }

        // CRITICAL: Validate and finalize agents
        let selectedAgents: AgentKey[] = parsed.agents || [];
        const validAgents = new Set<AgentKey>(['vitalist', 'dermatologist', 'metabolic', 'somatic', 'neuro', 'endocrine', 'guardian', 'orchestrator']);
        selectedAgents = selectedAgents.filter(a => validAgents.has(a));

        // ALWAYS include Environment (Context) for environmental data
        if (!selectedAgents.includes('environment')) selectedAgents.push('environment');
        // NOTE: Orchestrator is intentionally NOT added here — it runs separately as the final synthesizer,
        // not as a Phase 1/2 specialist. This avoids a redundant slow PRO call in the agent pool.

        // FALLBACK: If no agents selected, default to Guardian (Safety)
        if (selectedAgents.length <= 2) { // Only env + orchestrator
            logger.warn('[Router] No specific agents selected. Adding Guardian.');
            selectedAgents.push('guardian');
            if (imageBase64) selectedAgents.push('dermatologist');
        }

        logger.info(`[Router] Classified as CRITICAL → Agents: ${selectedAgents.join(', ')}`);
        return { type: 'CRITICAL', agents: selectedAgents };

    } catch (error) {
        logger.error('[Router] Unified classification failed, using fallback:', error);

        // CRITICAL FALLBACK (Regex-based)
        const fallbackAgents: AgentKey[] = ['environment', 'orchestrator', 'guardian'];
        if (/(skin|hair|face)/.test(q) || imageBase64) fallbackAgents.push('dermatologist');
        if (/(heart|chest)/.test(q)) fallbackAgents.push('vitalist');
        if (/(diet|food|eat|weight|bloat)/.test(q)) fallbackAgents.push('metabolic');
        if (/(sleep|stress|anxiety|headache|mood)/.test(q)) fallbackAgents.push('neuro');
        if (/(pain|knee|back|joint|muscle)/.test(q)) fallbackAgents.push('somatic');
        if (/(thyroid|hormone|period|diabetes)/.test(q)) fallbackAgents.push('endocrine');

        return { type: 'CRITICAL', agents: fallbackAgents };
    }
}

/**
 * Legacy: Classifies query complexity only (for the classifyQueryCallable)
 * Kept for backwards compatibility with the frontend callable.
 */
export async function classifyQuery(text: string): Promise<RouterResult> {
    const result = await classifyAndRoute(text);
    return { type: result.type, reason: result.reason };
}

