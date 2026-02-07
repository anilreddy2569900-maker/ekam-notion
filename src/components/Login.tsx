import React from 'react';
import { motion } from 'framer-motion';

interface LoginProps {
    onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    return (
        <div className="min-h-screen bg-warm-charcoal text-text-cream flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,rgba(0,0,0,0)_70%)]">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-center space-y-8 max-w-md w-full"
            >
                <div className="relative inline-block mb-4">
                    <div className="absolute inset-0 bg-white/20 blur-[50px] rounded-full opacity-20 animate-pulse-glow"></div>
                    <h1 className="font-serif text-5xl tracking-tighter relative z-10">
                        Ekam Health
                    </h1>
                </div>

                <p className="text-text-muted-zinc/80 font-light leading-relaxed">
                    Sign in to access your personal health council.
                </p>

                <button
                    onClick={onLogin}
                    className="w-full bg-text-cream text-warm-charcoal font-medium py-3 px-6 rounded-xl hover:bg-white transition-all duration-300 transform hover:scale-[1.02] shadow-lg shadow-white/5 flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26z" // Fixed path
                        />
                        <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    Continue with Google
                </button>
            </motion.div>
        </div>
    );
};
