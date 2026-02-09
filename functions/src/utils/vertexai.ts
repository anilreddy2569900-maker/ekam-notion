import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { AI_CONFIG, ModelTier } from '../config/ai_config';

// Project configuration
const PROJECT_ID = 'project-health-de9dd';

// ============================================================================
// DUAL CLIENT ARCHITECTURE (STRICT ENDPOINT ENFORCEMENT)
// ============================================================================

// Client A: Regional (us-central1)
// Explicitly targeting the US-Central1 endpoint
const vertexAIRegional = new VertexAI({
    project: PROJECT_ID,
    location: AI_CONFIG.location.regional,
    apiEndpoint: 'us-central1-aiplatform.googleapis.com', // FORCE THIS
});

// Client B: Global - For Gemini 3 Preview / Experimental models
// Explicitly targeting the Global endpoint
const vertexAIGlobal = new VertexAI({
    project: PROJECT_ID,
    location: AI_CONFIG.location.global,
    apiEndpoint: 'aiplatform.googleapis.com', // FORCE THIS
});

// ============================================================================
// ROUTING LOGIC
// ============================================================================

/**
 * Get the appropriate Vertex AI client based on the Model Tier
 * All "Gemini 3" / Tier 1 & 2 models are currently GLOBAL only.
 */
export function getModelClient(tier: ModelTier): VertexAI {
    // Current Strategy: Both Flash and Pro (Gemini 3/Exp) are Global
    if (tier === 'FLASH' || tier === 'PRO') {
        return vertexAIGlobal;
    }
    // Fallback? NO. STRICT MODE.
    // If not Flash or Pro, default to Global as per instruction to prioritize Gemini 3.
    // However, if we must fallback, use regional.
    return vertexAIRegional;
}

// ============================================================================
// MODEL FACTORY FUNCTIONS
// ============================================================================

export interface GenerativeModelOptions {
    systemInstruction?: string;
    tools?: any[];
    model?: string;     // Legacy/Specific model ID override
    tier?: ModelTier;   // Preferred way: 'FLASH' or 'PRO'
    thinkingLevel?: 'low' | 'high'; // Gemini 3 Thinking Level
}

/**
 * Get a generative model with automatic client routing
 */
export function getGenerativeModel(options: GenerativeModelOptions): GenerativeModel {
    // 1. Determine Tier
    const tier = options.tier || 'PRO'; // Default to PRO (Reasoning) if not specified

    // 2. Determine Model ID
    // If specific model ID is provided, use it. Otherwise use the ID from the Tier config.
    const modelId = options.model || AI_CONFIG.models[tier];

    // 3. Select Client
    const client = getModelClient(tier);

    // 4. Build Configuration
    const modelConfig: any = {
        model: modelId,
        systemInstruction: options.systemInstruction,
        tools: options.tools,
    };

    // Apply Thinking Config if requested or if implied by PRO tier (Gemini 3 Pro)
    // The user specifically requested "Low Thinking" for Gemini 3 Pro.
    if (options.thinkingLevel || (tier === 'PRO' && modelId.includes('gemini-3'))) {
        modelConfig.generationConfig = {
            thinkingConfig: {
                thinkingLevel: options.thinkingLevel || 'high', // Default to high unless 'low' specified
                includeThoughts: true // Usually required when thinking is enabled
            }
        };
    }

    return client.getGenerativeModel(modelConfig);
}

/**
 * Get a grounded search model (Uses Environment / Speed Tier)
 */
export function getGroundedModel(systemInstruction: string): GenerativeModel {
    // Environment agent uses FLASH (Tier 1) with grounding
    // Since it's FLASH, it uses the Global client
    const client = getModelClient('FLASH');

    return client.getGenerativeModel({
        model: AI_CONFIG.models.FLASH,
        systemInstruction: systemInstruction,
        tools: [{ googleSearchRetrieval: {} }],
    });
}

/**
 * Get a fallback model (Regional)
 * Used when Global/Preview models are unavailable
 */
export function getFallbackModel(options: {
    systemInstruction?: string;
    model?: string;
}): GenerativeModel {
    // Configured to use Regional client
    return vertexAIRegional.getGenerativeModel({
        model: options.model || 'gemini-1.5-flash',
        systemInstruction: options.systemInstruction,
    });
}

// Export model IDs for external reference if needed
export const MODEL_FLASH = AI_CONFIG.models.FLASH;
export const MODEL_PRO = AI_CONFIG.models.PRO;

// Export clients for advanced usage
export { vertexAIRegional, vertexAIGlobal };
