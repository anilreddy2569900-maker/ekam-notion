import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Utensils, Activity, ArrowRight, Brain, Check, RefreshCw, X, ChevronLeft, Trophy, Home, Building2, BicepsFlexed, HeartPulse, Scale, Flame } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { sendMessageToEkam } from '../../lib/ekam_api';
import { db, doc, getDoc, setDoc, onSnapshot } from '../../lib/firebase';

interface FitnessHubProps {
    onClose: () => void;
}

type Step = 'onboarding' | 'consultation' | 'plan';
type OnboardingStep = 'experience' | 'goal' | 'environment' | 'gear' | 'summary';

interface FitnessProfile {
    experience: 'Beginner' | 'Intermediate' | 'Advanced';
    goal: 'Weight Loss' | 'Muscle Gain' | 'Maintenance' | 'Endurance';
    activityLevel: 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active';
    environment: 'Gym' | 'Home' | 'Outdoor';
    equipment: 'Gym' | 'Home (Dumbbells)' | 'Bodyweight Only' | 'Cardio Machines'; // Derived or selected
    dietary: string;
    limitations: string;
}

interface WorkoutExercise {
    name: string;
    sets: string;
    reps: string;
    rest: string;
    notes: string;
    videoUrl?: string;
}

interface MealItem {
    time: string;
    meal: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
}

interface FitnessPlan {
    id: string;
    generatedAt: any;
    summary: string;
    workout: {
        split: string;
        days: {
            day: string;
            focus: string;
            exercises: WorkoutExercise[];
        }[];
    };
    diet: {
        calories: number;
        protein: number;
        carbs: number;
        fats: number;
        schedule: MealItem[];
    };
}

