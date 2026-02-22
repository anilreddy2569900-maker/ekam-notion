const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'ekam-8bf91' });

const db = getFirestore();

async function check() {
    try {
        console.log("Checking Firestore connection for ekam-8bf91...");
        const snapshot = await db.collection('test').limit(1).get();
        console.log("Success! Database exists.");
    } catch (e) {
        console.error("Error connecting to Firestore:");
        console.error(e.message);
    }
}

check();
