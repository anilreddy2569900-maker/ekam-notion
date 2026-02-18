
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
        let redirectCheckComplete = false;
        let authStateCheckComplete = false;

        const handleAuthCompletion = (user: User | null) => {
            if (!isMounted) return;
            // Only set loading to false if we have a user OR both checks are done
            if (user) {
                setUser(user);
                setLoading(false);
            } else if (redirectCheckComplete && authStateCheckComplete) {
                setUser(null);
                setLoading(false);
            }
        };

        // 1. Check Redirect Result
        getRedirectResult(auth)
            .then((result) => {
                if (!isMounted) return;
                redirectCheckComplete = true;
                if (result) {
                    addLog(`Redirect Success: User ${result.user.email}`);
                    handleAuthCompletion(result.user);
                } else {
                    addLog("Redirect Result: No redirect info found.");
                    handleAuthCompletion(null);
                }
            })
            .catch((error) => {
                if (!isMounted) return;
                redirectCheckComplete = true;
                addLog(`Redirect ERROR: ${error.code} - ${error.message}`);
                handleAuthCompletion(null);
            });

        // 2. Listen for Auth State Changes
        const unsubscribe = onAuthStateChanged(auth, (currentUser: any) => {
            if (!isMounted) return;
            addLog(`AuthStateChanged: ${currentUser ? 'User ' + currentUser.email : 'No User'}`);
            
            authStateCheckComplete = true;
            handleAuthCompletion(currentUser);
        });

        // 3. Safety timeout
        const safetyTimeout = setTimeout(() => {
            if (isMounted) {
                setLoading((current) => {
                    if (current) {
                        addLog("AuthContext: Safety timeout reached (10s). Forcing loading=false.");
                        return false;
                    }
                    return current;
                });
            }
        }, 10000);

        return () => {
            isMounted = false;
            clearTimeout(safetyTimeout);
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
