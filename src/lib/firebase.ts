import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { getFirestore, collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp, limit, where, Timestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyDBRF5SCiUFHNxzimhfLdkxYCkgOzZTbIo",
    authDomain: "project-health-de9dd.firebaseapp.com",
    projectId: "project-health-de9dd",
    storageBucket: "project-health-de9dd.firebasestorage.app",
    messagingSenderId: "128197273200",
    appId: "1:128197273200:web:0cc4f0a4a2ea82b21776b5",
    measurementId: "G-L3E28DSV6B"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// Re-export Firebase Auth functions for use in AuthContext
export { onAuthStateChanged, signInWithPopup, signOut, type User };

// Re-export Firestore functions for use in components
export { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp, limit, where, Timestamp };

// Re-export Storage functions for use in components
export { ref, uploadBytes, getDownloadURL, deleteObject, listAll };
