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
    agentNotes?: { agent: string; note: string }[];
}

interface ChatAreaProps {
    messages: Message[];
    isTyping?: boolean;
    activeAgents?: string[];
    loadingPhase?: 'gathering' | 'synthesizing' | 'done';
}

export const ChatArea: React.FC<ChatAreaProps> = ({ messages, isTyping, loadingPhase = 'done' }) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted-zinc p-8 min-h-[60vh]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="flex flex-col items-center space-y-6"
                >
                    {/* Premium Text Logo - No Icon */}
                    <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                        className="relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-accent-clay/10 via-transparent to-accent-blue/10 blur-3xl rounded-full opacity-30" />
                        <h1
                            className="text-7xl md:text-8xl tracking-[0.15em] relative z-10"
                            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
                        >
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-text-cream via-text-cream to-text-muted-zinc">
                                ekam
                            </span>
                        </h1>
                    </motion.div>

                    {/* Text Content */}
                    <div className="text-center space-y-3 relative z-10">
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, duration: 0.8 }}
                            className="text-lg md:text-xl text-text-muted-zinc/80 font-light tracking-[0.2em] uppercase"
                            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                        >
                            Your Personal Health Assistant
                        </motion.p>
                    </div>

                    {/* Subtle Hint */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        transition={{ delay: 1.5, duration: 1 }}
                        className="text-sm text-text-muted-zinc/40 pt-8"
                    >
                        Ask anything to get started...
                    </motion.p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto px-4 py-8 space-y-8 pb-40">
            {messages.map((msg, index) => (
                <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                    {msg.role === 'user' ? (
                        <div className="max-w-[85%] sm:max-w-[75%] bg-transparent border border-white/20 text-text-cream/95 rounded-2xl px-5 py-3 text-[15px] leading-relaxed backdrop-blur-sm">
                            {msg.content}
                        </div>
                    ) : (
                        <div className="flex gap-4 max-w-[95%] sm:max-w-[85%]">
                            <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center mt-1 text-text-muted-zinc">
                                <span className="font-serif text-xs">E</span>
                            </div>
                            <div className="text-text-cream/90 font-serif text-[17px] leading-relaxed pt-1 w-full overflow-hidden">
                                {/* Agent Thinking Bubble - Expandable Clinical Notes */}
                                {msg.agentNotes && msg.agentNotes.length > 0 && (
                                    <ThinkingBubble agentNotes={msg.agentNotes} />
                                )}
                                <div className="prose max-w-none text-text-cream prose-p:leading-relaxed prose-pre:bg-surface-charcoal prose-pre:rounded-xl prose-pre:p-4 prose-code:text-accent-clay prose-code:bg-surface-charcoal/50 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-headings:font-serif prose-headings:font-medium prose-strong:text-text-cream">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{
                                            // 1. Fix the Table Structure (Borders & Backgrounds)
                                            table: ({ node, ...props }) => (
                                                <div className="overflow-x-auto my-6 rounded-lg border border-surface-charcoal/50">
                                                    <table className="w-full text-left border-collapse text-text-cream" {...props} />
                                                </div>
                                            ),
                                            thead: ({ node, ...props }) => (
                                                <thead className="bg-surface-charcoal text-text-cream" {...props} />
                                            ),
                                            tbody: ({ node, ...props }) => (
                                                <tbody className="divide-y divide-surface-charcoal/30 bg-surface-charcoal/50" {...props} />
                                            ),
                                            tr: ({ node, ...props }) => (
                                                <tr className="hover:bg-surface-charcoal/80 transition-colors" {...props} />
                                            ),
                                            th: ({ node, ...props }) => (
                                                <th className="px-4 py-3 font-semibold text-sm uppercase tracking-wider border-r border-surface-charcoal/30 last:border-r-0 text-text-muted-zinc" {...props} />
                                            ),
                                            td: ({ node, ...props }) => (
                                                <td className="px-4 py-3 text-sm border-r border-surface-charcoal/30 last:border-r-0" {...props} />
                                            ),

                                            // 2. Fix Text Spacing & Structure
                                            p: ({ node, ...props }) => (
                                                <p className="mb-5 leading-7 text-text-cream" {...props} />
                                            ),
                                            ul: ({ node, ...props }) => (
                                                <ul className="list-disc pl-6 mb-5 space-y-2 text-text-cream" {...props} />
                                            ),
                                            ol: ({ node, ...props }) => (
                                                <ol className="list-decimal pl-6 mb-5 space-y-2 text-text-cream" {...props} />
                                            ),
                                            li: ({ node, ...props }) => (
                                                <li className="pl-1" {...props} />
                                            ),

                                            // 3. Headings & Code
                                            h1: ({ node, ...props }) => <h1 className="text-3xl font-bold mt-8 mb-4 text-text-cream" {...props} />,
                                            h2: ({ node, ...props }) => <h2 className="text-2xl font-semibold mt-6 mb-3 text-text-cream border-b border-surface-charcoal/30 pb-2" {...props} />,
                                            h3: ({ node, ...props }) => <h3 className="text-xl font-semibold mt-4 mb-2 text-text-cream" {...props} />,
                                            blockquote: ({ node, ...props }) => (
                                                <blockquote className="border-l-4 border-accent-clay pl-4 py-1 my-4 bg-surface-charcoal/30 italic rounded-r text-text-muted-zinc" {...props} />
                                            ),
                                            code: ({ node, className, children, ...props }: any) => {
                                                return !className?.includes('language-') && !String(children).includes('\n') ? (
                                                    <code className="text-accent-clay bg-surface-charcoal/50 rounded px-1.5 py-0.5 font-mono text-[0.9em]" {...props}>
                                                        {children}
                                                    </code>
                                                ) : (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                )
                                            }
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

            {/* Neural Wait Animation - "The Synapse" (Complex Mode) */}
            {isTyping && loadingPhase !== 'done' && (
                <div className="w-full flex justify-center py-4">
                    <ThinkingState />
                </div>
            )}

            {/* Standard Typing Bubble - "Express Lane" (Simple Mode) replaced by Fast Neural Sphere */}
            {isTyping && loadingPhase === 'done' && (
                <div className="w-full flex justify-center py-4">
                    <ThinkingState mode="simple" />
                </div>
            )}
            <div ref={endRef} />
        </div>
    );
};
