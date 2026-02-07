import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles, Heart, Apple, Dumbbell, Moon, Shield, Flame, Leaf } from 'lucide-react';

// Agent info matching ThinkingBubble
const AGENT_INFO: Record<string, { name: string; icon: React.ElementType; color: string }> = {
    dermatologist: { name: 'Dermatologist', icon: Sparkles, color: 'text-pink-400' },
    metabolic: { name: 'Metabolic', icon: Apple, color: 'text-green-400' },
    somatic: { name: 'Somatic', icon: Dumbbell, color: 'text-orange-400' },
    neuro: { name: 'Neuro', icon: Moon, color: 'text-purple-400' },
    guardian: { name: 'Guardian', icon: Shield, color: 'text-blue-400' },
    vitalist: { name: 'Vitalist', icon: Heart, color: 'text-red-400' },
    endocrine: { name: 'Endocrine', icon: Flame, color: 'text-yellow-400' },
    environment: { name: 'Environmental', icon: Leaf, color: 'text-emerald-400' },
};

interface AgentLoadingIndicatorProps {
    activeAgents: string[];
    phase: 'gathering' | 'synthesizing' | 'done';
}

export const AgentLoadingIndicator: React.FC<AgentLoadingIndicatorProps> = ({ activeAgents, phase }) => {
    if (phase === 'done' || activeAgents.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex gap-4 max-w-[95%] sm:max-w-[85%]"
        >
            <div className="w-8 h-8 shrink-0 rounded-full bg-surface-charcoal border border-surface-charcoal flex items-center justify-center mt-1">
                <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="font-serif text-xs text-accent-clay"
                >
                    <Brain size={14} />
                </motion.span>
            </div>

            <div className="bg-surface-charcoal/30 border border-white/5 rounded-2xl p-4 min-w-[200px]">
                {/* Phase Label */}
                <motion.div
                    className="flex items-center gap-2 mb-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-accent-clay"
                    />
                    <span className="text-sm text-text-muted-zinc">
                        {phase === 'gathering' ? 'Consulting specialists...' : 'Synthesizing insights...'}
                    </span>
                </motion.div>

                {/* Agent Icons Grid */}
                <div className="flex flex-wrap gap-2">
                    {activeAgents.map((agent, i) => {
                        const info = AGENT_INFO[agent] || { name: agent, icon: Brain, color: 'text-gray-400' };
                        const Icon = info.icon;

                        return (
                            <motion.div
                                key={agent}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: i * 0.1, type: "spring", stiffness: 300 }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-surface-charcoal/50 rounded-full border border-white/5"
                            >
                                <motion.div
                                    animate={{
                                        opacity: [0.5, 1, 0.5],
                                    }}
                                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                    className={info.color}
                                >
                                    <Icon size={14} />
                                </motion.div>
                                <span className="text-xs text-text-cream/70">{info.name}</span>

                                {/* Thinking dots */}
                                <div className="flex gap-0.5 ml-1">
                                    {[0, 1, 2].map((dot) => (
                                        <motion.div
                                            key={dot}
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{
                                                duration: 0.8,
                                                repeat: Infinity,
                                                delay: dot * 0.15 + i * 0.1
                                            }}
                                            className={`w-1 h-1 rounded-full ${info.color.replace('text-', 'bg-')}`}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Synthesizing Phase */}
                {phase === 'synthesizing' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 pt-3 border-t border-white/5"
                    >
                        <div className="flex items-center gap-2 text-accent-clay">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            >
                                <Sparkles size={14} />
                            </motion.div>
                            <span className="text-sm">Preparing unified response...</span>
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
};
