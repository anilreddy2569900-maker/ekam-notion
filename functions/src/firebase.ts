import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Ensure Firebase is initialized exactly once
if (getApps().length === 0) {
    initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();
