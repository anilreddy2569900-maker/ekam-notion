import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Brain, Stethoscope, Utensils, Dumbbell, Moon, Activity, Heart, Sparkles, Leaf } from 'lucide-react';

// Agent display names and icons
const AGENT_INFO: Record<string, { name: string; icon: React.ElementType; color: string }> = {
    dermatologist: { name: 'Dermatologist', icon: Sparkles, color: 'text-pink-400' },
    metabolic: { name: 'Metabolic Furnace', icon: Utensils, color: 'text-orange-400' },
    somatic: { name: 'Somatic Engineer', icon: Dumbbell, color: 'text-blue-400' },
    neuro: { name: 'Neuro Architect', icon: Moon, color: 'text-purple-400' },
    guardian: { name: 'Guardian', icon: Stethoscope, color: 'text-red-400' },
    vitalist: { name: 'Vitalist', icon: Heart, color: 'text-rose-400' },
    endocrine: { name: 'Endocrine Balancer', icon: Activity, color: 'text-teal-400' },
    environment: { name: 'Environmentalist', icon: Leaf, color: 'text-green-400' },
};

interface AgentNote {
    agent: string;
    note: string;
}

interface ThinkingBubbleProps {
    agentNotes: AgentNote[];
    isThinking?: boolean;
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({ agentNotes, isThinking = false }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (agentNotes.length === 0 && !isThinking) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="mb-4"
        >
            {/* Collapsed View - Agent Pills */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 px-4 py-2 bg-surface-charcoal/50 border border-white/5 rounded-full hover:bg-surface-charcoal/70 transition-all duration-300 group"
            >
                <Brain size={14} className="text-accent-clay/70" />
                <span className="text-[11px] text-text-muted-zinc/60 tracking-wider uppercase" style={{ fontWeight: 300 }}>
                    {isThinking ? 'Consulting specialists' : `${agentNotes.length} specialist${agentNotes.length > 1 ? 's' : ''} consulted`}
                </span>

                {/* Agent Avatars */}
                <div className="flex -space-x-2 ml-2">
                    {agentNotes.map((note, i) => {
                        const info = AGENT_INFO[note.agent] || { name: note.agent, icon: Brain, color: 'text-gray-400' };
                        const Icon = info.icon;
                        return (
                            <motion.div
                                key={note.agent}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                    delay: i * 0.08,
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 20,
                                }}
                                className={`w-5 h-5 rounded-full bg-surface-charcoal border border-white/10 flex items-center justify-center ${info.color}`}
                                title={info.name}
                            >
                                <Icon size={10} />
                            </motion.div>
                        );
                    })}
                </div>

                {/* Expand Arrow */}
                {agentNotes.length > 0 && (
                    <motion.span
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="text-text-muted-zinc/30 group-hover:text-text-muted-zinc/60 transition-colors ml-1"
                    >
                        <ChevronDown size={12} />
                    </motion.span>
                )}
            </button>

            {/* Expanded View - Clinical Notes */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 25, opacity: { duration: 0.2 } }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 space-y-2 pl-4 border-l border-gradient-to-b from-accent-clay/30 to-transparent"
                            style={{ borderImage: 'linear-gradient(to bottom, rgba(217,119,87,0.3), transparent) 1' }}>
                            {agentNotes.map((note, i) => {
                                const info = AGENT_INFO[note.agent] || { name: note.agent, icon: Brain, color: 'text-gray-400' };
                                const Icon = info.icon;
                                return (
                                    <motion.div
                                        key={note.agent}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            delay: i * 0.06,
                                            type: "spring",
                                            stiffness: 250,
                                            damping: 22,
                                        }}
                                        className="bg-surface-charcoal/20 rounded-lg p-3 hover:bg-surface-charcoal/30 transition-colors duration-300"
                                    >
                                        <div className={`flex items-center gap-2 mb-1 ${info.color}`}>
                                            <Icon size={12} />
                                            <span className="text-[11px] font-medium tracking-wide uppercase">{info.name}</span>
                                        </div>
                                        <p className="text-sm text-text-cream/60 leading-relaxed" style={{ fontWeight: 300 }}>
                                            {note.note}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/**
 * Thinking indicator shown while agents are processing
 */
export const ThinkingIndicator: React.FC<{ selectedAgents?: string[] }> = ({ selectedAgents = [] }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="flex items-center gap-3 mb-4"
        >
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-charcoal/50 border border-white/5 rounded-full">
                <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >
                    <Brain size={14} className="text-accent-clay/70" />
                </motion.div>
                <span className="text-[11px] text-text-muted-zinc/60 tracking-wider uppercase" style={{ fontWeight: 300 }}>
                    Consulting specialists
                </span>

                {/* Agent Avatars with breathing pulse */}
                <div className="flex -space-x-2 ml-2">
                    {selectedAgents.map((agent, i) => {
                        const info = AGENT_INFO[agent] || { name: agent, icon: Brain, color: 'text-gray-400' };
                        const Icon = info.icon;
                        return (
                            <motion.div
                                key={agent}
                                animate={{ opacity: [0.4, 0.9, 0.4] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: i * 0.3 }}
                                className={`w-5 h-5 rounded-full bg-surface-charcoal border border-white/10 flex items-center justify-center ${info.color}`}
                                title={info.name}
                            >
                                <Icon size={10} />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
};