export const FitnessHub: React.FC<FitnessHubProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [step, setStep] = useState<Step>('onboarding');
    const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('experience');
    const [loading, setLoading] = useState(false);
    
    // Profile State
    const [profile, setProfile] = useState<FitnessProfile>({
        experience: 'Beginner',
        goal: 'Muscle Gain',
        activityLevel: 'Moderately Active',
        environment: 'Gym',
        equipment: 'Gym',
        dietary: '',
        limitations: ''
    });

    // Chat State
    const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [consultationInput, setConsultationInput] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);

    // Plan State
    const [plan, setPlan] = useState<FitnessPlan | null>(null);
    const [activeTab, setActiveTab] = useState<'workout' | 'diet'>('workout');

    // Load Existing Plan
    useEffect(() => {
        if (!user) return;
        const planRef = doc(db, 'users', user.uid, 'fitness', 'current_plan');
        const unsubscribe = onSnapshot(planRef, (docSnap) => {
            if (docSnap.exists()) {
                setPlan(docSnap.data() as FitnessPlan);
                setStep('plan');
            }
        });
        return () => unsubscribe();
    }, [user]);

    // --- ONBOARDING HANDLERS ---

    const handleExperienceSelect = (level: FitnessProfile['experience']) => {
        setProfile(prev => ({ ...prev, experience: level }));
        setOnboardingStep('goal');
    };

    const handleGoalSelect = (goal: FitnessProfile['goal']) => {
        setProfile(prev => ({ ...prev, goal }));
        setOnboardingStep('environment');
    };

    const handleEnvironmentSelect = (env: FitnessProfile['environment']) => {
        setProfile(prev => ({ ...prev, environment: env }));
        
        // Auto-suggest equipment based on environment
        if (env === 'Gym') {
            setProfile(prev => ({ ...prev, environment: env, equipment: 'Gym' }));
            setOnboardingStep('summary'); // Skip gear check for gym
        } else {
            setOnboardingStep('gear');
        }
    };

    const handleGearSelect = (gear: FitnessProfile['equipment']) => {
        setProfile(prev => ({ ...prev, equipment: gear }));
        setOnboardingStep('summary');
    };

    // --- CONSULTATION & PLAN ---

    const handleConsultationSend = async () => {
        if (!consultationInput.trim()) return;
        
        const newHistory = [...chatHistory, { role: 'user' as const, text: consultationInput }];
        setChatHistory(newHistory);
        setConsultationInput('');
        setIsConsulting(true);

        try {
            const context = `
            You are Ekam's elite fitness coach.
            User Profile: ${JSON.stringify(profile)}
            Task: Provide a concise, motivating response. Ask 1 clarifying question if needed.
            If you have enough info, ask: "Shall I generate your plan now?"
            `;

            const response = await sendMessageToEkam(
                consultationInput, 
                newHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
                undefined, null, context, undefined, undefined, 'SIMPLE'
            );

            setChatHistory([...newHistory, { role: 'model', text: response.text }]);
        } catch (e) {
            console.error(e);
        } finally {
            setIsConsulting(false);
        }
    };

    const generateFinalPlan = async () => {
        setLoading(true);
        try {
            const prompt = `
            GENERATE FITNESS PLAN JSON.
            Profile: ${JSON.stringify(profile)}.
            Return ONLY valid JSON with structure:
            {
                "summary": "Brief motivational summary.",
                "workout": {
                    "split": "Upper/Lower",
                    "days": [ { "day": "Monday", "focus": "Chest", "exercises": [ { "name": "Bench Press", "sets": "3", "reps": "8-12", "rest": "90s", "notes": "Form cues" } ] } ]
                },
                "diet": {
                    "calories": 2500, "protein": 180, "carbs": 250, "fats": 80,
                    "schedule": [ { "time": "8:00 AM", "meal": "Oats", "calories": 400, "protein": 30, "carbs": 50, "fats": 10 } ]
                }
            }
            `;

            const response = await sendMessageToEkam(prompt, [], undefined, null, undefined, undefined, undefined, 'CRITICAL');
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const planData = JSON.parse(jsonMatch[0]);
                if (user) {
                    await setDoc(doc(db, 'users', user.uid, 'fitness', 'current_plan'), {
                        ...planData,
                        id: 'current_plan',
                        generatedAt: new Date()
                    });
                }
            }
        } catch (e) {
            console.error("Plan Gen Error", e);
            alert("Failed to generate plan.");
        } finally {
            setLoading(false);
        }
    };

    // --- ANIMATION VARIANTS ---
    const slideVariants = {
        enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 }),
    };

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 bg-surface-charcoal/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden"
        >
            <button onClick={onClose} className="absolute top-6 right-6 text-text-muted-zinc hover:text-text-cream transition-colors z-50">
                <X size={24} />
            </button>

            <div className="w-full max-w-5xl h-full flex flex-col bg-warm-charcoal rounded-2xl border border-text-cream/5 shadow-2xl overflow-hidden relative">
                
                {/* Header */}
                <div className="p-6 border-b border-text-cream/5 bg-surface-charcoal flex justify-between items-center z-10 relative">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 text-amber-500 shadow-inner">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-serif text-text-cream">Ekam Fitness</h2>
                            <p className="text-sm text-text-muted-zinc">
                                {step === 'onboarding' ? 'Bio-Calibration Sequence' : 'Personalized Protocol'}
                            </p>
                        </div>
                    </div>
                    
                    {/* Progress Bar for Onboarding */}
                    {step === 'onboarding' && (
                        <div className="hidden md:flex flex-col items-end gap-2 w-48">
                            <div className="flex gap-1">
                                {['experience', 'goal', 'environment', 'gear', 'summary'].map((s, i) => {
                                    const currentIdx = ['experience', 'goal', 'environment', 'gear', 'summary'].indexOf(onboardingStep);
                                    const isActive = i <= currentIdx;
                                    return (
                                        <div key={s} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${isActive ? 'bg-amber-500' : 'bg-white/10'}`} />
                                    );
                                })}
                            </div>
                            <span className="text-[10px] text-text-muted-zinc uppercase tracking-wider">
                                Step {['experience', 'goal', 'environment', 'gear', 'summary'].indexOf(onboardingStep) + 1} / 5
                            </span>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 relative flex flex-col">
                    
                    {/* STEP 1: ONBOARDING - GUIDED JOURNEY */}
                    {step === 'onboarding' && (
                        <div className="flex-1 flex flex-col justify-center max-w-3xl mx-auto w-full">
                            <AnimatePresence mode="wait">
                                
                                {/* 1. EXPERIENCE LEVEL */}
                                {onboardingStep === 'experience' && (
                                    <motion.div 
                                        key="experience"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="space-y-8 text-center"
                                    >
                                        <div>
                                            <h3 className="text-3xl md:text-4xl font-light text-text-cream mb-4">How well do you know the gym?</h3>
                                            <p className="text-text-muted-zinc text-lg">We'll tailor the terminology and complexity to match your level.</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {[
                                                { id: 'Beginner', title: 'Newbie', desc: 'I need guidance on form & basics.', icon: <Brain /> },
                                                { id: 'Intermediate', title: 'Regular', desc: 'I know my way around.', icon: <BicepsFlexed /> },
                                                { id: 'Advanced', title: 'Pro', desc: 'Push me to my absolute limit.', icon: <Trophy /> }
                                            ].map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => handleExperienceSelect(item.id as any)}
                                                    className="group p-6 rounded-2xl bg-surface-charcoal border border-text-cream/5 hover:border-amber-500/50 hover:bg-white/5 transition-all text-left flex flex-col gap-4 relative overflow-hidden"
                                                >
                                                    <div className="p-3 bg-white/5 w-fit rounded-xl text-amber-500 group-hover:scale-110 transition-transform">
                                                        {item.icon}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xl font-medium text-text-cream mb-1">{item.title}</h4>
                                                        <p className="text-sm text-text-muted-zinc">{item.desc}</p>
                                                    </div>
                                                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 to-amber-500/0 group-hover:to-amber-500/5 transition-all duration-500" />
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* 2. GOAL SELECTION */}
                                {onboardingStep === 'goal' && (
                                    <motion.div 
                                        key="goal"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="space-y-8 text-center"
                                    >
                                        <div>
                                            <button onClick={() => setOnboardingStep('experience')} className="text-sm text-text-muted-zinc hover:text-amber-500 mb-4 flex items-center justify-center gap-1 mx-auto"><ChevronLeft size={14}/> Back</button>
                                            <h3 className="text-3xl md:text-4xl font-light text-text-cream mb-4">What's your main mission?</h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {[
                                                { id: 'Muscle Gain', title: 'Build Muscle', icon: <BicepsFlexed size={24} />, desc: 'Hypertrophy & Strength' },
                                                { id: 'Weight Loss', title: 'Burn Fat', icon: <Flame size={24} />, desc: 'High Intensity & Deficit' },
                                                { id: 'Maintenance', title: 'Stay Fit', icon: <Scale size={24} />, desc: 'Longevity & Health' },
                                                { id: 'Endurance', title: 'Endurance', icon: <HeartPulse size={24} />, desc: 'Stamina & Cardio' }
                                            ].map((g) => (
                                                <button
                                                    key={g.id}
                                                    onClick={() => handleGoalSelect(g.id as any)}
                                                    className="p-6 rounded-2xl bg-surface-charcoal border border-text-cream/5 hover:border-amber-500/50 hover:bg-white/5 transition-all flex items-center gap-4 text-left group"
                                                >
                                                    <div className="p-4 rounded-xl bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                                        {g.icon}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-lg font-medium text-text-cream">{g.title}</h4>
                                                        <p className="text-sm text-text-muted-zinc">{g.desc}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* 3. ENVIRONMENT */}
                                {onboardingStep === 'environment' && (
                                    <motion.div 
                                        key="environment"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="space-y-8 text-center"
                                    >
                                        <div>
                                             <button onClick={() => setOnboardingStep('goal')} className="text-sm text-text-muted-zinc hover:text-amber-500 mb-4 flex items-center justify-center gap-1 mx-auto"><ChevronLeft size={14}/> Back</button>
                                            <h3 className="text-3xl md:text-4xl font-light text-text-cream mb-4">Where will you train?</h3>
                                        </div>
                                        <div className="flex flex-col md:flex-row gap-4 justify-center">
                                            {[
                                                { id: 'Gym', title: 'Commercial Gym', icon: <Building2 size={32} /> },
                                                { id: 'Home', title: 'Home Space', icon: <Home size={32} /> },
                                                { id: 'Outdoor', title: 'Outdoors', icon: <Activity size={32} /> }
                                            ].map((e) => (
                                                <button
                                                    key={e.id}
                                                    onClick={() => handleEnvironmentSelect(e.id as any)}
                                                    className="flex-1 p-8 rounded-2xl bg-surface-charcoal border border-text-cream/5 hover:border-amber-500/50 hover:bg-white/5 transition-all flex flex-col items-center gap-4 group"
                                                >
                                                    <div className="p-4 rounded-full bg-white/5 text-text-muted-zinc group-hover:text-amber-500 group-hover:scale-110 transition-all">
                                                        {e.icon}
                                                    </div>
                                                    <span className="text-lg font-medium text-text-cream">{e.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* 4. GEAR CHECK (Conditional) */}
                                {onboardingStep === 'gear' && (
                                    <motion.div 
                                        key="gear"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="space-y-8 text-center"
                                    >
                                        <div>
                                            <h3 className="text-3xl md:text-4xl font-light text-text-cream mb-4">What equipment do you have?</h3>
                                        </div>
                                        <div className="space-y-3 max-w-md mx-auto">
                                            {[
                                                { id: 'Bodyweight Only', label: 'Nothing (Just me)' },
                                                { id: 'Home (Dumbbells)', label: 'Dumbbells / Resistance Bands' },
                                                { id: 'Cardio Machines', label: 'Treadmill / Bike Only' }
                                            ].map((opt) => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => handleGearSelect(opt.id as any)}
                                                    className="w-full p-4 rounded-xl border border-text-cream/10 hover:border-amber-500 hover:bg-amber-500/10 transition-all text-left text-text-cream flex justify-between items-center group"
                                                >
                                                    <span>{opt.label}</span>
                                                    <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-500" />
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* 5. SUMMARY */}
                                {onboardingStep === 'summary' && (
                                    <motion.div 
                                        key="summary"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-center space-y-6 bg-surface-charcoal p-8 rounded-3xl border border-amber-500/20 shadow-2xl shadow-amber-900/10"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mx-auto mb-4">
                                            <Check size={32} />
                                        </div>
                                        <h3 className="text-2xl font-light text-text-cream">Profile Calibrated</h3>
                                        <div className="text-text-muted-zinc space-y-2 text-sm bg-black/20 p-4 rounded-xl">
                                            <p><strong className="text-text-cream">Level:</strong> {profile.experience}</p>
                                            <p><strong className="text-text-cream">Goal:</strong> {profile.goal}</p>
                                            <p><strong className="text-text-cream">Setup:</strong> {profile.environment} ({profile.equipment})</p>
                                        </div>
                                        <p className="text-text-cream/80 max-w-md mx-auto">
                                            We're ready to design your protocol. You can chat with our AI Coach to refine details, or generate your plan immediately.
                                        </p>
                                        <button 
                                            onClick={() => setStep('consultation')}
                                            className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-medium transition-all shadow-lg"
                                        >
                                            Enter Planning Phase
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* STEPS 2 & 3 (Consultation & Plan) remain similar but wrapped for layout */}
                    {step !== 'onboarding' && (
                        <div className="h-full flex flex-col">
                            {/* Same Consultation UI as before */}
                            {step === 'consultation' && (
                                <div className="h-full flex flex-col max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4">
                                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 scrollbar-thin scrollbar-thumb-white/10">
                                        <div className="flex gap-4">
                                            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0">
                                                <Brain size={16} />
                                            </div>
                                            <div className="bg-surface-charcoal p-4 rounded-2xl rounded-tl-none border border-text-cream/5 text-text-cream/90 max-w-[80%]">
                                                <p>I've analyzed your profile. As a <strong>{profile.experience}</strong> aiming for <strong>{profile.goal}</strong> at <strong>{profile.environment}</strong>...</p>
                                                <p className="mt-2">Do you have any specific injuries or days you CANNOT workout?</p>
                                            </div>
                                        </div>

                                        {chatHistory.map((msg, idx) => (
                                            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-white/10 text-white' : 'bg-amber-500/20 text-amber-500'}`}>
                                                    {msg.role === 'user' ? <div className="w-2 h-2 bg-white rounded-full" /> : <Brain size={16} />}
                                                </div>
                                                <div className={`p-4 rounded-2xl border max-w-[80%] ${msg.role === 'user' 
                                                    ? 'bg-amber-600/20 border-amber-500/20 text-text-cream rounded-tr-none' 
                                                    : 'bg-surface-charcoal border-text-cream/5 text-text-cream/90 rounded-tl-none'}`}>
                                                    <p>{msg.text}</p>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        {isConsulting && (
                                            <div className="flex gap-4 animate-pulse">
                                                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0">
                                                    <Brain size={16} />
                                                </div>
                                                <div className="bg-surface-charcoal p-4 rounded-2xl rounded-tl-none border border-text-cream/5 text-text-cream/50">
                                                    Thinking...
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-auto border-t border-text-cream/10 pt-4">
                                        {loading ? (
                                            <div className="text-center py-8">
                                                <RefreshCw className="animate-spin mx-auto text-amber-500 mb-2" size={32} />
                                                <p className="text-text-muted-zinc animate-pulse">Designing your bio-architecture...</p>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    value={consultationInput}
                                                    onChange={(e) => setConsultationInput(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleConsultationSend()}
                                                    placeholder="Type your reply..."
                                                    className="flex-1 bg-surface-charcoal border border-text-cream/10 rounded-xl px-4 py-3 text-text-cream focus:ring-1 focus:ring-amber-500/50 outline-none"
                                                />
                                                <button 
                                                    onClick={handleConsultationSend}
                                                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-text-cream transition-colors"
                                                >
                                                    <ArrowRight size={20} />
                                                </button>
                                                <button 
                                                    onClick={generateFinalPlan}
                                                    className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-amber-900/20 whitespace-nowrap"
                                                >
                                                    Generate Plan
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Plan Display */}
                            {step === 'plan' && plan && (
                                <div className="animate-in fade-in duration-700 h-full overflow-y-auto pr-2">
                                     <div className="flex justify-center gap-2 mb-6">
                                         <button 
                                            onClick={() => setActiveTab('workout')}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'workout' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'text-text-muted-zinc hover:bg-white/5'}`}
                                        >
                                            <Dumbbell size={16} className="inline mr-2" /> Workouts
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('diet')}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'diet' ? 'bg-green-500/20 text-green-500 border border-green-500/30' : 'text-text-muted-zinc hover:bg-white/5'}`}
                                        >
                                            <Utensils size={16} className="inline mr-2" /> Nutrition
                                        </button>
                                     </div>

                                     <div className="mb-8 p-6 bg-gradient-to-r from-amber-500/10 to-transparent border-l-4 border-amber-500 rounded-r-xl">
                                        <h3 className="text-xl font-medium text-amber-400 mb-2">Coach's Summary</h3>
                                        <p className="text-text-cream/90 italic leading-relaxed">"{plan.summary}"</p>
                                    </div>

                                    {activeTab === 'workout' && (
                                        <div className="space-y-8">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-2xl font-light text-text-cream">Training Split: <span className="text-amber-500">{plan.workout.split}</span></h3>
                                            </div>

                                            <div className="grid grid-cols-1 gap-6">
                                                {plan.workout.days.map((day, idx) => (
                                                    <div key={idx} className="bg-surface-charcoal border border-text-cream/5 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all group">
                                                        <div className="bg-white/5 p-4 flex justify-between items-center">
                                                            <h4 className="text-lg font-medium text-text-cream">{day.day} <span className="text-text-muted-zinc mx-2">•</span> {day.focus}</h4>
                                                            <span className="text-xs font-mono text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded">{day.exercises.length} Exercises</span>
                                                        </div>
                                                        <div className="p-4 space-y-4">
                                                            {day.exercises.map((ex, i) => (
                                                                <div key={i} className="flex flex-col md:flex-row gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-text-cream/5">
                                                                    <div className="w-full md:w-32 h-20 bg-black/40 rounded-lg flex items-center justify-center text-text-muted-zinc/30 relative overflow-hidden group-hover/ex:scale-105 transition-transform">
                                                                        <Dumbbell size={20} className="opacity-50" />
                                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="flex justify-between mb-1">
                                                                            <h5 className="font-medium text-text-cream">{ex.name}</h5>
                                                                            <div className="flex gap-3 text-sm font-mono text-amber-400">
                                                                                <span>{ex.sets} Sets</span>
                                                                                <span>{ex.reps} Reps</span>
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-sm text-text-muted-zinc mb-2">{ex.notes}</p>
                                                                        <div className="flex items-center gap-2 text-xs text-text-muted-zinc/60">
                                                                            <Activity size={12} />
                                                                            <span>Rest: {ex.rest}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'diet' && (
                                        <div className="space-y-8">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="bg-surface-charcoal p-4 rounded-xl border border-text-cream/5 text-center">
                                                    <p className="text-text-muted-zinc text-xs uppercase tracking-widest mb-1">Calories</p>
                                                    <p className="text-2xl font-bold text-text-cream">{plan.diet.calories}</p>
                                                </div>
                                                <div className="bg-surface-charcoal p-4 rounded-xl border border-blue-500/20 text-center relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
                                                    <p className="text-blue-400 text-xs uppercase tracking-widest mb-1">Protein</p>
                                                    <p className="text-2xl font-bold text-text-cream">{plan.diet.protein}g</p>
                                                </div>
                                                <div className="bg-surface-charcoal p-4 rounded-xl border border-amber-500/20 text-center relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
                                                    <p className="text-amber-400 text-xs uppercase tracking-widest mb-1">Carbs</p>
                                                    <p className="text-2xl font-bold text-text-cream">{plan.diet.carbs}g</p>
                                                </div>
                                                <div className="bg-surface-charcoal p-4 rounded-xl border border-red-500/20 text-center relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
                                                    <p className="text-red-400 text-xs uppercase tracking-widest mb-1">Fats</p>
                                                    <p className="text-2xl font-bold text-text-cream">{plan.diet.fats}g</p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h3 className="text-xl font-light text-text-cream">Daily Meal Schedule</h3>
                                                <div className="space-y-4">
                                                    {plan.diet.schedule.map((meal, idx) => (
                                                        <div key={idx} className="flex gap-6 p-4 bg-surface-charcoal border border-text-cream/5 rounded-xl items-center hover:bg-white/5 transition-colors">
                                                            <div className="w-20 text-sm font-mono text-text-muted-zinc/70 border-r border-white/5 pr-4 flex flex-col justify-center h-full">
                                                                {meal.time}
                                                            </div>
                                                            <div className="flex-1">
                                                                <h4 className="text-lg font-medium text-text-cream mb-1">{meal.meal}</h4>
                                                                <div className="flex gap-4 text-xs text-text-muted-zinc">
                                                                    <span className="text-blue-400/80">P: {meal.protein}g</span>
                                                                    <span className="text-amber-400/80">C: {meal.carbs}g</span>
                                                                    <span className="text-red-400/80">F: {meal.fats}g</span>
                                                                    <span className="ml-auto opacity-50">{meal.calories} kcal</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </motion.div>
    );
};