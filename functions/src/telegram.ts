
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db } from './firebase';
import { defineSecret } from 'firebase-functions/params';

// Define Configuration Parameters (Secrets)
const telegramToken = defineSecret('TELEGRAM_TOKEN');

/**
 * Helper: Send Message to Telegram
 */
export async function sendTelegramMessage(chatId: number | string, text: string, token: string, replyMarkup?: any) {
    try {
        const body: any = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
        };

        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }

        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const result = await response.json();
        if (!result.ok) {
            logger.error('[Telegram] Send Failed', result);
        }
    } catch (e) {
        logger.error('[Telegram] Network Error', e);
    }
}

/**
 * Telegram Webhook
 */
export const telegramWebhook = onRequest({ cors: true, secrets: [telegramToken] }, async (req, res) => {
    // 1. Validate Token (Optional but good practice to check secret availability)
    const token = telegramToken.value();
    if (!token) {
        logger.error('[Telegram] Secret TELEGRAM_TOKEN not set.');
        res.sendStatus(500);
        return;
    }

    // 2. Handle Event (POST only)
    if (req.method !== 'POST') {
        res.sendStatus(403);
        return;
    }

    const update = req.body;
    const message = update.message;

    if (!message) {
        // Could be edited_message, etc. Ignore for now.
        res.sendStatus(200);
        return;
    }

    // Ignore messages older than 5 minutes to prevent processing huge backlogs
    // that Telegram queues up if the webhook was failing, preventing spam floods.
    const now = Math.floor(Date.now() / 1000);
    if (message.date && (now - message.date > 300)) {
        logger.warn(`[Telegram] Ignoring old message. Too stale: ${message.date}`);
        res.sendStatus(200);
        return;
    }

    const chatId = message.chat.id;
    const telegramId = message.from.id;
    const text = message.text;
    const contact = message.contact;

    try {
        // 3. User Identification
        // Strategy: Look for existing link by telegramId
        let userProfile: any = null;

        const snapshot = await db.collectionGroup('profile')
            .where('telegramId', '==', telegramId)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            userProfile = doc.data();
        }

        // 4. Handle Contact Sharing (Linking)
        if (contact && !userProfile) {
            // User sent a contact. Does it match a registered phone number?
            // Telegram numbers usually have no + or different formats. Sanitize.
            let phone = contact.phone_number;
            if (!phone.startsWith('+')) {
                phone = `+${phone}`;
            }

            // Try to find user by this phone
            const profileSnap = await db.collectionGroup('profile')
                .where('phoneNumber', '==', phone)
                .limit(1)
                .get();

            if (!profileSnap.empty) {
                // MATCH FOUND! Link account.
                const doc = profileSnap.docs[0];
                await doc.ref.update({ telegramId: telegramId });

                await sendTelegramMessage(chatId, "✅ Account Linked! I am Ekam, your personal health AI. How can I help you today?", token, { remove_keyboard: true });
                res.sendStatus(200);
                return;
            } else {
                // No match
                await sendTelegramMessage(chatId, "❌ I couldn't find an Ekam account with that phone number. Please sign up on the website first, then try again.", token);
                res.sendStatus(200);
                return;
            }
        }

        // 5. Handle Unknown User (Request Contact)
        if (!userProfile) {
            // Ask for contact
            const keyboard = {
                keyboard: [[{ text: "📱 Share Contact", request_contact: true }]],
                one_time_keyboard: true,
                resize_keyboard: true
            };
            await sendTelegramMessage(chatId, "Welcome to Ekam! Please tap 'Share Contact' below to link your account.", token, keyboard);
            res.sendStatus(200);
            return;
        }

        if (text || message.photo || message.document) {
            let userId = null;
            if (userProfile) {
                const snapshot = await db.collectionGroup('profile')
                    .where('telegramId', '==', telegramId)
                    .limit(1)
                    .get();
                if (!snapshot.empty) userId = snapshot.docs[0].ref.parent.parent?.id;
            }

            if (userId) {
                const chatRef = db.collection('users').doc(userId).collection('chats').doc('telegram');
                const messagesRef = chatRef.collection('messages');

                let contentToSave = text;
                let attachedImageId = null;
                let attachedDocumentId = null;
                let originalFileName = null;
                let mimeType = null;

                if (message.photo) {
                    // Telegram sends an array of photo sizes. The last one is the largest.
                    const largestPhoto = message.photo[message.photo.length - 1];
                    attachedImageId = largestPhoto.file_id;
                    contentToSave = text || "Attached Image";
                    mimeType = 'image/jpeg';
                } else if (message.document) {
                    attachedDocumentId = message.document.file_id;
                    originalFileName = message.document.file_name;
                    mimeType = message.document.mime_type;
                    contentToSave = text || `Attached Document: ${originalFileName}`;
                }

                if (contentToSave) {
                    await messagesRef.add({
                        role: 'user',
                        content: contentToSave,
                        timestamp: new Date(),
                        tempImageId: attachedImageId,
                        tempDocumentId: attachedDocumentId,
                        originalFileName: originalFileName,
                        mimeType: mimeType
                    });

                    // Respond with 'typing...' action asynchronously
                    fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, action: 'typing' })
                    }).catch(e => logger.error('[Telegram] Typing Action Failed', e));
                }
            } else {
                await sendTelegramMessage(chatId, "⚠️ Could not identify user ID.", token);
            }
        }

        res.sendStatus(200);

    } catch (error) {
        logger.error('[Telegram] Error processing webhook', error);
        await sendTelegramMessage(chatId, "⚠️ An error occurred. Please try again later.", token); // Fallback
        res.sendStatus(200);
    }
});
