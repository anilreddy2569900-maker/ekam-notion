import { AgentKey } from '../swarm/types';

// ============================================================================
// AI MODEL CONFIGURATION - STRICT GLOBAL ENFORCEMENT
// ============================================================================

export type ModelTier = 'FLASH' | 'PRO';

export const AI_CONFIG = {
    models: {
        FLASH: 'gemini-3-flash-preview',
        PRO: 'gemini-3.1-pro-preview',
    },
    location: {
        global: 'global',
        regional: 'us-central1'
    }
};


export const AGENT_TIERS: Record<AgentKey, ModelTier> = {
    // TIER 2: REASONING (PRO) — Deep analysis agents
    orchestrator: 'PRO',
    guardian: 'PRO',
    neuro: 'PRO',
    dermatologist: 'PRO',

    // TIER 1: SPEED (FLASH) — Pattern matching agents
    metabolic: 'FLASH',
    somatic: 'FLASH',
    vitalist: 'FLASH',
    endocrine: 'FLASH',
    environment: 'FLASH',
};
