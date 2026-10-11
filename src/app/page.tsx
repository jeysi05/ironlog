'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Camera, 
  Send, 
  Loader2, 
  Check, 
  Scale, 
  Trash2, 
  Trophy, 
  Sparkles, 
  TrendingDown, 
  Sliders 
} from 'lucide-react';

/* ---------- types ---------- */

interface FoodItem {
  id?: string;
  food_name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at?: string;
}

interface ExerciseItem {
  id?: string;
  exercise_name: string;
  sets?: number;
  reps?: number;
  weight_kg?: number;
  cardio_minutes?: number;
  calories_burned?: number;
  created_at?: string;
}

interface HistoricalRecord {
  weight: number;
  reps: number;
}

interface UserProfile {
  id: string;
  gender: 'male' | 'female';
  age: number;
  height_cm: number;
  start_weight_kg: number;
  weight_kg: number;
  goal_weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'very_active';
  goal: 'aggressive_cut' | 'cut' | 'maintain' | 'lean_bulk';
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
}

/* ---------- metabolic engine ---------- */

function computeTargets(
  gender: 'male' | 'female',
  age: number,
  height_cm: number,
  weight_kg: number,
  activity_level: UserProfile['activity_level'],
  goal: UserProfile['goal']
) {
  const bmr =
    gender === 'male'
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;

  const multipliers: Record<UserProfile['activity_level'], number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.5,
    very_active: 1.7,
  };

  const tdee = bmr * (multipliers[activity_level] || 1.375);

  const goalDeltas: Record<UserProfile['goal'], number> = {
    aggressive_cut: -650,
    cut: -450,
    maintain: 0,
    lean_bulk: 250,
  };

  const calories = Math.max(1200, Math.round(tdee + goalDeltas[goal]));
  const protein = Math.round(weight_kg * 2.0);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(50, Math.round((calories - (protein * 4 + fat * 9)) / 4));

  return { calories, protein, carbs, fat, tdee: Math.round(tdee) };
}

/* ---------- helpers ---------- */

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const haptic = (ms = 10) => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
};

function useTween(value: number, ms = 650) {
  const [v, setV] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + (value - from) * eased;
      fromRef.current = cur;
      setV(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return v;
}

/* ---------- micro components ---------- */

function NumField({
  value,
  onChange,
  suffix,
  width = 'w-16',
  decimal = false,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  width?: string;
  decimal?: boolean;
}) {
  const [text, setText] = useState(String(value ?? 0));

  useEffect(() => {
    if (Number(text) !== value) setText(String(value ?? 0));
  }, [value]);

  return (
    <label className="flex items-baseline gap-1">
      <input
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = Number(raw);
          if (raw !== '' && !Number.isNaN(n)) onChange(n);
        }}
        className={`${width} bg-white/5 rounded-xl px-2.5 py-2 text-right font-mono text-base text-white focus:outline-none focus:ring-1 focus:ring-[#CCFF00] border border-white/5`}
      />
      {suffix && <span className="font-mono text-xs text-zinc-400">{suffix}</span>}
    </label>
  );
}

function SwipeRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const REVEAL = 84;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const base = useRef(0);
  const lock = useRef<'x' | 'y' | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    startX.current = e.clientX;
    startY.current = e.clientY;
    base.current = dx;
    lock.current = null;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lock.current && (Math.abs(e.clientX - startX.current) > 8 || Math.abs(e.clientY - startY.current) > 8)) {
      lock.current = Math.abs(e.clientX - startX.current) > Math.abs(e.clientY - startY.current) ? 'x' : 'y';
      if (lock.current === 'x') setDragging(true);
    }
    if (lock.current === 'x') {
      const ddx = e.clientX - startX.current;
      setDx(Math.max(-REVEAL * 1.3, Math.min(0, base.current + ddx)));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setDragging(false);
    if (lock.current === 'x') {
      const open = dx < -REVEAL / 2;
      setDx(open ? -REVEAL : 0);
      if (open) haptic(15);
    }
    lock.current = null;
  };

  return (
    <div className="relative overflow-hidden select-none">
      <button
        onClick={onDelete}
        aria-label="Delete entry"
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 text-white font-mono text-xs font-bold"
        style={{ width: REVEAL }}
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <div
        className="relative bg-[#0A0A0A]"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1)',
          touchAction: 'pan-y',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}

