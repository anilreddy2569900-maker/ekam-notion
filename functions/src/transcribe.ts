import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const sarvamApiKey = defineSecret('SARVAM_API_KEY');

interface TranscribeRequest {
    audio: string; // Base64 encoded audio
    languageCode?: string; // Optional, defaults to auto-detect
}

interface TranscribeResponse {
    text: string;
    languageCode: string;
}

/**
 * Map BCP-47 codes to Sarvam-compatible language codes.
 * Sarvam supports: hi-IN, bn-IN, kn-IN, ml-IN, mr-IN, od-IN, pa-IN, ta-IN, te-IN, en-IN, gu-IN
 * saaras:v3 also: as-IN, ur-IN, ne-IN, kok-IN, ks-IN
 */
function mapToSarvamLanguageCode(code?: string): string {
    if (!code) return 'unknown';

    const map: Record<string, string> = {
        'en-US': 'en-IN',
        'en-IN': 'en-IN',
        'hi-IN': 'hi-IN',
        'te-IN': 'te-IN',
        'ta-IN': 'ta-IN',
        'bn-IN': 'bn-IN',
        'mr-IN': 'mr-IN',
        'kn-IN': 'kn-IN',
        'ml-IN': 'ml-IN',
        'gu-IN': 'gu-IN',
        'pa-IN': 'pa-IN',
        'od-IN': 'od-IN',
        'ur-IN': 'ur-IN',
        'as-IN': 'as-IN',
        'ne-IN': 'ne-IN',
    };

    return map[code] || 'unknown';
}

export const transcribeAudio = onCall<TranscribeRequest, Promise<TranscribeResponse>>(
    {
        cors: true,
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 60,
        maxInstances: 10,
        secrets: [sarvamApiKey],
    },
    async (request) => {
        console.log('[Transcribe] Request received. Auth:', !!request.auth);

        if (!request.auth) {
            console.warn('[Transcribe] Unauthenticated request');
        }

        const { audio, languageCode } = request.data;
        if (!audio) {
            console.error('[Transcribe] No audio data provided');
            throw new HttpsError('invalid-argument', 'Audio data is required');
        }

        console.log('[Transcribe] Audio data length:', audio.length);

        try {
            // Convert base64 to binary buffer
            const audioBuffer = Buffer.from(audio, 'base64');

            // Build multipart form data for Sarvam API
            const FormData = require('form-data');
            const formData = new FormData();

            // Sarvam expects a file upload
            formData.append('file', audioBuffer, {
                filename: 'audio.webm',
                contentType: 'audio/webm',
            });
            formData.append('model', 'saaras:v3');
            formData.append('language_code', mapToSarvamLanguageCode(languageCode));
            formData.append('with_timestamps', 'false');

            console.log('[Transcribe] Sending request to Sarvam AI STT API...');

            const response = await fetch('https://api.sarvam.ai/speech-to-text', {
                method: 'POST',
                headers: {
                    'api-subscription-key': sarvamApiKey.value(),
                    ...formData.getHeaders(),
                },
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Transcribe] Sarvam API Error ${response.status}:`, errorText);
                throw new Error(`Sarvam API Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            const transcription = data.transcript || '';
            const detectedLanguage = data.language_code || languageCode || 'unknown';

            if (!transcription) {
                console.warn('[Transcribe] No transcription result.');
                return { text: '', languageCode: detectedLanguage };
            }

            console.log(`[Transcribe] Success (${detectedLanguage}): ${transcription.substring(0, 50)}...`);
            return { text: transcription, languageCode: detectedLanguage };

        } catch (error) {
            console.error('[Transcribe] Critical Error:', error);
            throw new HttpsError('internal', 'Transcription failed: ' + (error instanceof Error ? error.message : String(error)));
        }
    }
);
