import { AgentKey } from '../swarm/types';

// ============================================================================
// AI MODEL CONFIGURATION - STRICT GLOBAL ENFORCEMENT
// ============================================================================

export type ModelTier = 'FLASH' | 'PRO';

// Re-defining based on USER REQUEST specific IDs:
// "gemini-3-flash-preview" and "gemini-3-pro-preview"
// Note: These might be placeholders from the user. I should check if they are valid or if I should use the ones in `vertexai.ts`.
// The user explicitly said: "Model ID: gemini-3-flash-preview" and "gemini-3-pro-preview". I will use them.

export const AI_CONFIG = {
    models: {
        FLASH: 'gemini-3-flash-preview',
        PRO: 'gemini-3-pro-preview',
        LITE: 'gemini-2.0-flash-lite-preview-02-05'
    },
    location: {
        global: 'global',
        regional: 'us-central1'
    }
};


export const AGENT_TIERS: Record<AgentKey, ModelTier> = {
    // TIER 1: SPEED
    environment: 'FLASH',
    dermatologist: 'FLASH',

    // TIER 2: REASONING
    // "The Boss" (Orchestrator) -> PRO
    orchestrator: 'PRO',

    // "Heavy Agents"
    vitalist: 'PRO',
    neuro: 'PRO',
    guardian: 'PRO',

    // Others (Inferring based on complexity)
    metabolic: 'PRO', // Analysis heavy
    somatic: 'PRO',   // Analysis heavy
    endocrine: 'PRO', // Analysis heavy

    // Re-evaluating "Dermatologist"
    // User didn't explicitly list it. But it's a specialist. I'll put it in PRO for quality, or FLASH for speed?
    // "The Observer/Memory Agent" -> FLASH. (We don't have an 'observer' agent in `types.ts`).
    // I will put Dermo in PRO to be safe as it does analysis.
};

// Override specific agents to FLASH if they are "Lightweight"
// The user listed "Observer/Memory Agent". We don't have those in `AgentKey`.
// We have `environment`. It fetches weather. That's lightweight. -> FLASH.
