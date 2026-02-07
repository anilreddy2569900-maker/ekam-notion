/**
 * EKAM SWARM - Query Router
 * 
 * Routes user queries to appropriate specialist agents based on keyword triggers
 */

import { RoutableAgentKey } from './types';

// ============================================================================
// AGENT TRIGGERS (Keyword -> Agent mapping)
// ============================================================================

const AGENT_TRIGGERS: Record<RoutableAgentKey, string[]> = {
    dermatologist: [
        'skin', 'acne', 'hair', 'scalp', 'rash', 'pimple', 'wrinkle', 'sunscreen',
        'moisturizer', 'eczema', 'psoriasis', 'dandruff', 'oily', 'dry skin', 'glow',
        'pigmentation', 'dark spots', 'texture', 'skincare', 'face', 'chin', 'forehead',
        'cheek', 'nose', 'pore', 'breakout', 'cleanser', 'serum', 'toner', 'cream',
        'lotion', 'picture', 'image', 'photo', 'analyze'
    ],
    metabolic: [
        'diet', 'food', 'nutrition', 'weight', 'fat', 'metabolism', 'sugar', 'carbs',
        'protein', 'calories', 'gut', 'digestion', 'bloating', 'inflammation', 'microbiome',
        'eating', 'meal', 'breakfast', 'lunch', 'dinner', 'vegetarian', 'vegan', 'bmi',
        'lean', 'thin', 'skinny', 'overweight', 'obese', 'dairy'
    ],
    somatic: [
        'exercise', 'workout', 'gym', 'fitness', 'muscle', 'strength', 'cardio', 'running',
        'yoga', 'injury', 'pain', 'knee', 'back', 'shoulder', 'mobility', 'flexibility',
        'sports', 'training', 'posture', 'stretch'
    ],
    neuro: [
        'sleep', 'sleeping', 'insomnia', 'tired', 'tiredness', 'fatigue', 'fatigued',
        'stress', 'stressed', 'anxiety', 'anxious', 'focus', 'concentration', 'brain',
        'mood', 'depression', 'depressed', 'energy', 'motivation', 'dopamine', 'melatonin',
        'circadian', 'nap', 'wake', 'waking', 'rest', 'restless'
    ],
    guardian: [
        'blood test', 'lab report', 'cholesterol', 'glucose', 'hba1c', 'thyroid', 'vitamin',
        'deficiency', 'cancer', 'screening', 'biomarker', 'hemoglobin', 'creatinine',
        'liver', 'kidney', 'report', 'test result'
    ],
    vitalist: [
        'heart', 'blood pressure', 'bp', 'pulse', 'hrv', 'cardiac', 'immune', 'cold',
        'flu', 'fever', 'infection', 'immunity', 'vo2', 'cardiovascular', 'breathing', 'breath'
    ],
    endocrine: [
        'hormone', 'testosterone', 'estrogen', 'thyroid', 'period', 'cycle', 'menstrual',
        'pcos', 'libido', 'fertility', 'adrenal', 'cortisol', 'hormonal'
    ],
    environment: [
        'air quality', 'pollution', 'aqi', 'weather', 'humidity', 'uv', 'water', 'tds',
        'season', 'allergy', 'pollen', 'climate', 'temperature', 'environment', 'location',
        'shower', 'bathing', 'waxy', 'sticky', 'hard water', 'calcium', 'mineral'
    ]
};

/**
 * Route a query to the appropriate specialist agents
 * Returns an array of agent keys that should handle the query
 */
export function routeToAgents(query: string): RoutableAgentKey[] {
    const lowerQuery = query.toLowerCase();
    const selectedAgents: RoutableAgentKey[] = [];

    // Check each agent's triggers
    for (const [agent, triggers] of Object.entries(AGENT_TRIGGERS)) {
        const isTriggered = triggers.some((trigger: string) => lowerQuery.includes(trigger));
        if (isTriggered) {
            selectedAgents.push(agent as RoutableAgentKey);
        }
    }

    // Default to neuro (general wellness) if no specific agent is triggered
    if (selectedAgents.length === 0) {
        return ['neuro'];
    }

    return selectedAgents;
}

/**
 * Threshold for activating multi-agent Council mode
 * If more than this many agents are selected, use full swarm
 */
export const COUNCIL_THRESHOLD = 1;
