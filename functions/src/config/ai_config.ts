import { AgentKey } from '../swarm/types';

// ============================================================================
// AI MODEL CONFIGURATION - STRICT GLOBAL ENFORCEMENT
// ============================================================================

export type ModelTier = 'FLASH' | 'PRO' | 'LITE';

export const AI_CONFIG = {
    models: {
        FLASH: 'gemini-3-flash-preview',
        PRO: 'gemini-3.1-pro-preview',
        LITE: 'gemini-flash-lite-latest', // Ultra-fast for routing/classification
    },
    location: {
        global: 'global',
        regional: 'us-central1'
    }
};


export const AGENT_TIERS: Record<AgentKey, ModelTier> = {
    // TIER 2: REASONING (PRO) — Complex multi-domain synthesis only
    orchestrator: 'PRO',
    dermatologist: 'PRO', // Keep PRO: complex visual + systemic pattern analysis

    // TIER 1: SPEED (FLASH) — Pattern matchers & structured analysis
    guardian: 'FLASH',   // Red-flag screening: rule-based, benefits from speed not depth
    neuro: 'FLASH',      // Symptom mapping: structured analysis, not deep reasoning
    metabolic: 'FLASH',
    somatic: 'FLASH',
    vitalist: 'FLASH',
    endocrine: 'FLASH',
    environment: 'FLASH',
};
