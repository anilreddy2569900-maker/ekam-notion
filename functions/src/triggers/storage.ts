import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { defineSecret } from 'firebase-functions/params';
import { chatCompletion, setSiliconFlowApiKey } from '../utils/siliconflow';
import { db } from '../firebase';

const siliconflowApiKey = defineSecret('SILICONFLOW_API_KEY');

/**
 * Smart Auto-Renaming Trigger
 * 
 * Triggered when a new file is uploaded to Cloud Storage.
 * Uses LITE model via SiliconFlow to analyze file metadata and generate a descriptive filename.
 * Updates the corresponding Firestore metadata doc.
 */
export const onFileUpload = onObjectFinalized({
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: [siliconflowApiKey],
}, async (event) => {
    setSiliconFlowApiKey(siliconflowApiKey.value());
    const filePath = event.data.name;
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
        // 2. Generate Name via SiliconFlow (LITE tier)
        const prompt = `
            Based on this file path and type, generate a short, descriptive medical filename:
            - File path: ${filePath}
            - Content type: ${contentType}
            
            Format: "Type_DateOrContext" (e.g., "Blood_Test_Feb2024", "MRI_Knee_Scan", "Prescription_Derma").
            Do not include the file extension.
            Do not include spaces, use underscores.
            Keep it under 30 characters.
            Output ONLY the filename.
        `;

        const result = await chatCompletion({
            tier: 'LITE',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 50,
            temperature: 0.2,
        });

        const cleanName = (result.text || '').trim().replace(/[^a-zA-Z0-9_]/g, '');

        if (!cleanName) {
            console.warn('[AutoRename] Failed to generate name.');
            return;
        }

        console.log(`[AutoRename] Generated Name: ${cleanName}`);

        // 3. Update Firestore with a Retry Mechanism
        const uid = filePath.split('/')[1];
        if (!uid) {
            console.warn('[AutoRename] Could not extract UID from path');
            return;
        }

        const vaultRef = db.collection('users').doc(uid).collection('vault');

        let querySnapshot: FirebaseFirestore.QuerySnapshot | null = null;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            querySnapshot = await vaultRef.where('storagePath', '==', filePath).limit(1).get();

            if (!querySnapshot.empty) {
                break;
            }

            attempts++;
            console.log(`[AutoRename] Attempt ${attempts}/${maxAttempts}: No Firestore document found yet, waiting 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (!querySnapshot || querySnapshot.empty) {
            console.warn('[AutoRename] Failed to find Firestore document after 5 attempts for path:', filePath);
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
