import React from 'react';
import { Menu, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderProps {
    onOpenSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar }) => {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="flex items-center justify-between px-4 py-3 sticky top-0 bg-warm-charcoal/80 backdrop-blur-xl z-30 transition-all duration-300 border-b border-surface-charcoal/50">
            <div className="flex items-center gap-2">
                <button
                    onClick={onOpenSidebar}
                    className="p-2 text-text-muted-zinc hover:text-text-cream transition-colors rounded-lg active:bg-surface-charcoal"
                >
                    <Menu size={24} />
                </button>
                <motion.h1
                    className="text-xl text-text-cream tracking-[0.1em] cursor-default"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400 }}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    ekam
                </motion.h1>
            </div>


            <div className="flex items-center gap-4">
                <button
                    onClick={toggleTheme}
                    className="p-2 text-text-muted-zinc hover:text-text-cream transition-colors rounded-full hover:bg-surface-charcoal"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun size={20} strokeWidth={1} /> : <Moon size={20} strokeWidth={1} />}
                </button>

                <div className="w-9 h-9 rounded-full bg-surface-charcoal border border-white/10 dark:border-white/10 border-black/5 flex items-center justify-center text-text-cream shadow-inner text-lg font-serif">
                    <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                        {user?.displayName?.[0] || 'A'}
                    </span>
                </div>
            </div>
        </header>
    );
};