function Gauge({
  eaten,
  protein,
  targetCalories,
  targetProtein,
}: {
  eaten: number;
  protein: number;
  targetCalories: number;
  targetProtein: number;
}) {
  const R = 82;
  const R2 = 68;
  const C = 2 * Math.PI * R;
  const C2 = 2 * Math.PI * R2;
  const ARC = 0.75;

  const remaining = targetCalories - eaten;
  const over = remaining < 0;
  const frac = over ? 0 : Math.max(0, Math.min(remaining / targetCalories, 1));
  const pFrac = Math.min(protein / (targetProtein || 1), 1);
  const shown = useTween(Math.abs(remaining));
  const ease = 'stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)';

  return (
    <div className="relative mx-auto w-full max-w-[280px] aspect-square">
      <svg viewBox="0 0 200 200" className="w-full h-full">
        <g transform="rotate(135 100 100)">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${ARC * C} ${C}`} />
          <circle
            cx="100" cy="100" r={R} fill="none"
            stroke={over ? '#F87171' : '#CCFF00'} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${ARC * C * frac} ${C}`}
            style={{ transition: ease, opacity: frac === 0 ? 0 : 1 }}
          />
          <circle cx="100" cy="100" r={R2} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${ARC * C2} ${C2}`} />
          <circle
            cx="100" cy="100" r={R2} fill="none"
            stroke="#60A5FA" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${ARC * C2 * pFrac} ${C2}`}
            style={{ transition: ease, opacity: pFrac === 0 ? 0 : 1 }}
          />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pb-2">
        <span className="font-mono text-xs tracking-[0.2em] text-zinc-400 uppercase">{over ? 'OVER' : 'REMAINING'}</span>
        <span className={`font-black text-6xl tracking-tighter tabular-nums leading-none mt-1 ${over ? 'text-red-400' : 'text-white'}`}>
          {Math.round(shown)}
        </span>
        <span className="font-mono text-xs text-zinc-400 mt-2">OF {targetCalories} KCAL</span>
      </div>

      <div className="absolute bottom-2 inset-x-0 flex justify-center">
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-blue-300 font-bold tabular-nums">{Math.round(protein)}</span>
          <span className="text-zinc-400">/{targetProtein}G PRO</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- main application ---------- */

