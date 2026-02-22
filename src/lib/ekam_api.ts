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


export interface HealthRecord {
    fileName: string;
    fileType: string;
    storagePath?: string;
    uploadedAt: unknown;
}

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
    mode?: 'SIMPLE' | 'CRITICAL';
    attachments?: { storagePath?: string; mimeType: string }[];
    userId?: string;
    chatId?: string;
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

const processMessageFn = httpsCallable<SwarmRequest, SwarmResult>(functions, 'processMessage', { timeout: 300000 });
const transcribeAudioFn = httpsCallable<{ audio: string; languageCode?: string }, { text: string; languageCode: string }>(functions, 'transcribeAudio');

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
    if (profile.dateOfBirth) formatted.dateOfBirth = profile.dateOfBirth; // Explicitly ensure DOB is passed
    if (profile.age) formatted.age = profile.age; // Helper if age is pre-calculated
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
    healthRecords?: HealthRecord[],
    location?: { lat: number; lng: number } | null,
    mode: 'SIMPLE' | 'CRITICAL' = 'CRITICAL',
    userId?: string,
    chatId?: string
): Promise<EkamResponse> {
    try {
        // Map health records to SwarmAttachments (Multimodal Input)
        const attachments = healthRecords?.map(record => {
            return {
                storagePath: record.storagePath,
                mimeType: record.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg'
            };
        }).filter(a => a.storagePath);

        // Build request payload
        const request: SwarmRequest = {
            message,
            history: history.length > 0 ? history : undefined,
            imageUrl: imageUrl || undefined,
            attachments: attachments && attachments.length > 0 ? attachments : undefined,
            userProfile: userProfile ? formatProfileForAPI(userProfile) : undefined,
            chatHistorySummary: chatHistorySummary || undefined,
            location: location || undefined,
            mode,
            userId: userId || undefined,
            chatId: chatId || undefined
        };

        // Add health records context text (listing filenames) for awareness
        if (healthRecords && healthRecords.length > 0) {
            const recordsInfo = healthRecords.map((r, i) => `${i + 1}. ${r.fileName} (${r.fileType})`).join('\n');
            request.chatHistorySummary = (request.chatHistorySummary || '') +
                `\n\n[SYSTEM] The user has the following medical files in their Vault. You have access to read them if relevant:\n${recordsInfo}`;
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

        // ------------------------------------------------------------------
        // FAIL-SAFE FALLBACK: CLIENT-SIDE GEMINI (If Backend Fails)
        // ------------------------------------------------------------------
        try {
            console.warn('[Ekam API] Attempting client-side fallback (Fail-Safe Mode)...');
            const { GoogleGenerativeAI } = await import("@google/generative-ai");

            // Use the API key from environment variables (client-side)
            const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `
            You are Ekam, a helpful health assistant.
            The user asked: "${message}"
            
            The advanced medical council is temporarily unreachable.
            Please provide a helpful, safe, and concise answer to the user's question.
            Do not mention technical errors. Just help them.
            `;

            const result = await model.generateContent(prompt);
            const fallbackResponse = result.response.text();

            console.log('[Ekam API] Fallback response generated successfully.');

            return {
                text: fallbackResponse,
                usedCouncil: false,
                agentNotes: [{ agent: 'system', note: 'Response generated via fail-safe mode due to high traffic.' }]
            };

        } catch (fallbackError) {
            console.error('[Ekam API] Critical Fallback Failed:', fallbackError);

            // Ultimate Fail-Safe
            return {
                text: "I'm currently experiencing very high traffic. Please try asking your question again in a moment.",
                usedCouncil: false,
            };
        }
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

// ============================================================================
// SEMANTIC ROUTER API
// ============================================================================

export type QueryComplexity = 'SIMPLE' | 'CRITICAL';

export interface RouterResult {
    type: QueryComplexity;
    reason?: string;
}

// Patterns that indicate a SIMPLE query (instant classification, no network call)
const SIMPLE_PATTERNS = [
    /^(hi|hey|hello|hola|namaste|yo|sup|hii+|heyy+)\b/i,
    /^(thanks|thank you|thx|ty|ok|okay|cool|great|nice|got it|understood|sure)\b/i,
    /^(good morning|good evening|good night|good afternoon|gm|gn)\b/i,
    /^(bye|goodbye|see you|later|cya)\b/i,
    /^(who are you|what are you|what can you do|how do you work)\b/i,
    /^(what is my (age|weight|height|name|profile|location|bmi))\b/i,
    /^(how old am i|my age|my weight|my height|my bmi)\b/i,
    /^(where (is|are) my (profile|settings|vault|records))\b/i,
    /^(how do i (upload|use|navigate|change|update))\b/i,
];

// Patterns that indicate a CRITICAL query (needs full council)
const CRITICAL_PATTERNS = [
    /(hurt|pain|ache|sore|burning|sting|throb|cramp)/i,
    /(symptom|diagnos|condition|disease|disorder|syndrome|infection)/i,
    /(blood|pressure|sugar|cholesterol|glucose|thyroid|hormone)/i,
    /(rash|itch|swelling|lump|bump|lesion|wound)/i,
    /(dizzy|nausea|vomit|faint|breathless|palpitat)/i,
    /(anxiety|depress|insomnia|fatigue|exhausted)/i,
    /(diet for|exercise for|treatment|medication|supplement|dosage)/i,
    /(lab report|test result|blood test|scan|x-ray|mri)/i,
    /(pregnant|period|cycle|fertility|pcos)/i,
    /(cancer|tumor|surgery|operation|emergency)/i,
    /(allerg|asthma|diabetes|hypertension|cardiac)/i,
];

/**
 * Instant client-side query classification (zero latency).
 * Uses regex heuristics to classify SIMPLE vs CRITICAL queries.
 * Defaults to CRITICAL for ambiguous queries (safe fallback).
 */
export function classifyLocally(text: string): QueryComplexity {
    const trimmed = text.trim();

    // Very short messages (1-3 words, no medical keywords) are almost always simple
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount <= 3) {
        // Check if any critical pattern matches even in short text
        const hasCritical = CRITICAL_PATTERNS.some(p => p.test(trimmed));
        if (!hasCritical) {
            console.log('[Ekam Router] Local classification: SIMPLE (short message)');
            return 'SIMPLE';
        }
    }

    // Check explicit SIMPLE patterns
    const isSimple = SIMPLE_PATTERNS.some(p => p.test(trimmed));
    if (isSimple) {
        console.log('[Ekam Router] Local classification: SIMPLE (pattern match)');
        return 'SIMPLE';
    }

    // Check explicit CRITICAL patterns
    const isCritical = CRITICAL_PATTERNS.some(p => p.test(trimmed));
    if (isCritical) {
        console.log('[Ekam Router] Local classification: CRITICAL (pattern match)');
        return 'CRITICAL';
    }

    // Default to CRITICAL for safety (anything ambiguous gets full analysis)
    console.log('[Ekam Router] Local classification: CRITICAL (default/ambiguous)');
    return 'CRITICAL';
}

const classifyQueryFn = httpsCallable<{ text: string }, RouterResult>(functions, 'classifyQueryCallable');

/**
 * Server-side query classification (kept as fallback, no longer called by default).
 * Returns 'SIMPLE' (Express Lane) or 'CRITICAL' (Council Lane).
 */
export async function routeQuery(text: string): Promise<QueryComplexity> {
    try {
        console.log('[Ekam Router] Classifying query (server)...');
        const result = await classifyQueryFn({ text });
        const classification = result.data.type || 'CRITICAL';
        console.log('[Ekam Router] Server classification:', classification);
        return classification as QueryComplexity;
    } catch (error) {
        console.warn('[Ekam Router] Server classification failed (defaulting to CRITICAL):', error);
        return 'CRITICAL';
    }
}

// ============================================================================
// FLASH MEMORY API
// ============================================================================

export interface ClinicalFact {
    category: string;
    fact: string;
    action: 'add' | 'remove' | 'update';
}

const extractFactsFn = httpsCallable<{ text: string }, { facts: ClinicalFact[] }>(functions, 'extractClinicalFactsCallable');

/**
 * Rapidly extract clinical facts from user text
 * Returns immediately for optimistic UI updates
 */
export async function extractMemory(text: string): Promise<ClinicalFact[]> {
    try {
        console.log('[Ekam Memory] extracting facts...');
        const result = await extractFactsFn({ text });
        const facts = result.data.facts || [];

        if (facts.length > 0) {
            console.log('[Ekam Memory] Extracted:', facts);
        }
        return facts;
    } catch (error) {
        console.warn('[Ekam Memory] Extraction failed (non-critical):', error);
        return [];
    }
}

/**
 * Transcribe audio using Google Cloud Speech-to-Text (Chirp) via Backend
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
    console.log('[Ekam API] transcribeAudio called with blob size:', audioBlob.size, 'type:', audioBlob.type);
    if (audioBlob.size < 100) {
        console.warn('[Ekam API] Audio blob is too small, likely empty recording.');
        return '';
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            try {
                const base64String = reader.result as string;
                console.log('[Ekam API] Blob converted to base64. Length:', base64String.length);
                const base64Audio = base64String.split(',')[1];

                console.log('[Ekam API] Sending to backend function...');
                const result = await transcribeAudioFn({ audio: base64Audio });
                console.log('[Ekam API] Backend response:', result.data);

                resolve(result.data.text);
            } catch (error) {
                console.error('[Ekam API] Transcription failed:', error);
                // Log detailed error if available
                if (typeof error === 'object' && error !== null) {
                    console.error('[Ekam API] Error details:', JSON.stringify(error, null, 2));
                }
                reject(error);
            }
        };
        reader.onerror = (error) => {
            console.error('[Ekam API] FileReader error:', error);
            reject(error);
        };
    });
}
