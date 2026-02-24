/**
 * EKAM TELEGRAM INTEGRATION - Rewritten
 *
 * Architecture:
 * - Each user creates their own bot via BotFather and pastes the token into Ekam.
 * - Token is stored in Firestore: users/{uid}/profile/health_data.telegramBotToken
 * - Webhook URL: https://<region>-<project>.cloudfunctions.net/telegramWebhook?uid=USER_ID
 * - On any user message: runs full council swarm + saves to chats/telegram for web history sync.
 */

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase';
import { runSwarm } from './swarm/engine';

// ============================================================================
// CONSTANTS
// ============================================================================

// The public webhook base URL for this Firebase project
const WEBHOOK_BASE_URL = 'https://telegramwebhook-on2wny372a-uc.a.run.app';

// This is derived from the function URL pattern: https://<fnname>-<hash>-uc.a.run.app
// We embed the uid as a query param so a single generic endpoint handles all users.
// The actual function URL is: telegramWebhook?uid=USERID

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sends a message to a Telegram chat using the user's own bot token.
 */
export async function sendTelegramMessage(
    chatId: number | string,
    text: string,
    token: string,
    replyMarkup?: object
) {
    try {
        // Telegram has a 4096 char limit. Split if needed.
        const chunks = splitMessage(text, 4000);
        for (const chunk of chunks) {
            const body: Record<string, unknown> = {
                chat_id: chatId,
                text: chunk,
                parse_mode: 'Markdown',
            };
            if (replyMarkup) body.reply_markup = replyMarkup;

            const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await response.json() as { ok: boolean };
            if (!result.ok) {
                // Retry without markdown if markdown parsing fails
                const plainBody = { ...body, parse_mode: undefined };
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(plainBody),
                });
            }
        }
    } catch (e) {
        logger.error('[Telegram] Send message error', e);
    }
}

/**
 * Splits a long message into chunks at newline boundaries.
 */
function splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let current = '';
    for (const line of text.split('\n')) {
        if ((current + line).length > maxLen) {
            if (current) chunks.push(current.trim());
            current = line + '\n';
        } else {
            current += line + '\n';
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

/**
 * Sends a typing indicator to the Telegram chat.
 */
async function sendTypingAction(chatId: number | string, token: string) {
    fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    }).catch(() => { /* fire and forget */ });
}

// ============================================================================
// CALLABLE: Register Telegram Bot
// ============================================================================

interface RegisterBotRequest {
    token: string;
}

interface RegisterBotResult {
    success: boolean;
    botName: string;
    botUsername: string;
    webhookUrl: string;
}

/**
 * Callable function to register a user's Telegram bot.
 * 1. Validates the token with Telegram API
 * 2. Registers the webhook pointing to /telegramWebhook?uid=USER_ID
 * 3. Stores bot info + token in Firestore profile
 */