export default function IronLogApp() {
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  // User Profile & Biometrics
  const [profile, setProfile] = useState<UserProfile>({
    id: 'default_user',
    gender: 'male',
    age: 22,
    height_cm: 173,
    start_weight_kg: 95.0,
    weight_kg: 95.0,
    goal_weight_kg: 78.0,
    activity_level: 'light',
    goal: 'aggressive_cut',
    target_calories: 2050,
    target_protein: 175,
    target_carbs: 210,
    target_fat: 55,
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [tempProfile, setTempProfile] = useState<UserProfile>(profile);

  // Staged AI extractions
  const [draftFoods, setDraftFoods] = useState<FoodItem[]>([]);
  const [draftExercises, setDraftExercises] = useState<ExerciseItem[]>([]);
  const [draftWeight, setDraftWeight] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Committed logs
  const [dayFoods, setDayFoods] = useState<FoodItem[]>([]);
  const [dayExercises, setDayExercises] = useState<ExerciseItem[]>([]);
  const [currentWeight, setCurrentWeight] = useState<number>(95.0);
  const [priorBest, setPriorBest] = useState<Record<string, HistoricalRecord>>({});

  const [activeTab, setActiveTab] = useState<'meals' | 'workouts'>('meals');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Bottom Sheet Gestures
  const [sheetDy, setSheetDy] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetStartY = useRef(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Client-only mount: eliminate Next.js 16 prerender clock mismatch
  useEffect(() => {
    const now = new Date();
    setToday(now);
    setSelectedDate(now);
    setMounted(true);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const latest = new Date();
        setToday(latest);
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const fetchProfile = async () => {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', 'default_user').maybeSingle();
    if (data) {
      setProfile(data);
      setTempProfile(data);
    }
  };

  const fetchDataForDate = async (date: Date) => {
    const id = ++reqId.current;
    const start = startOfDay(date);
    const end = endOfDay(date);

    const [foodsRes, workoutsRes, weightRes, historyRes] = await Promise.all([
      supabase.from('food_logs').select('*').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).order('created_at', { ascending: false }),
      supabase.from('workout_logs').select('*').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).order('created_at', { ascending: false }),
      supabase.from('weight_logs').select('*').order('created_at', { ascending: false }).limit(1),
      supabase.from('workout_logs').select('exercise_name, weight_kg, reps').lt('created_at', start.toISOString()).not('weight_kg', 'is', null).order('created_at', { ascending: false }).limit(500),
    ]);

    if (id !== reqId.current) return;

    setDayFoods(foodsRes.data ?? []);
    setDayExercises(workoutsRes.data ?? []);
    
    if (weightRes.data && weightRes.data.length > 0) {
      setCurrentWeight(Number(weightRes.data[0].weight_kg));
    } else {
      setCurrentWeight(profile.start_weight_kg || 95.0);
    }

    const best: Record<string, HistoricalRecord> = {};
    (historyRes.data ?? []).forEach((w: { exercise_name: string; weight_kg: number | null; reps: number | null }) => {
      const name = w.exercise_name.toLowerCase().trim();
      const kg = Number(w.weight_kg);
      const reps = Number(w.reps || 0);
      if (kg && (!best[name] || kg > best[name].weight || (kg === best[name].weight && reps > best[name].reps))) {
        best[name] = { weight: kg, reps };
      }
    });
    setPriorBest(best);
  };

  useEffect(() => {
    if (mounted && selectedDate) {
      fetchProfile();
      fetchDataForDate(selectedDate);
    }
  }, [selectedDate, mounted]);

  const eaten = dayFoods.reduce((a, c) => a + (c.calories || 0), 0);
  const protein = dayFoods.reduce((a, c) => a + Number(c.protein_g || 0), 0);
  const carbs = dayFoods.reduce((a, c) => a + Number(c.carbs_g || 0), 0);
  const fat = dayFoods.reduce((a, c) => a + Number(c.fat_g || 0), 0);
  const burned = dayExercises.reduce((a, c) => a + (c.calories_burned || 0), 0);

  const isToday = selectedDate && today ? sameDay(today, selectedDate) : true;
  const hasDrafts = draftFoods.length > 0 || draftExercises.length > 0 || draftWeight !== null;

  const draftKcal = draftFoods.reduce((a, c) => a + (c.calories || 0), 0);
  const draftProtein = draftFoods.reduce((a, c) => a + (c.protein_g || 0), 0);
  const draftBurn = draftExercises.reduce((a, c) => a + (c.calories_burned || 0), 0);

  const goToDay = (d: Date) => {
    if (today && startOfDay(d) > startOfDay(today)) return;
    haptic();
    setSelectedDate(d);
  };

  const shiftDay = (n: number) => {
    if (!selectedDate) return;
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + n);
    goToDay(next);
  };

  const weekDays = (() => {
    if (!mounted || !selectedDate) return [];
    const base = selectedDate;
    const mondayOffset = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  })();

  const handleParse = async (overrideBase64?: string, mimeType?: string) => {
    if (!input.trim() && !overrideBase64) return;
    setParsing(true);
    haptic();
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          imageBase64: overrideBase64,
          mimeType,
          profile: {
            ...profile,
            weight_kg: currentWeight,
          },
        }),
      });
      if (!res.ok) throw new Error(`Parse failed: ${res.status}`);
      const data = await res.json();
      if (data.foods) {
        setDraftFoods(
          data.foods.map((f: any) => ({
            food_name: f.name,
            quantity: f.quantity,
            calories: f.calories,
            protein_g: f.protein_g || 0,
            carbs_g: f.carbs_g || 0,
            fat_g: f.fat_g || 0,
          }))
        );
      }
      if (data.exercises) setDraftExercises(data.exercises);
      if (data.weight_kg) setDraftWeight(data.weight_kg);
      
      setSheetDy(0);
      setSheetOpen(true);
    } catch (err) {
      console.error(err);
      alert('Extraction failed. Check internet connection or quota.');
    } finally {
      setParsing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = (reader.result as string).split(',')[1];
      handleParse(b64, file.type);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCommit = async () => {
    setSaving(true);
    haptic(20);
    const when = selectedDate || new Date();
    let ts: string;
    if (isToday) {
      ts = new Date().toISOString();
    } else {
      const noon = new Date(when);
      noon.setHours(12, 0, 0, 0);
      ts = noon.toISOString();
    }

    try {
      if (draftFoods.length > 0) {
        const { error } = await supabase.from('food_logs').insert(
          draftFoods.map((f) => ({
            food_name: f.food_name,
            quantity: f.quantity,
            calories: f.calories,
            protein_g: f.protein_g,
            carbs_g: f.carbs_g,
            fat_g: f.fat_g,
            created_at: ts,
          }))
        );
        if (error) throw error;
      }

      if (draftExercises.length > 0) {
        const { error } = await supabase.from('workout_logs').insert(
          draftExercises.map((e) => ({
            exercise_name: e.exercise_name,
            sets: e.sets || 0,
            reps: e.reps || 0,
            weight_kg: e.weight_kg || null,
            cardio_minutes: e.cardio_minutes || 0,
            calories_burned: e.calories_burned || 0,
            created_at: ts,
          }))
        );
        if (error) throw error;
      }

      if (draftWeight) {
        const { error: wErr } = await supabase.from('weight_logs').insert({ weight_kg: draftWeight, created_at: ts });
        if (wErr) throw wErr;
        setCurrentWeight(draftWeight);
      }

      setInput('');
      setDraftFoods([]);
      setDraftExercises([]);
      setDraftWeight(null);
      setSheetOpen(false);
      if (selectedDate) await fetchDataForDate(selectedDate);
    } catch (err: any) {
      alert('Save failed: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const discardDrafts = () => {
    haptic();
    setDraftFoods([]);
    setDraftExercises([]);
    setDraftWeight(null);
    setSheetOpen(false);
    setSheetDy(0);
  };

  const patchFood = (i: number, p: Partial<FoodItem>) =>
    setDraftFoods((d) => d.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const patchExercise = (i: number, p: Partial<ExerciseItem>) =>
    setDraftExercises((d) => d.map((e, j) => (j === i ? { ...e, ...p } : e)));

  const deleteFood = async (id?: string) => {
    if (!id) return;
    haptic(15);
    setDayFoods((d) => d.filter((x) => x.id !== id));
    await supabase.from('food_logs').delete().eq('id', id);
  };

  const deleteExercise = async (id?: string) => {
    if (!id) return;
    haptic(15);
    setDayExercises((d) => d.filter((x) => x.id !== id));
    await supabase.from('workout_logs').delete().eq('id', id);
  };

  const weightDelta = Number(((profile.start_weight_kg ?? 95.0) - currentWeight).toFixed(1));
  const toGoal = Number((currentWeight - (profile.goal_weight_kg ?? 78.0)).toFixed(1));

  const livePreview = computeTargets(
    tempProfile.gender,
    tempProfile.age,
    tempProfile.height_cm,
    currentWeight,
    tempProfile.activity_level,
    tempProfile.goal
  );

  if (!mounted || !selectedDate || !today) {
    return <div className="min-h-screen bg-[#0A0A0A]" />;
  }

  return (
    <div className="bg-[#0A0A0A] text-zinc-300 font-sans selection:bg-[#CCFF00] selection:text-black">
      <style>{`
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div className="relative mx-auto max-w-md h-[100dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="shrink-0 px-5 pb-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <div>
            <span className="font-mono text-xs tracking-[0.2em] text-zinc-400 uppercase block">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
            </span>
            <span className="font-black text-2xl tracking-tighter text-white">
              {isToday
                ? 'TODAY'
                : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full pl-3 pr-3.5 py-1.5 shadow-inner">
              <Scale className="w-3.5 h-3.5 text-[#CCFF00]" />
              <span className="font-black text-base text-white tabular-nums">{currentWeight.toFixed(1)}</span>
              <span className="font-mono text-xs text-zinc-400">KG</span>
              <span className="font-mono text-xs text-[#CCFF00] flex items-center gap-0.5 ml-1">
                <TrendingDown className="w-3 h-3" />
                {weightDelta >= 0 ? `-${weightDelta}` : `+${Math.abs(weightDelta)}`}
              </span>
            </div>
            <button
              onClick={() => { 
                setTempProfile(profile);
                setShowSettings(true); 
                haptic(); 
              }}
              aria-label="Profile Settings"
              className="p-2.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-white transition active:scale-90"
            >
              <Sliders className="w-4 h-4 text-[#CCFF00]" />
            </button>
          </div>
        </header>

        {/* Week Strip */}
        <nav className="shrink-0 px-3 pb-3 grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const selected = sameDay(d, selectedDate);
            const isActualToday = sameDay(d, today);
            const future = startOfDay(d) > startOfDay(today);
            return (
              <button
                key={i}
                disabled={future}
                onClick={() => goToDay(d)}
                className={`flex flex-col items-center py-2 rounded-2xl transition active:scale-95 ${
                  selected ? 'bg-[#CCFF00] text-black shadow-lg shadow-[#CCFF00]/10 font-bold' : 'text-zinc-400 hover:text-white'
                } ${future ? 'opacity-20 cursor-not-allowed' : ''}`}
              >
                <span className="font-mono text-xs">{'MTWTFSS'[i]}</span>
                <span className="font-black text-sm tabular-nums mt-0.5">{d.getDate()}</span>
                <span className={`w-1 h-1 rounded-full mt-1 ${isActualToday ? (selected ? 'bg-black' : 'bg-[#CCFF00]') : 'bg-transparent'}`} />
              </button>
            );
          })}
        </nav>

        {/* Scroll Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-56">
          <section
            className="px-5 pt-1"
            onTouchStart={(e) => {
              swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              const s = swipeStart.current;
              swipeStart.current = null;
              if (!s) return;
              const dx = e.changedTouches[0].clientX - s.x;
              const dy = e.changedTouches[0].clientY - s.y;
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftDay(dx < 0 ? 1 : -1);
            }}
          >
            <Gauge
              eaten={eaten}
              protein={protein}
              targetCalories={profile.target_calories}
              targetProtein={profile.target_protein}
            />

            <div className="grid grid-cols-3 gap-2 mt-2 text-center border-t border-white/[0.04] pt-3">
              <div>
                <span className="font-mono text-xs tracking-[0.15em] text-zinc-400 block">INTAKE</span>
                <span className="font-black text-lg text-white tabular-nums">{eaten}</span>
              </div>
              <div>
                <span className="font-mono text-xs tracking-[0.15em] text-zinc-400 block">BURNED</span>
                <span className="font-black text-lg text-sky-400 tabular-nums">-{burned}</span>
              </div>
              <div>
                <span className="font-mono text-xs tracking-[0.15em] text-zinc-400 block">TO GOAL</span>
                <span className="font-black text-lg text-white tabular-nums">
                  {toGoal}
                  <span className="font-mono text-xs text-zinc-400 ml-0.5">KG</span>
                </span>
              </div>
            </div>
          </section>

          {/* Precision Macro Ratios */}
          <section className="px-5 mt-5 grid grid-cols-3 gap-3">
            {[
              { label: 'PROTEIN', val: protein, target: profile.target_protein, color: 'bg-blue-400' },
              { label: 'CARBS', val: carbs, target: profile.target_carbs, color: 'bg-emerald-400' },
              { label: 'FAT', val: fat, target: profile.target_fat, color: 'bg-amber-400' },
            ].map((m) => (
              <div key={m.label} className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-3">
                <span className="font-mono text-xs tracking-[0.1em] text-zinc-400 block">{m.label}</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-black text-lg text-white tabular-nums">{Math.round(m.val)}</span>
                  <span className="font-mono text-xs text-zinc-400">/{m.target}g</span>
                </div>
                <div className="h-1 mt-2 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${m.color} transition-all duration-700`} style={{ width: `${Math.min((m.val / (m.target || 1)) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </section>

          {/* Feed List */}
          <section className="mt-6">
            <h2 className="px-5 font-mono text-xs tracking-[0.2em] text-zinc-400 uppercase mb-2">
              {activeTab === 'meals' ? 'Nutrition logs' : 'Training logs'}
              <span className="text-zinc-500"> · swipe left to delete</span>
            </h2>

            {activeTab === 'meals' ? (
              dayFoods.length === 0 ? (
                <p className="mx-5 py-12 text-center border border-dashed border-white/5 rounded-2xl font-mono text-xs text-zinc-500 uppercase tracking-widest">
                  Nothing logged today
                </p>
              ) : (
                dayFoods.map((f) => {
                  const lean = (Number(f.protein_g || 0) * 4) / (f.calories || 1) >= 0.35;
                  return (
                    <SwipeRow key={f.id} onDelete={() => deleteFood(f.id)}>
                      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.04]">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white truncate">{f.food_name}</p>
                            {lean && (
                              <span className="shrink-0 font-mono text-xs bg-[#CCFF00]/10 border border-[#CCFF00]/20 text-[#CCFF00] px-1.5 py-0.5 rounded">LEAN</span>
                            )}
                          </div>
                          <p className="font-mono text-xs text-zinc-400 mt-0.5 truncate">{f.quantity || '1 serving'}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-black text-sm text-white tabular-nums">
                            {f.calories}
                            <span className="font-mono text-xs text-zinc-400 ml-1">KCAL</span>
                          </p>
                          <p className="font-mono text-xs mt-0.5">
                            <span className="text-blue-400 font-bold">{f.protein_g}P</span>{' '}
                            <span className="text-emerald-400">{f.carbs_g}C</span>{' '}
                            <span className="text-amber-400">{f.fat_g}F</span>
                          </p>
                        </div>
                      </div>
                    </SwipeRow>
                  );
                })
              )
            ) : dayExercises.length === 0 ? (
              <p className="mx-5 py-12 text-center border border-dashed border-white/5 rounded-2xl font-mono text-xs text-zinc-500 uppercase tracking-widest">
                No training sessions
              </p>
            ) : (
              dayExercises.map((e) => {
                const prior = priorBest[e.exercise_name.toLowerCase().trim()];
                const isPR = !!e.weight_kg && prior !== undefined && (e.weight_kg > prior.weight || (e.weight_kg === prior.weight && (e.reps || 0) > prior.reps));

                return (
                  <SwipeRow key={e.id} onDelete={() => deleteExercise(e.id)}>
                    <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.04]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">{e.exercise_name}</p>
                          {isPR && (
                            <span className="shrink-0 font-mono text-xs bg-amber-400/15 border border-amber-400/30 text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                              <Trophy className="w-2.5 h-2.5" /> PR
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-xs text-zinc-400 mt-0.5">
                          {e.cardio_minutes ? `${e.cardio_minutes} min cardio` : `${e.sets}×${e.reps} @ ${e.weight_kg || 0}kg`}
                          {!isPR && prior !== undefined && !e.cardio_minutes ? ` · best ${prior.weight}kg × ${prior.reps}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 font-black text-sm text-sky-400 tabular-nums">
                        -{e.calories_burned || 0}
                        <span className="font-mono text-xs text-zinc-400 ml-1">KCAL</span>
                      </p>
                    </div>
                  </SwipeRow>
                );
              })
            )}
          </section>
        </div>

        {/* Floating Command Dock */}
        <div
          className="absolute inset-x-0 bottom-0 z-30 px-3 pt-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          {hasDrafts && !sheetOpen && (
            <div className="flex justify-center mb-2">
              <button
                onClick={() => { setSheetOpen(true); haptic(); }}
                className="flex items-center gap-1.5 bg-[#CCFF00] text-black font-mono text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-[#CCFF00]/20 animate-pulse active:scale-95 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {draftFoods.length + draftExercises.length + (draftWeight ? 1 : 0)} PENDING REVIEW (TAP TO OPEN)
              </button>
            </div>
          )}

          <div className="flex justify-center gap-2 mb-2.5">
            {(['meals', 'workouts'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setActiveTab(t);
                  haptic();
                }}
                className={`font-mono text-xs font-bold px-4 py-1.5 rounded-full transition active:scale-95 ${
                  activeTab === t ? 'bg-white text-black shadow-md' : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                {t === 'meals' ? `NUTRITION (${dayFoods.length})` : `TRAINING (${dayExercises.length})`}
              </button>
            ))}
          </div>

          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

          <div className="bg-[#141414] border border-white/10 rounded-full p-1.5 flex items-center gap-1.5 shadow-2xl shadow-black/80 focus-within:border-[#CCFF00]/50 transition">
            <button
              onClick={() => {
                haptic();
                fileInputRef.current?.click();
              }}
              disabled={parsing}
              aria-label="Scan food photo"
              className="p-3 text-zinc-300 bg-white/5 rounded-full transition active:scale-90 hover:bg-white/10"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleParse()}
              placeholder="Log meals, sets, or weigh-in..."
              enterKeyHint="send"
              className="flex-1 min-w-0 bg-transparent px-2 py-2 text-base text-white placeholder-zinc-500 focus:outline-none"
            />
            <button
              onClick={() => handleParse()}
              disabled={parsing || !input.trim()}
              aria-label="Parse log"
              className="bg-[#CCFF00] text-black disabled:bg-white/5 disabled:text-zinc-600 rounded-full p-3 transition active:scale-90"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 stroke-[2.5]" />}
            </button>
          </div>
        </div>

        {/* Review & Edit Bottom Sheet */}
        {hasDrafts && sheetOpen && (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm"
              style={{ animation: 'fadeIn 200ms ease-out', opacity: Math.max(0, 1 - sheetDy / 400) }}
              onClick={() => setSheetOpen(false)}
            />
            <div
              className="absolute inset-x-0 bottom-0 z-50 bg-[#121212] border-t border-white/10 rounded-t-[28px] flex flex-col max-h-[88dvh] shadow-2xl"
              style={{
                transform: `translateY(${sheetDy}px)`,
                transition: sheetDragging ? 'none' : 'transform 240ms cubic-bezier(.2,.8,.2,1)',
                animation: 'sheetUp 300ms cubic-bezier(.2,.8,.2,1)',
              }}
            >
              <div
                className="shrink-0 px-5 pt-3 pb-3 touch-none"
                onTouchStart={(e) => {
                  sheetStartY.current = e.touches[0].clientY;
                  setSheetDragging(true);
                }}
                onTouchMove={(e) => setSheetDy(Math.max(0, e.touches[0].clientY - sheetStartY.current))}
                onTouchEnd={() => {
                  setSheetDragging(false);
                  if (sheetDy > 120) setSheetOpen(false);
                  setSheetDy(0);
                }}
              >
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
                <div className="flex items-end justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#CCFF00]" />
                    <span className="font-black text-xl tracking-tighter text-white">REVIEW & EDIT</span>
                  </div>
                  <div className="font-mono text-xs text-right text-zinc-400">
                    {draftFoods.length > 0 && (
                      <span>
                        <span className="text-[#CCFF00] font-bold">{draftKcal}</span> KCAL ·{' '}
                        <span className="text-blue-400 font-bold">{Math.round(draftProtein)}</span>P
                      </span>
                    )}
                    {draftExercises.length > 0 && (
                      <span className="ml-2 text-sky-400 font-bold">-{draftBurn} KCAL</span>
                    )}
                  </div>
                </div>
                <p className="font-mono text-xs text-zinc-400 mt-1">Tap numbers directly to adjust portion estimates before logging.</p>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 space-y-3 pb-6">
                {draftWeight !== null && (
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/[0.04]">
                    <span className="font-mono text-xs text-zinc-300 flex items-center gap-2">
                      <Scale className="w-4 h-4 text-[#CCFF00]" /> MORNING WEIGH-IN
                    </span>
                    <NumField value={draftWeight} onChange={(n) => setDraftWeight(n)} suffix="KG" decimal width="w-20" />
                  </div>
                )}

                {draftFoods.map((f, i) => (
                  <div key={`f${i}`} className="rounded-2xl bg-white/[0.03] p-4 border border-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{f.food_name}</p>
                        <p className="font-mono text-xs text-zinc-400 mt-0.5">{f.quantity || '1 portion'}</p>
                      </div>
                      <button
                        onClick={() => setDraftFoods((d) => d.filter((_, j) => j !== i))}
                        aria-label="Remove"
                        className="p-1 text-zinc-400 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div>
                        <span className="font-mono text-xs text-[#CCFF00] block mb-1">KCAL</span>
                        <NumField value={f.calories} onChange={(n) => patchFood(i, { calories: n })} width="w-full" />
                      </div>
                      <div>
                        <span className="font-mono text-xs text-blue-400 block mb-1">PRO</span>
                        <NumField value={f.protein_g} onChange={(n) => patchFood(i, { protein_g: n })} width="w-full" decimal />
                      </div>
                      <div>
                        <span className="font-mono text-xs text-emerald-400 block mb-1">CARB</span>
                        <NumField value={f.carbs_g} onChange={(n) => patchFood(i, { carbs_g: n })} width="w-full" decimal />
                      </div>
                      <div>
                        <span className="font-mono text-xs text-amber-400 block mb-1">FAT</span>
                        <NumField value={f.fat_g} onChange={(n) => patchFood(i, { fat_g: n })} width="w-full" decimal />
                      </div>
                    </div>
                  </div>
                ))}

                {draftExercises.map((e, i) => (
                  <div key={`e${i}`} className="rounded-2xl bg-white/[0.03] p-4 border border-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{e.exercise_name}</p>
                      <button
                        onClick={() => setDraftExercises((d) => d.filter((_, j) => j !== i))}
                        aria-label="Remove"
                        className="p-1 text-zinc-400 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {e.cardio_minutes ? (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">MINUTES</span>
                          <NumField value={e.cardio_minutes} onChange={(n) => patchExercise(i, { cardio_minutes: n })} width="w-full" />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-sky-400 block mb-1">BURN (KCAL)</span>
                          <NumField value={e.calories_burned || 0} onChange={(n) => patchExercise(i, { calories_burned: n })} width="w-full" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">SETS</span>
                          <NumField value={e.sets || 0} onChange={(n) => patchExercise(i, { sets: n })} width="w-full" />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">REPS</span>
                          <NumField value={e.reps || 0} onChange={(n) => patchExercise(i, { reps: n })} width="w-full" />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">KG</span>
                          <NumField value={e.weight_kg || 0} onChange={(n) => patchExercise(i, { weight_kg: n })} width="w-full" decimal />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-sky-400 block mb-1">BURN</span>
                          <NumField value={e.calories_burned || 0} onChange={(n) => patchExercise(i, { calories_burned: n })} width="w-full" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div
                className="shrink-0 px-5 pt-3 flex gap-3 border-t border-white/[0.06] bg-[#121212]"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
              >
                <button
                  onClick={discardDrafts}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-full font-mono font-bold text-xs bg-white/5 text-zinc-400 hover:text-white transition active:scale-[0.98]"
                >
                  DISCARD
                </button>
                <button
                  onClick={handleCommit}
                  disabled={saving}
                  className="flex-[2] py-3.5 rounded-full font-mono font-bold text-xs bg-[#CCFF00] text-black flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-[#CCFF00]/10"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  COMMIT LOG
                </button>
              </div>
            </div>
          </>
        )}

        {/* Biometric Protocol & Target Settings Sheet */}
        {showSettings && (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowSettings(false)}
            />
            <div className="absolute inset-x-0 bottom-0 z-50 bg-[#121212] border-t border-white/10 rounded-t-[28px] max-h-[90dvh] flex flex-col p-6 overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#CCFF00]" />
                  <h3 className="font-mono text-sm font-bold tracking-wider text-white uppercase">Biometric Protocol</h3>
                </div>
                <button
                  onClick={async () => {
                    const updated = {
                      ...tempProfile,
                      target_calories: livePreview.calories,
                      target_protein: livePreview.protein,
                      target_carbs: livePreview.carbs,
                      target_fat: livePreview.fat,
                    };
                    setProfile(updated);
                    const { error } = await supabase.from('user_profiles').upsert(updated);
                    if (error) alert('Profile update failed: ' + error.message);
                    setShowSettings(false);
                    haptic(15);
                  }}
                  className="bg-[#CCFF00] text-black font-mono font-bold text-xs px-4 py-2 rounded-full active:scale-95 transition"
                >
                  SAVE & RECALCULATE
                </button>
              </div>

              {/* Real-time TDEE and Target Preview */}
              <div className="mt-4 p-3.5 rounded-2xl bg-white/[0.03] border border-[#CCFF00]/20 font-mono text-xs space-y-1">
                <div className="flex justify-between items-center text-zinc-400">
                  <span>ESTIMATED TDEE:</span>
                  <span className="text-white font-bold">{livePreview.tdee} KCAL</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>RECALCULATED TARGET:</span>
                  <span className="text-[#CCFF00] font-black">{livePreview.calories} KCAL</span>
                </div>
                <div className="flex justify-between text-zinc-400 pt-1 border-t border-white/5">
                  <span className="text-blue-400 font-semibold">{livePreview.protein}g PRO</span>
                  <span className="text-emerald-400 font-semibold">{livePreview.carbs}g CARBS</span>
                  <span className="text-amber-400 font-semibold">{livePreview.fat}g FAT</span>
                </div>
              </div>

              <div className="space-y-4 mt-4 font-mono text-xs">
                {/* Gender & Age */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-400 uppercase block mb-1">Gender</span>
                    <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl">
                      {(['male', 'female'] as const).map((g) => (
                        <button
                          key={g}
                          onClick={() => setTempProfile({ ...tempProfile, gender: g })}
                          className={`py-2 text-base rounded-lg capitalize ${tempProfile.gender === g ? 'bg-[#CCFF00] text-black font-bold' : 'text-zinc-400'}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-400 uppercase block mb-1">Age</span>
                    <input
                      type="number"
                      value={tempProfile.age}
                      onChange={(e) => setTempProfile({ ...tempProfile, age: Number(e.target.value) })}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-base text-white font-mono"
                    />
                  </div>
                </div>

                {/* Height & Start Baseline Weight */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-400 uppercase block mb-1">Height (cm)</span>
                    <input
                      type="number"
                      value={tempProfile.height_cm}
                      onChange={(e) => setTempProfile({ ...tempProfile, height_cm: Number(e.target.value) })}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-base text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-zinc-400 uppercase block mb-1">Start Weight (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={tempProfile.start_weight_kg}
                      onChange={(e) => setTempProfile({ ...tempProfile, start_weight_kg: Number(e.target.value) })}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-base text-white font-mono"
                    />
                  </div>
                </div>

                {/* Target Goal Weight */}
                <div>
                  <span className="text-zinc-400 uppercase block mb-1">Target Goal Weight (kg)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={tempProfile.goal_weight_kg}
                    onChange={(e) => setTempProfile({ ...tempProfile, goal_weight_kg: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-base text-white font-mono"
                  />
                </div>

                {/* Active Goal */}
                <div>
                  <span className="text-zinc-400 uppercase block mb-1">Active Objective</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'aggressive_cut', label: 'Aggressive Cut (-650 kcal)' },
                      { id: 'cut', label: 'Moderate Cut (-450 kcal)' },
                      { id: 'maintain', label: 'Maintenance (0 kcal)' },
                      { id: 'lean_bulk', label: 'Lean Bulk (+250 kcal)' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setTempProfile({ ...tempProfile, goal: opt.id as any })}
                        className={`p-3 rounded-xl border text-left transition ${
                          tempProfile.goal === opt.id
                            ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-white font-bold'
                            : 'border-white/5 bg-white/[0.02] text-zinc-400'
                        }`}
                      >
                        <span className="text-xs block">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity Multiplier */}
                <div>
                  <span className="text-zinc-400 uppercase block mb-1">Activity Level</span>
                  <select
                    value={tempProfile.activity_level}
                    onChange={(e) => setTempProfile({ ...tempProfile, activity_level: e.target.value as any })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-base text-white"
                  >
                    <option value="sedentary">Sedentary (Desk job, minimal cardio)</option>
                    <option value="light">Lightly Active (1-3 gym sessions/wk)</option>
                    <option value="moderate">Moderately Active (3-5 sessions/wk, high steps)</option>
                    <option value="very_active">Very Active (6+ sessions/wk, physical job)</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}