import { VertexAI } from '@google-cloud/vertexai';

// Project configuration
const PROJECT_ID = 'project-health-de9dd';

// ============================================================================
// DUAL CLIENT ARCHITECTURE
// ============================================================================

// Client A: Regional (us-central1) - For stable Gemini 2.0 models
const vertexAIRegional = new VertexAI({
    project: PROJECT_ID,
    location: 'us-central1',
});

// Client B: Global - For Gemini 3 Preview models
const vertexAIGlobal = new VertexAI({
    project: PROJECT_ID,
    location: 'global',
});

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

// Primary Models (Gemini 3 - uses global client)
export const GEMINI_3_PRO = 'gemini-3-pro-preview';      // Location: global
export const GEMINI_3_FLASH = 'gemini-3-flash-preview';  // Location: global

// Fallback Models (Gemini 2.5 - uses regional client)
export const GEMINI_2_FLASH = 'gemini-2.5-flash';    // Location: us-central1 (GA, stable until June 2026)

// Agent Configuration
export const BOSS_MODEL = GEMINI_3_PRO;      // Orchestrator uses Pro
export const AGENT_MODEL = GEMINI_3_PRO;     // Specialist agents use Pro
export const ENON_MODEL = GEMINI_3_FLASH;    // Environment agent uses Flash

// Legacy exports for compatibility
export const MODEL_FLASH = ENON_MODEL;
export const MODEL_PRO = AGENT_MODEL;

// ============================================================================
// ROUTING LOGIC: Select correct client based on model name
// ============================================================================

/**
 * Get the appropriate Vertex AI client based on model name
 * Gemini 3 models -> Global client
 * Gemini 2 models -> Regional client
 */
function getClientForModel(modelId: string) {
    if (modelId.includes('gemini-3') || modelId.includes('gemini-3')) {
        return vertexAIGlobal;
    }
    return vertexAIRegional;
}

// ============================================================================
// MODEL FACTORY FUNCTIONS
// ============================================================================

/**
 * Get a generative model with automatic client routing
 */
export function getGenerativeModel(options: {
    systemInstruction?: string;
    tools?: any[];
    model?: string;
}) {
    const modelId = options.model || MODEL_PRO;
    const client = getClientForModel(modelId);

    return client.getGenerativeModel({
        model: modelId,
        systemInstruction: options.systemInstruction,
        tools: options.tools,
    });
}

/**
 * Get a grounded search model (uses Gemini 3 Flash with global client)
 */
export function getGroundedModel(systemInstruction: string) {
    // Environment agent uses Gemini 3 Flash with grounding
    return vertexAIGlobal.getGenerativeModel({
        model: ENON_MODEL,
        systemInstruction: systemInstruction,
        tools: [{ googleSearchRetrieval: {} }],
    });
}

/**
 * Get a fallback model (Gemini 2.0 Flash with regional client)
 * Used when Gemini 3 models are unavailable
 */
export function getFallbackModel(options: {
    systemInstruction?: string;
    model?: string;
}) {
    // Always use regional client for fallback
    return vertexAIRegional.getGenerativeModel({
        model: options.model || GEMINI_2_FLASH,
        systemInstruction: options.systemInstruction,
    });
}

// Export clients for advanced usage
export { vertexAIRegional, vertexAIGlobal };