import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import type { LifestyleData } from '../../types';

interface ProfileOnboardingWizardProps {
    userId: string;
    onComplete: () => void;
}

type Question = {
    key: keyof LifestyleData;
    label: string;
    type: 'text' | 'number' | 'single' | 'multi';
    options?: string[];
    placeholder?: string;
};

const STORAGE_KEY = 'biosentinel_lifestyle_data';
const USER_NAME_KEY = 'biosentinel_user_name';
const USER_AVATAR_KEY = 'biosentinel_user_avatar';

const QUESTIONS: Question[] = [
    { key: 'fullName', label: 'Your Name', type: 'text', placeholder: 'Gaurav' },
    { key: 'age', label: 'Age', type: 'number', placeholder: '21' },
    { key: 'height', label: 'Height (cm)', type: 'number', placeholder: '182' },
    { key: 'weight', label: 'Weight (kg)', type: 'number', placeholder: '90' },
    { key: 'gender', label: 'Gender', type: 'single', options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
    { key: 'bloodGroup', label: 'Blood Group', type: 'single', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    { key: 'cityType', label: 'City Type', type: 'single', options: ['Urban', 'Semi-Urban', 'Rural', 'Coastal', 'Hilly'] },
    { key: 'stressLevel', label: 'Stress Level', type: 'single', options: ['Low', 'Moderate', 'High', 'Very High'] },
    { key: 'sleepHours', label: 'Sleep Hours', type: 'single', options: ['<5 hrs', '5-6 hrs', '6-7 hrs', '7-8 hrs', '8-9 hrs', '9+ hrs'] },
    { key: 'waterIntakeLiters', label: 'Water Intake Liters', type: 'single', options: ['<1 L', '1-1.5 L', '1.5-2 L', '2-2.5 L', '2.5-3 L', '3+ L'] },
    { key: 'vaccinationStatus', label: 'Vaccination Status', type: 'single', options: ['Up to Date', 'Partial', 'Booster Due', 'Unknown', 'Not Vaccinated'] },
    { key: 'occupation', label: 'Occupation', type: 'single', options: ['Student', 'Office Worker', 'Outdoor Worker', 'Healthcare Worker', 'Industrial Worker', 'Field Worker', 'Driver', 'Homemaker', 'Retired'] },
    { key: 'emergencyContact', label: 'Emergency Contact', type: 'single', options: ['Family Nearby', 'Family Remote', 'Caregiver Available', 'Lives Alone', 'Community Support', 'No Backup Contact'] },
    { key: 'lifestyle', label: 'Lifestyle', type: 'multi', options: ['Sedentary', 'Active', 'Athlete', 'Night Shift', 'Outdoor Worker', 'Remote Work', 'Frequent Traveler', 'Student', 'Healthcare Worker', 'High Exposure Worker'] },
    { key: 'exercise', label: 'Exercise', type: 'multi', options: ['None', 'Minimal', 'Moderate', 'Intense', 'Professional', 'Rehabilitation', 'Cardio Focus', 'Strength Focus', 'Yoga / Mobility'] },
    { key: 'smoking', label: 'Smoking', type: 'single', options: ['No', 'Occasional', 'Daily', 'Former Smoker', 'Vaping'] },
    { key: 'alcoholConsumption', label: 'Alcohol Consumption', type: 'multi', options: ['None', 'Social', 'Moderate', 'Heavy', 'Occasional', 'Weekly', 'Rarely'] },
    { key: 'medication', label: 'Medication', type: 'multi', options: ['None', 'Antihistamines', 'Blood Pressure', 'Inhalers', 'Insulin', 'Vitamins', 'Immunosuppressants', 'Painkillers', 'Thyroid', 'Cardiac Medication'] },
    { key: 'chronicConditions', label: 'Chronic Conditions', type: 'multi', options: ['None', 'Asthma', 'Diabetes', 'Hypertension', 'Heart Disease', 'COPD', 'Kidney Disease', 'Thyroid Disorder', 'Autoimmune Condition'] },
    { key: 'foodHabits', label: 'Food Habits', type: 'multi', options: ['Balanced', 'Vegan', 'Keto', 'High Protein', 'Fast Food', 'Gluten-Free', 'Vegetarian', 'Paleo', 'Low Sodium', 'Low Sugar', 'High Fiber'] },
    { key: 'allergies', label: 'Allergies', type: 'multi', options: ['None', 'Pollen', 'Dust', 'Mold', 'Peanuts', 'Shellfish', 'Lactose', 'Pet Dander', 'Insect Stings', 'Latex', 'Drug Allergy'] },
    { key: 'medicalHistory', label: 'Medical History', type: 'multi', options: ['None', 'Asthma', 'Diabetes', 'Hypertension', 'Heart Disease', 'COPD', 'Migraine', 'Arthritis', 'Eczema', 'Anxiety', 'Kidney Disease', 'Thyroid Disorder'] },
    { key: 'familyHistory', label: 'Family History', type: 'multi', options: ['None', 'Diabetes', 'Hypertension', 'Heart Disease', 'Stroke', 'Cancer', 'Respiratory Disease', 'Thyroid Issues'] },
];

function getInitialProfile(): LifestyleData {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved) as LifestyleData;
    } catch {
        // fallthrough
    }

    return {
        age: '',
        height: '',
        weight: '',
        gender: '',
        bloodGroup: '',
        occupation: '',
        cityType: '',
        lifestyle: '',
        medication: '',
        chronicConditions: '',
        vaccinationStatus: '',
        foodHabits: '',
        sleepHours: '',
        waterIntakeLiters: '',
        stressLevel: '',
        allergies: '',
        medicalHistory: '',
        familyHistory: '',
        emergencyContact: '',
        exercise: '',
        smoking: '',
        alcoholConsumption: '',
    };
}

