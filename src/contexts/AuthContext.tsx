
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, type User } from '../lib/firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithGoogleRedirect: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Global debug log: console only
const addLog = (msg: string) => {
    console.log(`[AuthDebug] ${msg}`);
};

addLog("AuthContext: Module loaded");

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        addLog("AuthContext: Effect running, setting up listener...");
        let isMounted = true;

        // 1. Check Redirect Result (Just for logging/debugging or special handling)
        getRedirectResult(auth)
            .then((result) => {
                if (!isMounted) return;
                if (result) {
                    addLog(`Redirect Success: User ${result.user.email}`);
                    // Ensure state is updated (onAuthStateChanged will likely catch this too)
                    setUser(result.user);
                } else {
                    addLog("Redirect Result: No redirect info found.");
                }
            })
            .catch((error) => {
                if (!isMounted) return;
                addLog(`Redirect ERROR: ${error.code} - ${error.message}`);
            });

        // 2. Listen for Auth State Changes (The Source of Truth)
        // Firebase guarantees this fires with the restored user if persistence is working.
        const unsubscribe = onAuthStateChanged(auth, (currentUser: any) => {
            if (!isMounted) return;
            addLog(`AuthStateChanged: ${currentUser ? 'User ' + currentUser.email : 'No User'}`);

            setUser(currentUser);
            setLoading(false); // Stop loading once we get the first auth state
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, []);

    const signInWithGoogle = async () => {
        addLog("Action: signInWithGoogle (Popup) started");
        try {
            await signInWithPopup(auth, googleProvider);
            addLog("Action: Popup Success");
        } catch (error: any) {
            addLog(`Action ERROR (Popup): ${error.code} - ${error.message}`);
            console.error("Error signing in with Google", error);
            throw error;
        }
    };

    const signInWithGoogleRedirect = async () => {
        addLog("Action: signInWithGoogleRedirect started");
        try {
            await signInWithRedirect(auth, googleProvider);
            addLog("Action: Redirect initiated");
        } catch (error: any) {
            addLog(`Action ERROR (Redirect): ${error.code} - ${error.message}`);
            console.error("Error signing in with Google Redirect", error);
            throw error;
        }
    };

    const logout = async () => {
        addLog("Action: Logout");
        try {
            await signOut(auth);
            addLog("Action: Logout Success");
        } catch (error: any) {
            addLog(`Logout ERROR: ${error.message}`);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithGoogleRedirect, logout }}>


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
