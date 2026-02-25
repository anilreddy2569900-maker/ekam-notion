import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Save, Check, HelpCircle, Plus, X, Send, AlertCircle, Loader } from 'lucide-react';
import { HelpModal } from './HelpModal';
import { registerTelegramBot, disconnectTelegramBot } from '../lib/ekam_api';
import { supabase } from '../lib/supabase';

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

    // Expansion state for clinical memory
    const [showAllMemory, setShowAllMemory] = useState(false);

    // Telegram connection state
    const [telegramToken, setTelegramToken] = useState('');
    const [telegramStatus, setTelegramStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [telegramBotUsername, setTelegramBotUsername] = useState('');
    const [telegramError, setTelegramError] = useState('');

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

        // Fetch profile and subscribe to changes
        const fetchProfile = async () => {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('data')
                .eq('firebase_uid', user.uid);

            if (error) {
                console.error("Error fetching profile:", error);
                return;
            }

            if (profiles && profiles.length > 0) {
                const profileData = profiles[0].data;
                if (!isSaving) {
                    setFormData(profileData);
                    if (profileData.phoneNumber) setSavedPhoneNumber(profileData.phoneNumber);
                    if (profileData.telegramBotUsername) {
                        setTelegramBotUsername(profileData.telegramBotUsername);
                        setTelegramStatus('connected');
                    }
                    localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify(profileData));
                }
            }
            setIsLoading(false);
        };

        fetchProfile();

        const channel = supabase
            .channel(`profile-${user.uid}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `firebase_uid=eq.${user.uid}`
            }, (payload) => {
                if (!isSaving) {
                    const profileData = payload.new.data;
                    setFormData(profileData);
                    if (profileData.phoneNumber) setSavedPhoneNumber(profileData.phoneNumber);
                    if (profileData.telegramBotUsername) {
                        setTelegramBotUsername(profileData.telegramBotUsername);
                        setTelegramStatus('connected');
                    }
                    localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify(profileData));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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
            const profileData = {
                ...formData,
                updatedAt: new Date().toISOString(),
                onboardingCompleted: true
            };

            const { error } = await supabase.from('profiles').upsert({
                firebase_uid: user.uid,
                data: profileData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'firebase_uid' });

            if (error) throw error;

            console.log("HandleSave: Write successful");

            // Update Local Cache Immediately
            localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify(profileData));

            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                onClose();
            }, 1500);
        } catch (error: any) {
            console.error("Error saving profile:", error);
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
                        {(() => {
                            // Define standard and internal keys to hide
                            const hiddenKeys = [
                                'gender', 'dob', 'height', 'weight', 'diet', 'skinType',
                                'hairType', 'allergies', 'conditions', 'updatedAt',
                                'onboardingCompleted', 'phoneNumber',
                                'telegramBotToken', 'telegramBotUsername', 'telegramBotName',
                                'telegramConnectedAt', 'telegramChatId'
                            ];

                            // Filter custom memory entries
                            const memoryEntries = Object.entries(formData)
                                .filter(([key]) => !hiddenKeys.includes(key));

                            // Determine entries to display based on toggle state
                            const displayedEntries = showAllMemory ? memoryEntries : memoryEntries.slice(0, 5);

                            if (memoryEntries.length === 0) {
                                return (
                                    <div className="text-center py-8 border border-dashed border-text-cream/10 rounded-lg text-text-muted-zinc/50 text-sm">
                                        No specialized memories yet. Upload a photo or chat with Ekam to generate insights.
                                    </div>
                                );
                            }

                            return (
                                <>
                                    {displayedEntries.map(([key, value]) => (
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

                                    {memoryEntries.length > 5 && (
                                        <div className="flex justify-center pt-2">
                                            <button
                                                onClick={() => setShowAllMemory(!showAllMemory)}
                                                className="text-xs text-text-muted-zinc hover:text-text-cream transition-colors py-2 px-4 rounded-full bg-white/5 hover:bg-white/10"
                                            >
                                                {showAllMemory ? '▲ Collapse Memory' : `▼ See ${memoryEntries.length - 5} More`}
                                            </button>
                                        </div>
                                    )}
                                </>
                            );
                        })()}

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

                {/* Section 4.5: Telegram Bot */}
                <section className="bg-surface-charcoal/30 rounded-2xl p-6 border border-white/5 space-y-6">
                    <h2 className="text-xl font-medium text-text-cream/90 flex items-center gap-2">
                        Connect Telegram
                        <div className="h-px bg-white/10 flex-1 ml-4"></div>
                        {telegramStatus === 'connected' && (
                            <span className="text-xs px-2 py-1 rounded-full bg-[#0088cc]/15 text-[#0088cc] border border-[#0088cc]/20 flex items-center gap-1">
                                <Check size={11} /> @{telegramBotUsername}
                            </span>
                        )}
                    </h2>

                    {telegramStatus !== 'connected' ? (
                        <div className="space-y-5">
                            {/* Step-by-step instructions */}
                            <div className="bg-[#0088cc]/5 border border-[#0088cc]/15 rounded-xl p-4 space-y-3">
                                <p className="text-xs font-medium text-[#0088cc] uppercase tracking-wider">Setup Instructions</p>
                                {[
                                    { n: 1, text: 'Open Telegram and search for @BotFather' },
                                    { n: 2, text: 'Send /newbot — choose a name (e.g. "My Ekam") and a username ending in "bot"' },
                                    { n: 3, text: 'Copy the API token BotFather gives you (looks like: 123456789:ABCdef...)' },
                                    { n: 4, text: 'Paste it below and click Connect' },
                                ].map(step => (
                                    <div key={step.n} className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0088cc]/20 text-[#0088cc] text-xs flex items-center justify-center font-bold">{step.n}</span>
                                        <p className="text-sm text-text-muted-zinc leading-relaxed">{step.text}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Token input */}
                            <div>
                                <label className="block text-sm text-text-muted-zinc mb-2">Bot API Token</label>
                                <input
                                    type="text"
                                    value={telegramToken}
                                    onChange={e => { setTelegramToken(e.target.value); setTelegramError(''); }}
                                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTuVwXYZ"
                                    className="w-full bg-surface-charcoal border border-text-cream/10 rounded-lg px-4 py-3 text-text-cream text-sm font-mono focus:outline-none focus:border-[#0088cc]/50 transition-colors"
                                />
                                {telegramError && (
                                    <div className="flex items-center gap-2 mt-2 text-red-400 text-xs">
                                        <AlertCircle size={12} /> {telegramError}
                                    </div>
                                )}
                            </div>

                            {/* Connect button */}
                            <button
                                onClick={async () => {
                                    if (!telegramToken.trim()) return;
                                    setTelegramStatus('connecting');
                                    setTelegramError('');
                                    try {
                                        const result = await registerTelegramBot(telegramToken.trim());
                                        setTelegramBotUsername(result.botUsername);
                                        setTelegramStatus('connected');
                                        setTelegramToken('');
                                    } catch (err: any) {
                                        setTelegramStatus('error');
                                        setTelegramError(err.message || 'Failed to connect. Check your token and try again.');
                                        setTimeout(() => setTelegramStatus('idle'), 100);
                                    }
                                }}
                                disabled={telegramStatus === 'connecting' || !telegramToken.trim()}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0088cc]/15 hover:bg-[#0088cc]/25 text-[#0088cc] border border-[#0088cc]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm"
                            >
                                {telegramStatus === 'connecting' ? (
                                    <><Loader size={16} className="animate-spin" /> Connecting...</>
                                ) : (
                                    <><Send size={16} /> Connect Bot</>
                                )}
                            </button>
                        </div>
                    ) : (
                        /* Connected state */
                        <div className="space-y-4">
                            <div className="bg-[#0088cc]/8 border border-[#0088cc]/20 rounded-xl p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#0088cc]/20 flex items-center justify-center text-[#0088cc]">
                                    <Send size={18} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-text-cream font-medium text-sm">@{telegramBotUsername}</p>
                                    <p className="text-text-muted-zinc text-xs mt-0.5">Your personal Ekam bot — tap to open in Telegram</p>
                                </div>
                                <a
                                    href={`https://t.me/${telegramBotUsername}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-[#0088cc]/15 hover:bg-[#0088cc]/25 text-[#0088cc] rounded-lg text-sm border border-[#0088cc]/20 transition-all"
                                >
                                    Open
                                </a>
                            </div>
                            <p className="text-xs text-text-muted-zinc/60 leading-relaxed">
                                All messages sent to @{telegramBotUsername} will be processed by the full Ekam council and will appear here in your chat history.
                            </p>
                            <button
                                onClick={async () => {
                                    try {
                                        await disconnectTelegramBot();
                                        setTelegramStatus('idle');
                                        setTelegramBotUsername('');
                                    } catch (err: any) {
                                        setTelegramError(err.message || 'Failed to disconnect.');
                                    }
                                }}
                                className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
                            >
                                Disconnect bot
                            </button>
                        </div>
                    )}
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
