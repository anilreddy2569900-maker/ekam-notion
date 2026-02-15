import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ThinkingProgressData } from './ChatArea';

// Agent display names
const AGENT_NAMES: Record<string, string> = {
    dermatologist: 'Dermatologist',
    metabolic: 'Metabolic Furnace',
    somatic: 'Somatic Engineer',
    neuro: 'Neuro Architect',
    guardian: 'Guardian',
    vitalist: 'Vitalist',
    endocrine: 'Endocrine Balancer',
    environment: 'Environmentalist',
};

// Phase display labels
const PHASE_LABELS: Record<string, string> = {
    routing: 'Assembling The Council',
    brainstorming: 'Specialists Analyzing',
    peer_review: 'Round Table — Cross-Referencing',
    synthesizing: 'Orchestrating Final Synthesis',
};

interface ThinkingStateProps {
    mode?: 'simple' | 'complex';
    activeAgents?: string[];
    thinkingProgress?: ThinkingProgressData | null;
}

export const ThinkingState: React.FC<ThinkingStateProps> = ({ mode = 'complex', activeAgents = [], thinkingProgress }) => {
    const [phraseIndex, setPhraseIndex] = useState(0);

    // Fallback phrases for when no live data is available
    const getFallbackPhrases = () => {
        if (mode === 'simple') {
            return ["Thinking...", "Processing..."];
        }
        const phrases = ["Consulting The Council..."];
        if (activeAgents.length > 0) {
            activeAgents.forEach(agent => {
                const name = AGENT_NAMES[agent] || agent;
                phrases.push(`${name} analyzing...`);
            });
        } else {
            phrases.push("Analyzing patterns...", "Synthesizing insights...");
        }
        phrases.push("Orchestrating response...");
        return phrases;
    };

    const PHRASES = getFallbackPhrases();

    useEffect(() => {
        setPhraseIndex(0);
    }, [activeAgents.length, mode]);

    useEffect(() => {
        if (thinkingProgress) return; // Don't cycle if we have live data
        const interval = setInterval(() => {
            setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
        }, 2800);
        return () => clearInterval(interval);
    }, [PHRASES.length, thinkingProgress]);

    const isSimple = mode === 'simple';
    const containerSize = isSimple ? 'w-20 h-20' : 'w-36 h-36';
    const coreSize = isSimple ? 'w-3 h-3' : 'w-4 h-4';

    const ripples = isSimple ? [0] : [0, 1, 2];

    // Determine current status text
    const hasLiveData = thinkingProgress && thinkingProgress.agents && Object.keys(thinkingProgress.agents).length > 0;
    const currentPhaseLabel = thinkingProgress ? (PHASE_LABELS[thinkingProgress.phase] || thinkingProgress.phase) : PHRASES[phraseIndex];

    // Get agents that are done with snippets
    const doneAgents = hasLiveData
        ? Object.entries(thinkingProgress!.agents!).filter(([, a]) => a.status === 'done' && a.snippet)
        : [];

    // Get agents still thinking
    const thinkingAgents = hasLiveData
        ? Object.entries(thinkingProgress!.agents!).filter(([, a]) => a.status === 'thinking')
        : [];

    return (
        <div className={`flex flex-col items-center justify-center w-full max-w-lg mx-auto ${isSimple ? 'py-3' : 'py-6'}`}>

            {/* THE BREATHING LIGHT */}
            <div className={`relative flex items-center justify-center ${containerSize} ${isSimple ? 'mb-3' : 'mb-5'}`}>

                {/* Ambient Haze */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    animate={{
                        opacity: [0.15, 0.35, 0.15],
                        scale: [0.9, 1.1, 0.9],
                    }}
                    transition={{
                        duration: isSimple ? 2 : 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    style={{
                        background: 'radial-gradient(circle, rgba(217,119,87,0.25) 0%, rgba(217,119,87,0.08) 40%, transparent 70%)',
                        filter: 'blur(20px)',
                    }}
                />

                {/* Concentric Ripple Rings */}
                {ripples.map((i) => (
                    <div
                        key={i}
                        className="absolute inset-0 rounded-full border border-accent-clay/30"
                        style={{
                            animation: `ripple-expand ${isSimple ? 2.2 : 3.5}s ease-out infinite`,
                            animationDelay: `${i * 0.9}s`,
                        }}
                    />
                ))}

                {/* Primary Breathing Ring */}
                <motion.div
                    className="absolute rounded-full border border-accent-clay/40"
                    animate={{
                        scale: [0.85, 1, 0.85],
                        opacity: [0.3, 0.6, 0.3],
                        borderColor: [
                            'rgba(217,119,87,0.2)',
                            'rgba(217,119,87,0.5)',
                            'rgba(217,119,87,0.2)',
                        ],
                    }}
                    transition={{
                        duration: isSimple ? 1.8 : 3.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    style={{
                        width: '65%',
                        height: '65%',
                    }}
                />

                {/* Core — The luminous center point */}
                <motion.div
                    className={`${coreSize} rounded-full bg-accent-clay relative z-10`}
                    animate={{
                        scale: [1, 1.3, 1],
                        opacity: [0.7, 1, 0.7],
                        boxShadow: [
                            '0 0 12px rgba(217,119,87,0.3), 0 0 24px rgba(217,119,87,0.1)',
                            '0 0 20px rgba(217,119,87,0.6), 0 0 40px rgba(217,119,87,0.2)',
                            '0 0 12px rgba(217,119,87,0.3), 0 0 24px rgba(217,119,87,0.1)',
                        ],
                    }}
                    transition={{
                        duration: isSimple ? 1.8 : 3.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                >
                    <div className="absolute inset-0.5 rounded-full bg-white/25 blur-[1px]" />
                </motion.div>
            </div>

            {/* Phase Label */}
            <div className="h-5 overflow-hidden relative w-full text-center mb-4">
                <AnimatePresence mode="wait">
                    <motion.p
                        key={currentPhaseLabel}
                        initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                        animate={{ opacity: 0.7, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className={`absolute w-full tracking-widest uppercase text-text-muted-zinc/70 ${isSimple ? 'text-[10px]' : 'text-[11px]'}`}
                        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, letterSpacing: '0.2em' }}
                    >
                        {currentPhaseLabel}
                    </motion.p>
                </AnimatePresence>
            </div>

            {/* LIVE AGENT THINKING FEED */}
            {hasLiveData && !isSimple && (
                <div className="w-full max-w-md space-y-2 mt-1">
                    <AnimatePresence mode="popLayout">
                        {/* Currently thinking agents */}
                        {thinkingAgents.map(([agentKey]) => (
                            <motion.div
                                key={`thinking-${agentKey}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.3 }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warm-charcoal/40 border border-text-cream/5 shadow-sm"
                            >
                                {/* Pulsing dot */}
                                <motion.div
                                    className="w-2 h-2 rounded-full bg-accent-clay/70 shrink-0"
                                    animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                />
                                <span className="text-[12px] text-text-muted-zinc/80 tracking-wide"
                                    style={{ fontFamily: "'Inter', sans-serif" }}>
                                    {AGENT_NAMES[agentKey] || agentKey}
                                    <span className="text-text-muted-zinc/50 ml-1.5">analyzing...</span>
                                </span>
                            </motion.div>
                        ))}

                        {/* Done agents with snippets */}
                        {doneAgents.map(([agentKey, agentData]) => (
                            <motion.div
                                key={`done-${agentKey}`}
                                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                                className="px-4 py-2.5 rounded-lg bg-warm-charcoal/60 border border-text-cream/10 shadow-sm"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    {/* Checkmark */}
                                    <span className="text-accent-clay text-[11px]">✓</span>
                                    <span className="text-[12px] text-text-cream/80 tracking-wide font-medium"
                                        style={{ fontFamily: "'Inter', sans-serif" }}>
                                        {AGENT_NAMES[agentKey] || agentKey}
                                    </span>
                                </div>
                                {agentData.snippet && (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 0.5 }}
                                        transition={{ delay: 0.2, duration: 0.4 }}
                                        className="text-[11px] text-text-muted-zinc/70 leading-relaxed pl-5 italic"
                                        style={{ fontFamily: "'Inter', sans-serif" }}
                                    >
                                        {agentData.snippet}
                                    </motion.p>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};
