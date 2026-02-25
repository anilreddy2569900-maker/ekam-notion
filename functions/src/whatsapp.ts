import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db } from './firebase';
import { defineSecret } from 'firebase-functions/params';

// Define Configuration Parameters (Secrets)
const whatsappToken = defineSecret('WHATSAPP_TOKEN');
const verifyToken = defineSecret('VERIFY_TOKEN');

/**
 * Helper: Send Message to WhatsApp
 * Scoped properly to be reusable.
 */
export async function sendWhatsAppMessage(to: string, text: string, phoneNumberId: string, token: string) {
    try {
        await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text },
            }),
        });
    } catch (e) {
        logger.error('[WhatsApp] Send Failed', e);
    }
}

/**
 * WhatsApp Webhook
 */
export const whatsappWebhook = onRequest({ cors: true, secrets: [whatsappToken, verifyToken] }, async (req, res) => {
    // 1. Verification (GET)
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === verifyToken.value()) {
            logger.info('[WhatsApp] Verified Webhook');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
        return;
    }

    // 2. Event Handling (POST)
    if (req.method === 'POST') {
        const body = req.body;

        // Check if this is a WhatsApp status update or message
        if (!body.object) {
            res.sendStatus(404);
            return;
        }

        try {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const message = value?.messages?.[0];

            if (message) {
                const businessPhoneNumberId = value.metadata?.phone_number_id;

                if (!businessPhoneNumberId) {
                    logger.error('[WhatsApp] Missing phone_number_id in metadata');
                    res.sendStatus(400); // Bad Request
                    return;
                }

                const from = message.from; // e.g. "919876543210"
                const token = whatsappToken.value();

                // Extract User Identification First
                const query = message.text?.body || "";
                logger.info(`[WhatsApp] Msg from ${from}: ${query} (Type: ${message.type})`);

                // 3. Identify User
                // SCALABILITY: O(1) reverse lookup via phoneToUser/{phone} collection
                // Falls back to collectionGroup query for backwards compatibility
                const possibleNumberPlus = `+${from}`;

                let userDoc = null;

                // FAST PATH: Direct document lookup (O(1), no query)
                const phoneDocPlus = await db.collection('phoneToUser').doc(possibleNumberPlus).get();
                if (phoneDocPlus.exists) {
                    const userId = phoneDocPlus.data()?.userId;
                    if (userId) {
                        const profileDoc = await db.doc(`users/${userId}/profile/health_data`).get();
                        if (profileDoc.exists) {
                            userDoc = profileDoc;
                            logger.info(`[WhatsApp] Fast lookup hit for ${possibleNumberPlus}`);
                        }
                    }
                }

                if (!userDoc) {
                    const phoneDocRaw = await db.collection('phoneToUser').doc(from).get();
                    if (phoneDocRaw.exists) {
                        const userId = phoneDocRaw.data()?.userId;
                        if (userId) {
                            const profileDoc = await db.doc(`users/${userId}/profile/health_data`).get();
                            if (profileDoc.exists) {
                                userDoc = profileDoc;
                                logger.info(`[WhatsApp] Fast lookup hit for ${from}`);
                            }
                        }
                    }
                }

                // SLOW FALLBACK: collectionGroup query (for users not yet in reverse index)
                if (!userDoc) {
                    logger.warn('[WhatsApp] Fast lookup missed, falling back to collectionGroup query');
                    const snapshotPlus = await db.collectionGroup('profile')
                        .where('phoneNumber', '==', possibleNumberPlus)
                        .limit(1)
                        .get();

                    if (!snapshotPlus.empty) {
                        userDoc = snapshotPlus.docs[0];
                        // Auto-populate reverse index for next time
                        const uid = userDoc.ref.parent.parent?.id;
                        if (uid) {
                            db.collection('phoneToUser').doc(possibleNumberPlus).set({ userId: uid, linkedAt: new Date() }).catch(() => { });
                        }
                    } else {
                        const snapshotRaw = await db.collectionGroup('profile')
                            .where('phoneNumber', '==', from)
                            .limit(1)
                            .get();
                        if (!snapshotRaw.empty) {
                            userDoc = snapshotRaw.docs[0];
                            const uid = userDoc.ref.parent.parent?.id;
                            if (uid) {
                                db.collection('phoneToUser').doc(from).set({ userId: uid, linkedAt: new Date() }).catch(() => { });
                            }
                        }
                    }
                }

                if (!userDoc) {
                    await sendWhatsAppMessage(from, "Welcome to Ekam! I don't recognize this number. Please log in to the web app and link your WhatsApp number in Profile Settings.", businessPhoneNumberId, token);
                    res.sendStatus(200);
                    return;
                }

                // Extract User ID
                // Doc path: users/{uid}/profile/health_data (parent=profile, parent.parent=uid)
                const userId = userDoc.ref.parent.parent?.id;

                if (!userId) {
                    logger.error('[WhatsApp] Found profile but no UID parent');
                    res.sendStatus(200);
                    return;
                }

                // 4. Persistence (Matches Website Structure)
                const chatId = 'whatsapp'; // Single persistent chat for WhatsApp
                const chatRef = db.collection('users').doc(userId).collection('chats').doc(chatId);
                const messagesRef = chatRef.collection('messages');

                // Extract Media
                let contentToSave = query;
                let attachedImageId = undefined;
                let attachedDocumentId = undefined;
                let originalFileName = undefined;
                let mimeType = undefined;

                if (message.type === 'image' && message.image) {
                    attachedImageId = message.image.id;
                    mimeType = message.image.mime_type;
                    contentToSave = query || "Attached Image";
                } else if (message.type === 'document' && message.document) {
                    attachedDocumentId = message.document.id;
                    mimeType = message.document.mime_type;
                    originalFileName = message.document.filename;
                    contentToSave = query || `Attached Document: ${originalFileName}`;
                } else if (message.type !== 'text') {
                    logger.info(`[WhatsApp] Unsupported message type from ${from}: ${message.type}`);
                    await sendWhatsAppMessage(from, "I'm sorry, I don't support that message type yet.", businessPhoneNumberId, token);
                    res.sendStatus(200);
                    return;
                }

                // Save User Message (Triggers background function)
                await messagesRef.add({
                    role: 'user',
                    content: contentToSave,
                    timestamp: new Date(),
                    tempImageId: attachedImageId,
                    tempDocumentId: attachedDocumentId,
                    originalFileName: originalFileName,
                    mimeType: mimeType
                });

                // 5. Send 'Mark as Read' and theoretically a Typing Indicator if WhatsApp API allowed it easily
                // But saving to DB is fast enough. Returns 200 OK immediately.

                // We can also mark the message as read on WhatsApp if we want:
                fetch(`https://graph.facebook.com/v18.0/${businessPhoneNumberId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        status: 'read',
                        message_id: message.id,
                    }),
                }).catch((e: any) => logger.error('[WhatsApp] Mark Read Failed', e));
            }
            res.sendStatus(200);
        } catch (error) {
            logger.error('[WhatsApp] Error processing webhook', error);
            res.sendStatus(500);
        }
    }
});
