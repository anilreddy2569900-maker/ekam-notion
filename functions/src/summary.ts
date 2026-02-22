import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebase';
import { getGenerativeModel } from './utils/vertexai';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { Part } from '@google-cloud/vertexai';

export const generateClinicalSummary = onCall(
    {
        cors: true,
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 300,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Must be logged in to generate summary.');
        }

        const userId = request.auth.uid;
        logger.info(`[Summary] Generating Doctor-Ready Summary for user: ${userId}`);

        try {
            // 1. Fetch Profile
            let profileData: any = {};
            const profileSnap = await db.collection('users').doc(userId).collection('profile').limit(1).get();
            if (!profileSnap.empty) {
                profileData = profileSnap.docs[0].data();
            }

            // 2. Fetch recent Chat History (last 50 messages from web)
            const chatSnap = await db.collection('users').doc(userId).collection('chats').doc('web').collection('messages')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();

            const messages = chatSnap.docs.reverse().map(d => {
                const data = d.data();
                return `${data.role.toUpperCase()}: ${data.content}`;
            }).join('\n\n');

            // 3. Fetch Vault Metadata + Paths for context
            const vaultSnap = await db.collection('users').doc(userId).collection('vault')
                .orderBy('uploadedAt', 'desc')
                .limit(20)
                .get();

            const vaultMeta = vaultSnap.docs.map(d => d.data());
            const fileAttachments: Part[] = [];

            for (const doc of vaultMeta) {
                if (doc.storagePath && (doc.fileType === 'pdf' || doc.fileType === 'image')) {
                    fileAttachments.push({
                        fileData: {
                            fileUri: `gs://ekam-8bf91.firebasestorage.app/${doc.storagePath}`,
                            mimeType: doc.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg'
                        }
                    });
                }
            }

            // Build Context
            const contextText = `
                USER PROFILE:
                ${JSON.stringify(profileData, null, 2)}

                RECENT CHAT HISTORY:
                ${messages}

                VAULT FILES METADATA:
                ${JSON.stringify(vaultMeta.map(v => v.fileName), null, 2)}
            `;

            // 4. Run Gemini
            const model = getGenerativeModel({
                tier: 'PRO',
                thinkingLevel: 'high',
                systemInstruction: `You are the Chief Medical Officer at Ekam Hospital. Your task is to generate a comprehensive, highly professional "Doctor-Ready Clinical Summary" based on the user's profile, their recent chats with the AI health council, and their attached medical documents (lab reports, images).
                FORMAT: Use Markdown. Include these sections:
                - PATIENT OVERVIEW (Demographics, Baseline context)
                - CHIEF COMPLAINTS & RECENT HISTORY (Summarized from chats)
                - MEDICAL DOCUMENT FINDINGS (Summarize the attached vault documents)
                - ACTIVE MEDICATIONS & ALLERGIES
                - ACTIONABLE NEXT STEPS / QUESTIONS FOR THE DOCTOR
                
                Keep it completely objective, clinical, and directly readable by a human doctor. Do NOT address the user directly (do not say "Your recent chats show..."). Instead say "Patient reports...".`
            });

            logger.info(`[Summary] Calling Gemini with ${fileAttachments.length} attachments...`);
            const parts: Part[] = [{ text: contextText }, ...fileAttachments];

            const result = await model.generateContent({
                contents: [{ role: 'user', parts }]
            });

            const summaryText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!summaryText) {
                throw new Error("Empty response from AI");
            }

            // 5. Save Summary to Vault as a Markdown file (or just textual document)

            const fileName = `Clinical_Summary_${new Date().toISOString().split('T')[0]}.md`;

            // To make it downloadable in the app, we can upload it to Storage, OR just save it as text in vault
            // It's cleaner to upload the Markdown string to Storage so the Vault retains uniformity.
            const { getStorage } = await import('firebase-admin/storage');
            const storageBucket = getStorage().bucket('ekam-8bf91.firebasestorage.app');
            const storagePath = `uploads/${userId}/${Date.now()}_${fileName}`;
            const fileRef = storageBucket.file(storagePath);

            await fileRef.save(Buffer.from(summaryText, 'utf8'), {
                contentType: 'text/markdown'
            });
            await fileRef.makePublic();
            const fileUrl = fileRef.publicUrl();

            await db.collection('users').doc(userId).collection('vault').add({
                fileName: fileName,
                fileUrl: fileUrl,
                fileType: 'other',
                size: Buffer.byteLength(summaryText, 'utf8'),
                uploadedAt: FieldValue.serverTimestamp(),
                storagePath: storagePath
            });

            logger.info(`[Summary] Success! Saved to ${storagePath}`);
            return { success: true, url: fileUrl };

        } catch (error) {
            logger.error(`[Summary] Failed to generate summary:`, error);
            throw new HttpsError('internal', 'Failed to generate summary.');
        }
    }
);
