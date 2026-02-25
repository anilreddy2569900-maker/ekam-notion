import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Settings, FileText, MessageSquare, Trash2, LogOut, Dumbbell, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    onNewChat: () => void;
    onSelectChat: (chatId: string) => void;
    onOpenSettings: () => void;
    onOpenVault: () => void;
    onOpenFitness: () => void;
    onOpenGuide: () => void;
    chats: { id: string, title: string, createdAt: any }[];
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onNewChat, onSelectChat, onOpenSettings, onOpenVault, onOpenFitness, onOpenGuide, chats }) => {
    const { user, logout } = useAuth();

    const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation();
        if (!user) return;
        if (confirm('Are you sure you want to delete this chat?')) {
            const { error } = await supabase.from('chats').delete().eq('id', chatId);
            if (error) {
                console.error("Error deleting chat:", error);
                alert("Failed to delete chat.");
            }
        }
    };

    const sidebarVariants = {
        open: { x: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 30 } },
        closed: { x: -300, opacity: 0, transition: { type: "spring" as const, stiffness: 300, damping: 30 } }
    };

    const itemVariants = {
        hover: { scale: 1.02, x: 5, transition: { type: "spring" as const, stiffness: 400, damping: 10 } },
        tap: { scale: 0.98 }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={sidebarVariants}
                        className="fixed left-0 top-0 bottom-0 w-72 bg-sidebar-bg border-r border-text-cream/5 shadow-2xl shadow-text-cream/5 z-50 flex flex-col"
                    >
                        <div className="p-6 flex items-center justify-between">
                            <h1
                                className="text-3xl tracking-tight text-text-cream relative z-10"
                                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}
                            >
                                ekam
                            </h1>
                            <button onClick={onClose} className="md:hidden text-text-muted-zinc hover:text-text-cream transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <motion.button
                                variants={itemVariants}
                                whileHover="hover"
                                whileTap="tap"
                                onClick={() => {
                                    onNewChat();
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-warm-charcoal hover:bg-white text-text-cream rounded-xl transition-colors border border-text-cream/5 shadow-sm group"
                            >
                                <div className="p-1.5 rounded-lg bg-text-cream/5 text-text-cream group-hover:bg-accent-clay/10 group-hover:text-accent-clay transition-colors">
                                    <Plus size={18} />
                                </div>
                                <span className="font-medium text-sm tracking-wide">New Chat</span>
                            </motion.button>

                            <div className="space-y-1 pt-2">
                                {[
                                    { icon: FileText, label: "Health Records", action: onOpenVault },
                                    { icon: Dumbbell, label: "Fitness", action: onOpenFitness },
                                    { icon: Settings, label: "Settings", action: onOpenSettings },
                                ].map((item, idx) => (
                                    <motion.button
                                        key={idx}
                                        variants={itemVariants}
                                        whileHover="hover"
                                        whileTap="tap"
                                        onClick={() => {
                                            item.action();
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-text-muted-zinc hover:text-text-cream hover:bg-text-cream/5 rounded-xl transition-colors"
                                    >
                                        <item.icon size={18} className="opacity-70" />
                                        <span className="font-medium text-sm tracking-wide">{item.label}</span>
                                    </motion.button>
                                ))}
                            </div>

                            <motion.button
                                variants={itemVariants}
                                whileHover="hover"
                                whileTap="tap"
                                onClick={() => {
                                    onOpenGuide();
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-text-muted-zinc hover:text-text-cream hover:bg-text-cream/5 rounded-xl transition-all group"
                            >
                                <span className="text-lg leading-none group-hover:text-accent-clay transition-colors font-serif italic w-[18px] text-center">i</span>
                                <span className="font-medium text-sm tracking-wide">About Ekam</span>
                            </motion.button>
                        </div>

                        {/* Recent Chats List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-1">
                            {chats.length > 0 && (
                                <h3 className="text-[10px] font-medium text-text-muted-zinc/60 uppercase tracking-[0.2em] mb-3 px-2">Recent Chats</h3>
                            )}
                            {chats.map(chat => (
                                <div key={chat.id} className="group relative">
                                    <motion.button
                                        whileHover={{ x: 3, backgroundColor: "rgba(0,0,0,0.02)" }}
                                        onClick={() => {
                                            onSelectChat(chat.id);
                                            onClose();
                                        }}
                                        className="w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-3 group-hover:pr-8"
                                    >
                                        {chat.id === 'telegram' ? (
                                            <Send size={14} className="flex-shrink-0 text-[#0088cc]/60 group-hover:text-[#0088cc] transition-colors" />
                                        ) : (
                                            <MessageSquare size={14} className="flex-shrink-0 text-text-muted-zinc/50 group-hover:text-accent-clay transition-colors" />
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm text-text-muted-zinc group-hover:text-text-cream transition-colors line-clamp-1 font-light tracking-wide">{chat.title}</p>
                                        </div>
                                    </motion.button>
                                    <button
                                        onClick={(e) => handleDeleteChat(e, chat.id)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-text-muted-zinc/50 hover:text-red-500 rounded-md transition-all scale-90 hover:scale-100"
                                        title="Delete Chat"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* User Profile - Clean Aesthetic */}
                        <div className="p-5 border-t border-text-cream/5 bg-warm-charcoal/50">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-surface-hover border border-text-cream/5 flex items-center justify-center text-text-cream shadow-sm">
                                    <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.1rem' }}>
                                        {user?.displayName?.[0] || 'A'}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-text-cream truncate tracking-wide" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.05rem' }}>
                                        {user?.displayName?.split(' ')[0] || 'Anil'}
                                    </p>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.1, color: "#ef4444" }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => logout()}
                                    className="p-2 text-text-muted-zinc/60 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Logout"
                                >
                                    <LogOut size={16} />
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