export const registerTelegramBot = onCall<RegisterBotRequest, Promise<RegisterBotResult>>(
    {
        cors: true,
        region: 'us-central1',
        memory: '256MiB',
        timeoutSeconds: 15,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Must be authenticated to register a bot.');
        }

        const { token } = request.data;
        if (!token || typeof token !== 'string' || !token.includes(':')) {
            throw new HttpsError('invalid-argument', 'Invalid bot token format. Expected format: 123456:ABCdef...');
        }

        const uid = request.auth.uid;

        try {
            // 1. Validate token by calling getMe
            const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            const getMeData = await getMeRes.json() as { ok: boolean; result?: { first_name: string; username: string } };

            if (!getMeData.ok || !getMeData.result) {
                throw new HttpsError('invalid-argument', 'Invalid bot token. Please check it and try again.');
            }

            const botName = getMeData.result.first_name;
            const botUsername = getMeData.result.username;

            // 2. Register Webhook pointing to /telegramWebhook?uid=USER_ID
            const webhookUrl = `${WEBHOOK_BASE_URL}?uid=${uid}`;

            const webhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    allowed_updates: ['message'],
                    drop_pending_updates: true,
                }),
            });
            const webhookData = await webhookRes.json() as { ok: boolean; description?: string };

            if (!webhookData.ok) {
                logger.error('[Telegram] Webhook registration failed', webhookData);
                throw new HttpsError('internal', `Webhook registration failed: ${webhookData.description}`);
            }

            // 3. Store in Firestore profile
            const profileRef = db.doc(`users/${uid}/profile/health_data`);
            await profileRef.set({
                telegramBotToken: token,
                telegramBotName: botName,
                telegramBotUsername: botUsername,
                telegramConnectedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            // 4. Ensure telegram chat doc exists in Firestore for web sidebar
            const chatRef = db.doc(`users/${uid}/chats/telegram`);
            await chatRef.set({
                title: `Telegram — @${botUsername}`,
                platform: 'telegram',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            logger.info(`[Telegram] Bot registered for user ${uid}: @${botUsername}`);

            return {
                success: true,
                botName,
                botUsername,
                webhookUrl,
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error('[Telegram] registerTelegramBot error', error);
            throw new HttpsError('internal', 'Failed to register bot. Please try again.');
        }
    }
);

// ============================================================================
// CALLABLE: Disconnect Telegram Bot
// ============================================================================

/**
 * Removes webhook and clears bot token from profile.
 */
export const disconnectTelegramBot = onCall(
    { cors: true, region: 'us-central1', memory: '256MiB', timeoutSeconds: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated.');
        const uid = request.auth.uid;

        const profileRef = db.doc(`users/${uid}/profile/health_data`);
        const profileSnap = await profileRef.get();
        const token = profileSnap.data()?.telegramBotToken;

        if (token) {
            // Remove webhook
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: 'POST' });
        }

        // Clear from profile
        await profileRef.update({
            telegramBotToken: FieldValue.delete(),
            telegramBotName: FieldValue.delete(),
            telegramBotUsername: FieldValue.delete(),
            telegramConnectedAt: FieldValue.delete(),
        });

        return { success: true };
    }
);

// ============================================================================
// WEBHOOK: Receive Telegram Updates
// ============================================================================

/**
 * Generic Telegram webhook handler.
 * Identifies user via ?uid= query param.
 * Runs full swarm engine and returns response to Telegram.
 */
