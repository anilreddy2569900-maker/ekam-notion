import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Utensils, Activity, ArrowRight, Brain, Check, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { sendMessageToEkam } from '../../lib/ekam_api';
import { db, doc, getDoc, setDoc, onSnapshot } from '../../lib/firebase';

interface FitnessHubProps {
    onClose: () => void;
}

type Step = 'onboarding' | 'consultation' | 'plan';

interface FitnessProfile {
    goal: 'Weight Loss' | 'Muscle Gain' | 'Maintenance' | 'Endurance';
    activityLevel: 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active';
    equipment: 'Gym' | 'Home (Dumbbells)' | 'Bodyweight Only' | 'Cardio Machines';
    dietary: string; // e.g., 'Vegan', 'Keto', 'None'
    limitations: string;
}

interface WorkoutExercise {
    name: string;
    sets: string;
    reps: string;
    rest: string;
    notes: string;
    videoUrl?: string; // Placeholder for now
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
        split: string; // e.g., "Push/Pull/Legs"
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
    const [loading, setLoading] = useState(false);
    
    // Onboarding State
    const [profile, setProfile] = useState<FitnessProfile>({
        goal: 'Muscle Gain',
        activityLevel: 'Moderately Active',
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

    const handleConsultationSend = async () => {
        if (!consultationInput.trim()) return;
        
        const newHistory = [...chatHistory, { role: 'user' as const, text: consultationInput }];
        setChatHistory(newHistory);
        setConsultationInput('');
        setIsConsulting(true);

        try {
            // Specialized Fitness Prompt Context
            const context = `
            You are Ekam's elite fitness coach.
            User Profile: ${JSON.stringify(profile)}
            
            Task: Provide a concise, motivating response. Ask 1 clarifying question if needed to build the perfect plan.
            If you have enough info, ask: "Shall I generate your plan now?"
            `;

            const response = await sendMessageToEkam(
                consultationInput, 
                newHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
                undefined, // no image
                null, // no full profile context needed here, we passed specifically relevant parts
                context, // passing as summary context
                undefined,
                undefined,
                'SIMPLE' // Keep it fast for chat
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
            Based on our consultation and this profile: ${JSON.stringify(profile)}.
            
            Return ONLY valid JSON with this structure:
            {
                "summary": "Brief motivational summary of the plan.",
                "workout": {
                    "split": "e.g. Upper/Lower",
                    "days": [
                        { "day": "Monday", "focus": "Chest/Triceps", "exercises": [ { "name": "Bench Press", "sets": "3", "reps": "8-12", "rest": "90s", "notes": "Keep elbows tucked." } ] }
                    ]
                },
                "diet": {
                    "calories": 2500, "protein": 180, "carbs": 250, "fats": 80,
                    "schedule": [ { "time": "8:00 AM", "meal": "Oats & Whey", "calories": 400, "protein": 30, "carbs": 50, "fats": 10 } ]
                }
            }
            `;

            const response = await sendMessageToEkam(prompt, [], undefined, null, undefined, undefined, undefined, 'CRITICAL');
            
            // Parse JSON from response (handling potential markdown code blocks)
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const planData = JSON.parse(jsonMatch[0]);
                
                // Save to Firestore
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
            alert("Failed to generate plan. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 bg-surface-charcoal/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden"
        >
            <button onClick={onClose} className="absolute top-6 right-6 text-text-muted-zinc hover:text-text-cream transition-colors">
                <X size={24} />
            </button>

            <div className="w-full max-w-5xl h-full flex flex-col bg-warm-charcoal rounded-2xl border border-text-cream/5 shadow-2xl overflow-hidden relative">
                
                {/* Header */}
                <div className="p-6 border-b border-text-cream/5 bg-surface-charcoal flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-serif text-text-cream">Ekam Fitness</h2>
                            <p className="text-sm text-text-muted-zinc">Personalized Bio-Architecture</p>
                        </div>
                    </div>
                    
                    {step === 'plan' && (
                        <div className="flex gap-2">
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
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 relative">
                    
                    {/* STEP 1: ONBOARDING */}
                    {step === 'onboarding' && (
                        <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center space-y-2">
                                <h3 className="text-3xl font-light text-text-cream">Define Your Goal</h3>
                                <p className="text-text-muted-zinc">Tell us what you want to achieve, and we'll build the path.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {['Weight Loss', 'Muscle Gain', 'Maintenance', 'Endurance'].map((g) => (
                                    <button
                                        key={g}
                                        onClick={() => setProfile({...profile, goal: g as any})}
                                        className={`p-4 rounded-xl border text-left transition-all ${profile.goal === g ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-surface-charcoal border-text-cream/5 text-text-muted-zinc hover:border-text-cream/20'}`}
                                    >
                                        <span className="block text-lg font-medium mb-1">{g}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-4">
                                <label className="block text-sm font-medium text-text-muted-zinc">Activity Level</label>
                                <select 
                                    value={profile.activityLevel}
                                    onChange={(e) => setProfile({...profile, activityLevel: e.target.value as any})}
                                    className="w-full bg-surface-charcoal border border-text-cream/10 rounded-xl p-3 text-text-cream focus:ring-1 focus:ring-amber-500/50 outline-none"
                                >
                                    <option>Sedentary</option>
                                    <option>Lightly Active</option>
                                    <option>Moderately Active</option>
                                    <option>Very Active</option>
                                </select>
                            </div>
                            
                            <div className="space-y-4">
                                <label className="block text-sm font-medium text-text-muted-zinc">Available Equipment</label>
                                <select 
                                    value={profile.equipment}
                                    onChange={(e) => setProfile({...profile, equipment: e.target.value as any})}
                                    className="w-full bg-surface-charcoal border border-text-cream/10 rounded-xl p-3 text-text-cream focus:ring-1 focus:ring-amber-500/50 outline-none"
                                >
                                    <option>Gym</option>
                                    <option>Home (Dumbbells)</option>
                                    <option>Bodyweight Only</option>
                                    <option>Cardio Machines</option>
                                </select>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <button 
                                    onClick={() => setStep('consultation')}
                                    className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-amber-900/20"
                                >
                                    Start Consultation <ArrowRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: CONSULTATION */}
                    {step === 'consultation' && (
                        <div className="h-full flex flex-col max-w-3xl mx-auto">
                            <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 scrollbar-thin scrollbar-thumb-white/10">
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0">
                                        <Brain size={16} />
                                    </div>
                                    <div className="bg-surface-charcoal p-4 rounded-2xl rounded-tl-none border border-text-cream/5 text-text-cream/90 max-w-[80%]">
                                        <p>I see you're aiming for <strong>{profile.goal}</strong> with a <strong>{profile.activityLevel}</strong> lifestyle using <strong>{profile.equipment}</strong>.</p>
                                        <p className="mt-2">Before I build your plan, do you have any specific injuries, dietary restrictions (like Vegan or Keto), or preferred workout days?</p>
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

                    {/* STEP 3: PLAN DISPLAY */}
                    {step === 'plan' && plan && (
                        <div className="animate-in fade-in duration-700">
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
                                                            {/* Placeholder Animation */}
                                                            <div className="w-full md:w-32 h-20 bg-black/40 rounded-lg flex items-center justify-center text-text-muted-zinc/30 relative overflow-hidden">
                                                                <Dumbbell size={20} className="opacity-50" />
                                                                {/* In future, map ex.name to a local GIF or Video URL */}
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
                                    {/* Macro Header */}
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
            </div>
        </motion.div>
    );
};
