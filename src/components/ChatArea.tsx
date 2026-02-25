import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ThinkingBubble } from './ThinkingBubble';
import { ThinkingState } from './ThinkingState';

export interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    imageUrl?: string | null;
    agentNotes?: { agent: string; note: string }[];
}

export interface ThinkingProgressData {
    phase: string;
    agents?: Record<string, { status: 'thinking' | 'done'; snippet?: string }>;
    selectedAgents?: string[];
}

interface ChatAreaProps {
    messages: Message[];
    isTyping?: boolean;
    activeAgents?: string[];
    loadingPhase?: 'gathering' | 'synthesizing' | 'done';
    thinkingProgress?: ThinkingProgressData | null;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ messages, isTyping, activeAgents = [], loadingPhase = 'done', thinkingProgress }) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[60vh] overflow-hidden relative">
                {/* Ambient Background Elements */}
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.1, 0.2, 0.1],
                    }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-1/4 -left-20 w-96 h-96 bg-accent-clay/5 rounded-full blur-[100px] pointer-events-none"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.1, 0.15, 0.1],
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-1/4 -right-20 w-[400px] h-[400px] bg-text-cream/5 rounded-full blur-[120px] pointer-events-none"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} // smooth easeOutQuint
                    className="flex flex-col items-center space-y-8 z-10"
                >
                    {/* Minimal typographic logo */}
                    <div className="relative group cursor-default">
                        <motion.h1
                            className="text-8xl md:text-9xl tracking-tight text-text-cream select-none"
                            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
                            initial={{ letterSpacing: "0.1em", filter: "blur(10px)" }}
                            animate={{ letterSpacing: "-0.02em", filter: "blur(0px)" }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                        >
                            ekam
                        </motion.h1>
                        {/* Subtle glow on hover */}
                        <motion.div
                            className="absolute inset-0 bg-accent-clay/10 blur-3xl opacity-0 group-hover:opacity-50 transition-opacity duration-700 rounded-full"
                        />
                    </div>

                    <div className="text-center space-y-2">
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5, duration: 0.8 }}
                            className="text-lg md:text-xl text-text-muted-zinc font-light tracking-wide"
                        >
                            Your personal health council
                        </motion.p>
                    </div>

                    {/* Minimal Input Hint */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2, duration: 1 }}
                        className="mt-12 flex items-center gap-2 text-text-muted-zinc/60 text-sm font-light"
                    >
                        <div className="w-1 h-1 rounded-full bg-accent-clay/40 animate-pulse" />
                        Type anything to begin
                    </motion.div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto px-4 py-6 space-y-8 pb-40">
            {messages.map((msg, index) => (
                <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
                    className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                    {msg.role === 'user' ? (
                        <motion.div
                            whileHover={{ scale: 1.005 }}
                            className="max-w-[85%] sm:max-w-[75%] bg-white/60 dark:bg-white/5 border border-text-cream/5 shadow-sm text-text-cream rounded-2xl rounded-tr-sm px-6 py-4 text-[16px] leading-relaxed backdrop-blur-sm"
                        >
                            {msg.imageUrl && (
                                <img
                                    src={msg.imageUrl}
                                    alt="User upload"
                                    className="mb-3 max-w-full rounded-lg border border-text-cream/10 shadow-sm max-h-60 object-cover"
                                />
                            )}
                            {msg.content === '🎙️ Voice Note' || msg.content === 'Voice Note' ? (
                                <div className="flex items-center gap-3 py-1">
                                    <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-accent-clay/10 text-accent-clay">
                                        <div className="absolute inset-0 rounded-full border border-accent-clay/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                                        <div className="absolute inset-0 rounded-full border border-accent-clay/20 animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]" />
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                                    </div>
                                    <span className="font-medium tracking-wide text-text-cream/90">Voice Note Analysis</span>
                                </div>
                            ) : msg.content.startsWith('🎙️') ? (
                                // For transcribed voice notes like "🎙️ Hello there"
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3 py-1">
                                        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-accent-clay/10 text-accent-clay">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                                        </div>
                                        <span className="font-medium text-sm tracking-wide text-text-muted-zinc/80 uppercase">Voice Note</span>
                                    </div>
                                    <div className="text-[16px] leading-relaxed text-text-cream/90">{msg.content.substring(2).trim()}</div>
                                </div>
                            ) : (
                                msg.content
                            )}
                        </motion.div>
                    ) : (
                        <div className="flex gap-5 max-w-[95%] sm:max-w-[85%] group">
                            <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center mt-1 bg-warm-charcoal border border-text-cream/5 shadow-sm text-text-cream">
                                <span className="font-serif text-xs italic">e</span>
                            </div>
                            <div className="text-text-cream/90 font-serif text-[17px] leading-relaxed pt-1 w-full overflow-hidden">
                                {msg.agentNotes && msg.agentNotes.length > 0 && (
                                    <ThinkingBubble agentNotes={msg.agentNotes} />
                                )}
                                <div className="prose max-w-none text-text-cream prose-p:leading-relaxed prose-pre:bg-warm-charcoal prose-pre:border prose-pre:border-text-cream/5 prose-pre:rounded-xl prose-pre:p-4 prose-code:text-accent-clay prose-code:bg-warm-charcoal prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-headings:font-serif prose-headings:font-medium prose-strong:text-text-cream prose-a:text-accent-clay prose-a:no-underline hover:prose-a:underline">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{
                                            table: ({ node, ...props }) => (
                                                <div className="overflow-x-auto my-6 rounded-xl border border-text-cream/10 shadow-sm bg-white/30">
                                                    <table className="w-full text-left border-collapse" {...props} />
                                                </div>
                                            ),
                                            thead: ({ node, ...props }) => (
                                                <thead className="bg-warm-charcoal text-text-cream/80" {...props} />
                                            ),
                                            tbody: ({ node, ...props }) => (
                                                <tbody className="divide-y divide-text-cream/5" {...props} />
                                            ),
                                            tr: ({ node, ...props }) => (
                                                <tr className="hover:bg-warm-charcoal/50 transition-colors" {...props} />
                                            ),
                                            th: ({ node, ...props }) => (
                                                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider text-text-muted-zinc" {...props} />
                                            ),
                                            td: ({ node, ...props }) => (
                                                <td className="px-5 py-3 text-sm text-text-muted-zinc" {...props} />
                                            ),
                                            blockquote: ({ node, ...props }) => (
                                                <blockquote className="border-l-2 border-accent-clay/50 pl-5 py-2 my-6 bg-warm-charcoal/50 italic rounded-r text-text-muted-zinc" {...props} />
                                            ),
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            ))}

            {isTyping && loadingPhase !== 'done' && (
                <div className="w-full flex justify-center py-6">
                    <ThinkingState activeAgents={activeAgents} thinkingProgress={thinkingProgress} />
                </div>
            )}

            {isTyping && loadingPhase === 'done' && (
                <div className="w-full flex justify-center py-6">
                    <ThinkingState mode="simple" />
                </div>
            )}
            <div ref={endRef} />
        </div>
    );
};
