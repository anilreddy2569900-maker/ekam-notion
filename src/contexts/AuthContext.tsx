
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from '../lib/firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

console.log("AuthContext: Initializing...");

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log("AuthContext: Effect running, setting up listener...");
        const unsubscribe = onAuthStateChanged(auth, (currentUser: any) => {
            console.log("AuthContext: auth state changed", currentUser?.email);
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Error signing in with Google", error);
            throw error; // Re-throw to allow component to handle it
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout }}>
            {loading ? (
                <div className="h-screen w-screen bg-warm-charcoal flex flex-col items-center justify-center text-text-cream space-y-4">
                    <div className="w-8 h-8 border-2 border-accent-clay border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-serif text-sm animate-pulse">Connecting to Ekam...</p>
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
