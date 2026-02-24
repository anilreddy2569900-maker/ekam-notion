import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Brain, Zap, Shield, Microscope, Scale, Heart, Leaf, Sparkles } from 'lucide-react';
import type { ThinkingProgressData } from './ChatArea';

// Agent display names
const AGENT_NAMES: Record<string, string> = {
    orchestrator: 'orchestrator',
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
    orchestrator: Sparkles,
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

// Generate orbital positions for agents around the center
function getOrbitalPosition(index: number, total: number, radius: number = 120) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
    };
}

// Hook to get responsive orbital radius
function useOrbitalRadius() {
    const [radius, setRadius] = React.useState(() => {
        if (typeof window === 'undefined') return 90;
        return window.innerWidth < 400 ? 75 : window.innerWidth < 640 ? 90 : 115;
    });

    React.useEffect(() => {
        const handleResize = () => {
            const w = window.innerWidth;
            setRadius(w < 400 ? 75 : w < 640 ? 90 : 115);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return radius;
}

export const ThinkingState: React.FC<ThinkingStateProps> = ({ mode = 'complex', activeAgents = [], thinkingProgress }) => {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const orbitalRadius = useOrbitalRadius();

    const getFallbackPhrases = () => {
        if (mode === 'simple') {
            return ["Thinking...", "Processing..."];
        }
        return [
            "Consulting The Council...",
            "Analyzing patterns...",
            "Cross-referencing data...",
            "Synthesizing insights...",
            "Orchestrating response..."
        ];
    };

    const PHRASES = getFallbackPhrases();

    useEffect(() => {
        setPhraseIndex(0);
        setElapsedSeconds(0);
    }, [activeAgents.length, mode]);

    useEffect(() => {
        if (thinkingProgress) return;
        const interval = setInterval(() => {
            setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
        }, 2800);
        return () => clearInterval(interval);
    }, [PHRASES.length, thinkingProgress]);

    // Timer
    useEffect(() => {
        const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    const isSimple = mode === 'simple';
    const hasLiveData = thinkingProgress && thinkingProgress.agents && Object.keys(thinkingProgress.agents).length > 0;
    const currentPhaseLabel = thinkingProgress ? (PHASE_LABELS[thinkingProgress.phase] || thinkingProgress.phase) : PHRASES[phraseIndex];

    const doneAgents = hasLiveData
        ? Object.entries(thinkingProgress!.agents!).filter(([, a]) => a.status === 'done' && a.snippet)
        : [];

    const thinkingAgents = hasLiveData
        ? Object.entries(thinkingProgress!.agents!).filter(([, a]) => a.status === 'thinking')
        : [];

    const allAgents = hasLiveData ? Object.entries(thinkingProgress!.agents!) : [];

    // --- SIMPLE MODE: Minimal elegant animation ---
    if (isSimple) {
        return (
            <div className="flex flex-col items-center justify-center w-full py-4">
                <div className="relative w-12 h-12 mb-3">
                    {/* DNA-like double helix spinner */}
                    <motion.div
                        className="absolute inset-0 rounded-full border-2 border-transparent"
                        style={{ borderTopColor: 'var(--color-accent-clay)', borderBottomColor: 'rgba(217,119,87,0.3)' }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                        className="absolute inset-1 rounded-full border-2 border-transparent"
                        style={{ borderLeftColor: 'var(--color-accent-clay)', borderRightColor: 'rgba(217,119,87,0.3)' }}
                        animate={{ rotate: -360 }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Sparkles size={14} className="text-accent-clay opacity-60" />
                    </div>
                </div>
                <span className="text-[10px] tracking-[0.25em] uppercase text-text-muted-zinc/60 font-light animate-pulse">
                    Thinking...
                </span>
            </div>
        );
    }

    // --- COMPLEX MODE: Orbital Constellation ---
    return (
        <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto py-6">

            {/* ORBITAL CONSTELLATION */}
            <div className="relative w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 mb-4 mx-auto">

                {/* Outer rotating ring */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                        border: '1px dashed rgba(217,119,87,0.15)',
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                />

                {/* Middle rotating ring (opposite direction) */}
                <motion.div
                    className="absolute rounded-full"
                    style={{
                        inset: '15%',
                        border: '1px dashed rgba(217,119,87,0.10)',
                    }}
                    animate={{ rotate: -360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                />

                {/* Central Core Orb */}
                <div className="absolute inset-0 flex items-center justify-center">
                    {/* Ambient glow */}
                    <motion.div
                        className="absolute w-20 h-20 sm:w-28 sm:h-28 rounded-full"
                        animate={{
                            opacity: [0.15, 0.35, 0.15],
                            scale: [0.9, 1.1, 0.9],
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        style={{
                            background: 'radial-gradient(circle, rgba(217,119,87,0.4) 0%, rgba(217,119,87,0.1) 40%, transparent 70%)',
                            filter: 'blur(20px)',
                        }}
                    />

                    {/* Pulsing rings */}
                    {[0, 1, 2].map(i => (
                        <motion.div
                            key={`pulse-${i}`}
                            className="absolute rounded-full border border-accent-clay/20"
                            style={{ width: 56, height: 56 }}
                            animate={{
                                scale: [1, 2.5],
                                opacity: [0.4, 0],
                            }}
                            transition={{
                                duration: 3,
                                repeat: Infinity,
                                delay: i * 1,
                                ease: "easeOut",
                            }}
                        />
                    ))}

                    {/* Core icon */}
                    <motion.div
                        className="relative z-10 w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-accent-clay/20 to-accent-clay/5 border border-accent-clay/30 flex items-center justify-center shadow-lg"
                        style={{ boxShadow: '0 0 30px rgba(217,119,87,0.2)' }}
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <Sparkles size={18} className="text-accent-clay sm:w-[22px] sm:h-[22px]" />
                    </motion.div>
                </div>

                {/* Orbiting Agent Nodes */}
                {hasLiveData && allAgents.map(([agentKey, agentData], index) => {
                    const pos = getOrbitalPosition(index, allAgents.length, orbitalRadius);
                    const Icon = AGENT_ICONS[agentKey] || Activity;
                    const isDone = agentData.status === 'done';

                    return (
                        <motion.div
                            key={agentKey}
                            className="absolute"
                            style={{
                                left: '50%',
                                top: '50%',
                            }}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                x: pos.x - 18,
                                y: pos.y - 18,
                            }}
                            transition={{
                                delay: index * 0.12,
                                type: "spring",
                                stiffness: 200,
                                damping: 20,
                            }}
                        >
                            {/* Connection line to center */}
                            <svg
                                className="absolute pointer-events-none"
                                style={{
                                    left: 18,
                                    top: 18,
                                    width: 1,
                                    height: 1,
                                    overflow: 'visible',
                                }}
                            >
                                <motion.line
                                    x1="0" y1="0"
                                    x2={-pos.x} y2={-pos.y}
                                    stroke={isDone ? 'rgba(74,222,128,0.2)' : 'rgba(217,119,87,0.15)'}
                                    strokeWidth="1"
                                    strokeDasharray={isDone ? "0" : "4 4"}
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 1 }}
                                    transition={{ delay: index * 0.12 + 0.3, duration: 0.5 }}
                                />
                                {/* Traveling particle on the line */}
                                {!isDone && (
                                    <motion.circle
                                        r="2"
                                        fill="rgba(217,119,87,0.6)"
                                        initial={{ opacity: 0 }}
                                        animate={{
                                            cx: [0, -pos.x * 0.5, -pos.x, -pos.x * 0.5, 0],
                                            cy: [0, -pos.y * 0.5, -pos.y, -pos.y * 0.5, 0],
                                            opacity: [0, 1, 0.5, 1, 0],
                                        }}
                                        transition={{
                                            duration: 2.5,
                                            repeat: Infinity,
                                            delay: index * 0.3,
                                            ease: "linear",
                                        }}
                                    />
                                )}
                            </svg>

                            {/* Agent Node */}
                            <motion.div
                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center relative ${isDone
                                    ? 'bg-green-500/10 border border-green-500/30'
                                    : 'bg-surface-charcoal border border-accent-clay/30'
                                    }`}
                                style={{
                                    boxShadow: isDone
                                        ? '0 0 12px rgba(74,222,128,0.15)'
                                        : '0 0 12px rgba(217,119,87,0.1)',
                                }}
                                whileHover={{ scale: 1.2 }}
                            >
                                <Icon size={14} className={`${isDone ? 'text-green-400' : 'text-accent-clay'} sm:w-4 sm:h-4`} />

                                {/* Thinking ping */}
                                {!isDone && (
                                    <motion.div
                                        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent-clay"
                                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                        transition={{ duration: 1.2, repeat: Infinity }}
                                    />
                                )}

                                {/* Done checkmark */}
                                {isDone && (
                                    <motion.div
                                        className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 flex items-center justify-center"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                    >
                                        <svg viewBox="0 0 24 24" className="w-2 h-2 stroke-white stroke-[3]" fill="none">
                                            <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* Agent name label */}
                            <motion.span
                                className={`absolute whitespace-nowrap text-[9px] tracking-wider uppercase font-medium ${isDone ? 'text-green-400/70' : 'text-text-muted-zinc/60'
                                    }`}
                                style={{
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    top: '100%',
                                    marginTop: 4,
                                }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.12 + 0.5 }}
                            >
                                {(AGENT_NAMES[agentKey] || agentKey).split(' ')[0]}
                            </motion.span>
                        </motion.div>
                    );
                })}
            </div>

            {/* Phase Label + Timer */}
            <div className="flex flex-col items-center gap-2 mb-4">
                <div className="h-6 overflow-hidden relative w-full text-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentPhaseLabel}
                            initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
                            transition={{ duration: 0.5, type: "spring", bounce: 0.2 }}
                            className="flex items-center justify-center gap-2"
                        >
                            <span className="tracking-[0.2em] uppercase text-text-muted-zinc/80 font-light text-xs">
                                {currentPhaseLabel}
                            </span>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Elapsed timer */}
                <span className="text-[10px] text-text-muted-zinc/40 tabular-nums font-mono">
                    {elapsedSeconds}s
                </span>
            </div>

            {/* Done Agent Snippets (collapsed cards below the constellation) */}
            {doneAgents.length > 0 && (
                <div className="w-full max-w-md px-4 space-y-2">
                    <AnimatePresence>
                        {doneAgents.map(([agentKey, agentData]) => {
                            const Icon = AGENT_ICONS[agentKey] || Activity;
                            const name = AGENT_NAMES[agentKey] || agentKey;

                            return (
                                <motion.div
                                    key={`snippet-${agentKey}`}
                                    initial={{ opacity: 0, y: 10, height: 0 }}
                                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                                    exit={{ opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                    className="flex items-start gap-3 p-3 rounded-xl bg-surface-charcoal/40 border border-green-500/10 backdrop-blur-sm"
                                >
                                    <div className="p-1.5 rounded-lg bg-green-500/10 text-green-400 mt-0.5">
                                        <Icon size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-medium text-green-400/80">{name}</span>
                                        {agentData.snippet && (
                                            <p className="text-[11px] text-text-muted-zinc/50 mt-0.5 italic truncate">
                                                "{agentData.snippet}"
                                            </p>
                                        )}
                                    </div>
                                    <div className="w-4 h-4 rounded-full bg-green-500/15 flex items-center justify-center text-green-500 flex-shrink-0 mt-0.5">
                                        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 stroke-current stroke-2" fill="none">
                                            <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};
