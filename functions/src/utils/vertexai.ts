import { VertexAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { AI_CONFIG, ModelTier } from '../config/ai_config';

// Project configuration
const PROJECT_ID = 'ekam-8bf91';

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
// SAFETY SETTINGS
// ============================================================================

const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
];

// ============================================================================
// ROUTING LOGIC
// ============================================================================

/**
 * Get the appropriate Vertex AI client based on the Model Tier
 * All "Gemini 3" / Tier 1 & 2 models are currently GLOBAL only.
 */
export function getModelClient(modelId: string): VertexAI {
    // Global models: All Gemini 3.x preview models AND Flash Lite
    if (modelId.includes('gemini-3') || modelId.includes('gemini-flash-lite')) {
        return vertexAIGlobal;
    }
    // For Gemini 1.5 and other older models, fallback to Regional
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
 * Get a generative model with automatic client routing.
 * NOTE: thinkingConfig is intentionally NOT set here.
 * It must be passed per-request in generationConfig to avoid SDK conflicts.
 * Use getThinkingConfig() to get the correct thinkingConfig object.
 */
export function getGenerativeModel(options: GenerativeModelOptions): GenerativeModel {
    // 1. Determine Tier
    const tier = options.tier || 'PRO'; // Default to PRO (Reasoning) if not specified

    // 2. Determine Model ID
    // If specific model ID is provided, use it. Otherwise use the ID from the Tier config.
    const modelId = options.model || AI_CONFIG.models[tier];

    // 3. Select Client based on the resolved model ID
    const client = getModelClient(modelId);

    // 4. Build Configuration (NO generationConfig here — set per-request instead)
    const modelConfig: any = {
        model: modelId,
        systemInstruction: options.systemInstruction,
        tools: options.tools,
        safetySettings,
    };

    return client.getGenerativeModel(modelConfig);
}

/**
 * Returns the thinkingConfig block for use inside a per-request generationConfig.
 * Only call this for PRO-tier models (gemini-3.1-pro-preview) that support thinking.
 */
export function getThinkingConfig(level: 'low' | 'medium' | 'high' = 'high'): object {
    return {
        thinkingConfig: {
            thinkingLevel: level,
            includeThoughts: false, // Model thinks internally but thoughts are NOT prepended to response parts
        }
    };
}

/**
 * Get a grounded search model (Uses Environment / Speed Tier)
 */
export function getGroundedModel(systemInstruction: string): GenerativeModel {
    // Environment agent uses FLASH (Tier 1) with grounding
    // Client selection based on the configured model
    const client = getModelClient(AI_CONFIG.models.FLASH);

    return client.getGenerativeModel({
        model: AI_CONFIG.models.FLASH,
        systemInstruction: systemInstruction,
        tools: [{ googleSearchRetrieval: {} }],
        safetySettings,
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
        model: options.model || AI_CONFIG.models.FLASH,
        systemInstruction: options.systemInstruction,
        safetySettings,
    });
}

// Export model IDs for external reference if needed
export const MODEL_FLASH = AI_CONFIG.models.FLASH;
export const MODEL_PRO = AI_CONFIG.models.PRO;

// Export clients for advanced usage
export { vertexAIRegional, vertexAIGlobal };
