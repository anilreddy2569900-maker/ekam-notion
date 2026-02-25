/**
 * EKAM SWARM - Memory System
 * 
 * "Flash" Memory Architecture for real-time fact extraction.
 * Uses LITE tier for ultra-fast background extraction.
 */

import * as logger from 'firebase-functions/logger';
import { chatCompletion } from '../utils/siliconflow';

export interface ClinicalFact {
    category: string;
    fact: string;
    confidence: number;
    action: 'add' | 'remove' | 'update';
}

export interface MemoryExtractionResult {
    facts: ClinicalFact[];
}

/**
 * Extract clinical facts from user text with high speed
 */
export async function extractClinicalFacts(text: string): Promise<MemoryExtractionResult> {
    const systemInstruction = `
    You are the "Flash Observer" for a medical AI system.
    Your ONLY job is to extract NEW clinical facts, preferences, or medical history from the user's text.
    
    SPEED IS CRITICAL. Return JSON only.
    
    Rules:
    1. Extract facts about: Diet, Allergies, Injuries, Symptoms, Medications, Preferences (e.g., "I hate needles").
    2. Ignore general conversation ("Hello", "How are you").
    3. Ignore questions ("Do I have cancer?"). Only extract STATEMENTS of fact.
    4. Return strict JSON format: { "facts": [{ "category": "String", "fact": "String", "action": "add"|"remove"|"update" }] }
    
    Example:
    User: "I stopped eating dairy last week."
    Output: { "facts": [{ "category": "Diet", "fact": "No Dairy", "action": "add" }] }
    
    User: "My knee doesn't hurt anymore."
    Output: { "facts": [{ "category": "Injury Status", "fact": "Knee pain resolved", "action": "update" }] }
    `;

    try {
        const result = await chatCompletion({
            tier: 'LITE',
            systemInstruction,
            messages: [{ role: 'user', content: text }],
            maxTokens: 256,
            temperature: 0,
            jsonMode: true,
        });

        const responseText = result.text;
        if (!responseText) return { facts: [] };

        const parsed = JSON.parse(responseText) as MemoryExtractionResult;

        if (parsed.facts && parsed.facts.length > 0) {
            logger.info(`[Memory] Extracted ${parsed.facts.length} facts`, parsed);
        }

        return parsed;

    } catch (error) {
        logger.error('[Memory] Extraction failed:', error);
        return { facts: [] };
    }
}