export const telegramWebhook = onRequest(
    { cors: true, region: 'us-central1', memory: '1GiB', timeoutSeconds: 300 },
    async (req, res) => {
        // Only accept POST
        if (req.method !== 'POST') {
            res.sendStatus(405);
            return;
        }

        // Get uid from query param
        const uid = req.query.uid as string;
        if (!uid) {
            logger.warn('[Telegram Webhook] Missing uid query param');
            res.sendStatus(400);
            return;
        }

        const update = req.body;
        const message = update.message;

        if (!message) {
            res.sendStatus(200); // Ignore non-message updates
            return;
        }

        // Ignore stale messages (>5 minutes old)
        const now = Math.floor(Date.now() / 1000);
        if (message.date && (now - message.date > 300)) {
            res.sendStatus(200);
            return;
        }

        const telegramChatId = message.chat.id;
        const text = (message.text || '').trim();
        const photo = message.photo;
        const document = message.document;

        // Respond immediately to Telegram (avoid retries)
        res.sendStatus(200);

        // Process in background
        (async () => {
            try {
                // 1. Fetch user's bot token + profile
                const profileRef = db.doc(`users/${uid}/profile/health_data`);
                const profileSnap = await profileRef.get();
                if (!profileSnap.exists) {
                    logger.warn(`[Telegram Webhook] No profile for uid ${uid}`);
                    return;
                }

                const profileData = profileSnap.data()!;
                const token = profileData.telegramBotToken;

                if (!token) {
                    logger.warn(`[Telegram Webhook] No bot token in profile for uid ${uid}`);
                    return;
                }

                // 2. Handle /start command
                if (text.startsWith('/start')) {
                    await sendTelegramMessage(
                        telegramChatId,
                        `👋 *Welcome to Ekam!*\n\nI'm your personal AI health council. Ask me anything about your health, wellness, symptoms, or upload a medical document.\n\n*Try:* "I've been having headaches every morning" or send a photo of a rash.`,
                        token
                    );
                    return;
                }

                if (!text && !photo && !document) {
                    await sendTelegramMessage(telegramChatId, 'Please send a text message, photo, or document.', token);
                    return;
                }

                // 3. Send typing indicator
                await sendTypingAction(telegramChatId, token);

                // 4. Fetch/create the telegram chat doc in Firestore
                const chatRef = db.doc(`users/${uid}/chats/telegram`);
                const messagesRef = chatRef.collection('messages');

                // 5. Save user message to Firestore (for web history)
                const userContent = text || (photo ? '📷 Photo' : '📄 Document');

                let tempImageId: string | undefined;
                let tempDocumentId: string | undefined;
                let originalFileName: string | undefined;
                let mimeType: string | undefined;

                if (photo) {
                    const largest = photo[photo.length - 1];
                    tempImageId = largest.file_id;
                    mimeType = 'image/jpeg';
                }
                if (document) {
                    tempDocumentId = document.file_id;
                    originalFileName = document.file_name;
                    mimeType = document.mime_type;
                }

                await messagesRef.add({
                    role: 'user',
                    content: userContent,
                    createdAt: FieldValue.serverTimestamp(),
                    tempImageId: tempImageId || null,
                    tempDocumentId: tempDocumentId || null,
                    originalFileName: originalFileName || null,
                    mimeType: mimeType || null,
                    source: 'telegram',
                });

                // Update chat doc so it shows up in sidebar and sync trigger can find it
                await chatRef.set({
                    title: 'Telegram',
                    platform: 'telegram',
                    updatedAt: FieldValue.serverTimestamp(),
                    createdAt: FieldValue.serverTimestamp(),
                    preview: userContent.substring(0, 60),
                    telegramChatId: telegramChatId,
                }, { merge: true });

                // 6. Fetch last 10 messages for history context
                const historySnap = await messagesRef
                    .orderBy('createdAt', 'asc')
                    .limitToLast(11) // +1 to exclude current
                    .get();

                const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
                historySnap.docs.slice(0, -1).forEach(doc => {
                    const d = doc.data();
                    history.push({
                        role: d.role === 'user' ? 'user' : 'model',
                        parts: [{ text: d.content }],
                    });
                });

                // 7. Handle image/document downloads
                let imageBase64: string | undefined;
                let imageMimeType: string | undefined;
                const attachments: { fileUri: string; mimeType: string }[] = [];

                if (tempImageId || tempDocumentId) {
                    const fileId = tempImageId || tempDocumentId;
                    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                    const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } };

                    if (fileData.ok && fileData.result) {
                        const downloadRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`);
                        const arrayBuffer = await downloadRes.arrayBuffer();

                        if (tempImageId) {
                            imageBase64 = Buffer.from(arrayBuffer).toString('base64');
                            imageMimeType = 'image/jpeg';
                        } else if (tempDocumentId) {
                            // Upload to Firebase Storage Vault
                            const { getStorage } = await import('firebase-admin/storage');
                            const buffer = Buffer.from(arrayBuffer);
                            const timestamp = Date.now();
                            const fname = originalFileName || `telegram_doc_${timestamp}.pdf`;
                            const storagePath = `uploads/${uid}/${timestamp}_${fname}`;
                            const storageBucket = getStorage().bucket('ekam-8bf91.firebasestorage.app');
                            const fileRef = storageBucket.file(storagePath);
                            await fileRef.save(buffer, { contentType: mimeType || 'application/octet-stream' });
                            await fileRef.makePublic();

                            // Add to Vault
                            await db.collection(`users/${uid}/vault`).add({
                                fileName: fname,
                                fileUrl: fileRef.publicUrl(),
                                fileType: mimeType?.includes('pdf') ? 'pdf' : 'other',
                                size: buffer.length,
                                uploadedAt: FieldValue.serverTimestamp(),
                                storagePath,
                                source: 'telegram',
                            });

                            attachments.push({
                                fileUri: `gs://ekam-8bf91.firebasestorage.app/${storagePath}`,
                                mimeType: mimeType || 'application/pdf',
                            });
                        }
                    }
                }

                // 8. Run full Swarm Engine
                const swarmResult = await runSwarm(
                    text || (photo ? 'Please analyze this image.' : `Please analyze this document: ${originalFileName}`),
                    history,
                    profileData as any,
                    undefined, // location
                    imageBase64,
                    imageMimeType,
                    undefined, // chat history summary
                    'CRITICAL',
                    attachments.length > 0 ? attachments : undefined,
                    undefined  // onProgress not needed for Telegram
                );

                let aiResponse = swarmResult.response;

                // Handle auto-rename tag (for PDF uploads)
                const renameMatch = aiResponse.match(/\|\|RENAME:\s*(.*?)\|\|/);
                if (renameMatch && renameMatch[1] && tempDocumentId) {
                    const newName = renameMatch[1].trim();
                    aiResponse = aiResponse.replace(renameMatch[0], '').trim();
                    const vaultQuery = await db.collection(`users/${uid}/vault`)
                        .where('fileName', '==', originalFileName || 'Document')
                        .orderBy('uploadedAt', 'desc')
                        .limit(1).get();
                    if (!vaultQuery.empty) {
                        await vaultQuery.docs[0].ref.update({ fileName: newName });
                    }
                }

                // 9. Send response back to Telegram
                await sendTelegramMessage(telegramChatId, aiResponse, token);

                // 10. Save AI response to Firestore (for web history)
                await messagesRef.add({
                    role: 'model',
                    content: aiResponse,
                    createdAt: FieldValue.serverTimestamp(),
                    source: 'telegram',
                    agentNotes: swarmResult.agentNotes || [],
                });

                // 11. Update chat preview
                await chatRef.set({
                    updatedAt: FieldValue.serverTimestamp(),
                    preview: aiResponse.substring(0, 60) + '...',
                }, { merge: true });

            } catch (error) {
                logger.error('[Telegram Webhook] Error processing message', error);
                // Try to send error message back to user
                try {
                    const profileSnap = await db.doc(`users/${uid}/profile/health_data`).get();
                    const token = profileSnap.data()?.telegramBotToken;
                    if (token) {
                        await sendTelegramMessage(
                            telegramChatId,
                            '⚠️ I encountered an error processing your message. Please try again in a moment.',
                            token
                        );
                    }
                } catch { /* ignore fallback errors */ }
            }
        })();
    }
);

