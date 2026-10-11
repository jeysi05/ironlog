'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  TrendingUp,
  Sliders,
  User,
  LogOut,
  Mail,
  ShieldCheck,
  AlertCircle,
  Undo2,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════ */

const ACCENT = '#CCFF00';
const SWIPE_REVEAL = 84;
const TOAST_MS = 4000;
const UNDO_MS = 5000;
const DEFAULT_WEIGHT = 95;
const DEFAULT_GOAL_WEIGHT = 78;

/* ══════════════════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════════════════ */

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

interface SessionUser {
  id: string;
  email?: string | null;
}

/** Shape returned by `/api/parse`. Every field is optional — treat the
 *  response as untrusted and validate before touching state. */
interface ParseResponse {
  foods?: Array<{
    name?: string;
    quantity?: string;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  }>;
  exercises?: Array<{
    exercise_name?: string;
    sets?: number;
    reps?: number;
    weight_kg?: number;
    cardio_minutes?: number;
    calories_burned?: number;
  }>;
  weight_kg?: number;
}

interface ToastState {
  id: number;
  message: string;
  tone: 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

/* ══════════════════════════════════════════════════════════════════════
   METABOLIC ENGINE
   ══════════════════════════════════════════════════════════════════════ */

function computeTargets(
  gender: UserProfile['gender'],
  age: number,
  height_cm: number,
  weight_kg: number,
  activity_level: UserProfile['activity_level'],
  goal: UserProfile['goal'],
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

  const tdee = bmr * (multipliers[activity_level] ?? 1.375);

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

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════ */

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
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* some browsers throw on vibrate without user gesture */
    }
  }
};

const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

const byNewest = (a: { created_at?: string }, b: { created_at?: string }) =>
  (b.created_at ?? '').localeCompare(a.created_at ?? '');

/** `crypto.randomUUID` is unavailable in non-secure contexts (older iOS
 *  Safari over plain http), which would crash the whole app on boot. */
function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID().slice(0, 16);
    } catch {
      /* fall through */
    }
  }
  let out = '';
  for (let i = 0; i < 16; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

const newGuestId = () => `usr_${safeUUID()}`;

/** Clamp + coerce an untrusted number coming back from the parse API. */
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ══════════════════════════════════════════════════════════════════════
   HOOKS
   ══════════════════════════════════════════════════════════════════════ */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

function useTween(value: number, ms = 650, disabled = false) {
  const [v, setV] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    if (disabled) {
      fromRef.current = value;
      setV(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + (value - from) * eased;
      fromRef.current = cur;
      setV(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, ms, disabled]);

  return disabled ? value : v;
}

/* ══════════════════════════════════════════════════════════════════════
   MICRO COMPONENTS
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Numeric input that lets the user type freely (including "", "1." etc.)
 * without the parent clobbering the caret. We only push a value upward when
 * the text parses to a finite number, and we only pull a value down when the
 * field is *not* focused.
 */
const NumField = memo(function NumField({
  value,
  onChange,
  suffix,
  width = 'w-16',
  decimal = false,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  width?: string;
  decimal?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => String(value ?? 0));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText((prev) => (num(prev, NaN) === value ? prev : String(value ?? 0)));
  }, [value]);

  return (
    <label className="flex items-baseline gap-1">
      <input
        aria-label={ariaLabel}
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          // Normalise display on blur (e.g. "1." -> "1")
          setText(String(num(text, 0)));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = Number(raw);
          if (raw !== '' && Number.isFinite(n)) onChange(n);
        }}
        className={`${width} bg-white/5 rounded-xl px-2.5 py-2 text-right font-mono text-base text-white focus:outline-none focus:ring-1 focus:ring-[${ACCENT}] border border-white/5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      {suffix && <span className="font-mono text-xs text-zinc-400">{suffix}</span>}
    </label>
  );
});

const ProtocolField = memo(function ProtocolField({
  label,
  value,
  unit,
  step = '1',
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 focus-within:border-[#CCFF00]/50 transition">
      <span className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1">
        {label}
      </span>
      <div className="flex items-center justify-between">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ''}
          aria-label={label}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
            else if (e.target.value === '') onChange(0);
          }}
          className="w-full bg-transparent text-base font-mono font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs font-mono text-zinc-400 shrink-0 font-medium ml-1">{unit}</span>
      </div>
    </div>
  );
});

/**
 * Swipe-to-delete row. Uses pointer events with axis locking so vertical
 * scrolling still works. The delete button is also reachable by keyboard.
 */
const SwipeRow = memo(function SwipeRow({
  children,
  onDelete,
  label,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  label: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const base = useRef(0);
  const lock = useRef<'x' | 'y' | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
    startX.current = e.clientX;
    startY.current = e.clientY;
    base.current = dx;
    lock.current = null;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lock.current) {
      const ax = Math.abs(e.clientX - startX.current);
      const ay = Math.abs(e.clientY - startY.current);
      if (ax > 8 || ay > 8) {
        lock.current = ax > ay ? 'x' : 'y';
        if (lock.current === 'x') setDragging(true);
      }
    }
    if (lock.current === 'x') {
      const ddx = e.clientX - startX.current;
      setDx(Math.max(-SWIPE_REVEAL * 1.3, Math.min(0, base.current + ddx)));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
    setDragging(false);
    if (lock.current === 'x') {
      const open = dx < -SWIPE_REVEAL / 2;
      setDx(open ? -SWIPE_REVEAL : 0);
      if (open) haptic(15);
    }
    lock.current = null;
  };

  return (
    <div className="relative overflow-hidden select-none group">
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-rose-600 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        style={{ width: SWIPE_REVEAL }}
      >
        <Trash2 className="w-4 h-4" aria-hidden />
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
});

/**
 * Single ring = calories CONSUMED. Fills as you eat, turns red when over.
 */
const CalorieRing = memo(function CalorieRing({
  eaten,
  target,
}: {
  eaten: number;
  target: number;
}) {
  const SIZE = 136;
  const STROKE = 11;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;

  const reducedMotion = usePrefersReducedMotion();
  const remaining = target - eaten;
  const over = remaining < 0;
  const frac = Math.max(0, Math.min(eaten / (target || 1), 1));
  const shown = useTween(Math.abs(remaining), 650, reducedMotion);

  return (
    <div
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={
        over
          ? `${Math.abs(Math.round(remaining))} calories over target of ${target}`
          : `${Math.round(remaining)} calories remaining of ${target}`
      }
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90" aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={over ? '#FB7185' : ACCENT}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${C * frac} ${C}`}
          style={{
            transition: reducedMotion ? 'none' : 'stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)',
            opacity: frac === 0 ? 0 : 1,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-mono text-[11px] tracking-[0.18em] font-semibold ${
            over ? 'text-rose-400' : 'text-zinc-400'
          }`}
        >
          {over ? 'OVER' : 'LEFT'}
        </span>
        <span
          className={`font-black text-[38px] tracking-tighter tabular-nums leading-none mt-0.5 ${
            over ? 'text-rose-400' : 'text-white'
          }`}
        >
          {Math.round(shown)}
        </span>
        <span className="font-mono text-[11px] text-zinc-400 mt-1 tabular-nums">of {target}</span>
      </div>
    </div>
  );
});

function StatRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-2.5 ${
        last ? '' : 'border-b border-white/[0.05]'
      }`}
    >
      <span className="font-mono text-[11px] tracking-[0.12em] text-zinc-400 uppercase font-semibold">
        {label}
      </span>
      <span className="font-black text-lg tabular-nums leading-none">{children}</span>
    </div>
  );
}

