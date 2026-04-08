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
    type: 'number' | 'single' | 'multi';
    options?: string[];
    placeholder?: string;
};

const STORAGE_KEY = 'biosentinel_lifestyle_data';

const QUESTIONS: Question[] = [
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

export const ProfileOnboardingWizard: React.FC<ProfileOnboardingWizardProps> = ({ userId, onComplete }) => {
    const [profile, setProfile] = useState<LifestyleData>(() => getInitialProfile());
    const [step, setStep] = useState(0);
    const [customInput, setCustomInput] = useState('');
    const question = QUESTIONS[step];

    const progress = Math.round(((step + 1) / QUESTIONS.length) * 100);
    const bmi = useMemo(() => toBmi(profile.height, profile.weight), [profile.height, profile.weight]);

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
        localStorage.setItem(`biosentinel_onboarding_complete_${userId}`, 'true');
        onComplete();
    };

    const back = () => {
        setStep(prev => Math.max(0, prev - 1));
        setCustomInput('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Health Profile Quest</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step {step + 1} of {QUESTIONS.length}</p>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5" /> {progress}%
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

                <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{question.label}</label>

                    {question.type === 'number' ? (
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
