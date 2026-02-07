/**
 * EKAM API - Cloud Functions Client
 * 
 * Frontend interface to the Ekam Swarm Engine running on Cloud Functions
 * Replaces direct Gemini API calls with server-side processing
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface EkamResponse {
    text: string;
    agentNotes?: { agent: string; note: string }[];
    symptoms?: { symptom: string; severity: string; timestamp: string }[];
    consultations?: { from: string; to: string; question: string; answer: string }[];
    usedCouncil: boolean;
}

interface SwarmRequest {
    message: string;
    history?: { role: 'user' | 'model'; parts: { text: string }[] }[];
    imageUrl?: string;
    userProfile?: Record<string, unknown>;
    chatHistorySummary?: string;
    location?: { lat: number; lng: number };
}

interface SwarmResult {
    response: string;
    agentNotes: { agent: string; note: string }[];
    consultations?: { from: string; to: string; question: string; answer: string }[];
    symptoms?: { symptom: string; severity: string; timestamp: string }[];
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

const processMessageFn = httpsCallable<SwarmRequest, SwarmResult>(functions, 'processMessage');

// ============================================================================
// MAIN API FUNCTION
// ============================================================================

/**
 * Formats user profile data into a context object for the API
 */
function formatProfileForAPI(profile: Record<string, unknown>): Record<string, unknown> {
    const formatted: Record<string, unknown> = {};

    // Basic Info
    if (profile.gender) formatted.gender = profile.gender;
    if (profile.dateOfBirth) formatted.dateOfBirth = profile.dateOfBirth;
    if (profile.height) formatted.height = profile.height;
    if (profile.weight) formatted.weight = profile.weight;

    // Health Info
    if (profile.diet) formatted.diet = profile.diet;
    if (profile.skinType) formatted.skinType = profile.skinType;
    if (profile.hairType) formatted.hairType = profile.hairType;
    if (profile.allergies) formatted.allergies = profile.allergies;
    if (profile.conditions) formatted.conditions = profile.conditions;
    if (profile.medications) formatted.medications = profile.medications;
    if (profile.goals) formatted.goals = profile.goals;

    return formatted;
}

/**
 * Main API function - sends message to Ekam Swarm Engine on Cloud Functions
 * Returns structured response with agent insights
 */
export async function sendMessageToEkam(
    message: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    imageUrl?: string,
    userProfile?: Record<string, unknown> | null,
    chatHistorySummary?: string,
    healthRecords?: { fileName: string; fileType: string; uploadedAt: unknown }[],
    location?: { lat: number; lng: number } | null
): Promise<EkamResponse> {
    try {
        // Build request payload
        const request: SwarmRequest = {
            message,
            history: history.length > 0 ? history : undefined,
            imageUrl: imageUrl || undefined,
            userProfile: userProfile ? formatProfileForAPI(userProfile) : undefined,
            chatHistorySummary: chatHistorySummary || undefined,
            location: location || undefined,
        };

        // Add health records context to the message if available
        if (healthRecords && healthRecords.length > 0) {
            const recordsInfo = healthRecords.map((r, i) => `${i + 1}. ${r.fileName} (${r.fileType})`).join('\n');
            request.chatHistorySummary = (request.chatHistorySummary || '') +
                `\n\nUser's Uploaded Health Records:\n${recordsInfo}`;
        }

        console.log('[Ekam API] Calling Cloud Function with message:', message.substring(0, 50));

        // Call the Cloud Function
        const result = await processMessageFn(request);
        const data = result.data;

        console.log('[Ekam API] Response received from Cloud Function');
        console.log('[Ekam API] Agents consulted:', data.agentNotes?.length || 0);
        console.log('[Ekam API] Cross-consultations:', data.consultations?.length || 0);

        return {
            text: data.response,
            agentNotes: data.agentNotes,
            symptoms: data.symptoms,
            consultations: data.consultations,
            usedCouncil: (data.agentNotes?.length || 0) > 1,
        };
    } catch (error) {
        console.error('[Ekam API] Error calling Cloud Function:', error);

        // Return a user-friendly error message
        return {
            text: 'I apologize, but I encountered an error processing your request. Please try again in a moment.',
            usedCouncil: false,
        };
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a concise chat title from the user's first message
 * Uses a simple local approach (no API call needed)
 */
export async function generateChatTitle(userMessage: string): Promise<string> {
    // Simple title generation: take first sentence or first 50 chars
    const firstSentence = userMessage.split(/[.!?]/)[0];
    const title = firstSentence.length > 50
        ? firstSentence.substring(0, 47) + '...'
        : firstSentence;

    return title || 'New Chat';
}

/**
 * Health check - verifies Cloud Functions are reachable
 */
export async function healthCheck(): Promise<boolean> {
    try {
        const healthCheckFn = httpsCallable(functions, 'healthCheck');
        const result = await healthCheckFn({});
        console.log('[Ekam API] Health check passed:', result.data);
        return true;
    } catch (error) {
        console.error('[Ekam API] Health check failed:', error);
        return false;
    }
}
