import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface LoginProps {
    onLogin: () => Promise<void>;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        setIsLoggingIn(true);
        setError(null);
        try {
            await onLogin();
        } catch (err: any) {
            console.error("Login failed:", err);
            setError("Failed to sign in. Please try again.");
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAF7F2] text-[#2D2520] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient Background Animation */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.5, 0.3],
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-20 -left-20 w-96 h-96 bg-[#D97757]/10 rounded-full blur-[100px]"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.2, 0.4, 0.2],
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#C4502A]/5 rounded-full blur-[120px]"
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, type: "spring", stiffness: 50 }}
                className="relative z-10 w-full max-w-md bg-[#F0EBE3] p-10 rounded-[2.5rem] shadow-2xl shadow-[#2D2520]/5 text-center border border-[#2D2520]/5"
            >
                <div className="mb-8 relative inline-block">
                    <div className="absolute inset-0 bg-white/40 blur-2xl rounded-full opacity-50"></div>
                    <h1 className="font-serif text-5xl tracking-tight relative z-10 text-[#2D2520]">
                        Ekam Health
                    </h1>
                </div>

                <p className="text-[#6B5E54] font-light text-lg mb-10 leading-relaxed">
                    Your personal health council awaits.<br />
                    <span className="text-sm opacity-80">Sign in to begin your journey.</span>
                </p>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm"
                    >
                        {error}
                    </motion.div>
                )}

                <motion.button
                    whileHover={{ scale: 1.02, boxShadow: "0 10px 30px -10px rgba(196, 80, 42, 0.3)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="w-full bg-[#FAF7F2] text-[#2D2520] font-medium py-4 px-6 rounded-2xl border border-[#2D2520]/10 hover:border-[#C4502A]/30 transition-all duration-300 flex items-center justify-center gap-3 group relative overflow-hidden"
                >
                    {isLoggingIn ? (
                        <div className="w-6 h-6 border-2 border-[#C4502A] border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <svg className="w-5 h-5 text-[#2D2520] group-hover:text-[#C4502A] transition-colors" viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                            <span className="group-hover:text-[#C4502A] transition-colors">Continue with Google</span>
                        </>
                    )}
                </motion.button>

                <div className="mt-8 text-xs text-[#A1A1AA] font-light">
                    By continuing, you agree to our Terms and Privacy Policy.
                </div>
            </motion.div>
        </div>
    );
};
