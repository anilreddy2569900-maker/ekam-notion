/**
 * EKAM SWARM ENGINE - Cloud Functions Entry Point
 * 
 * Firebase Cloud Functions with Vertex AI backend
 * Project: ekam-8bf91
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import './firebase'; // Ensures initialization runs FIRST
import { db } from './firebase';
import { runSwarm } from './swarm/engine';
import { extractClinicalFacts, MemoryExtractionResult } from './swarm/memory';
import { classifyQuery, RouterResult } from './swarm/router';
import { ProcessMessageRequest, SwarmResult } from './swarm/types';
import { transcribeAudio } from './transcribe';

// Attachments Trigger
// Attachments Trigger
import { onFileUpload } from './triggers/storage';
// WhatsApp Trigger
import { whatsappWebhook } from './whatsapp';

import { telegramWebhook, registerTelegramBot, disconnectTelegramBot, onTelegramMessageSync } from './telegram';

// Messaging Async Trigger
import { onMessagingTrigger } from './triggers/messaging';

// Summary Generation Function
import { generateClinicalSummary } from './summary';

export { onFileUpload, whatsappWebhook, telegramWebhook, onMessagingTrigger, generateClinicalSummary, registerTelegramBot, disconnectTelegramBot, onTelegramMessageSync };

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
        timeoutSeconds: 300,
        maxInstances: 100, // Reduced from 500 to fit quota
        minInstances: 1,
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
            mode,
            userId,
            chatId,
            godMode
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
            // SCALABILITY: Capped at 4MB to prevent memory spikes under concurrent load
            // The 1GiB Cloud Function memory must be shared across all concurrent processing
            let imageBase64: string | undefined;
            let imageMimeType: string | undefined;

            if (imageUrl) {
                try {
                    const imageResponse = await fetch(imageUrl);

                    // Validate response
                    if (!imageResponse.ok) {
                        console.warn(`[Ekam] Image fetch failed with status ${imageResponse.status}`);
                    } else {
                        const contentType = imageResponse.headers.get('content-type') || '';

                        // Only accept actual image content types
                        if (!contentType.startsWith('image/')) {
                            console.warn(`[Ekam] Image URL returned non-image content-type: ${contentType}. Skipping.`);
                        } else {
                            const imageBuffer = await imageResponse.arrayBuffer();

                            // Reject tiny responses (likely error pages) and oversized ones
                            // SCALABILITY: Reduced from 10MB to 4MB — prevents Node.js memory exhaustion
                            // when many concurrent requests are downloading images simultaneously
                            if (imageBuffer.byteLength < 100) {
                                console.warn('[Ekam] Image too small, likely invalid. Skipping.');
                            } else if (imageBuffer.byteLength > 4 * 1024 * 1024) {
                                console.warn(`[Ekam] Image too large (${Math.round(imageBuffer.byteLength / 1024 / 1024)}MB > 4MB limit). Skipping to protect memory.`);
                            } else {
                                imageBase64 = Buffer.from(imageBuffer).toString('base64');
                                imageMimeType = contentType;
                                console.log(`[Ekam] Image fetched and converted (${Math.round(imageBuffer.byteLength / 1024)}KB, ${contentType})`);
                            }
                        }
                    }
                } catch (imageError) {
                    console.error('[Ekam] Failed to fetch image:', imageError);
                    // Continue without image — imageBase64 stays undefined
                }
            }

            const bucketName = 'ekam-8bf91.firebasestorage.app'; // Production Bucket

            // Process Attachments (Map storagePath -> gs:// URI)
            const attachments = request.data.attachments?.map(a => ({
                fileUri: `gs://${bucketName}/${a.storagePath}`,
                mimeType: a.mimeType
            }));

            if (attachments && attachments.length > 0) {
                console.log(`[Ekam] Attached ${attachments.length} files for multimodal reading.`);
            }

            // Set up live thinking progress if we have userId and chatId
            // SCALABILITY: Debounced writer — max 1 Firestore write per 1.5s
            // Prevents Firestore's 1 write/sec/doc limit from being hit under load
            let thinkingDocRef: FirebaseFirestore.DocumentReference | null = null;
            let onProgress = undefined;

            const resolvedUserId = userId || request.auth?.uid;
            if (resolvedUserId && chatId && mode !== 'SIMPLE') {
                thinkingDocRef = db.doc(`users/${resolvedUserId}/chats/${chatId}/thinking/current`);
                // Initialize thinking doc
                await thinkingDocRef.set({
                    phase: 'routing',
                    agents: {},
                    selectedAgents: [],
                    updatedAt: FieldValue.serverTimestamp()
                });

                // Debounce state: buffer writes and flush at controlled intervals
                let pendingUpdate: any = null;
                let lastFlushTime = 0;
                const FLUSH_INTERVAL_MS = 1500; // Max 1 write per 1.5 seconds
                let flushTimer: ReturnType<typeof setTimeout> | null = null;

                const flushToFirestore = async (update: any) => {
                    if (!thinkingDocRef) return;
                    try {
                        await thinkingDocRef.set({
                            ...update,
                            updatedAt: FieldValue.serverTimestamp()
                        }, { merge: true });
                        lastFlushTime = Date.now();
                    } catch (e) {
                        console.warn('[Ekam] Thinking progress flush failed:', e);
                    }
                };

                onProgress = async (update: any) => {
                    pendingUpdate = update; // Always keep latest state
                    const now = Date.now();
                    const elapsed = now - lastFlushTime;

                    if (elapsed >= FLUSH_INTERVAL_MS) {
                        // Enough time passed — flush immediately
                        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
                        await flushToFirestore(pendingUpdate);
                        pendingUpdate = null;
                    } else if (!flushTimer) {
                        // Schedule a delayed flush for the remaining interval
                        flushTimer = setTimeout(async () => {
                            flushTimer = null;
                            if (pendingUpdate) {
                                await flushToFirestore(pendingUpdate);
                                pendingUpdate = null;
                            }
                        }, FLUSH_INTERVAL_MS - elapsed);
                    }
                };
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
                mode,
                attachments,
                onProgress,
                godMode
            );

            // Clean up thinking doc
            if (thinkingDocRef) {
                try { await thinkingDocRef.delete(); } catch (e) { /* ignore cleanup errors */ }
            }

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
        maxInstances: 100, // Reduced from 300 to fit quota
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
        maxInstances: 100, // Reduced from 300 to fit quota
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

export { transcribeAudio };
