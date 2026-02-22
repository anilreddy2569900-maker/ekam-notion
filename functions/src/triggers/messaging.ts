import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import { runSwarm } from '../swarm/engine';
import { sendTelegramMessage } from '../telegram';
import { sendWhatsAppMessage } from '../whatsapp';
import { db } from '../firebase';

const telegramToken = defineSecret('TELEGRAM_TOKEN');
const whatsappToken = defineSecret('WHATSAPP_TOKEN');

export const onMessagingTrigger = onDocumentCreated(
    {
        document: 'users/{userId}/chats/{platform}/messages/{messageId}',
        secrets: [telegramToken, whatsappToken],
        region: 'us-central1'
    },
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const data = snapshot.data();
        const { userId, platform } = event.params;

        // We only trigger when the user sends a message.
        // We do not want an infinite loop when the assistant responds.
        if (data.role !== 'user') return;

        // We only care about external messaging platforms for this trigger
        if (platform !== 'telegram' && platform !== 'whatsapp') return;

        const text = data.content;
        const tempImageId = data.tempImageId;
        const tempDocumentId = data.tempDocumentId;
        const incomingFileName = data.originalFileName || 'Document';
        const incomingMimeType = data.mimeType;

        try {
            // 1. Get User Profile for Context & Routing Details
            const profileSnapshot = await db.collection(`users/${userId}/profile`).doc('health_data').get();
            const userProfile = profileSnapshot.exists ? profileSnapshot.data() : undefined;

            if (!userProfile) {
                logger.warn(`[MessagingTrigger] Profile missing for user ${userId}`);
                return;
            }

            // 2. Fetch Chat History
            const chatRef = db.doc(`users/${userId}/chats/${platform}`);
            const messagesRef = chatRef.collection('messages');

            // Limit to last 10 messages for context
            const historySnapshot = await messagesRef
                .orderBy('timestamp', 'asc')
                .limitToLast(10)
                .get();

            const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

            // Exclude the current message from history to avoid duplication in context
            historySnapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                if (doc.id !== event.params.messageId) {
                    const msgData = doc.data();
                    history.push({
                        role: msgData.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msgData.content }]
                    });
                }
            });

            // 3. Handle Images and Documents attached to the message
            let imageBase64: string | undefined = undefined;
            let imageMimeType: string | undefined = undefined;
            const attachments: { fileUri: string, mimeType: string }[] = [];

            // --- TELEGRAM DOWNLOADS ---
            if (platform === 'telegram' && (tempImageId || tempDocumentId)) {
                const token = telegramToken.value();
                const fileId = tempImageId || tempDocumentId;

                // Get File Path from Telegram API
                const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                const fileData = await fileRes.json();

                if (fileData.ok) {
                    const filePath = fileData.result.file_path;
                    // Download File Bytes arrayBuffer
                    const downloadRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
                    const arrayBuffer = await downloadRes.arrayBuffer();

                    if (tempImageId) {
                        // Pass image directly inline to multimodal swarm if it's just a raw photo payload
                        imageBase64 = Buffer.from(arrayBuffer).toString('base64');
                        imageMimeType = 'image/jpeg';
                    } else if (tempDocumentId) {
                        // It's a document (like a PDF). Upload to Firebase Storage so Vault can use it.
                        const buffer = Buffer.from(arrayBuffer);
                        const timestamp = Date.now();
                        const storagePath = `uploads/${userId}/${timestamp}_${incomingFileName}`;
                        const storageBucket = getStorage().bucket('ekam-8bf91.firebasestorage.app');
                        const fileRef = storageBucket.file(storagePath);

                        await fileRef.save(buffer, {
                            contentType: incomingMimeType || 'application/octet-stream',
                        });
                        logger.info(`[MessagingTrigger] PDF/Doc Uploaded to Storage: ${storagePath}`);

                        // Make file public temporarily or use signed URL if required by frontend 
                        // To match React app behavior seamlessly:
                        await fileRef.makePublic();
                        const fileUrl = fileRef.publicUrl();

                        // Add Vault Entry
                        await db.collection(`users/${userId}/vault`).add({
                            fileName: incomingFileName,
                            fileUrl: fileUrl,
                            fileType: incomingMimeType?.includes('pdf') ? 'pdf' : 'other',
                            size: buffer.length,
                            uploadedAt: FieldValue.serverTimestamp(),
                            storagePath: storagePath
                        });

                        // Add to attachments for Swarm Context
                        attachments.push({
                            fileUri: `gs://ekam-8bf91.firebasestorage.app/${storagePath}`,
                            mimeType: incomingMimeType || 'application/pdf'
                        });
                    }
                }
            }

            // --- WHATSAPP DOWNLOADS ---
            if (platform === 'whatsapp' && (tempImageId || tempDocumentId)) {
                const token = whatsappToken.value();
                const mediaId = tempImageId || tempDocumentId;

                // 1. Get Media URL
                const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const mediaData = await mediaRes.json();

                if (mediaData.url) {
                    // 2. Download File Bytes
                    const downloadRes = await fetch(mediaData.url, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const arrayBuffer = await downloadRes.arrayBuffer();

                    if (tempImageId) {
                        // Pass image directly (base64)
                        imageBase64 = Buffer.from(arrayBuffer).toString('base64');
                        imageMimeType = incomingMimeType || 'image/jpeg';
                    } else if (tempDocumentId) {
                        // It's a document. Upload to Firebase Storage Vault.
                        const buffer = Buffer.from(arrayBuffer);
                        const timestamp = Date.now();
                        const fileName = incomingFileName || `WhatsApp_Doc_${timestamp}.pdf`;
                        const storagePath = `uploads/${userId}/${timestamp}_${fileName}`;

                        const storageBucket = getStorage().bucket('ekam-8bf91.firebasestorage.app');
                        const fileRef = storageBucket.file(storagePath);

                        await fileRef.save(buffer, {
                            contentType: incomingMimeType || 'application/octet-stream',
                        });

                        await fileRef.makePublic();
                        const fileUrl = fileRef.publicUrl();

                        // Add Vault Entry
                        await db.collection(`users/${userId}/vault`).add({
                            fileName: fileName,
                            fileUrl: fileUrl,
                            fileType: incomingMimeType?.includes('pdf') ? 'pdf' : 'other',
                            size: buffer.length,
                            uploadedAt: FieldValue.serverTimestamp(),
                            storagePath: storagePath
                        });

                        // Add to attachments array for AI
                        attachments.push({
                            fileUri: `gs://ekam-8bf91.firebasestorage.app/${storagePath}`,
                            mimeType: incomingMimeType || 'application/pdf'
                        });
                    }
                } else {
                    logger.error(`[MessagingTrigger] Failed to get media URL from WhatsApp for media ID ${mediaId}`, mediaData);
                }
            }

            // 4. Gather Vault Records for Contextual Analysis
            // The user wanted the AI to look at OTHER pdfs in the Vault as well.
            const vaultSnapshot = await db.collection(`users/${userId}/vault`).get();
            if (!vaultSnapshot.empty) {
                vaultSnapshot.forEach(doc => {
                    const vaultData = doc.data();
                    // Don't re-add the one we JUST uploaded (we just put it in attachments above)
                    if (vaultData.storagePath) {
                        const expectedUri = `gs://ekam-8bf91.firebasestorage.app/${vaultData.storagePath}`;
                        if (!attachments.find(a => a.fileUri === expectedUri)) {
                            attachments.push({
                                fileUri: expectedUri,
                                // Convert frontend fileType to MIME for Vertex
                                mimeType: vaultData.fileType === 'pdf' ? 'application/pdf' : (vaultData.fileType === 'image' ? 'image/jpeg' : 'application/octet-stream')
                            });
                        }
                    }
                });
            }

            // 5. Run Swarm
            const result = await runSwarm(
                text + "\n If the user attached a document, provide an auto-generated descriptive name based on its contents using the format ||RENAME: New_File_Name_Here.pdf|| inside your response. Do not use quotes in the rename tag.",
                history,
                userProfile,
                undefined, // location not supported yet via generic trigger
                imageBase64,
                imageMimeType,
                undefined, // chat history summary
                'CRITICAL',
                attachments.length > 0 ? attachments : undefined,
                undefined
            );

            let aiResponse = result.response;

            // Handle the auto-rename tag if present
            const renameMatch = aiResponse.match(/\|\|RENAME:\s*(.*?)\|\|/);
            if (renameMatch && renameMatch[1]) {
                const newName = renameMatch[1].trim();
                aiResponse = aiResponse.replace(renameMatch[0], '').trim();

                // If we uploaded a document in this request, update its name in Vault
                if (tempDocumentId) {
                    // Find the vault doc we just added via query since we didn't save the reference ID directly
                    const vaultQuery = await db.collection(`users/${userId}/vault`)
                        .where('fileName', '==', incomingFileName || 'Document')
                        .orderBy('uploadedAt', 'desc')
                        .limit(1)
                        .get();

                    if (!vaultQuery.empty) {
                        await vaultQuery.docs[0].ref.update({
                            fileName: newName
                        });
                        logger.info(`[MessagingTrigger] Auto-renamed vault file to ${newName}`);
                    }
                }
            }

            // 5. Send Response back to Platform
            if (platform === 'telegram') {
                const telegramId = userProfile.telegramId;
                if (telegramId) {
                    await sendTelegramMessage(telegramId, aiResponse, telegramToken.value());
                } else {
                    logger.error(`[MessagingTrigger] No telegramId found in profile for user ${userId}`);
                }
            } else if (platform === 'whatsapp') {
                // The whatsapp trigger doesn't have the businessPhoneNumberId easily accessible here.
                // We could store it in the chat metadata, but for now we'll use a hardcoded or environment one.
                // Wait, we can fetch businessPhoneNumberId from the chat metadata if we save it there.
                // Let's assume userProfile.phoneNumber is the TO address.
                // Actually, it's safer to read the businessPhoneNumberId from the chat doc.
                const chatDoc = await chatRef.get();
                const businessPhoneNumberId = chatDoc.data()?.businessPhoneNumberId || "300329596489434"; // Default fallback to EKAM test number
                const toPhone = userProfile.phoneNumber;

                if (toPhone) {
                    // Clean up "+" for WhatsApp API
                    const formattedPhone = toPhone.startsWith('+') ? toPhone.substring(1) : toPhone;
                    await sendWhatsAppMessage(formattedPhone, aiResponse, businessPhoneNumberId, whatsappToken.value());
                } else {
                    logger.error(`[MessagingTrigger] No phoneNumber found in profile for user ${userId}`);
                }
            }

            // 6. Save AI Response to Firestore
            await messagesRef.add({
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date()
            });

            // 7. Update Chat Preview
            await chatRef.set({
                updatedAt: new Date(),
                preview: aiResponse.substring(0, 50) + '...'
            }, { merge: true });

        } catch (error) {
            logger.error(`[MessagingTrigger] Error processing message for ${platform}`, error);

            // Try to get profile again just for fallback
            try {
                const profileSnapshot = await db.doc(`users/${userId}/profile/health_data`).get();
                const userProfileFallback = profileSnapshot.exists ? profileSnapshot.data() : undefined;
                if (platform === 'telegram' && userProfileFallback && userProfileFallback.telegramId) {
                    await sendTelegramMessage(userProfileFallback.telegramId, "⚠️ I encountered an error processing your request. Please try again.", telegramToken.value());
                }
            } catch (fallbackError) {
                logger.error(`[MessagingTrigger] Fallback failed`, fallbackError);
            }
        }
    }
);
