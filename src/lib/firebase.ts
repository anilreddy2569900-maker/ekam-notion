import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, setPersistence, browserLocalPersistence, type User } from "firebase/auth";
import { getFirestore, collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, limit, where, Timestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

// NEW CONFIG (ekam-8bf91) - Using Environment Variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);

// ENABLE PERSISTENCE IMMEDIATELY
// This fixes the "logout on refresh" issue
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("[Firebase] Auth persistence enabled (browserLocalPersistence).");
    })
    .catch((error) => {
        console.error("[Firebase] Failed to enable auth persistence:", error);
    });

export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
// Functions location might need to be removed if new project is on Spark plan, 
// but keeping us-central1 for now as standard.
export const functions = getFunctions(app, 'us-central1');

// Re-export Firebase Auth functions for use in AuthContext
export { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, setPersistence, browserLocalPersistence, type User };

// Re-export Firestore functions for use in components
export { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, limit, where, Timestamp };

// Re-export Storage functions for use in components
export { ref, uploadBytes, getDownloadURL, deleteObject, listAll };

// Re-export Functions
export { httpsCallable };
