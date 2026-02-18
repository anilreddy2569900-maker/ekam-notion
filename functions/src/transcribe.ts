import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { SpeechClient } from '@google-cloud/speech';

const speechClient = new SpeechClient({
    projectId: 'ekam-8bf91'
});

interface TranscribeRequest {
    audio: string; // Base64 encoded audio
    languageCode?: string; // Optional, defaults to auto-detect or en-US
}

interface TranscribeResponse {
    text: string;
    languageCode: string;
}

export const transcribeAudio = onCall<TranscribeRequest, Promise<TranscribeResponse>>(
    {
        cors: true,
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 60,
        maxInstances: 10,
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
        console.log('[Transcribe] Env Project:', process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT);

        try {
            // Lazy load client or use global instance (global is fine usually, but let's be safe)
            // const client = new SpeechClient(); // Using global for caching connections

            // Configure Request for Chirp (USM)
            const recognitionRequest = {
                config: {
                    encoding: 'WEBM_OPUS' as const,
                    // sampleRateHertz: 48000, // Let Google detect from WebM header
                    languageCode: languageCode || 'en-US',
                    alternativeLanguageCodes: ['hi-IN', 'te-IN', 'ta-IN', 'bn-IN', 'mr-IN'],
                    enableAutomaticPunctuation: true,
                    model: 'latest_long',
                    useEnhanced: true,
                },
                audio: {
                    content: audio,
                },
            };

            console.log('[Transcribe] Sending request to Google Speech API...');
            const [response] = await speechClient.recognize(recognitionRequest as any);

            const transcription = response.results
                ?.map(result => result.alternatives?.[0].transcript)
                .join('\n');

            const detectedLanguage = response.results?.[0]?.languageCode || 'en-US';

            if (!transcription) {
                console.warn('[Transcribe] No transcription result.');
                return { text: '', languageCode: detectedLanguage };
            }

            console.log(`[Transcribe] Success (${detectedLanguage}): ${transcription.substring(0, 50)}...`);
            return { text: transcription, languageCode: detectedLanguage };

        } catch (error) {
            console.error('[Transcribe] Critical Error:', error);
            // Throwing HttpsError ensures 500 but with specific code
            throw new HttpsError('internal', 'Transcription failed: ' + (error instanceof Error ? error.message : String(error)));
        }
    }
);
