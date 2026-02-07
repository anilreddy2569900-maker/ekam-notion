/**
 * EKAM API Local - Client-side utilities
 * 
 * Lightweight client-side routing for UI feedback (loading indicators)
 * The actual routing happens server-side, this is just for UX preview
 */

type RoutableAgentKey =
    | 'dermatologist'
    | 'metabolic'
    | 'somatic'
    | 'neuro'
    | 'guardian'
    | 'vitalist'
    | 'endocrine'
    | 'environment';

// Simplified keyword mapping for client-side preview
const AGENT_TRIGGERS: Record<RoutableAgentKey, string[]> = {
    dermatologist: ['skin', 'acne', 'hair', 'scalp', 'rash', 'pimple', 'wrinkle', 'sunscreen', 'moisturizer', 'cleanser', 'serum', 'picture', 'image', 'photo', 'face'],
    metabolic: ['diet', 'food', 'nutrition', 'weight', 'fat', 'metabolism', 'sugar', 'carbs', 'protein', 'gut', 'digestion', 'eating', 'meal', 'dairy'],
    somatic: ['exercise', 'workout', 'gym', 'fitness', 'muscle', 'strength', 'cardio', 'running', 'yoga', 'injury', 'pain', 'knee', 'back'],
    neuro: ['sleep', 'insomnia', 'tired', 'fatigue', 'stress', 'anxiety', 'focus', 'brain', 'mood', 'depression', 'energy'],
    guardian: ['blood test', 'lab report', 'cholesterol', 'glucose', 'thyroid', 'vitamin', 'cancer', 'screening'],
    vitalist: ['heart', 'blood pressure', 'pulse', 'hrv', 'cardiac', 'immune', 'cold', 'flu', 'fever'],
    endocrine: ['hormone', 'testosterone', 'estrogen', 'period', 'cycle', 'pcos', 'cortisol'],
    environment: ['air quality', 'pollution', 'aqi', 'weather', 'humidity', 'uv', 'environment', 'location']
};

/**
 * Client-side routing for UI feedback (shows which agents will be consulted)
 * Actual routing happens server-side in Cloud Functions
 */
export function routeToAgents(query: string): RoutableAgentKey[] {
    const lowerQuery = query.toLowerCase();
    const selectedAgents: RoutableAgentKey[] = [];

    for (const [agent, triggers] of Object.entries(AGENT_TRIGGERS)) {
        const isTriggered = triggers.some((trigger: string) => lowerQuery.includes(trigger));
        if (isTriggered) {
            selectedAgents.push(agent as RoutableAgentKey);
        }
    }

    // Default to neuro if no specific agent is triggered
    if (selectedAgents.length === 0) {
        return ['neuro'];
    }

    return selectedAgents;
}
