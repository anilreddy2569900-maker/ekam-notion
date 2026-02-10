import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Settings, FileText, MessageSquare, Trash2, LogOut, Dumbbell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db, deleteDoc, doc } from '../lib/firebase';

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
            await deleteDoc(doc(db, 'users', user.uid, 'chats', chatId));
        }
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
                        className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm z-40 md:hidden"
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: -300 }}
                        animate={{ x: 0 }}
                        exit={{ x: -300 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed left-0 top-0 bottom-0 w-72 bg-surface-charcoal border-r border-text-cream/10 shadow-2xl z-50 flex flex-col"
                    >
                        <div className="p-6 border-b border-text-cream/10 flex items-center justify-between">
                            <h1
                                className="text-3xl tracking-[0.05em] text-text-cream relative z-10"
                                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400 }}
                            >
                                ekam
                            </h1>
                            <button onClick={onClose} className="md:hidden text-text-muted-zinc/60 hover:text-text-cream transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 space-y-2">
                            <button
                                onClick={() => {
                                    onNewChat();
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-warm-charcoal hover:bg-warm-charcoal/80 text-text-cream rounded-xl transition-all border border-text-cream/10 hover:border-text-cream/20 group"
                            >
                                <div className="p-1 rounded-lg text-text-cream/70 group-hover:text-text-cream transition-colors">
                                    <Plus size={18} />
                                </div>
                                <span className="font-medium text-sm tracking-wide">New Chat</span>
                            </button>

                            <button
                                onClick={() => {
                                    onOpenVault();
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-text-muted-zinc hover:text-text-cream hover:bg-text-cream/5 rounded-xl transition-all"
                            >
                                <FileText size={18} className="opacity-70" />
                                <span className="font-medium text-sm tracking-wide">Health Records</span>
                            </button>

                            <button
                                onClick={() => {
                                    onOpenFitness();
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-text-muted-zinc hover:text-text-cream hover:bg-text-cream/5 rounded-xl transition-all"
                            >
                                <Dumbbell size={18} className="opacity-70" />
                                <span className="font-medium text-sm tracking-wide">Fitness</span>
                            </button>

                            <button
                                onClick={() => {
                                    onOpenSettings();
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-text-muted-zinc hover:text-text-cream hover:bg-text-cream/5 rounded-xl transition-all"
                            >
                                <Settings size={18} className="opacity-70" />
                                <span className="font-medium text-sm tracking-wide">Profile & Settings</span>
                            </button>

                            <button
                                onClick={() => {
                                    onOpenGuide();
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-text-muted-zinc hover:text-text-cream hover:bg-white/5 rounded-xl transition-all group"
                            >
                                <span className="text-lg leading-none group-hover:text-amber-400 transition-colors font-serif italic w-[18px] text-center">i</span>
                                <span className="font-medium text-sm tracking-wide">About Ekam</span>
                            </button>
                        </div>

                        {/* Recent Chats List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-1">
                            {chats.length > 0 && (
                                <h3 className="text-[10px] font-medium text-text-muted-zinc/40 uppercase tracking-[0.2em] mb-4 px-2">Recent Chats</h3>
                            )}
                            {chats.map(chat => (
                                <div key={chat.id} className="group relative">
                                    <button
                                        onClick={() => {
                                            onSelectChat(chat.id);
                                            onClose();
                                        }}
                                        className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 transition-all flex items-start gap-3 group-hover:pr-10"
                                    >
                                        <MessageSquare size={14} className="mt-1 flex-shrink-0 text-text-muted-zinc/40 group-hover:text-text-muted-zinc/70 transition-colors" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-text-muted-zinc group-hover:text-text-cream transition-colors line-clamp-1 font-light tracking-wide">{chat.title}</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteChat(e, chat.id)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-text-muted-zinc/40"
                                        title="Delete Chat"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* User Profile - Clean Aesthetic */}
                        <div className="p-6 border-t border-text-cream/10">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-warm-charcoal border border-text-cream/10 flex items-center justify-center text-text-cream shadow-inner">
                                    <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.2rem' }}>
                                        {user?.displayName?.[0] || 'A'}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-text-cream/80 truncate tracking-wide" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.1rem' }}>
                                        {user?.displayName?.split(' ')[0] || 'Anil'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => logout()}
                                    className="p-2 text-text-muted-zinc/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                    title="Logout"
                                >
                                    <LogOut size={18} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