const MacroCard = memo(function MacroCard({
  label,
  val,
  target,
  barColor,
}: {
  label: string;
  val: number;
  target: number;
  barColor: string;
}) {
  const diff = Math.round(target - val);
  const isOver = diff < 0;
  const pct = Math.min((val / (target || 1)) * 100, 100);

  return (
    <div
      className={`border rounded-2xl p-3 transition ${
        isOver ? 'bg-rose-500/[0.05] border-rose-500/30' : 'bg-white/[0.02] border-white/[0.05]'
      }`}
    >
      <span className="font-mono text-[11px] tracking-[0.1em] text-zinc-400 font-bold block">
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`font-black text-lg tabular-nums ${isOver ? 'text-rose-300' : 'text-white'}`}
        >
          {Math.round(val)}
        </span>
        <span className="font-mono text-xs text-zinc-400">/{target}g</span>
      </div>
      <div className="h-1.5 mt-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ${isOver ? 'bg-rose-500' : barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-[11px] mt-1.5 block tabular-nums ${
          isOver ? 'text-rose-400 font-bold' : 'text-zinc-400'
        }`}
      >
        {isOver ? `${Math.abs(diff)}g over` : `${diff}g left`}
      </span>
    </div>
  );
});

/** Memoised food row — object identity of `item` is stable in state. */
const FoodRow = memo(function FoodRow({
  item,
  isToday,
  onDelete,
}: {
  item: FoodItem;
  isToday: boolean;
  onDelete: (f: FoodItem) => void;
}) {
  const lean = (Number(item.protein_g || 0) * 4) / (item.calories || 1) >= 0.35;
  const time = isToday ? fmtTime(item.created_at) : '';

  return (
    <SwipeRow label={item.food_name} onDelete={() => onDelete(item)}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.04]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-white truncate">{item.food_name}</p>
            {lean && (
              <span className="shrink-0 font-mono text-[10px] bg-[#CCFF00]/10 border border-[#CCFF00]/25 text-[#CCFF00] font-bold px-1.5 py-0.5 rounded">
                LEAN
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-zinc-400 mt-0.5 truncate">
            {item.quantity || '1 serving'}
            {time && ` · ${time}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-black text-[15px] text-white tabular-nums">
            {item.calories}
            <span className="font-mono text-xs text-zinc-400 ml-1">KCAL</span>
          </p>
          <p className="font-mono text-xs mt-0.5">
            <span className="text-blue-400 font-bold">{item.protein_g}P</span>{' '}
            <span className="text-emerald-400">{item.carbs_g}C</span>{' '}
            <span className="text-amber-400">{item.fat_g}F</span>
          </p>
        </div>
      </div>
    </SwipeRow>
  );
});

const ExerciseRow = memo(function ExerciseRow({
  item,
  prior,
  onDelete,
}: {
  item: ExerciseItem;
  prior?: HistoricalRecord;
  onDelete: (e: ExerciseItem) => void;
}) {
  const isPR =
    !!item.weight_kg &&
    prior !== undefined &&
    (item.weight_kg > prior.weight ||
      (item.weight_kg === prior.weight && (item.reps || 0) > prior.reps));

  return (
    <SwipeRow label={item.exercise_name} onDelete={() => onDelete(item)}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.04]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-white truncate">{item.exercise_name}</p>
            {isPR && (
              <span className="shrink-0 font-mono text-[10px] bg-amber-400/15 border border-amber-400/30 text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                <Trophy className="w-2.5 h-2.5" aria-hidden /> PR
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-zinc-400 mt-0.5">
            {item.cardio_minutes
              ? `${item.cardio_minutes} min cardio`
              : `${item.sets}×${item.reps} @ ${item.weight_kg || 0}kg`}
            {!isPR && prior !== undefined && !item.cardio_minutes
              ? ` · best ${prior.weight}kg × ${prior.reps}`
              : ''}
          </p>
        </div>
        <p className="shrink-0 font-black text-[15px] text-sky-400 tabular-nums">
          -{item.calories_burned || 0}
          <span className="font-mono text-xs text-zinc-400 ml-1">KCAL</span>
        </p>
      </div>
    </SwipeRow>
  );
});

/* ──────────────────────────────────────────────────────────────────────
   COMPOSER — owns its own text state so typing doesn't re-render the
   entire log list on every keystroke.
   ────────────────────────────────────────────────────────────────────── */

interface ComposerHandle {
  clear: () => void;
  focus: () => void;
}

const Composer = memo(
  React.forwardRef<
    ComposerHandle,
    {
      parsing: boolean;
      pendingCount: number;
      onOpenReview: () => void;
      onSubmitText: (text: string) => void;
      onSubmitImage: (base64: string, mime: string) => void;
    }
  >(function Composer(
    { parsing, pendingCount, onOpenReview, onSubmitText, onSubmitImage },
    ref,
  ) {
    const [input, setInput] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const textRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => setInput(''),
        focus: () => textRef.current?.focus(),
      }),
      [],
    );

    const submit = useCallback(() => {
      const text = input.trim();
      if (!text || parsing) return;
      onSubmitText(text);
    }, [input, parsing, onSubmitText]);

    const onFile = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result !== 'string') return;
          const comma = result.indexOf(',');
          if (comma < 0) return;
          onSubmitImage(result.slice(comma + 1), file.type || 'image/jpeg');
        };
        reader.onerror = () => {};
        reader.readAsDataURL(file);
      },
      [onSubmitImage],
    );

    const hasDrafts = pendingCount > 0;

    return (
      <div
        className="absolute inset-x-0 bottom-0 z-30 px-3 pt-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent pointer-events-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
      >
        {hasDrafts && (
          <div className="flex justify-center mb-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                onOpenReview();
                haptic();
              }}
              className="flex items-center gap-1.5 bg-[#CCFF00] text-black font-mono text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-[#CCFF00]/20 animate-pulse active:scale-95 transition"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              {pendingCount} PENDING REVIEW (TAP TO OPEN)
            </button>
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileRef}
          onChange={onFile}
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />

        <div className="bg-[#141414]/95 backdrop-blur-xl border border-white/10 rounded-full p-1.5 flex items-center gap-1.5 shadow-2xl shadow-black/80 focus-within:border-[#CCFF00]/50 transition pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              haptic();
              fileRef.current?.click();
            }}
            disabled={parsing}
            aria-label="Scan food photo"
            className="p-3 text-zinc-300 bg-white/5 rounded-full transition active:scale-90 hover:bg-white/10 disabled:opacity-40"
          >
            <Camera className="w-4 h-4" aria-hidden />
          </button>
          <input
            ref={textRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Log meals, sets, or weigh-in..."
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent px-2 py-2 text-base text-white placeholder-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={parsing || !input.trim()}
            aria-label="Parse log entry"
            className="bg-[#CCFF00] text-black disabled:bg-white/5 disabled:text-zinc-600 rounded-full p-3 transition active:scale-90"
          >
            {parsing ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Send className="w-4 h-4 stroke-[2.5]" aria-hidden />
            )}
          </button>
        </div>
      </div>
    );
  }),
);

