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
    const [isExpanded, setIsExpanded] = useState(true); // Auto-expand to show clinical notes

    if (agentNotes.length === 0 && !isThinking) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
        >
            {/* Collapsed View - Agent Pills */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 px-4 py-2 bg-surface-charcoal/50 border border-white/5 rounded-full hover:bg-surface-charcoal transition-colors group"
            >
                <Brain size={16} className="text-accent-clay" />
                <span className="text-sm text-text-muted-zinc">
                    {isThinking ? 'Consulting specialists...' : `${agentNotes.length} specialist${agentNotes.length > 1 ? 's' : ''} consulted`}
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
                                transition={{ delay: i * 0.1 }}
                                className={`w-6 h-6 rounded-full bg-surface-charcoal border border-white/10 flex items-center justify-center ${info.color}`}
                                title={info.name}
                            >
                                <Icon size={12} />
                            </motion.div>
                        );
                    })}
                </div>

                {/* Expand Arrow */}
                {agentNotes.length > 0 && (
                    <span className="text-text-muted-zinc/50 group-hover:text-text-muted-zinc transition-colors ml-1">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                )}
            </button>

            {/* Expanded View - Clinical Notes */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 space-y-2 pl-4 border-l-2 border-surface-charcoal">
                            {agentNotes.map((note, i) => {
                                const info = AGENT_INFO[note.agent] || { name: note.agent, icon: Brain, color: 'text-gray-400' };
                                const Icon = info.icon;
                                return (
                                    <motion.div
                                        key={note.agent}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="bg-surface-charcoal/30 rounded-lg p-3"
                                    >
                                        <div className={`flex items-center gap-2 mb-1 ${info.color}`}>
                                            <Icon size={14} />
                                            <span className="text-sm font-medium">{info.name}</span>
                                        </div>
                                        <p className="text-sm text-text-cream/70 leading-relaxed">
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
            className="flex items-center gap-3 mb-4"
        >
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-charcoal/50 border border-white/5 rounded-full">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                >
                    <Brain size={16} className="text-accent-clay" />
                </motion.div>
                <span className="text-sm text-text-muted-zinc">
                    Consulting specialists...
                </span>

                {/* Pulsing Agent Avatars */}
                <div className="flex -space-x-2 ml-2">
                    {selectedAgents.map((agent, i) => {
                        const info = AGENT_INFO[agent] || { name: agent, icon: Brain, color: 'text-gray-400' };
                        const Icon = info.icon;
                        return (
                            <motion.div
                                key={agent}
                                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                                className={`w-6 h-6 rounded-full bg-surface-charcoal border border-white/10 flex items-center justify-center ${info.color}`}
                                title={info.name}
                            >
                                <Icon size={12} />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
};