function normalizeCommaList(raw: string): string[] {
    return raw.split(', ').map(x => x.trim()).filter(Boolean);
}

function toBmi(height?: string, weight?: string): number | null {
    const h = Number(height || 0);
    const w = Number(weight || 0);
    if (!h || !w || h < 50 || w < 10) return null;
    return w / Math.pow(h / 100, 2);
}

function hashSeed(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function buildAvatarSvg(seed: string): string {
    const h = hashSeed(seed || 'biosentinel');
    const hueA = h % 360;
    const hueB = (h + 120) % 360;
    const hueC = (h + 240) % 360;
    const initials = (seed || 'U')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() || '')
        .join('') || 'U';

    return `
<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>
    <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%' stop-color='hsl(${hueA} 80% 60%)'/>
            <stop offset='100%' stop-color='hsl(${hueB} 85% 52%)'/>
        </linearGradient>
    </defs>
    <rect width='128' height='128' rx='28' fill='url(#g)'/>
    <circle cx='30' cy='26' r='18' fill='hsl(${hueC} 95% 75% / 0.7)'/>
    <circle cx='106' cy='102' r='24' fill='hsl(${hueA} 95% 80% / 0.45)'/>
    <text x='50%' y='56%' text-anchor='middle' font-family='Verdana, sans-serif' font-size='42' font-weight='700' fill='white'>${initials}</text>
</svg>
`.trim();
}

