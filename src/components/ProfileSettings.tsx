import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { db, doc, setDoc, onSnapshot, serverTimestamp } from '../lib/firebase';
import { ArrowLeft, Save, Check, HelpCircle, Plus, X } from 'lucide-react';
import { HelpModal } from './HelpModal';

interface ProfileSettingsProps {
    onClose: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    // Track the LAST SAVED phone number to control the "Linked" badge
    const [savedPhoneNumber, setSavedPhoneNumber] = useState('');

    // Help Modal State
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
        phoneNumber: '',
    });



    // ... (rest of imports)

    useEffect(() => {
        if (!user) return;

        // Instant Load from Cache
        const cachedStr = localStorage.getItem(`ekam_profile_${user.uid}`);
        if (cachedStr) {
            try {
                const data = JSON.parse(cachedStr);
                if (!isSaving) {
                    setFormData(data as any);
                    if (data.phoneNumber) setSavedPhoneNumber(data.phoneNumber);
                }
                setIsLoading(false); // Instantly stop loading
            } catch (e) {
                console.warn("Profile Cache corrupted", e);
            }
        }

        const docRef = doc(db, 'users', user.uid, 'profile', 'health_data');

        // Real-time listener
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                // Only update form data if we are NOT currently saving
                if (!isSaving) {
                    const data = docSnap.data() as any;
                    setFormData(data);
                    // Sync saved state
                    if (data.phoneNumber) setSavedPhoneNumber(data.phoneNumber);

                    // Update cache silently
                    localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify(data));
                }
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error listening to profile:", error);
            // If error but we have cache, we're good
            if (!cachedStr) {
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, [user, isSaving]);

    const updateData = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!user) {
            console.error("HandleSave: No user found");
            return;
        }
        console.log("HandleSave: Starting save...", formData);
        setIsSaving(true);
        try {
            const docRef = doc(db, 'users', user.uid, 'profile', 'health_data');
            console.log("HandleSave: Writing to", docRef.path);

            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Save timed out after 10s. Check your connection.")), 10000)
            );

            // Race setDoc against timeout
            await Promise.race([
                setDoc(docRef, {
                    ...formData,
                    updatedAt: serverTimestamp(),
                    onboardingCompleted: true
                }, { merge: true }),
                timeoutPromise
            ]);

            console.log("HandleSave: Write successful");

            // Update Local Cache Immediately
            localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify({
                ...formData,
                updatedAt: new Date().toISOString(),
                onboardingCompleted: true
            }));

            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                onClose();
            }, 1500);
        } catch (error: any) {
            console.error("Error saving profile:", error);
            // alert(`Error saving: ${error.message || error}`); // Removed for production
        } finally {
            console.log("HandleSave: Finally block reached");
            setIsSaving(false);
            if ((formData as any).phoneNumber) {
                setSavedPhoneNumber((formData as any).phoneNumber);
            }
        }
    };

    if (isLoading) {
        return <div className="flex-1 flex items-center justify-center text-text-muted-zinc">Loading Profile...</div>;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex-1 flex flex-col h-full bg-background-dark overflow-y-auto"
        >
            <div className="max-w-3xl mx-auto w-full p-6 pb-24 space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={onClose} className="p-2 hover:bg-text-cream/5 rounded-full text-text-muted-zinc transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <h1
                        className="text-3xl text-text-cream tracking-wide"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400 }}
                    >
                        Profile & Settings
                    </h1>
                </div>

                {/* Section 1: Vitals */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                        Basic Vitals
                        <div className="h-px bg-white/10 flex-1 ml-4"></div>
                    </h2>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm text-text-muted-zinc mb-2">Gender</label>
                            <div className="flex gap-2">
                                {['Male', 'Female', 'Other'].map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => updateData('gender', opt)}
                                        className={`px-4 py-2 rounded-lg border text-sm transition-all ${formData.gender === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-text-cream/10 hover:bg-text-cream/5 text-text-muted-zinc'}`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-text-muted-zinc mb-2">Date of Birth</label>
                            <input
                                type="date"
                                value={formData.dob}
                                onChange={e => updateData('dob', e.target.value)}
                                className="w-full bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-2 text-text-cream focus:outline-none focus:border-text-cream/50 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-muted-zinc mb-2">Height (cm)</label>
                            <input
                                type="number"
                                value={formData.height}
                                onChange={e => updateData('height', e.target.value)}
                                className="w-full bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-2 text-text-cream focus:outline-none focus:border-text-cream/50 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-muted-zinc mb-2">Weight (kg)</label>
                            <input
                                type="number"
                                value={formData.weight}
                                onChange={e => updateData('weight', e.target.value)}
                                className="w-full bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-2 text-text-cream focus:outline-none focus:border-text-cream/50 transition-colors"
                            />
                        </div>
                    </div>
                </section>

                {/* Section 1.5: Diet & Lifestyle */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                        Diet & Lifestyle
                        <div className="h-px bg-white/10 flex-1 ml-4"></div>
                    </h2>

                    <div>
                        <label className="block text-sm text-text-muted-zinc mb-2">Dietary Preference</label>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Other'].map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => updateData('diet', opt)}
                                    className={`px-3 py-2 rounded-lg border text-sm transition-all ${formData.diet === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-text-cream/10 hover:bg-text-cream/5 text-text-muted-zinc'}`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Section 2: Dermatology */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                        Dermatology
                        <div className="h-px bg-white/10 flex-1 ml-4"></div>
                    </h2>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <div className="flex items-center justify-between mb-3">
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
                            <div className="grid grid-cols-2 gap-2">
                                {['Dry', 'Oily', 'Combination', 'Normal'].map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => updateData('skinType', opt)}
                                        className={`px-3 py-2 rounded-lg border text-sm text-left transition-all ${formData.skinType === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-text-cream/10 hover:bg-text-cream/5 text-text-muted-zinc'}`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-3">
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
                            <div className="grid grid-cols-2 gap-2">
                                {['Straight', 'Wavy', 'Curly', 'Coily'].map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => updateData('hairType', opt)}
                                        className={`px-3 py-2 rounded-lg border text-sm text-left transition-all ${formData.hairType === opt ? 'bg-text-cream text-warm-charcoal border-text-cream' : 'border-text-cream/10 hover:bg-text-cream/5 text-text-muted-zinc'}`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 3: Medical */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                        Medical History
                        <div className="h-px bg-white/10 flex-1 ml-4"></div>
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-text-muted-zinc mb-2">Allergies</label>
                            <textarea
                                value={formData.allergies}
                                onChange={e => updateData('allergies', e.target.value)}
                                className="w-full bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-3 text-text-cream focus:outline-none focus:border-text-cream/50 transition-colors min-h-[80px]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-text-muted-zinc mb-2">Chronic Conditions</label>
                            <textarea
                                value={formData.conditions}
                                onChange={e => updateData('conditions', e.target.value)}
                                className="w-full bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-3 text-text-cream focus:outline-none focus:border-text-cream/50 transition-colors min-h-[80px]"
                            />
                        </div>
                    </div>
                </section>

                {/* Section 3.5: Account & Connections */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                        Account & Connections
                        <div className="h-px bg-white/10 flex-1 ml-4"></div>
                    </h2>

                    <div>
                        <label className="block text-sm text-text-muted-zinc mb-2">WhatsApp Number</label>
                        <div className="relative">
                            <input
                                type="tel"
                                value={(formData as any).phoneNumber || ''}
                                onChange={e => {
                                    // Basic validation: Allow only numbers, spaces, +, -
                                    const val = e.target.value;
                                    if (/^[0-9+\- ]*$/.test(val)) {
                                        updateData('phoneNumber', val);
                                    }
                                }}
                                placeholder="+91 98765 43210"
                                className="w-full bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-3 text-text-cream focus:outline-none focus:border-text-cream/50 transition-colors"
                            />
                            {/* Linked Badge: Only if SAVED and MATCHES current input */}
                            {savedPhoneNumber && savedPhoneNumber.length > 5 && savedPhoneNumber === (formData as any).phoneNumber && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-green-400 text-xs font-medium bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">
                                    <Check size={12} /> Linked
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-text-muted-zinc mt-2 opacity-70">
                            Enter with <strong className="text-text-cream">Country Code</strong> (e.g. +91 or +1). This allows Ekam to recognize you on WhatsApp.
                        </p>
                    </div>
                </section>

                {/* Section 4: Agent Memory (Dynamic) */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                            Clinical Memory (Agent Insights)
                            <div className="h-px bg-white/10 w-8 ml-4"></div>
                        </h2>
                    </div>

                    <p className="text-sm text-text-muted-zinc leading-relaxed">
                        This is the raw data Ekam's agents have learned about you. You can add new facts or delete incorrect ones.
                        <br /><span className="text-xs opacity-70">Example: "Injury: Left Knee", "Phobia: Spiders", "Preference: No Cilantro"</span>
                    </p>

                    <div className="space-y-3">
                        {Object.entries(formData)
                            .filter(([key]) => !['gender', 'dob', 'height', 'weight', 'diet', 'skinType', 'hairType', 'allergies', 'conditions', 'updatedAt', 'onboardingCompleted', 'phoneNumber'].includes(key))
                            .map(([key, value]) => (
                                <div key={key} className="flex items-center gap-3 group">
                                    <div className="flex-1 bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-3 flex items-center gap-4">
                                        <span className="text-text-muted-zinc text-sm font-medium uppercase tracking-wider min-w-[100px]">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                        <div className="h-4 w-px bg-white/10"></div>
                                        <input
                                            type="text"
                                            value={value as string}
                                            onChange={(e) => updateData(key, e.target.value)}
                                            className="bg-transparent text-text-cream flex-1 focus:outline-none text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newData = { ...formData };
                                            delete (newData as any)[key];
                                            setFormData(newData);
                                        }}
                                        className="p-3 text-text-muted-zinc hover:text-red-400 hover:bg-text-cream/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Forget this memory"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ))}

                        {/* Empty state if no extra memories */}
                        {Object.entries(formData).filter(([key]) => !['gender', 'dob', 'height', 'weight', 'diet', 'skinType', 'hairType', 'allergies', 'conditions', 'updatedAt', 'onboardingCompleted'].includes(key)).length === 0 && (
                            <div className="text-center py-8 border border-dashed border-text-cream/10 rounded-lg text-text-muted-zinc/50 text-sm">
                                No specialized memories yet. Upload a photo or chat with Ekam to generate insights.
                            </div>
                        )}

                        {/* Add New Memory Button */}
                        <div className="pt-2">
                            <button
                                onClick={() => {
                                    const keyName = prompt("Enter a label for this new memory (e.g., 'Injury', 'Medication'):");
                                    if (keyName && keyName.trim()) {
                                        // Normalize key: camelCase or snake_case preferred, but space is okay for now
                                        const cleanKey = keyName.trim();
                                        if (cleanKey && !(formData as any)[cleanKey]) {
                                            updateData(cleanKey, '');
                                        }
                                    }
                                }}
                                className="flex items-center gap-2 text-sm text-accent-clay hover:text-text-cream transition-colors px-1"
                            >
                                <Plus size={16} /> Add Custom Memory
                            </button>
                        </div>
                    </div>
                </section>

                {/* Section 4.5: Connect Bots */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                        Connect AI Assistants
                        <div className="h-px bg-white/10 flex-1 ml-4"></div>
                    </h2>

                    <div className="bg-surface-charcoal/50 rounded-xl p-4 border border-text-cream/5">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-accent-clay/10 rounded-lg text-accent-clay">
                                <HelpCircle size={20} />
                            </div>
                            <div>
                                <h3 className="text-text-cream font-medium text-sm">How to Connect</h3>
                                <p className="text-text-muted-zinc text-xs mt-1 leading-relaxed">
                                    To use Ekam on WhatsApp or Telegram, simply save your phone number below (with country code, e.g., +91).
                                    Then click the buttons to start a chat!
                                </p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-text-muted-zinc mb-2">Phone Number (with Country Code)</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="tel"
                                placeholder="+919999999999"
                                value={formData.phoneNumber}
                                onChange={e => updateData('phoneNumber', e.target.value)}
                                className="flex-1 bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-2 text-text-cream focus:outline-none focus:border-text-cream/50 transition-colors"
                            />
                            {savedPhoneNumber && savedPhoneNumber === formData.phoneNumber && (
                                <span className="px-3 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20 flex items-center gap-1">
                                    <Check size={12} /> Linked
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-text-muted-zinc mt-2 opacity-70">
                            Enter with <strong className="text-text-cream">Country Code</strong> (e.g. +91 or +1). This allows Ekam to recognize you on WhatsApp.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <a
                            href={`https://wa.me/15551735233?text=Hello`} // Correct Test Number
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] rounded-xl border border-[#25D366]/20 transition-all group"
                        >
                            <span>Chat on WhatsApp</span>
                        </a>
                        <a
                            href="https://t.me/EkamHealth_Bot" // Correct Bot Username
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 text-[#0088cc] rounded-xl border border-[#0088cc]/20 transition-all group"
                        >
                            <span>Chat on Telegram</span>
                        </a>
                    </div>
                </section>

                {/* Action Bar */}
                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`flex items-center gap-2 px-8 py-3 rounded-full font-medium shadow-lg transition-all ${showSuccess ? 'bg-green-500 text-white' : 'bg-text-cream text-warm-charcoal hover:scale-105 active:scale-95'}`}
                    >
                        {showSuccess ? (
                            <>Saved <Check size={18} /></>
                        ) : isSaving ? (
                            'Saving...'
                        ) : (
                            <>Save Changes <Save size={18} /></>
                        )}
                    </button>
                </div>
            </div>

            <HelpModal
                isOpen={helpModal.isOpen}
                onClose={() => setHelpModal(prev => ({ ...prev, isOpen: false }))}
                title={helpModal.title}
                content={helpModal.content}
            />
        </motion.div>
    );
};