/* ══════════════════════════════════════════════════════════════════════
   MAIN APPLICATION
   ══════════════════════════════════════════════════════════════════════ */

const EMPTY_PROFILE = (id: string, weight: number): UserProfile => ({
  id,
  gender: 'male',
  age: 24,
  height_cm: 175,
  start_weight_kg: weight,
  weight_kg: weight,
  goal_weight_kg: DEFAULT_GOAL_WEIGHT,
  activity_level: 'light',
  goal: 'cut',
  target_calories: 2202,
  target_protein: 190,
  target_carbs: 223,
  target_fat: 61,
});

export default function IronLogApp() {
  const [mounted, setMounted] = useState(false);
  const [userId, setUserId] = useState('');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  /* ---------- toast (with undo support) ---------- */
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(null);
  }, []);

  const notify = useCallback(
    (
      message: string,
      opts?: { tone?: 'error' | 'info'; action?: ToastState['action']; duration?: number },
    ) => {
      haptic(25);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      const id = ++toastSeq.current;
      setToast({ id, message, tone: opts?.tone ?? 'error', action: opts?.action });
      toastTimer.current = setTimeout(
        () => setToast((t) => (t?.id === id ? null : t)),
        opts?.duration ?? TOAST_MS,
      );
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /* ---------- auth form ---------- */
  const [authEmail, setAuthEmail] = useState('');
  const [authOtp, setAuthOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  /* ---------- date / profile ---------- */
  const [today, setToday] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [profile, setProfile] = useState<UserProfile>(() => EMPTY_PROFILE('', DEFAULT_WEIGHT));
  const [showSettings, setShowSettings] = useState(false);
  const [tempProfile, setTempProfile] = useState<UserProfile>(profile);

  /** Keeps callbacks stable while still reading the freshest profile. */
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  /* ---------- staged drafts ---------- */
  const [draftFoods, setDraftFoods] = useState<FoodItem[]>([]);
  const [draftExercises, setDraftExercises] = useState<ExerciseItem[]>([]);
  const [draftWeight, setDraftWeight] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ---------- committed logs ---------- */
  const [dayFoods, setDayFoods] = useState<FoodItem[]>([]);
  const [dayExercises, setDayExercises] = useState<ExerciseItem[]>([]);
  const [currentWeight, setCurrentWeight] = useState<number>(DEFAULT_WEIGHT);
  const [priorBest, setPriorBest] = useState<Record<string, HistoricalRecord>>({});
  const [loadingDay, setLoadingDay] = useState(false);

  const [activeTab, setActiveTab] = useState<'meals' | 'workouts'>('meals');

  const composerRef = useRef<ComposerHandle>(null);
  const parseAbort = useRef<AbortController | null>(null);
  const reqId = useRef(0);
  const savingRef = useRef(false);

  /* ---------- bottom sheet drag ---------- */
  const [sheetDy, setSheetDy] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetStartY = useRef(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  /* ═══════════════ guest → auth migration ═══════════════ */

  const migrateGuestData = useCallback(async (guestId: string, authUid: string) => {
    if (!guestId || !authUid || guestId === authUid) return;
    try {
      const results = await Promise.all([
        supabase.from('food_logs').update({ user_id: authUid }).eq('user_id', guestId),
        supabase.from('workout_logs').update({ user_id: authUid }).eq('user_id', guestId),
        supabase.from('weight_logs').update({ user_id: authUid }).eq('user_id', guestId),
      ]);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      localStorage.removeItem('ironlog_user_id');
    } catch (e) {
      console.error('Migration error:', e);
    }
  }, []);

  /* ═══════════════ boot ═══════════════ */

  useEffect(() => {
    let localUid = localStorage.getItem('ironlog_user_id');
    if (!localUid) {
      localUid = newGuestId();
      localStorage.setItem('ironlog_user_id', localUid);
    }

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setSessionUser({ id: session.user.id, email: session.user.email });
          setUserId(session.user.id);
        } else {
          setUserId(localUid!);
        }
      })
      .catch(() => setUserId(localUid!));

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const guestId = localStorage.getItem('ironlog_user_id');
        setSessionUser({ id: session.user.id, email: session.user.email });
        setUserId(session.user.id);
        if (guestId) await migrateGuestData(guestId, session.user.id);
      } else {
        setSessionUser(null);
        const currentGuest = localStorage.getItem('ironlog_user_id') || newGuestId();
        localStorage.setItem('ironlog_user_id', currentGuest);
        setUserId(currentGuest);
      }
    });

    const now = new Date();
    setToday(now);
    setSelectedDate(now);
    setMounted(true);

    const onVisible = () => {
      if (document.visibilityState === 'visible') setToday(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      authListener.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [migrateGuestData]);

  /* ═══════════════ data fetching ═══════════════ */

  const fetchProfile = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (error) {
        console.error('Profile fetch failed:', error);
      }

      if (data) {
        const p = data as UserProfile;
        setProfile(p);
        setTempProfile(p);
        setCurrentWeight(Number(p.weight_kg) || DEFAULT_WEIGHT);
        return;
      }

      // No profile yet — create a sensible default.
      const initial = EMPTY_PROFILE(uid, DEFAULT_WEIGHT);
      const { error: insertErr } = await supabase.from('user_profiles').insert(initial);
      if (insertErr) console.error('Profile seed failed:', insertErr);
      setProfile(initial);
      setTempProfile(initial);
      setCurrentWeight(DEFAULT_WEIGHT);
    },
    [],
  );

  const fetchDataForDate = useCallback(async (date: Date, uid: string) => {
    if (!uid) return;
    const id = ++reqId.current;
    const start = startOfDay(date);
    const end = endOfDay(date);

    setLoadingDay(true);

    const [foodsRes, workoutsRes, weightRes, historyRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', uid)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', uid)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('weight_logs')
        .select('weight_kg, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('workout_logs')
        .select('exercise_name, weight_kg, reps')
        .eq('user_id', uid)
        .lt('created_at', start.toISOString())
        .not('weight_kg', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    // A newer request superseded this one.
    if (id !== reqId.current) return;
    setLoadingDay(false);

    const err = foodsRes.error || workoutsRes.error || weightRes.error;
    if (err) console.error('Day fetch failed:', err);

    setDayFoods((foodsRes.data ?? []) as FoodItem[]);
    setDayExercises((workoutsRes.data ?? []) as ExerciseItem[]);

    const latest = weightRes.data?.[0]?.weight_kg;
    setCurrentWeight(latest != null ? Number(latest) : profileRef.current.start_weight_kg || DEFAULT_WEIGHT);

    const best: Record<string, HistoricalRecord> = {};
    for (const w of (historyRes.data ?? []) as Array<{
      exercise_name: string;
      weight_kg: number | null;
      reps: number | null;
    }>) {
      const name = w.exercise_name?.toLowerCase().trim();
      if (!name) continue;
      const kg = Number(w.weight_kg);
      const reps = Number(w.reps || 0);
      if (!kg) continue;
      const cur = best[name];
      if (!cur || kg > cur.weight || (kg === cur.weight && reps > cur.reps)) {
        best[name] = { weight: kg, reps };
      }
    }
    setPriorBest(best);
  }, []);

  useEffect(() => {
    if (mounted && userId) void fetchProfile(userId);
  }, [mounted, userId, fetchProfile]);

  useEffect(() => {
    if (mounted && selectedDate && userId) void fetchDataForDate(selectedDate, userId);
  }, [mounted, selectedDate, userId, fetchDataForDate]);

  /* ═══════════════ auth handlers ═══════════════ */

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || authLoading) return;
    setAuthLoading(true);
    haptic();

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });

    setAuthLoading(false);
    if (error) notify(error.message);
    else setOtpSent(true);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authOtp.trim() || authLoading) return;
    setAuthLoading(true);
    haptic();

    const { error } = await supabase.auth.verifyOtp({
      email: authEmail.trim(),
      token: authOtp.trim(),
      type: 'email',
    });

    setAuthLoading(false);
    if (error) {
      notify(error.message);
    } else {
      setShowAuthModal(false);
      setOtpSent(false);
      setAuthOtp('');
      setAuthEmail('');
    }
  };

  const handleGoogleSignIn = async () => {
    haptic();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) notify('Google sign-in failed: ' + error.message);
  };

  const handleSignOut = async () => {
    haptic(15);
    const { error } = await supabase.auth.signOut();
    if (error) notify('Sign-out failed: ' + error.message);
    setShowAuthModal(false);
  };

  /* ═══════════════ derived intake metrics ═══════════════ */

  const { eaten, protein, carbs, fat, burned } = useMemo(() => {
    let e = 0,
      p = 0,
      c = 0,
      f = 0,
      b = 0;
    for (const x of dayFoods) {
      e += x.calories || 0;
      p += Number(x.protein_g || 0);
      c += Number(x.carbs_g || 0);
      f += Number(x.fat_g || 0);
    }
    for (const x of dayExercises) b += x.calories_burned || 0;
    return { eaten: e, protein: p, carbs: c, fat: f, burned: b };
  }, [dayFoods, dayExercises]);

  const isToday = selectedDate && today ? sameDay(today, selectedDate) : true;

  const pendingCount = draftFoods.length + draftExercises.length + (draftWeight !== null ? 1 : 0);
  const hasDrafts = pendingCount > 0;

  const draftKcal = useMemo(() => draftFoods.reduce((a, c) => a + (c.calories || 0), 0), [draftFoods]);
  const draftProtein = useMemo(
    () => draftFoods.reduce((a, c) => a + (c.protein_g || 0), 0),
    [draftFoods],
  );
  const draftBurn = useMemo(
    () => draftExercises.reduce((a, c) => a + (c.calories_burned || 0), 0),
    [draftExercises],
  );

  const goToDay = useCallback(
    (d: Date) => {
      if (today && startOfDay(d) > startOfDay(today)) return;
      haptic();
      setSelectedDate(d);
    },
    [today],
  );

  const shiftDay = useCallback(
    (n: number) => {
      setSelectedDate((prev) => {
        if (!prev) return prev;
        const next = new Date(prev);
        next.setDate(next.getDate() + n);
        if (today && startOfDay(next) > startOfDay(today)) return prev;
        haptic();
        return next;
      });
    },
    [today],
  );

  const weekDays = useMemo(() => {
    if (!mounted || !selectedDate) return [];
    const mondayOffset = (selectedDate.getDay() + 6) % 7;
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [mounted, selectedDate]);

  /* ═══════════════ parse ═══════════════ */

  const handleParse = useCallback(
    async (payload: { message?: string; imageBase64?: string; mimeType?: string }) => {
      if (!payload.message?.trim() && !payload.imageBase64) return;

      // Cancel any in-flight parse so a slow first request can't overwrite
      // a fast second one.
      parseAbort.current?.abort();
      const controller = new AbortController();
      parseAbort.current = controller;

      setParsing(true);
      haptic();

      try {
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: payload.message ?? '',
            imageBase64: payload.imageBase64,
            mimeType: payload.mimeType,
            profile: { ...profileRef.current, weight_kg: currentWeight },
          }),
        });

        if (!res.ok) throw new Error(`Parse failed (${res.status})`);
        const data = (await res.json()) as ParseResponse;

        const foods: FoodItem[] = (data.foods ?? [])
          .filter((f) => f && typeof f.name === 'string' && f.name.trim())
          .map((f) => ({
            food_name: f.name!.trim(),
            quantity: f.quantity,
            calories: Math.round(num(f.calories)),
            protein_g: num(f.protein_g),
            carbs_g: num(f.carbs_g),
            fat_g: num(f.fat_g),
          }));

        const exercises: ExerciseItem[] = (data.exercises ?? [])
          .filter((e) => e && typeof e.exercise_name === 'string' && e.exercise_name.trim())
          .map((e) => ({
            exercise_name: e.exercise_name!.trim(),
            sets: num(e.sets),
            reps: num(e.reps),
            weight_kg: e.weight_kg != null ? num(e.weight_kg) : undefined,
            cardio_minutes: num(e.cardio_minutes),
            calories_burned: num(e.calories_burned),
          }));

        if (foods.length === 0 && exercises.length === 0 && data.weight_kg == null) {
          notify("Couldn't find any food, exercise, or weigh-in in that. Try rephrasing.", {
            tone: 'info',
          });
          return;
        }

        if (foods.length) setDraftFoods((d) => [...d, ...foods]);
        if (exercises.length) setDraftExercises((d) => [...d, ...exercises]);
        if (data.weight_kg != null) setDraftWeight(num(data.weight_kg, currentWeight));

        setSheetDy(0);
        setSheetOpen(true);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.error(err);
        notify("Couldn't read that. Check your connection or API quota and try again.");
      } finally {
        if (parseAbort.current === controller) parseAbort.current = null;
        setParsing(false);
      }
    },
    [currentWeight, notify],
  );

  const submitText = useCallback(
    (text: string) => void handleParse({ message: text }),
    [handleParse],
  );
  const submitImage = useCallback(
    (base64: string, mime: string) => void handleParse({ imageBase64: base64, mimeType: mime }),
    [handleParse],
  );

  /* ═══════════════ commit ═══════════════ */

  const handleCommit = useCallback(async () => {
    if (!userId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    haptic(20);

    const when = selectedDate ?? new Date();
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
            user_id: userId,
            food_name: f.food_name,
            quantity: f.quantity,
            calories: f.calories,
            protein_g: f.protein_g,
            carbs_g: f.carbs_g,
            fat_g: f.fat_g,
            created_at: ts,
          })),
        );
        if (error) throw error;
      }

      if (draftExercises.length > 0) {
        const { error } = await supabase.from('workout_logs').insert(
          draftExercises.map((e) => ({
            user_id: userId,
            exercise_name: e.exercise_name,
            sets: e.sets || 0,
            reps: e.reps || 0,
            weight_kg: e.weight_kg || null,
            cardio_minutes: e.cardio_minutes || 0,
            calories_burned: e.calories_burned || 0,
            created_at: ts,
          })),
        );
        if (error) throw error;
      }

      if (draftWeight !== null && Number.isFinite(draftWeight)) {
        const { error: wErr } = await supabase
          .from('weight_logs')
          .insert({ user_id: userId, weight_kg: draftWeight, created_at: ts });
        if (wErr) throw wErr;
        setCurrentWeight(draftWeight);
      }

      composerRef.current?.clear();
      setDraftFoods([]);
      setDraftExercises([]);
      setDraftWeight(null);
      setSheetOpen(false);
      setSheetDy(0);
      if (selectedDate) await fetchDataForDate(selectedDate, userId);
    } catch (err) {
      notify('Save failed: ' + ((err as Error)?.message ?? 'Unknown error'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [userId, selectedDate, isToday, draftFoods, draftExercises, draftWeight, notify, fetchDataForDate]);

  const discardDrafts = useCallback(() => {
    haptic();
    setDraftFoods([]);
    setDraftExercises([]);
    setDraftWeight(null);
    setSheetOpen(false);
    setSheetDy(0);
  }, []);

  /* ═══════════════ draft editing ═══════════════ */

  const patchFood = useCallback((i: number, p: Partial<FoodItem>) => {
    setDraftFoods((d) => d.map((f, j) => (j === i ? { ...f, ...p } : f)));
  }, []);

  const patchExercise = useCallback((i: number, p: Partial<ExerciseItem>) => {
    setDraftExercises((d) => d.map((e, j) => (j === i ? { ...e, ...p } : e)));
  }, []);

  /* ═══════════════ deletes (optimistic + undo) ═══════════════ */

  const deleteFood = useCallback(
    async (item: FoodItem) => {
      if (!item.id) return;
      haptic(15);

      setDayFoods((d) => d.filter((x) => x.id !== item.id));
      const { error } = await supabase.from('food_logs').delete().eq('id', item.id);

      if (error) {
        setDayFoods((d) => [item, ...d].sort(byNewest));
        notify('Delete failed: ' + error.message);
        return;
      }

      notify(`Deleted ${item.food_name}`, {
        tone: 'info',
        duration: UNDO_MS,
        action: {
          label: 'UNDO',
          onClick: async () => {
            dismissToast();
            const { error: e2 } = await supabase.from('food_logs').insert(item);
            if (e2) {
              notify('Undo failed: ' + e2.message);
              return;
            }
            setDayFoods((d) => [item, ...d.filter((x) => x.id !== item.id)].sort(byNewest));
          },
        },
      });
    },
    [dismissToast, notify],
  );

  const deleteExercise = useCallback(
    async (item: ExerciseItem) => {
      if (!item.id) return;
      haptic(15);

      setDayExercises((d) => d.filter((x) => x.id !== item.id));
      const { error } = await supabase.from('workout_logs').delete().eq('id', item.id);

      if (error) {
        setDayExercises((d) => [item, ...d].sort(byNewest));
        notify('Delete failed: ' + error.message);
        return;
      }

      notify(`Deleted ${item.exercise_name}`, {
        tone: 'info',
        duration: UNDO_MS,
        action: {
          label: 'UNDO',
          onClick: async () => {
            dismissToast();
            const { error: e2 } = await supabase.from('workout_logs').insert(item);
            if (e2) {
              notify('Undo failed: ' + e2.message);
              return;
            }
            setDayExercises((d) => [item, ...d.filter((x) => x.id !== item.id)].sort(byNewest));
          },
        },
      });
    },
    [dismissToast, notify],
  );

  /* ═══════════════ settings save ═══════════════ */

  const saveProfile = useCallback(async () => {
    const preview = computeTargets(
      tempProfile.gender,
      tempProfile.age,
      tempProfile.height_cm,
      currentWeight,
      tempProfile.activity_level,
      tempProfile.goal,
    );

    const updated: UserProfile = {
      ...tempProfile,
      id: userId || tempProfile.id,
      target_calories: preview.calories,
      target_protein: preview.protein,
      target_carbs: preview.carbs,
      target_fat: preview.fat,
    };

    // Optimistic — revert if the write fails.
    const previous = profile;
    setProfile(updated);
    setShowSettings(false);
    haptic(20);

    const { error } = await supabase.from('user_profiles').upsert(updated);
    if (error) {
      setProfile(previous);
      notify('Profile update failed: ' + error.message);
    }
  }, [tempProfile, currentWeight, userId, profile, notify]);

  /* ═══════════════ render guards ═══════════════ */

  const weightLost = Number(
    ((profile.start_weight_kg ?? DEFAULT_WEIGHT) - currentWeight).toFixed(1),
  );
  const toGoal = Number((currentWeight - (profile.goal_weight_kg ?? DEFAULT_GOAL_WEIGHT)).toFixed(1));

  const livePreview = useMemo(
    () =>
      computeTargets(
        tempProfile.gender,
        tempProfile.age,
        tempProfile.height_cm,
        currentWeight,
        tempProfile.activity_level,
        tempProfile.goal,
      ),
    [
      tempProfile.gender,
      tempProfile.age,
      tempProfile.height_cm,
      tempProfile.activity_level,
      tempProfile.goal,
      currentWeight,
    ],
  );

  const macros = useMemo(
    () => [
      { label: 'PROTEIN', val: protein, target: profile.target_protein, barColor: 'bg-blue-400' },
      { label: 'CARBS', val: carbs, target: profile.target_carbs, barColor: 'bg-emerald-400' },
      { label: 'FAT', val: fat, target: profile.target_fat, barColor: 'bg-amber-400' },
    ],
    [protein, carbs, fat, profile.target_protein, profile.target_carbs, profile.target_fat],
  );

  if (!mounted || !selectedDate || !today) {
    return <div className="fixed inset-0 bg-[#0A0A0A]" />;
  }

  const listEmpty = activeTab === 'meals' ? dayFoods.length === 0 : dayExercises.length === 0;

  return (
    <div className="fixed inset-0 bg-black flex justify-center overflow-hidden select-none">
      <style>{`
        html, body {
          position: fixed;
          width: 100%;
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
          -webkit-overflow-scrolling: touch;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
        input, select, textarea {
          -webkit-user-select: text;
          user-select: text;
          -webkit-tap-highlight-color: transparent;
        }
        * { -webkit-tap-highlight-color: transparent; }

        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <div className="w-full max-w-md h-full flex flex-col relative overflow-hidden bg-[#0A0A0A] text-zinc-300 font-sans">
        {/* ── Toast ─────────────────────────────────────────────── */}
        {toast && (
          <div
            className="absolute inset-x-4 z-[60]"
            style={{
              top: 'calc(env(safe-area-inset-top) + 8px)',
              animation: 'toastIn 200ms ease-out',
            }}
            role="status"
            aria-live="polite"
          >
            <div
              className={`flex items-start gap-2.5 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl border ${
                toast.tone === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30'
                  : 'bg-white/10 border-white/20'
              }`}
            >
              {toast.tone === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden />
              ) : (
                <Check className="w-4 h-4 text-[#CCFF00] shrink-0 mt-0.5" aria-hidden />
              )}
              <p
                className={`text-sm leading-snug flex-1 ${
                  toast.tone === 'error' ? 'text-rose-100' : 'text-zinc-100'
                }`}
              >
                {toast.message}
              </p>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="shrink-0 flex items-center gap-1 font-mono text-xs font-bold text-[#CCFF00] hover:text-white transition px-1"
                >
                  <Undo2 className="w-3.5 h-3.5" aria-hidden />
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={dismissToast}
                aria-label="Dismiss notification"
                className="shrink-0 text-zinc-400 hover:text-white transition -mr-1 px-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────── */}
        <header
          className="shrink-0 px-5 pb-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
        >
          <div>
            <span className="font-mono text-[11px] tracking-[0.2em] text-zinc-400 uppercase font-bold block">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
            </span>
            <span className="font-black text-2xl tracking-tight text-white">
              {isToday
                ? 'TODAY'
                : selectedDate
                    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    .toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full pl-3 pr-3.5 py-1.5 shadow-inner">
              <Scale className="w-3.5 h-3.5 text-[#CCFF00]" aria-hidden />
              <span className="font-black text-base text-white tabular-nums">
                {currentWeight.toFixed(1)}
              </span>
              <span className="font-mono text-xs text-zinc-400">KG</span>
              {weightLost > 0 ? (
                <span className="font-mono text-xs text-[#CCFF00] flex items-center gap-0.5 font-bold">
                  <TrendingDown className="w-3 h-3" aria-hidden />
                  {weightLost}
                </span>
              ) : weightLost < 0 ? (
                <span className="font-mono text-xs text-amber-400 flex items-center gap-0.5 font-bold">
                  <TrendingUp className="w-3 h-3" aria-hidden />
                  {Math.abs(weightLost)}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setTempProfile(profile);
                setShowSettings(true);
                haptic();
              }}
              aria-label="Profile settings"
              className="p-2.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:text-white transition active:scale-90"
            >
              <Sliders className="w-4 h-4 text-[#CCFF00]" aria-hidden />
            </button>
          </div>
        </header>

        {/* ── Week strip ────────────────────────────────────────── */}
        <nav className="shrink-0 px-5 pb-3 grid grid-cols-7 gap-1.5" aria-label="Select day">
          {weekDays.map((d, i) => {
            const selected = sameDay(d, selectedDate);
            const isActualToday = sameDay(d, today);
            const future = startOfDay(d) > startOfDay(today);
            return (
              <button
                type="button"
                key={i}
                disabled={future}
                onClick={() => goToDay(d)}
                aria-label={d.toDateString()}
                aria-current={selected ? 'date' : undefined}
                className={`flex flex-col items-center py-2 rounded-2xl transition active:scale-95 ${
                  selected
                    ? 'bg-[#CCFF00] text-black shadow-lg shadow-[#CCFF00]/15 font-bold'
                    : 'text-zinc-400 hover:text-white'
                } ${future ? 'opacity-25 cursor-not-allowed' : ''}`}
              >
                <span className="font-mono text-[11px] tracking-wider">{'MTWTFSS'[i]}</span>
                <span className="font-black text-sm tabular-nums mt-0.5">{d.getDate()}</span>
                <span
                  className={`w-1 h-1 rounded-full mt-1 ${
                    isActualToday ? (selected ? 'bg-black' : 'bg-[#CCFF00]') : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </nav>

        {/* ── Feed ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-40 [-webkit-overflow-scrolling:touch]">
          <section
            className="px-5"
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
            <div className="flex items-center gap-5 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-4">
              <CalorieRing eaten={eaten} target={profile.target_calories} />
              <div className="flex-1 min-w-0">
                <StatRow label="Intake">
                  <span className="text-white">{eaten}</span>
                </StatRow>
                <StatRow label="Burned">
                  <span className="text-sky-400">{burned > 0 ? `-${burned}` : '0'}</span>
                </StatRow>
                <StatRow label="To goal" last>
                  <span className="text-white">{toGoal}</span>
                  <span className="font-mono text-xs text-zinc-400 ml-1">KG</span>
                </StatRow>
              </div>
            </div>
          </section>

          <section className="px-5 mt-3 grid grid-cols-3 gap-2.5">
            {macros.map((m) => (
              <MacroCard key={m.label} {...m} />
            ))}
          </section>

          <section className="mt-5">
            <div className="sticky top-0 z-10 bg-[#0A0A0A]/95 backdrop-blur-md px-5 py-2.5 border-b border-white/[0.04]">
              <div className="grid grid-cols-2 gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.05]">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('meals');
                    haptic();
                  }}
                  aria-pressed={activeTab === 'meals'}
                  className={`font-mono text-xs font-bold py-2 rounded-lg transition active:scale-95 ${
                    activeTab === 'meals' ? 'bg-[#CCFF00] text-black shadow' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  NUTRITION ({dayFoods.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('workouts');
                    haptic();
                  }}
                  aria-pressed={activeTab === 'workouts'}
                  className={`font-mono text-xs font-bold py-2 rounded-lg transition active:scale-95 ${
                    activeTab === 'workouts'
                      ? 'bg-[#CCFF00] text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  TRAINING ({dayExercises.length})
                </button>
              </div>
            </div>

            {loadingDay && listEmpty ? (
              <div className="px-5 py-4 space-y-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : listEmpty ? (
              <div className="mx-5 my-8 py-12 text-center border border-dashed border-white/[0.08] rounded-2xl">
                <p className="font-mono text-xs text-zinc-300 uppercase tracking-widest">
                  {isToday
                    ? activeTab === 'meals'
                      ? 'Nothing logged yet'
                      : 'No training yet'
                    : 'Nothing logged this day'}
                </p>
                <p className="font-mono text-[11px] text-zinc-400 mt-1.5">
                  {activeTab === 'meals' ? 'Snap a photo or type below' : 'Log sets or cardio below'}
                </p>
              </div>
            ) : activeTab === 'meals' ? (
              dayFoods.map((f) => (
                <FoodRow key={f.id} item={f} isToday={isToday} onDelete={deleteFood} />
              ))
            ) : (
              dayExercises.map((e) => (
                <ExerciseRow
                  key={e.id}
                  item={e}
                  prior={priorBest[e.exercise_name.toLowerCase().trim()]}
                  onDelete={deleteExercise}
                />
              ))
            )}

            {!listEmpty && (
              <p className="font-mono text-[11px] text-zinc-500 text-center py-4">
                ← swipe left on an entry to delete
              </p>
            )}
          </section>
        </div>

        {/* ── Composer dock ─────────────────────────────────────── */}
        <Composer
          ref={composerRef}
          parsing={parsing}
          pendingCount={pendingCount}
          onOpenReview={() => setSheetOpen(true)}
          onSubmitText={submitText}
          onSubmitImage={submitImage}
        />

        {/* ── Review sheet ──────────────────────────────────────── */}
        {hasDrafts && sheetOpen && (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm"
              onTouchMove={(e) => e.preventDefault()}
              onClick={() => setSheetOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Review parsed entries"
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
                onTouchMove={(e) =>
                  setSheetDy(Math.max(0, e.touches[0].clientY - sheetStartY.current))
                }
                onTouchEnd={() => {
                  setSheetDragging(false);
                  if (sheetDy > 120) setSheetOpen(false);
                  setSheetDy(0);
                }}
              >
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
                <div className="flex items-end justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#CCFF00]" aria-hidden />
                    <span className="font-black text-xl tracking-tight text-white">REVIEW &amp; EDIT</span>
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
                <p className="font-mono text-xs text-zinc-400 mt-1">
                  Tap numbers directly to adjust portion estimates before logging.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 space-y-3 pb-6 [-webkit-overflow-scrolling:touch]">
                {draftWeight !== null && (
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4 border border-white/[0.04]">
                    <span className="font-mono text-xs text-zinc-300 flex items-center gap-2">
                      <Scale className="w-4 h-4 text-[#CCFF00]" aria-hidden /> WEIGH-IN
                    </span>
                    <NumField
                      value={draftWeight}
                      onChange={setDraftWeight}
                      suffix="KG"
                      decimal
                      width="w-20"
                      ariaLabel="Weight in kilograms"
                    />
                  </div>
                )}

                {draftFoods.map((f, i) => (
                  <div key={`f${i}`} className="rounded-2xl bg-white/[0.03] p-4 border border-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{f.food_name}</p>
                        <p className="font-mono text-xs text-zinc-400 mt-0.5">
                          {f.quantity || '1 portion'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDraftFoods((d) => d.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.food_name}`}
                        className="p-1 text-zinc-400 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div>
                        <span className="font-mono text-xs text-[#CCFF00] block mb-1">KCAL</span>
                        <NumField
                          value={f.calories}
                          onChange={(n) => patchFood(i, { calories: n })}
                          width="w-full"
                          ariaLabel="Calories"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-xs text-blue-400 block mb-1">PRO</span>
                        <NumField
                          value={f.protein_g}
                          onChange={(n) => patchFood(i, { protein_g: n })}
                          width="w-full"
                          decimal
                          ariaLabel="Protein grams"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-xs text-emerald-400 block mb-1">CARB</span>
                        <NumField
                          value={f.carbs_g}
                          onChange={(n) => patchFood(i, { carbs_g: n })}
                          width="w-full"
                          decimal
                          ariaLabel="Carbohydrate grams"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-xs text-amber-400 block mb-1">FAT</span>
                        <NumField
                          value={f.fat_g}
                          onChange={(n) => patchFood(i, { fat_g: n })}
                          width="w-full"
                          decimal
                          ariaLabel="Fat grams"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {draftExercises.map((e, i) => (
                  <div key={`e${i}`} className="rounded-2xl bg-white/[0.03] p-4 border border-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{e.exercise_name}</p>
                      <button
                        type="button"
                        onClick={() => setDraftExercises((d) => d.filter((_, j) => j !== i))}
                        aria-label={`Remove ${e.exercise_name}`}
                        className="p-1 text-zinc-400 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                    {e.cardio_minutes ? (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">MINUTES</span>
                          <NumField
                            value={e.cardio_minutes}
                            onChange={(n) => patchExercise(i, { cardio_minutes: n })}
                            width="w-full"
                            ariaLabel="Cardio minutes"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-sky-400 block mb-1">BURN (KCAL)</span>
                          <NumField
                            value={e.calories_burned || 0}
                            onChange={(n) => patchExercise(i, { calories_burned: n })}
                            width="w-full"
                            ariaLabel="Calories burned"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">SETS</span>
                          <NumField
                            value={e.sets || 0}
                            onChange={(n) => patchExercise(i, { sets: n })}
                            width="w-full"
                            ariaLabel="Sets"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">REPS</span>
                          <NumField
                            value={e.reps || 0}
                            onChange={(n) => patchExercise(i, { reps: n })}
                            width="w-full"
                            ariaLabel="Reps"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-zinc-400 block mb-1">KG</span>
                          <NumField
                            value={e.weight_kg || 0}
                            onChange={(n) => patchExercise(i, { weight_kg: n })}
                            width="w-full"
                            decimal
                            ariaLabel="Weight in kilograms"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-xs text-sky-400 block mb-1">BURN</span>
                          <NumField
                            value={e.calories_burned || 0}
                            onChange={(n) => patchExercise(i, { calories_burned: n })}
                            width="w-full"
                            ariaLabel="Calories burned"
                          />
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
                  type="button"
                  onClick={discardDrafts}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-full font-mono font-bold text-xs bg-white/5 text-zinc-400 hover:text-white transition active:scale-[0.98] disabled:opacity-50"
                >
                  DISCARD
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={saving}
                  className="flex-[2] py-3.5 rounded-full font-mono font-bold text-xs bg-[#CCFF00] text-black flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-[#CCFF00]/10 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="w-4 h-4 stroke-[3]" aria-hidden />
                  )}
                  COMMIT LOG
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Settings sheet ────────────────────────────────────── */}
        {showSettings && (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm transition-opacity"
              onTouchMove={(e) => e.preventDefault()}
              onClick={() => setShowSettings(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Biometric protocol settings"
              className="absolute inset-x-0 bottom-0 z-50 bg-[#121212] border-t border-white/10 rounded-t-[32px] max-h-[92dvh] flex flex-col shadow-2xl"
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-1" />

              <div className="shrink-0 px-6 pt-3 pb-4 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#CCFF00]/10 flex items-center justify-center">
                    <Sliders className="w-4 h-4 text-[#CCFF00]" aria-hidden />
                  </div>
                  <div>
                    <h3 className="font-mono text-sm font-bold tracking-wider text-white uppercase">
                      Biometric Protocol
                    </h3>
                    <p className="font-mono text-[11px] text-zinc-400">
                      Calculated via Mifflin-St Jeor equation
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  aria-label="Close settings"
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-90"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 pb-28 [-webkit-overflow-scrolling:touch]">
                {/* Account */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between font-mono text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                      <User className="w-4 h-4 text-[#CCFF00]" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="text-zinc-400 block text-[11px] uppercase font-bold tracking-wider">
                        Cloud Account
                      </span>
                      <span className="text-white font-semibold truncate max-w-[150px] block text-xs">
                        {sessionUser?.email ?? 'Guest Mode (Local Only)'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettings(false);
                      setShowAuthModal(true);
                      haptic();
                    }}
                    className="shrink-0 bg-[#CCFF00]/10 border border-[#CCFF00]/30 hover:bg-[#CCFF00]/20 text-[#CCFF00] font-bold px-3 py-1.5 rounded-xl transition active:scale-95 text-xs"
                  >
                    {sessionUser ? 'MANAGE' : 'SIGN IN / SYNC'}
                  </button>
                </div>

                {/* Metabolic preview */}
                <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08]">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="font-mono text-[11px] text-zinc-400 uppercase tracking-widest block font-semibold">
                        CALCULATED TARGET
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-black text-white tabular-nums">
                          {livePreview.calories}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">KCAL / DAY</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[11px] text-zinc-400 block">
                        MAINTENANCE (TDEE)
                      </span>
                      <span className="font-mono text-xs font-bold text-zinc-300">
                        {livePreview.tdee} kcal
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl py-1.5">
                      <span className="text-[10px] text-blue-400 block font-bold">PROTEIN</span>
                      <span className="text-xs font-bold text-white">{livePreview.protein}g</span>
                    </div>
                    <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl py-1.5">
                      <span className="text-[10px] text-emerald-400 block font-bold">CARBS</span>
                      <span className="text-xs font-bold text-white">{livePreview.carbs}g</span>
                    </div>
                    <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl py-1.5">
                      <span className="text-[10px] text-amber-400 block font-bold">FATS</span>
                      <span className="text-xs font-bold text-white">{livePreview.fat}g</span>
                    </div>
                  </div>
                </div>

                {/* Sex */}
                <div>
                  <span className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1.5">
                    Biological Sex
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 bg-black/40 border border-white/5 p-1 rounded-2xl">
                    {(['male', 'female'] as const).map((g) => (
                      <button
                        type="button"
                        key={g}
                        onClick={() => {
                          setTempProfile((p) => ({ ...p, gender: g }));
                          haptic();
                        }}
                        aria-pressed={tempProfile.gender === g}
                        className={`py-2.5 rounded-xl font-mono text-xs font-bold capitalize transition active:scale-95 ${
                          tempProfile.gender === g
                            ? 'bg-[#CCFF00] text-black shadow-md shadow-[#CCFF00]/10'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Biometrics */}
                <div className="grid grid-cols-2 gap-3">
                  <ProtocolField
                    label="Current Age"
                    value={tempProfile.age}
                    unit="yrs"
                    onChange={(v) => setTempProfile((p) => ({ ...p, age: v }))}
                  />
                  <ProtocolField
                    label="Height"
                    value={tempProfile.height_cm}
                    unit="cm"
                    onChange={(v) => setTempProfile((p) => ({ ...p, height_cm: v }))}
                  />
                  <ProtocolField
                    label="Baseline Start"
                    value={tempProfile.start_weight_kg}
                    unit="kg"
                    step="0.1"
                    onChange={(v) => setTempProfile((p) => ({ ...p, start_weight_kg: v }))}
                  />
                  <ProtocolField
                    label="Goal Weight"
                    value={tempProfile.goal_weight_kg}
                    unit="kg"
                    step="0.1"
                    onChange={(v) => setTempProfile((p) => ({ ...p, goal_weight_kg: v }))}
                  />
                </div>

                {/* Goal */}
                <div>
                  <span className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1.5">
                    Deficit / Surplus Goal
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'aggressive_cut', label: 'Aggressive Cut', delta: '-650 kcal' },
                        { id: 'cut', label: 'Moderate Cut', delta: '-450 kcal' },
                        { id: 'maintain', label: 'Maintenance', delta: '0 kcal' },
                        { id: 'lean_bulk', label: 'Lean Bulk', delta: '+250 kcal' },
                      ] as const
                    ).map((opt) => (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => {
                          setTempProfile((p) => ({ ...p, goal: opt.id }));
                          haptic();
                        }}
                        aria-pressed={tempProfile.goal === opt.id}
                        className={`p-3 rounded-2xl border text-left transition font-mono active:scale-95 ${
                          tempProfile.goal === opt.id
                            ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-white'
                            : 'border-white/[0.06] bg-white/[0.02] text-zinc-400'
                        }`}
                      >
                        <span className="text-xs font-bold block text-white">{opt.label}</span>
                        <span
                          className={`text-[11px] mt-0.5 block ${
                            tempProfile.goal === opt.id ? 'text-[#CCFF00]' : 'text-zinc-400'
                          }`}
                        >
                          {opt.delta}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity */}
                <div>
                  <span className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1.5">
                    Activity Multiplier
                  </span>
                  <div className="relative">
                    <select
                      value={tempProfile.activity_level}
                      onChange={(e) =>
                        setTempProfile((p) => ({
                          ...p,
                          activity_level: e.target.value as UserProfile['activity_level'],
                        }))
                      }
                      aria-label="Activity level"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-3.5 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#CCFF00]/50 appearance-none"
                    >
                      <option value="sedentary">Sedentary (Desk job, minimal daily movement)</option>
                      <option value="light">Lightly Active (1–3 gym sessions / week)</option>
                      <option value="moderate">Moderately Active (3–5 sessions / week + steps)</option>
                      <option value="very_active">Very Active (6+ hard sessions / physical job)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-400 text-xs">
                      ▼
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="shrink-0 p-5 border-t border-white/[0.06] bg-[#121212]"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
              >
                <button
                  type="button"
                  onClick={saveProfile}
                  className="w-full py-4 rounded-2xl bg-[#CCFF00] text-black font-mono font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#CCFF00]/20 active:scale-[0.98] transition"
                >
                  <Check className="w-4 h-4 stroke-[3]" aria-hidden />
                  SAVE &amp; APPLY PROTOCOL
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Auth modal ────────────────────────────────────────── */}
        {showAuthModal && (
          <>
            <div
              className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm transition-opacity"
              onTouchMove={(e) => e.preventDefault()}
              onClick={() => setShowAuthModal(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Account"
              className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl font-mono text-xs max-w-sm mx-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#CCFF00]" aria-hidden />
                  <span className="text-sm font-bold text-white uppercase tracking-wider">
                    {sessionUser ? 'Account Cloud Sync' : 'Sign In to IronLog'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  aria-label="Close"
                  className="text-zinc-400 hover:text-white p-1"
                >
                  ✕
                </button>
              </div>

              {sessionUser ? (
                <div className="space-y-4">
                  <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 space-y-1">
                    <span className="text-[11px] text-zinc-400 uppercase tracking-widest block font-bold">
                      Logged In As
                    </span>
                    <span className="text-white text-sm font-bold block truncate">
                      {sessionUser.email}
                    </span>
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 pt-1 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Cloud Sync Active
                    </span>
                  </div>
                  <p className="text-zinc-400 text-xs leading-relaxed">
                    All meals, weigh-ins, and personal records automatically sync across your iPhone,
                    laptop, and iPad.
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full py-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold hover:bg-rose-500/20 transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" aria-hidden />
                    SIGN OUT
                  </button>
                </div>
              ) : !otpSent ? (
                <div className="space-y-4">
                  <p className="text-zinc-400 text-xs">
                    Sign in to sync data across devices. Existing logs on this phone will be linked
                    automatically.
                  </p>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full py-3.5 rounded-2xl bg-white text-black font-mono font-bold text-xs flex items-center justify-center gap-2.5 active:scale-95 transition shadow-md"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    CONTINUE WITH GOOGLE
                  </button>

                  <div className="flex items-center gap-2 my-2 text-zinc-500 text-[11px]">
                    <div className="flex-1 h-px bg-white/5" />
                    <span>OR USE EMAIL CODE</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>

                  <form onSubmit={handleSendOtp} className="space-y-3">
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-base text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-3.5 rounded-2xl bg-[#CCFF00] text-black font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                    >
                      {authLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      ) : (
                        <Mail className="w-4 h-4" aria-hidden />
                      )}
                      SEND 6-DIGIT CODE
                    </button>
                  </form>
                </div>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <p className="text-zinc-400 text-xs">
                    Enter the 6-digit code sent to{' '}
                    <span className="text-white font-bold">{authEmail}</span>:
                  </p>
                  <input
                    type="text"
                    required
                    pattern="[0-9]*"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={6}
                    value={authOtp}
                    onChange={(e) => setAuthOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-center tracking-[0.4em] text-2xl font-bold text-white focus:outline-none focus:border-[#CCFF00]"
                  />
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3.5 rounded-2xl bg-[#CCFF00] text-black font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
                  >
                    {authLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="w-4 h-4 stroke-[3]" aria-hidden />
                    )}
                    VERIFY &amp; SYNC
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="w-full text-center text-zinc-400 hover:text-zinc-200 text-xs"
                  >
                    ← Back to email input
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}