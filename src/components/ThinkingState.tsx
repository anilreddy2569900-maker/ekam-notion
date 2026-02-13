import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

export const ThinkingState: React.FC<{ mode?: 'simple' | 'complex', activeAgents?: string[] }> = ({ mode = 'complex', activeAgents = [] }) => {
    const [phraseIndex, setPhraseIndex] = useState(0);

    const getPhrases = () => {
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

    const PHRASES = getPhrases();

    useEffect(() => {
        setPhraseIndex(0);
    }, [activeAgents.length, mode]);

    useEffect(() => {
        const interval = setInterval(() => {
            setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
        }, 2800);
        return () => clearInterval(interval);
    }, [PHRASES.length]);

    const isSimple = mode === 'simple';
    const containerSize = isSimple ? 'w-20 h-20' : 'w-36 h-36';
    const coreSize = isSimple ? 'w-3 h-3' : 'w-4 h-4';

    // Ripple ring configs — staggered delays for organic feel
    const ripples = isSimple ? [0] : [0, 1, 2];

    return (
        <div className={`flex flex-col items-center justify-center w-full max-w-md mx-auto ${isSimple ? 'py-3' : 'py-6'}`}>

            {/* THE BREATHING LIGHT */}
            <div className={`relative flex items-center justify-center ${containerSize} ${isSimple ? 'mb-3' : 'mb-6'}`}>

                {/* Ambient Haze — Soft gaussian background glow */}
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

            {/* Status Text — Smooth vertical slide */}
            <div className="h-5 overflow-hidden relative w-full text-center">
                <AnimatePresence mode="wait">
                    <motion.p
                        key={phraseIndex}
                        initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                        animate={{ opacity: 0.6, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className={`absolute w-full tracking-widest uppercase text-text-muted-zinc/70 ${isSimple ? 'text-[10px]' : 'text-[11px]'}`}
                        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, letterSpacing: '0.2em' }}
                    >
                        {PHRASES[phraseIndex]}
                    </motion.p>
                </AnimatePresence>
            </div>
        </div>
    );
};
