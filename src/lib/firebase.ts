import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, type User } from "firebase/auth";
import { getFirestore, collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, limit, where, Timestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";

import { getAnalytics } from "firebase/analytics";

// NEW CONFIG (ekam-8bf91)
const firebaseConfig = {
    apiKey: "AIzaSyB3YAuFEpG7QVk_vZBEHPPkgF6y5q3unx8",
    authDomain: "ekam-8bf91.firebaseapp.com",
    projectId: "ekam-8bf91",
    storageBucket: "ekam-8bf91.firebasestorage.app",
    messagingSenderId: "504818444721",
    appId: "1:504818444721:web:cae9c1c5fc6f8295183590",
    measurementId: "G-ER3JYFF591"
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
// Functions location might need to be removed if new project is on Spark plan, 
// but keeping us-central1 for now as standard.
export const functions = getFunctions(app, 'us-central1');

// Re-export Firebase Auth functions for use in AuthContext
export { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, type User };

// Re-export Firestore functions for use in components
export { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, limit, where, Timestamp };

// Re-export Storage functions for use in components
export { ref, uploadBytes, getDownloadURL, deleteObject, listAll };

// Re-export Functions
export { httpsCallable };
