/**
 * EKAM SWARM ENGINE - Cloud Functions Entry Point
 * 
 * Firebase Cloud Functions with Vertex AI backend
 * Project: project-health-de9dd
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { runSwarm } from './swarm/engine';
import { extractClinicalFacts, MemoryExtractionResult } from './swarm/memory';
import { classifyQuery, RouterResult } from './swarm/router';
import { ProcessMessageRequest, SwarmResult } from './swarm/types';

// Initialize Firebase Admin
// Attachments Trigger
import { onFileUpload } from './triggers/storage';
export { onFileUpload };

/**
 * Main callable function for processing user messages
 * 
 * Called from frontend via: httpsCallable(functions, 'processMessage')
 */
export const processMessage = onCall<ProcessMessageRequest, Promise<SwarmResult>>(
    {
        cors: true,
        region: 'us-central1',
        memory: '1GiB',
        timeoutSeconds: 120,
        maxInstances: 100,
    },
    async (request) => {
        // Verify authentication (optional but recommended)
        if (!request.auth) {
            console.warn('[Ekam] Unauthenticated request received');
            // Allow for now, but log warning
        }

        const {
            message,
            history,
            imageUrl,
            userProfile,
            chatHistorySummary,
            location,
            mode
        } = request.data;

        // Validate input
        if (!message || typeof message !== 'string') {
            throw new HttpsError('invalid-argument', 'Message is required and must be a string');
        }

        console.log('[Ekam] Processing message:', message.substring(0, 100));
        console.log('[Ekam] Mode:', mode || 'COMPLEX (Default)');
        console.log('[Ekam] User:', request.auth?.uid || 'anonymous');

        try {
            // Fetch and convert image if URL provided
            let imageBase64: string | undefined;
            let imageMimeType: string | undefined;

            if (imageUrl) {
                try {
                    const imageResponse = await fetch(imageUrl);
                    const imageBuffer = await imageResponse.arrayBuffer();
                    imageBase64 = Buffer.from(imageBuffer).toString('base64');
                    imageMimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
                    console.log('[Ekam] Image fetched and converted');
                } catch (imageError) {
                    console.error('[Ekam] Failed to fetch image:', imageError);
                    // Continue without image
                }
            }

            const bucketName = 'project-health-de9dd.firebasestorage.app'; // Production Bucket

            // Process Attachments (Map storagePath -> gs:// URI)
            const attachments = request.data.attachments?.map(a => ({
                fileUri: `gs://${bucketName}/${a.storagePath}`,
                mimeType: a.mimeType
            }));

            if (attachments && attachments.length > 0) {
                console.log(`[Ekam] Attached ${attachments.length} files for multimodal reading.`);
            }

            // Run the Swarm Engine
            const result = await runSwarm(
                message,
                history,
                userProfile,
                location,
                imageBase64,
                imageMimeType,
                chatHistorySummary,
                mode, // Pass the mode!
                attachments // Pass the files!
            );

            console.log('[Ekam] Response generated successfully');
            console.log('[Ekam] Agents consulted:', result.agentNotes.length);
            console.log('[Ekam] Cross-consultations:', result.consultations?.length || 0);

            return result;
        } catch (error) {
            console.error('[Ekam] Error processing message:', error);
            throw new HttpsError('internal', 'Failed to process message. Please try again.');
        }
    }
);

/**
 * Health check endpoint
 */
export const healthCheck = onCall(
    {
        cors: true,
        region: 'us-central1',
    },
    async () => {
        return {
            status: 'healthy',
            version: '2.0.0',
            engine: 'Ekam Swarm Engine',
            timestamp: new Date().toISOString()
        };
    }
);

/**
 * Flash Memory Extraction - Callable Function
 * High-speed observer for clinical facts
 */
export const extractClinicalFactsCallable = onCall<{ text: string }, Promise<MemoryExtractionResult>>(
    {
        cors: true,
        region: 'us-central1',
        memory: '256MiB', // Lightweight
        timeoutSeconds: 10, // Fast timeout
        maxInstances: 100,
    },
    async (request) => {
        if (!request.auth) {
            console.warn('[Memory] Unauthenticated request');
        }

        const { text } = request.data;
        if (!text || typeof text !== 'string') {
            throw new HttpsError('invalid-argument', 'Text is required');
        }
        return await extractClinicalFacts(text);
    }
);

/**
 * Semantic Router - Callable Function
 * Classifies query complexity
 */
export const classifyQueryCallable = onCall<{ text: string }, Promise<RouterResult>>(
    {
        cors: true,
        region: 'us-central1',
        memory: '256MiB',
        timeoutSeconds: 5, // Very fast
        maxInstances: 100,
    },
    async (request) => {
        if (!request.auth) {
            console.warn('[Router] Unauthenticated request');
        }

        const { text } = request.data;
        if (!text || typeof text !== 'string') {
            throw new HttpsError('invalid-argument', 'Text is required');
        }

        return await classifyQuery(text);
    }
);
