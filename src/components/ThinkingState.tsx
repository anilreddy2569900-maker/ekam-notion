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

    // Dynamic Phrases based on Active Agents
    const getPhrases = () => {
        if (mode === 'simple') {
            return ["Processing...", "Retrieving...", "Synthesizing..."];
        }

        const phrases = ["Consulting The Council..."];

        // Add specific agent actions
        if (activeAgents.length > 0) {
            activeAgents.forEach(agent => {
                const name = AGENT_NAMES[agent] || agent;
                phrases.push(`${name} analyzing...`);
                phrases.push(`${name} reviewing data...`);
            });
        } else {
            // Fallback if no agents detected yet
            phrases.push("Synthesizing biometrics...", "Analyzing patterns...", "Formulating response...");
        }

        phrases.push("Orchestrator synthesizing...");
        return phrases;
    };

    const PHRASES = getPhrases();

    // Cycle through phrases independently of render to avoid jitter, but update when PHRASES change
    useEffect(() => {
        setPhraseIndex(0); // Reset on new query
    }, [activeAgents.length, mode]);

    useEffect(() => {
        const interval = setInterval(() => {
            setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
        }, 2000); // 2 seconds per agent for readability
        return () => clearInterval(interval);
    }, [PHRASES.length]);

    // Orbiting nodes configuration
    const nodes = mode === 'complex' ? [0, 1, 2, 3] : [0, 1]; // Fewer nodes for simple mode

    return (
        <div className={`flex flex-col items-center justify-center p-8 w-full max-w-md mx-auto ${mode === 'simple' ? 'my-1 py-4 scale-75' : 'my-4'}`}>
            {/* THE SYNAPSE ANIMATION CONTAINER */}
            <div className={`relative flex items-center justify-center ${mode === 'simple' ? 'w-24 h-24 mb-4' : 'w-48 h-48 mb-8'}`}>

                {/* 1. CENTRAL CORE (The User's Query) */}
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.6, 1, 0.6],
                        boxShadow: [
                            "0 0 20px rgba(217, 119, 87, 0.2)",
                            "0 0 40px rgba(217, 119, 87, 0.6)",
                            "0 0 20px rgba(217, 119, 87, 0.2)"
                        ]
                    }}
                    transition={{
                        duration: mode === 'simple' ? 1.5 : 3, // Faster pulse
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className={`rounded-full bg-accent-clay/90 relative z-10 backdrop-blur-sm ${mode === 'simple' ? 'w-8 h-8' : 'w-12 h-12'}`}
                >
                    {/* Inner Core Brightness */}
                    <div className="absolute inset-2 rounded-full bg-white/20 blur-sm" />
                </motion.div>

                {/* 2. ORBITING NODES (The Agents) */}
                {nodes.map((i) => (
                    <motion.div
                        key={i}
                        className="absolute w-full h-full"
                        animate={{ rotate: 360 }}
                        transition={{
                            duration: mode === 'simple' ? 2 : 8 + i * 2, // Much faster orbits
                            repeat: Infinity,
                            ease: "linear",
                            delay: i * 0.2
                        }}
                    >
                        {/* The Node Itself - Offset from center */}
                        <motion.div
                            className="absolute top-0 left-1/2 -ml-1.5 rounded-full bg-accent-clay"
                            animate={{
                                scale: [1, 1.5, 1],
                                opacity: [0.4, 0.9, 0.4],
                            }}
                            transition={{
                                duration: mode === 'simple' ? 1 : 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: i * 0.1
                            }}
                            style={{
                                width: mode === 'simple' ? '8px' : '12px',
                                height: mode === 'simple' ? '8px' : '12px',
                                boxShadow: "0 0 15px rgba(217, 119, 87, 0.4)"
                            }}
                        />
                    </motion.div>
                ))}

                {/* 3. CONNECTION BEAMS (Data Transfer) - Complex Mode Only */}
                {mode === 'complex' && nodes.map((i) => (
                    <motion.div
                        key={`beam-${i}`}
                        className="absolute w-1 h-24 origin-bottom bg-gradient-to-t from-transparent via-accent-clay/50 to-transparent"
                        style={{ bottom: "50%", left: "50%", marginLeft: "-0.5px" }}
                        animate={{
                            rotate: [0, 360],
                            opacity: [0, 0.8, 0],
                            height: ["0%", "50%", "0%"]
                        }}
                        transition={{
                            rotate: { duration: 10 + i * 2, repeat: Infinity, ease: "linear" },
                            opacity: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.7 },
                            height: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.7 }
                        }}
                    />
                ))}

                {/* 4. Background Glow/Ambience */}
                <div className="absolute inset-0 bg-accent-clay/5 blur-3xl rounded-full" />
            </div>

            {/* 5. STATUS TEXT (Only if actually loading, though express is fast) */}
            <div className="h-6 overflow-hidden relative w-full text-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={phraseIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className={`absolute w-full font-serif text-text-muted-zinc tracking-wide italic ${mode === 'simple' ? 'text-sm' : 'text-lg'}`}
                    >
                        {PHRASES[phraseIndex]}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};
