import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { VertexAI } from '@google-cloud/vertexai';

const db = getFirestore();

/**
 * Smart Auto-Renaming Trigger
 * 
 * Triggered when a new file is uploaded to Cloud Storage.
 * Uses Gemini Flash 2.5 to analyze the file content and generate a descriptive filename.
 * Updates the corresponding Firestore metadata doc.
 */
export const onFileUpload = onObjectFinalized({
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
}, async (event) => {
    const filePath = event.data.name;
    const bucketName = event.data.bucket;
    const contentType = event.data.contentType;

    // 1. Validation and Filtering
    if (!filePath || !filePath.startsWith('uploads/')) {
        console.log('[AutoRename] Ignoring file outside uploads/:', filePath);
        return;
    }

    if (!contentType || (!contentType.startsWith('image/') && contentType !== 'application/pdf')) {
        console.log('[AutoRename] Ignoring unsupported type:', contentType);
        return;
    }

    console.log('[AutoRename] Processing file:', filePath);

    try {
        // 2. Initialize Vertex AI (Direct Client)
        const vertexAI = new VertexAI({ project: 'ekam-8bf91', location: 'us-central1' });
        const model = vertexAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                maxOutputTokens: 20,
                temperature: 0.2,
            }
        });

        // 3. Construct Input
        const filePart = {
            fileData: {
                fileUri: `gs://${bucketName}/${filePath}`,
                mimeType: contentType
            }
        };

        const prompt = `
            Analyze this medical document or image.
            Generate a short, descriptive filename for it.
            Format: "Type_DateOrContext" (e.g., "Blood_Test_Feb2024", "MRI_Knee_Scan", "Prescription_Derma").
            Do not include the file extension.
            Do not include spaces, use underscores.
            Keep it under 30 characters.
            Output ONLY the filename.
        `;

        // 4. Generate Name
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [filePart, { text: prompt }] }]
        });
        const responseText = result.response.candidates?.[0].content.parts[0].text || '';
        const cleanName = responseText.trim().replace(/[^a-zA-Z0-9_]/g, ''); // Sanitize

        if (!cleanName) {
            console.warn('[AutoRename] Failed to generate name.');
            return;
        }

        console.log(`[AutoRename] Generated Name: ${cleanName}`);

        // 5. Update Firestore
        // We need to find the document. 
        // Strategy: Query by 'storagePath' which we saved in MedicalRepository.tsx
        // Note: This relies on the frontend having already created the doc. 
        // There might be a race condition, so we retry or wait? 
        // Usually frontend write is fast.

        // Extract UID from path "uploads/{uid}/..."
        const parts = filePath.split('/');
        const uid = parts[1];

        if (!uid) {
            console.warn('[AutoRename] Could not extract UID from path');
            return;
        }

        const vaultRef = db.collection('users').doc(uid).collection('vault');
        const querySnapshot = await vaultRef.where('storagePath', '==', filePath).limit(1).get();

        if (querySnapshot.empty) {
            console.warn('[AutoRename] No matching Firestore document found for path:', filePath);
            // This might happen if upload completes before Firestore write. 
            // Ideally we'd validte this, but for now we log.
            return;
        }

        const docRef = querySnapshot.docs[0].ref;
        const originalName = querySnapshot.docs[0].data().fileName;
        const extension = originalName.split('.').pop();
        const finalName = `${cleanName}.${extension}`;

        await docRef.update({
            fileName: finalName,
            autoRenamed: true,
            originalName: originalName
        });

        console.log(`[AutoRename] Updated document ${docRef.id}: ${originalName} -> ${finalName}`);

    } catch (error) {
        console.error('[AutoRename] Error:', error);
    }
});