// ============================================================================
// TRIGGER: Sync Web UI Messages to Telegram App
// ============================================================================

/**
 * Listens for new messages in users/{uid}/chats/telegram/messages.
 * If the message was added from the Web UI (source is NOT 'telegram'),
 * it forwards the message to the user's Telegram app for perfect sync.
 */
export const onTelegramMessageSync = onDocumentCreated(
    {
        document: 'users/{userId}/chats/telegram/messages/{messageId}',
        region: 'us-central1'
    },
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const data = snapshot.data();
        const userId = event.params.userId;

        // If 'source' is 'telegram', it means the webhook already handled/sent it. Ignore.
        if (data.source === 'telegram') return;

        // Fetch user's bot token
        const profileSnap = await db.doc(`users/${userId}/profile/health_data`).get();
        if (!profileSnap.exists) return;

        const token = profileSnap.data()?.telegramBotToken;
        if (!token) return;

        // To send a message to a user, we need their Telegram chat ID.
        // Wait, where do we get the user's Telegram chat ID?
        // Let's get it from the most recent incoming telegram message.
        // Wait, the webhook currently DOES NOT save the user's telegramChatId anywhere globally.
        // Let's modify the webhook to save telegramChatId to the chat doc, and read it here.

        const chatDocSnap = await db.doc(`users/${userId}/chats/telegram`).get();
        const telegramChatId = chatDocSnap.data()?.telegramChatId;

        if (!telegramChatId) {
            logger.warn(`[Telegram Sync] No telegramChatId found for user ${userId}. Cannot sync web message.`);
            return;
        }

        let prefix = '';
        if (data.role === 'user') {
            prefix = '*(Web)*\n';
        } else if (data.role === 'model' || data.role === 'assistant') {
            // It's the AI response from the web
        }

        const messageContent = data.content || (data.imageUrl ? '[Image]' : '[Document]');
        await sendTelegramMessage(telegramChatId, prefix + messageContent, token);
    }
);
