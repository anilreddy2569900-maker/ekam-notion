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
                systemInstruction: `You are the Chief Medical Officer at Ekam Hospital. Your task is to generate a comprehensive, highly professional "Doctor-Ready Clinical Summary" based on the user's profile, their recent chats with the AI health council, and their attached medical documents (lab reports, images).
                FORMAT: Use PLAIN TEXT only. Do NOT use Markdown, HTML, asterisks, hashes, or any special formatting characters. Use simple, clean text with standard newlines, uppercase headings, and standard bullet points (using dashes). Include these sections:
                - PATIENT OVERVIEW
                - CHIEF COMPLAINTS & RECENT HISTORY
                - MEDICAL DOCUMENT FINDINGS
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

            // 5. Generate PDF using pdfkit (Premium Dark Theme)
            const PDFDocument = require('pdfkit');
            const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
                const doc = new PDFDocument({ margin: 0 }); // Use 0 margin to allow full-bleed background
                const chunks: Buffer[] = [];
                doc.on('data', (chunk: Buffer) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Colors from Ekam Brand
                const EKAM_CHARCOAL = '#0B0B0B';
                const EKAM_CLAY = '#D97757';
                const EKAM_CREAM = '#EAEAEA';
                const EKAM_ZINC = '#A1A1AA';

                // 1. Full Page Background
                doc.rect(0, 0, doc.page.width, doc.page.height).fill(EKAM_CHARCOAL);

                const margin = 50;
                let currentY = 50;

                // 2. Header
                doc.fontSize(24)
                    .fillColor(EKAM_CLAY)
                    .text('EKAM HEALTH', margin, currentY, { characterSpacing: 2 });
                currentY += 30;

                doc.fontSize(14)
                    .fillColor(EKAM_CREAM)
                    .text('CLINICAL SUMMARY', margin, currentY, { characterSpacing: 1 });
                currentY += 40;

                doc.strokeColor(EKAM_CLAY).lineWidth(1).moveTo(margin, currentY).lineTo(doc.page.width - margin, currentY).stroke();
                currentY += 30;

                // 3. Meta info
                doc.fontSize(10).fillColor(EKAM_ZINC).text(`GENERATED: ${new Date().toLocaleDateString()}`, margin, currentY, { align: 'right' });
                currentY += 20;

                // 4. Content Sections
                // We split by headings (starting with "- ")
                const lines = summaryText.split('\n');

                doc.fontSize(11).lineGap(6);

                for (const line of lines) {
                    if (line.startsWith('- ') && line === line.toUpperCase()) {
                        // Section Heading
                        currentY += 15;
                        doc.fontSize(13).fillColor(EKAM_CLAY).text(line.replace('- ', ''), margin, currentY);
                        currentY += 20;
                    } else if (line.trim()) {
                        // Standard body text
                        doc.fontSize(11).fillColor(EKAM_CREAM).text(line, margin, currentY, {
                            width: doc.page.width - (margin * 2),
                            align: 'left'
                        });
                        currentY = doc.y + 5;
                    }

                    // Simple page overflow handling
                    if (currentY > doc.page.height - 100) {
                        doc.addPage();
                        doc.rect(0, 0, doc.page.width, doc.page.height).fill(EKAM_CHARCOAL);
                        currentY = 50;
                    }
                }

                // 5. Footer
                doc.fontSize(9)
                    .fillColor(EKAM_ZINC)
                    .text('CONFIDENTIAL • GENERATED BY EKAM AI COUNCIL', 0, doc.page.height - 50, { align: 'center' });

                doc.end();
            });

            // 6. Save PDF to Vault
            const fileName = `Doctor_Summary_${new Date().toISOString().split('T')[0]}.pdf`;

            const { getStorage } = await import('firebase-admin/storage');
            const storageBucket = getStorage().bucket('ekam-8bf91.firebasestorage.app');
            const storagePath = `uploads/${userId}/${Date.now()}_${fileName}`;
            const fileRef = storageBucket.file(storagePath);

            // Set metadata to force browser download
            await fileRef.save(pdfBuffer, {
                contentType: 'application/pdf',
                metadata: {
                    contentDisposition: `attachment; filename="${fileName}"`,
                    cacheControl: 'public, max-age=3600'
                }
            });
            await fileRef.makePublic();
            const fileUrl = fileRef.publicUrl();

            await db.collection('users').doc(userId).collection('vault').add({
                fileName: fileName,
                fileUrl: fileUrl,
                fileType: 'pdf',
                size: pdfBuffer.length,
                uploadedAt: FieldValue.serverTimestamp(),
                storagePath: storagePath
            });

            logger.info(`[Summary] Success! Saved Styled PDF to ${storagePath}`);
            return { success: true, url: fileUrl };

        } catch (error) {
            logger.error(`[Summary] Failed to generate summary:`, error);
            throw new HttpsError('internal', 'Failed to generate summary.');
        }
    }
);