export const ProfileOnboardingWizard: React.FC<ProfileOnboardingWizardProps> = ({ userId, onComplete }) => {
    const [profile, setProfile] = useState<LifestyleData>(() => getInitialProfile());
    const [step, setStep] = useState(0);
    const [customInput, setCustomInput] = useState('');
    const question = QUESTIONS[step];

    const progress = Math.round(((step + 1) / QUESTIONS.length) * 100);
    const bmi = useMemo(() => toBmi(profile.height, profile.weight), [profile.height, profile.weight]);
    const points = (step + 1) * 120;
    const streak = Math.min(7, step + 1);
    const name = profile.fullName?.trim() || 'Explorer';
    const avatarSvg = useMemo(() => buildAvatarSvg(`${userId}:${name}`), [name, userId]);

    const currentValue = String(profile[question.key] ?? '');
    const currentValues = normalizeCommaList(currentValue);

    const setSingleValue = (value: string) => {
        setProfile(prev => ({ ...prev, [question.key]: value }));
    };

    const toggleMultiValue = (value: string) => {
        const values = normalizeCommaList(String(profile[question.key] || ''));
        const next = values.includes(value) ? values.filter(v => v !== value) : [...values, value];
        setProfile(prev => ({ ...prev, [question.key]: next.join(', ') }));
    };

    const addCustom = () => {
        const value = customInput.trim();
        if (!value) return;
        if (question.type === 'multi') {
            const values = normalizeCommaList(String(profile[question.key] || ''));
            if (!values.includes(value)) {
                setProfile(prev => ({ ...prev, [question.key]: [...values, value].join(', ') }));
            }
        } else {
            setSingleValue(value);
        }
        setCustomInput('');
    };

    const next = () => {
        if (step < QUESTIONS.length - 1) {
            setStep(step + 1);
            setCustomInput('');
            return;
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
        localStorage.setItem(USER_NAME_KEY, name);
        localStorage.setItem(USER_AVATAR_KEY, avatarSvg);
        localStorage.setItem(`biosentinel_onboarding_complete_${userId}`, 'true');
        onComplete();
    };

    const back = () => {
        setStep(prev => Math.max(0, prev - 1));
        setCustomInput('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
            <style>{`
              @keyframes floatY { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
              @keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(20,184,166,0.35);} 70% { box-shadow: 0 0 0 10px rgba(20,184,166,0);} 100% { box-shadow: 0 0 0 0 rgba(20,184,166,0);} }
            `}</style>

            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50" viewBox="0 0 1440 800" fill="none" aria-hidden="true">
                <circle cx="180" cy="130" r="90" fill="#99f6e4" style={{ animation: 'floatY 6s ease-in-out infinite' }} />
                <circle cx="1240" cy="220" r="120" fill="#bfdbfe" style={{ animation: 'floatY 7s ease-in-out infinite' }} />
                <circle cx="1120" cy="640" r="80" fill="#fde68a" style={{ animation: 'floatY 5.5s ease-in-out infinite' }} />
                <path d="M0 640 C 260 520, 520 760, 780 620 C 980 520, 1220 700, 1440 580" stroke="#14b8a6" strokeOpacity="0.2" strokeWidth="12" />
            </svg>

            <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <img
                            src={`data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg)}`}
                            alt="Avatar"
                            className="w-12 h-12 rounded-2xl border border-slate-200 dark:border-slate-700"
                        />
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Health Profile Quest</h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step {step + 1} of {QUESTIONS.length} · {name}</p>
                        </div>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ animation: 'pulseGlow 2s ease-in-out infinite' }}>
                        <Trophy className="w-3.5 h-3.5" /> {progress}%
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl border border-teal-200 bg-teal-50 text-center">
                        <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest">XP</p>
                        <p className="text-sm font-black text-teal-700">{points}</p>
                    </div>
                    <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-center">
                        <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Streak</p>
                        <p className="text-sm font-black text-indigo-700">{streak} 🔥</p>
                    </div>
                    <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-center">
                        <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Level</p>
                        <p className="text-sm font-black text-rose-700">{Math.floor(step / 4) + 1}</p>
                    </div>
                </div>

                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
                </div>

                {(step <= 2 && bmi !== null) ? (
                    <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">BMI Calculator</p>
                        <p className="text-2xl font-black text-amber-800 mt-1">{bmi.toFixed(1)} kg/m²</p>
                    </div>
                ) : null}

                <div key={step} className="space-y-3 animate-fade-in">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{question.label}</label>

                    {question.type === 'text' ? (
                        <input
                            type="text"
                            value={currentValue}
                            onChange={(e) => setSingleValue(e.target.value)}
                            placeholder={question.placeholder}
                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
                        />
                    ) : question.type === 'number' ? (
                        <input
                            type="number"
                            value={currentValue}
                            onChange={(e) => setSingleValue(e.target.value)}
                            placeholder={question.placeholder}
                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
                        />
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {(question.options || []).map(opt => {
                                    const active = question.type === 'single' ? currentValue === opt : currentValues.includes(opt);
                                    return (
                                        <button
                                            type="button"
                                            key={opt}
                                            onClick={() => (question.type === 'single' ? setSingleValue(opt) : toggleMultiValue(opt))}
                                            className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${active
                                                ? 'bg-teal-600 border-teal-500 text-white'
                                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:border-teal-400'
                                                }`}
                                        >
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={customInput}
                                    onChange={(e) => setCustomInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addCustom();
                                        }
                                    }}
                                    placeholder="Not listed? Add custom"
                                    className="flex-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
                                />
                                <button
                                    type="button"
                                    onClick={addCustom}
                                    className="px-3 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200"
                                >
                                    Add
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={back}
                        disabled={step === 0}
                        className="px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" /> Back
                    </button>

                    <button
                        type="button"
                        onClick={next}
                        className="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                    >
                        {step === QUESTIONS.length - 1 ? 'Finish & Enter Home' : 'Next Question'}
                        {step === QUESTIONS.length - 1 ? <Check className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProfileOnboardingWizard;
