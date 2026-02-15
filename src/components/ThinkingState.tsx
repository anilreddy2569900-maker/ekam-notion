import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Brain, Zap, Shield, Microscope, Scale, Heart, Leaf, Sparkles } from 'lucide-react';
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

// Agent Icons
const AGENT_ICONS: Record<string, React.ElementType> = {
    dermatologist: Microscope,
    metabolic: Zap,
    somatic: Shield,
    neuro: Brain,
    guardian: Heart,
    vitalist: Activity,
    endocrine: Scale,
    environment: Leaf,
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

    // Fallback phrases
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
        if (thinkingProgress) return;
        const interval = setInterval(() => {
            setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
        }, 2800);
        return () => clearInterval(interval);
    }, [PHRASES.length, thinkingProgress]);

    const isSimple = mode === 'simple';
    const containerSize = isSimple ? 'w-16 h-16' : 'w-24 h-24';

    const ripples = isSimple ? [0] : [0, 1, 2];

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
        <div className={`flex flex-col items-center justify-center w-full max-w-2xl mx-auto ${isSimple ? 'py-2' : 'py-6'}`}>

            {/* THE BREATHING CORE */}
            <div className={`relative flex items-center justify-center ${containerSize} ${isSimple ? 'mb-2' : 'mb-6'}`}>
                {/* Ambient Haze */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    animate={{
                        opacity: [0.1, 0.25, 0.1],
                        scale: [0.8, 1.2, 0.8],
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                        background: 'radial-gradient(circle, rgba(217,119,87,0.2) 0%, transparent 70%)',
                        filter: 'blur(24px)',
                    }}
                />

                {/* Concentric Ripple Rings */}
                {ripples.map((i) => (
                    <div
                        key={i}
                        className="absolute inset-0 rounded-full border border-accent-clay/20"
                        style={{
                            animation: `ripple-expand ${3.5}s ease-out infinite`,
                            animationDelay: `${i * 1.2}s`,
                        }}
                    />
                ))}

                {/* Core Icon */}
                <div className="relative z-10 p-3 rounded-full bg-surface-charcoal border border-accent-clay/20 shadow-lg shadow-accent-clay/10">
                    <Sparkles size={isSimple ? 16 : 24} className="text-accent-clay animate-pulse" />
                </div>
            </div>

            {/* Phase Label */}
            <div className="h-6 overflow-hidden relative w-full text-center mb-6">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentPhaseLabel}
                        initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
                        transition={{ duration: 0.5, type: "spring", bounce: 0.2 }}
                        className="flex items-center justify-center gap-2"
                    >
                        <span className={`tracking-[0.2em] uppercase text-text-muted-zinc/80 font-light ${isSimple ? 'text-[10px]' : 'text-xs'}`}>
                            {currentPhaseLabel}
                        </span>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* LIVE AGENT GRID */}
            {hasLiveData && !isSimple && (
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 px-4">
                    <AnimatePresence mode="popLayout">
                        {/* Currently Thinking Agents */}
                        {thinkingAgents.map(([agentKey]) => {
                            const Icon = AGENT_ICONS[agentKey] || Activity;
                            const name = AGENT_NAMES[agentKey] || agentKey;

                            return (
                                <motion.div
                                    key={`thinking-${agentKey}`}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-charcoal/50 border border-accent-clay/20 shadow-lg shadow-accent-clay/5 backdrop-blur-sm relative overflow-hidden group"
                                >
                                    {/* Shimmer Effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" />

                                    <div className="p-2 rounded-lg bg-accent-clay/10 text-accent-clay relative">
                                        <Icon size={18} />
                                        <span className="absolute top-0 right-0 w-2 h-2 bg-accent-clay rounded-full animate-ping" />
                                        <span className="absolute top-0 right-0 w-2 h-2 bg-accent-clay rounded-full" />
                                    </div>

                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-text-cream/90 font-serif tracking-wide">{name}</span>
                                        <span className="text-xs text-accent-clay/80 animate-pulse">Analyzing data...</span>
                                    </div>
                                </motion.div>
                            );
                        })}

                        {/* Done Agents */}
                        {doneAgents.map(([agentKey, agentData]) => {
                            const Icon = AGENT_ICONS[agentKey] || Activity;
                            const name = AGENT_NAMES[agentKey] || agentKey;

                            return (
                                <motion.div
                                    key={`done-${agentKey}`}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                    className="flex flex-col gap-2 p-3 rounded-xl bg-surface-charcoal/80 border border-text-cream/10 shadow-sm"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-text-cream/5 text-text-muted-zinc">
                                            <Icon size={16} />
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-sm font-medium text-text-muted-zinc line-through decoration-text-cream/20">{name}</span>
                                        </div>
                                        <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                                            <motion.svg
                                                viewBox="0 0 24 24"
                                                className="w-3 h-3 stroke-current stroke-2"
                                                fill="none"
                                                initial={{ pathLength: 0 }}
                                                animate={{ pathLength: 1 }}
                                                transition={{ duration: 0.3 }}
                                            >
                                                <motion.path d="M20 6L9 17l-5-5" />
                                            </motion.svg>
                                        </div>
                                    </div>

                                    {agentData.snippet && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="text-xs text-text-muted-zinc/70 bg-black/20 p-2 rounded-lg italic border-l-2 border-text-cream/10"
                                        >
                                            "{agentData.snippet}"
                                        </motion.div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};
