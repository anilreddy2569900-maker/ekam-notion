import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Brain, Heart, Zap, Shield, Microscope, Leaf, Scale } from 'lucide-react';

interface GuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-[60]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-8 pointer-events-none"
                    >
                        <div className="bg-warm-charcoal border border-text-cream/10 w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col relative text-text-cream">

                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 text-text-muted-zinc hover:text-text-cream transition-colors rounded-full hover:bg-text-cream/10 z-10"
                            >
                                <X size={24} />
                            </button>

                            {/* Content Scrollable */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="p-8 md:p-12 space-y-16">

                                    {/* Header / Mission */}
                                    <div className="text-center space-y-6">
                                        <h1 className="text-5xl md:text-6xl tracking-tight text-text-cream" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                                            ekam
                                        </h1>
                                        <p className="text-xl md:text-2xl text-text-muted-zinc font-light tracking-wide max-w-2xl mx-auto" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                                            Your Personal Health Intelligence Council
                                        </p>
                                        <div className="w-16 h-px bg-gradient-to-r from-transparent via-text-cream/30 to-transparent mx-auto pt-4"></div>
                                        <p className="text-base leading-relaxed text-text-muted-zinc/80 max-w-2xl mx-auto">
                                            Ekam is not just a chatbot. It is a unified intelligence system orchestrated by a council of specialized AI agents.
                                            We treat your health as a holistic interconnected system, not a series of isolated symptoms.
                                        </p>
                                    </div>

                                    {/* The Council */}
                                    <div className="space-y-8">
                                        <h2 className="text-3xl text-center text-text-cream/90" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                                            The Council
                                        </h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <AgentCard
                                                icon={<Activity className="text-rose-400" />}
                                                name="Vitalist"
                                                role="Cardiovascular & Immune"
                                                desc="Monitors heart health, blood pressure, and immune system resilience."
                                            />
                                            <AgentCard
                                                icon={<Brain className="text-violet-400" />}
                                                name="Neuro"
                                                role="Sleep & Mental Wellness"
                                                desc="Optimizes sleep patterns, stress management, and cognitive function."
                                            />
                                            <AgentCard
                                                icon={<Zap className="text-amber-400" />}
                                                name="Metabolic"
                                                role="Nutrition & Gut Health"
                                                desc="Analyzes diet, digestion, and metabolic markers for fueling your body."
                                            />
                                            <AgentCard
                                                icon={<Shield className="text-emerald-400" />}
                                                name="Somatic"
                                                role="Movement & Recovery"
                                                desc="Guides physical activity, injury prevention, and muscle recovery."
                                            />
                                            <AgentCard
                                                icon={<Microscope className="text-blue-400" />}
                                                name="Dermatologist"
                                                role="Skin, Hair & Nails"
                                                desc="Addresses dermatological concerns and external signs of internal health."
                                            />
                                            <AgentCard
                                                icon={<Scale className="text-pink-400" />}
                                                name="Endocrine"
                                                role="Hormonal Balance"
                                                desc="Tracks cycles, libido, and hormonal health indicators."
                                            />
                                            <AgentCard
                                                icon={<Heart className="text-red-400" />}
                                                name="Guardian"
                                                role="Lab Analysis & Screening"
                                                desc="Interprets blood tests and tracks critical biomarkers over time."
                                            />
                                            <AgentCard
                                                icon={<Leaf className="text-cyan-400" />}
                                                name="Environment"
                                                role="External Factors"
                                                desc="Considers air quality, weather, and environmental impacts on your health."
                                            />
                                        </div>
                                    </div>

                                    {/* How it Works */}
                                    <div className="space-y-8 pb-8">
                                        <h2 className="text-3xl text-center text-text-cream" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                                            How It Works
                                        </h2>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center bg-surface-charcoal p-8 rounded-2xl border border-text-cream/10">
                                            <div className="space-y-3">
                                                <div className="w-12 h-12 rounded-full bg-text-cream/10 mx-auto flex items-center justify-center text-text-cream font-serif text-xl border border-text-cream/20">1</div>
                                                <h3 className="text-lg text-text-cream font-medium">Upload Records</h3>
                                                <p className="text-sm text-text-cream/70 leading-relaxed">
                                                    Securely upload your lab reports, prescriptions, or fitness data to your private Vault.
                                                </p>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="w-12 h-12 rounded-full bg-text-cream/10 mx-auto flex items-center justify-center text-text-cream font-serif text-xl border border-text-cream/20">2</div>
                                                <h3 className="text-lg text-text-cream font-medium">Ask Anything</h3>
                                                <p className="text-sm text-text-cream/70 leading-relaxed">
                                                    Chat comfortably. The Council analyzes your query and consults the relevant specialists.
                                                </p>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="w-12 h-12 rounded-full bg-text-cream/10 mx-auto flex items-center justify-center text-text-cream font-serif text-xl border border-text-cream/20">3</div>
                                                <h3 className="text-lg text-text-cream font-medium">Get Truth</h3>
                                                <p className="text-sm text-text-cream/70 leading-relaxed">
                                                    Receive a single, synthesized answer that balances all medical perspectives.
                                                </p>
                                            </div>
                                        </div>
                                    </div>


                                    {/* Know More Section */}
                                    <div className="text-center pb-8">
                                        <a
                                            href="https://about.ekamhealth.online"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-6 py-3 bg-warm-charcoal border border-text-cream/20 text-text-cream rounded-full hover:bg-text-cream hover:text-warm-charcoal transition-all duration-300 font-serif tracking-wide group"
                                        >
                                            Know More About Ekam
                                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                                        </a>
                                    </div>

                                    {/* Footer Credit */}


                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )
            }
        </AnimatePresence >
    );
};

const AgentCard = ({ icon, name, role, desc }: { icon: React.ReactNode, name: string, role: string, desc: string }) => (
    <div className="p-5 rounded-xl bg-surface-charcoal border border-text-cream/5 hover:bg-surface-charcoal/80 transition-colors group">
        <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-text-cream/10 text-text-cream/80 group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
            <div>
                <h3 className="text-lg text-text-cream font-serif tracking-wide mb-1">{name}</h3>
                <p className="text-xs text-accent-clay uppercase tracking-wider font-medium mb-2">{role}</p>
                <p className="text-sm text-text-muted-zinc leading-relaxed">
                    {desc}
                </p>
            </div>
        </div>
    </div>
);
