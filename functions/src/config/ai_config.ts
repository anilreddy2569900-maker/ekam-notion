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
    // TIER 1: SPEED (FLASH) — Analysis & note generation
    environment: 'FLASH',
    dermatologist: 'FLASH',
    metabolic: 'FLASH',
    somatic: 'FLASH',
    neuro: 'FLASH',
    vitalist: 'FLASH',
    endocrine: 'FLASH',

    // TIER 2: REASONING (PRO) — Safety-critical only
    guardian: 'PRO',

    // Orchestrator uses FLASH directly in engine.ts (not referenced from here)
    orchestrator: 'FLASH',
};

// Override specific agents to FLASH if they are "Lightweight"
// The user listed "Observer/Memory Agent". We don't have those in `AgentKey`.
// We have `environment`. It fetches weather. That's lightweight. -> FLASH.
