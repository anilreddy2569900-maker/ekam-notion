import { AgentKey } from '../swarm/types';

// ============================================================================
// AI MODEL CONFIGURATION — SILICONFLOW
// ============================================================================

export type ModelTier = 'CORE' | 'LITE' | 'DERM' | 'DERM_ESCALATION';

export const AI_CONFIG = {
    models: {
        CORE: 'openai/gpt-oss-120b',                   // All serious reasoning — Orchestrator, specialists, summaries
        LITE: 'meta-llama/Meta-Llama-3.1-8B-Instruct',      // Routing, Express Lane, Environment, Memory
        DERM: 'Qwen/Qwen2.5-VL-72B-Instruct',          // Default vision dermatologist
        DERM_ESCALATION: 'Pro/THUDM/glm-4v-9b',              // Heavy derm VLM (only on escalation)
    },
};

export const AGENT_TIERS: Record<AgentKey, ModelTier> = {
    // CORE: Deep reasoning — Orchestrator + complex visual analysis
    orchestrator: 'CORE',
    dermatologist: 'DERM', // Uses vision model by default; escalates to DERM_ESCALATION

    // LITE: Fast pattern matchers & structured analysis
    guardian: 'CORE',    // Safety needs strong reasoning
    neuro: 'CORE',
    metabolic: 'CORE',
    somatic: 'CORE',
    vitalist: 'CORE',
    endocrine: 'CORE',
    environment: 'LITE', // Data provider, doesn't need heavy reasoning
};
