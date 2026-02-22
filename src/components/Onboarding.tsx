import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { db, doc, setDoc, serverTimestamp } from '../lib/firebase';
import { ChevronRight, Check, HelpCircle } from 'lucide-react';
import { HelpModal } from './HelpModal';

interface OnboardingProps {
    onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [helpModal, setHelpModal] = useState<{ isOpen: boolean, title: string, content: React.ReactNode }>({
        isOpen: false,
        title: '',
        content: null
    });

    // Form Data State
    const [formData, setFormData] = useState({
        gender: '',
        dob: '',
        height: '',
        weight: '',
        diet: '',
        skinType: '',
        hairType: '',
        allergies: '',
        conditions: '',
    });

    const updateData = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const nextStep = () => setStep(prev => prev + 1);
    const prevStep = () => setStep(prev => Math.max(1, prev - 1));

    const handleSubmit = async () => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            await setDoc(doc(db, 'users', user.uid, 'profile', 'health_data'), {
                ...formData,
                // Sanitize: Ensure numerical values are stored as numbers
                height: Number(formData.height) || 0,
                weight: Number(formData.weight) || 0,
                updatedAt: serverTimestamp(),
                onboardingCompleted: true
            });

            // Set local flags immediately to prevent onboarding loop on refresh
            localStorage.setItem('ekam_onboarding_completed', 'true');
            // Cache the profile itself so App.tsx can load instantly
            localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify({
                ...formData,
                height: Number(formData.height) || 0,
                weight: Number(formData.weight) || 0,
                onboardingCompleted: true
            }));

            // Small delay for UX
            setTimeout(() => {
                onComplete();
            }, 1000);
        } catch (error) {
            console.error("Error saving profile:", error);
            setIsSubmitting(false);
        }
    };

    // Render Steps
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark text-text-cream p-6">
            <div className="w-full max-w-lg">
                {/* Progress Bar */}
                <div className="w-full bg-white/5 h-1 rounded-full mb-12 overflow-hidden">
                    <motion.div
                        className="h-full bg-text-cream"
                        initial={{ width: 0 }}
                        animate={{ width: `${(step / 5) * 100}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <h2 className="text-3xl font-serif">Let's start with the basics.</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-text-muted-zinc mb-1">Gender</label>
                                    <div className="flex gap-4">
                                        {['Male', 'Female', 'Other'].map(opt => (
                                            <button
                                                key={opt}
                                                onClick={() => updateData('gender', opt)}
                                                className={`px-4 py-2 rounded-lg border transition-all ${formData.gender === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-white/10 hover:bg-white/5'}`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-text-muted-zinc mb-1">Date of Birth</label>
                                    <input
                                        type="date"
                                        value={formData.dob}
                                        onChange={e => updateData('dob', e.target.value)}
                                        className="w-full bg-surface-charcoal border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-text-cream/50"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm text-text-muted-zinc mb-1">Height (cm)</label>
                                        <input
                                            type="number"
                                            value={formData.height}
                                            onChange={e => {
                                                // Prevent negative numbers
                                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                                updateData('height', val.toString())
                                            }}
                                            min="0"
                                            max="300"
                                            placeholder="175"
                                            className="w-full bg-surface-charcoal border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-text-cream/50"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm text-text-muted-zinc mb-1">Weight (kg)</label>
                                        <input
                                            type="number"
                                            value={formData.weight}
                                            onChange={e => {
                                                // Prevent negative numbers
                                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                                updateData('weight', val.toString())
                                            }}
                                            min="0"
                                            max="500"
                                            placeholder="70"
                                            className="w-full bg-surface-charcoal border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-text-cream/50"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="pt-6 flex justify-end">
                                <button
                                    onClick={nextStep}
                                    disabled={!formData.gender || !formData.dob || !formData.height || !formData.weight}
                                    className="flex items-center gap-2 bg-text-cream text-warm-charcoal px-6 py-3 rounded-full font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 4 && (
                        <motion.div
                            key="step4"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <h2 className="text-3xl font-serif">Any medical history?</h2>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm text-text-muted-zinc mb-2">Allergies (if any)</label>
                                    <textarea
                                        value={formData.allergies}
                                        onChange={e => updateData('allergies', e.target.value)}
                                        placeholder="e.g. Peanuts, Penicillin..."
                                        className="w-full bg-surface-charcoal border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-text-cream/50 min-h-[100px]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-text-muted-zinc mb-2">Chronic Conditions</label>
                                    <textarea
                                        value={formData.conditions}
                                        onChange={e => updateData('conditions', e.target.value)}
                                        placeholder="e.g. Asthma, Diabetes..."
                                        className="w-full bg-surface-charcoal border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-text-cream/50 min-h-[100px]"
                                    />
                                </div>
                            </div>
                            <div className="pt-6 flex justify-between">
                                <button onClick={prevStep} className="text-text-muted-zinc hover:text-text-cream">Back</button>
                                <button
                                    onClick={nextStep}
                                    className="flex items-center gap-2 bg-text-cream text-warm-charcoal px-6 py-3 rounded-full font-medium hover:scale-105 transition-transform"
                                >
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2-diet"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <h2 className="text-3xl font-serif">What's your diet like?</h2>
                            <div className="space-y-4">
                                <label className="block text-sm text-text-muted-zinc mb-2">Dietary Preference</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Other'].map(opt => (
                                        <button
                                            key={opt}
                                            onClick={() => updateData('diet', opt)}
                                            className={`px-4 py-4 rounded-lg border text-left transition-all flex items-center justify-between group ${formData.diet === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-white/10 hover:bg-white/5'}`}
                                        >
                                            <span className="font-medium">{opt}</span>
                                            {formData.diet === opt && <Check size={18} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-6 flex justify-between">
                                <button onClick={prevStep} className="text-text-muted-zinc hover:text-text-cream">Back</button>
                                <button
                                    onClick={nextStep}
                                    disabled={!formData.diet}
                                    className="flex items-center gap-2 bg-text-cream text-warm-charcoal px-6 py-3 rounded-full font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <h2 className="text-3xl font-serif">Tell us about your skin & hair.</h2>
                            <div className="space-y-6">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm text-text-muted-zinc">Skin Type</label>
                                        <button
                                            onClick={() => setHelpModal({
                                                isOpen: true,
                                                title: "How to check your Skin Type",
                                                content: (
                                                    <div className="space-y-4 text-sm leading-relaxed text-text-muted-zinc">
                                                        <p><strong className="text-text-cream">The Bare-Face Method:</strong></p>
                                                        <ol className="list-decimal pl-4 space-y-2">
                                                            <li>Wash your face with a gentle cleanser and pat dry.</li>
                                                            <li>Wait 30 minutes. Do not apply any products.</li>
                                                            <li>Observe your skin in a mirror:</li>
                                                        </ol>
                                                        <ul className="list-disc pl-4 space-y-2 pt-2">
                                                            <li><strong className="text-text-cream">Dry:</strong> Feels tight, flaky, or rough.</li>
                                                            <li><strong className="text-text-cream">Oily:</strong> Shiny all over (forehead, nose, cheeks).</li>
                                                            <li><strong className="text-text-cream">Combination:</strong> Shiny on forehead/nose (T-zone) but dry on cheeks.</li>
                                                            <li><strong className="text-text-cream">Normal:</strong> Comfortable, no excess oil or dryness.</li>
                                                        </ul>
                                                    </div>
                                                )
                                            })}
                                            className="text-xs text-accent-clay hover:underline flex items-center gap-1"
                                        >
                                            How to check? <HelpCircle size={12} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['Dry', 'Oily', 'Combination', 'Normal'].map(opt => (
                                            <button
                                                key={opt}
                                                onClick={() => updateData('skinType', opt)}
                                                className={`px-4 py-3 rounded-lg border text-left transition-all ${formData.skinType === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-white/10 hover:bg-white/5'}`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm text-text-muted-zinc">Hair Type</label>
                                        <button
                                            onClick={() => setHelpModal({
                                                isOpen: true,
                                                title: "How to check your Hair Type",
                                                content: (
                                                    <div className="space-y-4 text-sm leading-relaxed text-text-muted-zinc">
                                                        <p><strong className="text-text-cream">The Air-Dry Test:</strong></p>
                                                        <ol className="list-decimal pl-4 space-y-2">
                                                            <li>Wash your hair and let it air dry completely.</li>
                                                            <li>Do not use blow dryers or styling products.</li>
                                                            <li>Observe your natural pattern:</li>
                                                        </ol>
                                                        <ul className="list-disc pl-4 space-y-2 pt-2">
                                                            <li><strong className="text-text-cream">Straight:</strong> Dries flat without any curve or bend.</li>
                                                            <li><strong className="text-text-cream">Wavy:</strong> Dries with an "S" shape or loose bends.</li>
                                                            <li><strong className="text-text-cream">Curly:</strong> Dries in distinct loops or ringlets.</li>
                                                            <li><strong className="text-text-cream">Coily:</strong> Dries in tight zig-zags or very small spirals (often shrinks).</li>
                                                        </ul>
                                                    </div>
                                                )
                                            })}
                                            className="text-xs text-accent-clay hover:underline flex items-center gap-1"
                                        >
                                            How to check? <HelpCircle size={12} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['Straight', 'Wavy', 'Curly', 'Coily'].map(opt => (
                                            <button
                                                key={opt}
                                                onClick={() => updateData('hairType', opt)}
                                                className={`px-4 py-3 rounded-lg border text-left transition-all ${formData.hairType === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-white/10 hover:bg-white/5'}`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="pt-6 flex justify-between">
                                <button onClick={prevStep} className="text-text-muted-zinc hover:text-text-cream">Back</button>
                                <button
                                    onClick={nextStep}
                                    disabled={!formData.skinType || !formData.hairType}
                                    className="flex items-center gap-2 bg-text-cream text-warm-charcoal px-6 py-3 rounded-full font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 5 && (
                        <motion.div
                            key="step5"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center space-y-6"
                        >
                            <div className="w-20 h-20 bg-text-cream rounded-full mx-auto flex items-center justify-center text-warm-charcoal mb-4">
                                <Check size={40} />
                            </div>
                            <h2 className="text-3xl font-serif">You're all set!</h2>
                            <p className="text-text-muted-zinc">Ekam is ready to assist you based on your unique profile.</p>

                            <div className="pt-8">
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="w-full max-w-xs bg-text-cream text-warm-charcoal px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform disabled:opacity-70 disabled:hover:scale-100 shadow-glow"
                                >
                                    {isSubmitting ? 'Personalizing...' : 'Enter Ekam Health'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <HelpModal
                isOpen={helpModal.isOpen}
                onClose={() => setHelpModal(prev => ({ ...prev, isOpen: false }))}
                title={helpModal.title}
                content={helpModal.content}
            />
        </div>
    );
};
