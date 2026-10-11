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
  Volume2,
  VolumeX,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════
   1. PROCEDURAL WEB AUDIO SYNTHESIZER (ZERO-LATENCY TACTILE SOUND)
   ══════════════════════════════════════════════════════════════════════ */

class SyntheticHaptics {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  click(freq = 1800, duration = 0.008) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  subThud() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, this.ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.18);
  }
}

const audio = new SyntheticHaptics();

/* ══════════════════════════════════════════════════════════════════════
   2. SHADER-DRIVEN METABOLIC CORE (WEBGL CANVAS)
   ══════════════════════════════════════════════════════════════════════ */

const VS_SOURCE = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = (position + 1.0) * 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FS_SOURCE = `
  precision highp float;
  varying vec2 vUv;
  uniform float u_time;
  uniform float u_progress;
  uniform float u_over;
  uniform vec2 u_mouse;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    float dist = length(uv);
    
    vec2 mouseOffset = (u_mouse - 0.5) * 0.5;
    vec2 p = uv - mouseOffset;
    
    float angle = atan(p.y, p.x);
    float normAngle = (angle + 3.14159265) / (2.0 * 3.14159265);
    
    float n = noise(p * 2.8 + vec2(u_time * 0.4, -u_time * 0.2));
    float ringR = 0.68 + (n * 0.08);
    float ringThickness = 0.055;
    
    float ringMask = smoothstep(ringThickness, 0.0, abs(length(p) - ringR));
    float arcMask = step(normAngle, u_progress);
    if (u_progress >= 0.999) arcMask = 1.0;

    float innerGlow = smoothstep(ringR, 0.0, length(p)) * 0.22;
    
    vec3 baseColor = mix(vec3(0.8, 1.0, 0.0), vec3(0.98, 0.25, 0.35), u_over);
    vec3 glowColor = mix(vec3(0.4, 0.9, 0.1), vec3(0.9, 0.1, 0.2), u_over);
    
    vec3 col = baseColor * (ringMask * arcMask * 2.2);
    col += glowColor * innerGlow;
    col += vec3(0.08, 0.1, 0.09) * smoothstep(0.95, 0.0, dist);

    float alpha = clamp(ringMask * arcMask + innerGlow * 1.5, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

const MetabolicCoreGL = memo(function MetabolicCoreGL({
  eaten,
  target,
}: {
  eaten: number;
  target: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<[number, number]>([0.5, 0.5]);

  const progress = Math.min(eaten / (target || 1), 1.0);
  const isOver = eaten > target;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) return;

    const compileShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, VS_SOURCE));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, FS_SOURCE));
    gl.linkProgram(program);
    gl.useProgram(program);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'u_time');
    const uProgress = gl.getUniformLocation(program, 'u_progress');
    const uOver = gl.getUniformLocation(program, 'u_over');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');

    let animId: number;
    const start = performance.now();

    const render = (now: number) => {
      const elapsed = (now - start) * 0.001;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform1f(uTime, elapsed);
      gl.uniform1f(uProgress, progress);
      gl.uniform1f(uOver, isOver ? 1.0 : 0.0);
      gl.uniform2f(uMouse, mouseRef.current[0], mouseRef.current[1]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      gl.deleteProgram(program);
    };
  }, [progress, isOver]);

  return (
    <div
      className="relative flex items-center justify-center w-[160px] h-[160px] select-none shrink-0"
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseRef.current = [
          (e.clientX - rect.left) / rect.width,
          (e.clientY - rect.top) / rect.height,
        ];
      }}
    >
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="w-full h-full pointer-events-none drop-shadow-[0_0_24px_rgba(204,255,0,0.2)]"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className={`font-mono text-[9px] tracking-[0.25em] font-extrabold uppercase ${
            isOver ? 'text-rose-400' : 'text-[#CCFF00]'
          }`}
        >
          {isOver ? 'COMBUSTION' : 'RESERVE'}
        </span>
        <span className="font-black text-3xl tracking-tighter text-white tabular-nums leading-none mt-1">
          {Math.abs(Math.round(target - eaten))}
        </span>
        <span className="font-mono text-[10px] text-zinc-400 tracking-wider font-semibold mt-1">
          KCAL {isOver ? 'SURPLUS' : 'LEFT'}
        </span>
      </div>
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════════════
   CONSTANTS & TOKENS
   ══════════════════════════════════════════════════════════════════════ */

const SWIPE_REVEAL = 84;
const TOAST_MS = 4000;
const UNDO_MS = 5000;
const DEFAULT_WEIGHT = 95;
const DEFAULT_GOAL_WEIGHT = 78;

/* ══════════════════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════════════════ */

export interface FoodItem {
  id?: string;
  food_name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at?: string;
}

export interface ExerciseItem {
  id?: string;
  exercise_name: string;
  sets?: number;
  reps?: number;
  weight_kg?: number;
  cardio_minutes?: number;
  calories_burned?: number;
  created_at?: string;
}

export interface HistoricalRecord {
  weight: number;
  reps: number;
}

export interface UserProfile {
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
   METABOLIC FORMULAS (Mifflin-St Jeor)
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
   UTILITIES
   ══════════════════════════════════════════════════════════════════════ */

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

const sameDay = (a: Date, b: Date) => toDateKey(a) === toDateKey(b);

const haptic = (ms = 12) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }
};

const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

const byNewest = (a: { created_at?: string }, b: { created_at?: string }) =>
  (b.created_at ?? '').localeCompare(a.created_at ?? '');

function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID().slice(0, 16);
    } catch {
      /* fallback */
    }
  }
  let out = '';
  for (let i = 0; i < 16; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

const newGuestId = () => `usr_${safeUUID()}`;

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ══════════════════════════════════════════════════════════════════════
   MICRO COMPONENTS
   ══════════════════════════════════════════════════════════════════════ */

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
    <label className="flex items-baseline gap-1.5">
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
          setText(String(num(text, 0)));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = Number(raw);
          if (raw !== '' && Number.isFinite(n)) onChange(n);
        }}
        className={`${width} bg-white/[0.04] rounded-xl px-2.5 py-1.5 text-right font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CCFF00] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition`}
      />
      {suffix && <span className="font-mono text-[10px] text-zinc-400 font-semibold">{suffix}</span>}
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
    <div className="bg-[#111215] border border-white/[0.08] rounded-2xl p-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] focus-within:border-[#CCFF00]/60 transition">
      <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 block mb-1 font-bold">
        {label}
      </span>
      <div className="flex items-baseline justify-between">
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
          className="w-full bg-transparent text-lg font-mono font-black text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs font-mono text-zinc-400 shrink-0 font-bold ml-1">{unit}</span>
      </div>
    </div>
  );
});

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
      /* safe */
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
      setDx(Math.max(-SWIPE_REVEAL * 1.25, Math.min(0, base.current + ddx)));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* safe */
    }
    setDragging(false);
    if (lock.current === 'x') {
      const open = dx < -SWIPE_REVEAL / 2;
      setDx(open ? -SWIPE_REVEAL : 0);
      if (open) {
        haptic(15);
        audio.click(1400);
      }
    }
    lock.current = null;
  };

  return (
    <div className="relative overflow-hidden select-none bg-[#0B0C0E]">
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-rose-600 text-white font-mono font-bold text-xs"
        style={{ width: SWIPE_REVEAL }}
      >
        <Trash2 className="w-4 h-4" aria-hidden />
      </button>
      <div
        className="relative bg-[#0B0C0E]"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 240ms cubic-bezier(.16, 1, .3, 1)',
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

const MacroCard = memo(function MacroCard({
  label,
  val,
  target,
  accentHex,
}: {
  label: string;
  val: number;
  target: number;
  accentHex: string;
}) {
  const diff = Math.round(target - val);
  const isOver = diff < 0;
  const pct = Math.min((val / (target || 1)) * 100, 100);

  return (
    <div
      onClick={() => audio.click(2200)}
      className={`border rounded-2xl p-3.5 transition shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] active:scale-[0.97] cursor-pointer ${
        isOver ? 'bg-rose-500/[0.04] border-rose-500/30' : 'bg-[#111215] border-white/[0.08]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.16em] text-zinc-400 font-extrabold block">
          {label}
        </span>
        <span className="font-mono text-[9px] text-zinc-500 font-bold">{Math.round(pct)}%</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`font-black text-xl tabular-nums ${isOver ? 'text-rose-300' : 'text-white'}`}>
          {Math.round(val)}
        </span>
        <span className="font-mono text-[11px] text-zinc-400 font-medium">/{target}g</span>
      </div>
      <div className="h-1.5 mt-2.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : ''}`}
          style={{ width: `${pct}%`, backgroundColor: isOver ? undefined : accentHex }}
        />
      </div>
      <span
        className={`font-mono text-[10px] mt-2 block tabular-nums font-semibold tracking-tight ${
          isOver ? 'text-rose-400' : 'text-zinc-400'
        }`}
      >
        {isOver ? `${Math.abs(diff)}g excess` : `${diff}g left`}
      </span>
    </div>
  );
});

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
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.015] transition">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-bold text-white tracking-tight truncate">{item.food_name}</p>
            {lean && (
              <span className="shrink-0 font-mono text-[9px] bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] font-extrabold px-1.5 py-0.5 rounded tracking-wider">
                LEAN
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-zinc-400 mt-0.5 truncate font-medium">
            {item.quantity || '1 portion'}
            {time && ` · ${time}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-black text-sm text-white tabular-nums">
            {item.calories}
            <span className="font-mono text-[10px] text-zinc-400 ml-1 font-bold">KCAL</span>
          </p>
          <p className="font-mono text-[11px] mt-0.5 tracking-tight font-medium">
            <span className="text-sky-400 font-bold">{item.protein_g}P</span>{' '}
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
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.015] transition">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-bold text-white tracking-tight truncate">
              {item.exercise_name}
            </p>
            {isPR && (
              <span className="shrink-0 font-mono text-[9px] bg-amber-400/15 border border-amber-400/30 text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-1 font-extrabold tracking-wider">
                <Trophy className="w-2.5 h-2.5" aria-hidden /> PR
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-zinc-400 mt-0.5 font-medium">
            {item.cardio_minutes
              ? `${item.cardio_minutes}m steady-state cardio`
              : `${item.sets} sets × ${item.reps} reps @ ${item.weight_kg || 0}kg`}
            {!isPR && prior !== undefined && !item.cardio_minutes
              ? ` · PB: ${prior.weight}kg × ${prior.reps}`
              : ''}
          </p>
        </div>
        <p className="shrink-0 font-black text-sm text-sky-400 tabular-nums">
          -{item.calories_burned || 0}
          <span className="font-mono text-[10px] text-zinc-400 ml-1 font-bold">KCAL</span>
        </p>
      </div>
    </SwipeRow>
  );
});

/* ══════════════════════════════════════════════════════════════════════
   COMPOSER DOCK
   ══════════════════════════════════════════════════════════════════════ */

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
  >(function Composer({ parsing, pendingCount, onOpenReview, onSubmitText, onSubmitImage }, ref) {
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
      audio.click(1600);
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
        reader.readAsDataURL(file);
      },
      [onSubmitImage],
    );

    return (
      <div
        className="absolute inset-x-0 bottom-0 z-30 px-4 pt-6 bg-gradient-to-t from-[#0B0C0E] via-[#0B0C0E]/95 to-transparent pointer-events-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {pendingCount > 0 && (
          <div className="flex justify-center mb-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                onOpenReview();
                haptic();
                audio.click(2000);
              }}
              className="flex items-center gap-1.5 bg-[#CCFF00] text-black font-mono text-[11px] font-black tracking-wider px-4 py-1.5 rounded-full shadow-[0_0_24px_rgba(204,255,0,0.35)] active:scale-95 transition"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              {pendingCount} DRAFTED · TAP TO REVIEW
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

        <div className="bg-[#141518]/90 backdrop-blur-2xl border border-white/[0.12] rounded-full p-1.5 flex items-center gap-2 shadow-[0_16px_36px_rgba(0,0,0,0.7)] focus-within:border-[#CCFF00]/60 transition pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              haptic();
              audio.click(1800);
              fileRef.current?.click();
            }}
            disabled={parsing}
            aria-label="Scan food photo"
            className="p-3 text-zinc-300 bg-white/[0.05] hover:bg-white/10 rounded-full transition active:scale-90 disabled:opacity-40"
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
            placeholder="Log food, sets, or weigh-in..."
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent px-2 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={submit}
            disabled={parsing || !input.trim()}
            aria-label="Parse log entry"
            className="bg-[#CCFF00] text-black disabled:bg-white/5 disabled:text-zinc-600 rounded-full p-3 transition active:scale-90 font-bold shadow-[0_0_16px_rgba(204,255,0,0.25)]"
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
   PRIMARY IRONLOG APP
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
  const [soundEnabled, setSoundEnabled] = useState(true);

  /* ---------- Toast feedback ---------- */
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
      haptic(20);
      audio.click(900, 0.02);
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

  /* ---------- Auth ---------- */
  const [authEmail, setAuthEmail] = useState('');
  const [authOtp, setAuthOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  /* ---------- Profile & Dates ---------- */
  const [today, setToday] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [profile, setProfile] = useState<UserProfile>(() => EMPTY_PROFILE('', DEFAULT_WEIGHT));
  const [showSettings, setShowSettings] = useState(false);
  const [tempProfile, setTempProfile] = useState<UserProfile>(profile);
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  /* ---------- Draft Staging ---------- */
  const [draftFoods, setDraftFoods] = useState<FoodItem[]>([]);
  const [draftExercises, setDraftExercises] = useState<ExerciseItem[]>([]);
  const [draftWeight, setDraftWeight] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ---------- Committed Logs ---------- */
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

  /* ---------- Sound Toggle ---------- */
  const toggleSound = () => {
    const next = !soundEnabled;
    audio.enabled = next;
    setSoundEnabled(next);
    if (next) audio.click(2400);
  };

  /* ---------- Migration ---------- */
  const migrateGuestData = useCallback(async (guestId: string, authUid: string) => {
    if (!guestId || !authUid || guestId === authUid) return;
    try {
      await Promise.all([
        supabase.from('food_logs').update({ user_id: authUid }).eq('user_id', guestId),
        supabase.from('workout_logs').update({ user_id: authUid }).eq('user_id', guestId),
        supabase.from('weight_logs').update({ user_id: authUid }).eq('user_id', guestId),
      ]);
      localStorage.removeItem('ironlog_user_id');
    } catch (e) {
      console.error('Migration failed:', e);
    }
  }, []);

  /* ---------- Boot Lifecycle ---------- */
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

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [migrateGuestData]);

  /* ---------- Fetch Profile & Days ---------- */
  const fetchProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', uid).maybeSingle();

    if (data) {
      const p = data as UserProfile;
      setProfile(p);
      setTempProfile(p);
      setCurrentWeight(Number(p.weight_kg) || DEFAULT_WEIGHT);
      return;
    }

    const initial = EMPTY_PROFILE(uid, DEFAULT_WEIGHT);
    await supabase.from('user_profiles').insert(initial);
    setProfile(initial);
    setTempProfile(initial);
    setCurrentWeight(DEFAULT_WEIGHT);
  }, []);

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
        .limit(200),
    ]);

    if (id !== reqId.current) return;
    setLoadingDay(false);

    setDayFoods((foodsRes.data ?? []) as FoodItem[]);
    setDayExercises((workoutsRes.data ?? []) as ExerciseItem[]);

    const latest = weightRes.data?.[0]?.weight_kg;
    setCurrentWeight(
      latest != null ? Number(latest) : profileRef.current.start_weight_kg || DEFAULT_WEIGHT,
    );

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

  /* ---------- Intake Stats ---------- */
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

  const draftKcal = useMemo(
    () => draftFoods.reduce((a, c) => a + (c.calories || 0), 0),
    [draftFoods],
  );
  const draftProtein = useMemo(
    () => draftFoods.reduce((a, c) => a + (c.protein_g || 0), 0),
    [draftFoods],
  );
  const draftBurn = useMemo(
    () => draftExercises.reduce((a, c) => a + (c.calories_burned || 0), 0),
    [draftExercises],
  );

  /* ---------- Date Nav ---------- */
  const goToDay = useCallback(
    (d: Date) => {
      if (today && startOfDay(d) > startOfDay(today)) return;
      haptic();
      audio.click(1800);
      setSelectedDate(d);
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

  /* ---------- Parse Pipeline ---------- */
  const handleParse = useCallback(
    async (payload: { message?: string; imageBase64?: string; mimeType?: string }) => {
      if (!payload.message?.trim() && !payload.imageBase64) return;

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
          notify("Couldn't extract telemetry. Try rephrasing.", { tone: 'info' });
          return;
        }

        if (foods.length) setDraftFoods((d) => [...d, ...foods]);
        if (exercises.length) setDraftExercises((d) => [...d, ...exercises]);
        if (data.weight_kg != null) setDraftWeight(num(data.weight_kg, currentWeight));

        audio.subThud();
        setSheetOpen(true);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        notify('Parsing failed. Check connection.');
      } finally {
        if (parseAbort.current === controller) parseAbort.current = null;
        setParsing(false);
      }
    },
    [currentWeight, notify],
  );

  /* ---------- Commit Pipeline ---------- */
  const handleCommit = useCallback(async () => {
    if (!userId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    haptic(20);
    audio.subThud();

    const when = selectedDate ?? new Date();
    const ts = isToday
      ? new Date().toISOString()
      : new Date(new Date(when).setHours(12, 0, 0, 0)).toISOString();

    try {
      if (draftFoods.length > 0) {
        const { data, error } = await supabase
          .from('food_logs')
          .insert(
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
          )
          .select();
        if (error) throw error;
        if (data) setDayFoods((curr) => [...(data as FoodItem[]), ...curr]);
      }

      if (draftExercises.length > 0) {
        const { data, error } = await supabase
          .from('workout_logs')
          .insert(
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
          )
          .select();
        if (error) throw error;
        if (data) setDayExercises((curr) => [...(data as ExerciseItem[]), ...curr]);
      }

      if (draftWeight !== null && Number.isFinite(draftWeight)) {
        await supabase
          .from('weight_logs')
          .insert({ user_id: userId, weight_kg: draftWeight, created_at: ts });
        setCurrentWeight(draftWeight);
      }

      composerRef.current?.clear();
      setDraftFoods([]);
      setDraftExercises([]);
      setDraftWeight(null);
      setSheetOpen(false);
    } catch (err) {
      notify('Save failed: ' + ((err as Error)?.message ?? 'Unknown error'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [userId, selectedDate, isToday, draftFoods, draftExercises, draftWeight, notify]);

  /* ---------- Delete / Undo ---------- */
  const deleteFood = useCallback(
    async (item: FoodItem) => {
      if (!item.id) return;
      haptic(15);
      audio.click(800, 0.015);

      setDayFoods((d) => d.filter((x) => x.id !== item.id));
      const { error } = await supabase.from('food_logs').delete().eq('id', item.id);

      if (error) {
        setDayFoods((d) => [item, ...d].sort(byNewest));
        notify('Delete failed: ' + error.message);
        return;
      }

      notify(`Removed ${item.food_name}`, {
        tone: 'info',
        duration: UNDO_MS,
        action: {
          label: 'UNDO',
          onClick: async () => {
            dismissToast();
            audio.click(1800);
            const { error: e2 } = await supabase.from('food_logs').insert(item);
            if (!e2) setDayFoods((d) => [item, ...d.filter((x) => x.id !== item.id)].sort(byNewest));
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
      audio.click(800, 0.015);

      setDayExercises((d) => d.filter((x) => x.id !== item.id));
      const { error } = await supabase.from('workout_logs').delete().eq('id', item.id);

      if (error) {
        setDayExercises((d) => [item, ...d].sort(byNewest));
        notify('Delete failed: ' + error.message);
        return;
      }

      notify(`Removed ${item.exercise_name}`, {
        tone: 'info',
        duration: UNDO_MS,
        action: {
          label: 'UNDO',
          onClick: async () => {
            dismissToast();
            audio.click(1800);
            const { error: e2 } = await supabase.from('workout_logs').insert(item);
            if (!e2) setDayExercises((d) => [item, ...d.filter((x) => x.id !== item.id)].sort(byNewest));
          },
        },
      });
    },
    [dismissToast, notify],
  );

  /* ---------- Settings Profile Update ---------- */
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

    const prev = profile;
    setProfile(updated);
    setShowSettings(false);
    haptic(20);
    audio.subThud();

    const { error } = await supabase.from('user_profiles').upsert(updated);
    if (error) {
      setProfile(prev);
      notify('Failed to update protocol: ' + error.message);
    }
  }, [tempProfile, currentWeight, userId, profile, notify]);

  const weightDelta = Number(
    ((profile.start_weight_kg ?? DEFAULT_WEIGHT) - currentWeight).toFixed(1),
  );
  const toGoal = Number((currentWeight - (profile.goal_weight_kg ?? DEFAULT_GOAL_WEIGHT)).toFixed(1));

  const macros = useMemo(
    () => [
      { label: 'PROTEIN', val: protein, target: profile.target_protein, accentHex: '#38BDF8' },
      { label: 'CARBS', val: carbs, target: profile.target_carbs, accentHex: '#34D399' },
      { label: 'LIPIDS', val: fat, target: profile.target_fat, accentHex: '#FBBF24' },
    ],
    [protein, carbs, fat, profile.target_protein, profile.target_carbs, profile.target_fat],
  );

  if (!mounted || !selectedDate || !today) {
    return <div className="fixed inset-0 bg-[#08080A]" />;
  }

  const listEmpty = activeTab === 'meals' ? dayFoods.length === 0 : dayExercises.length === 0;

  return (
    <div className="fixed inset-0 bg-black flex justify-center overflow-hidden select-none">
      {/* ── Persistent Film Noise ───────────────────────────── */}
      <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.038]" aria-hidden>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      <div className="w-full max-w-md h-full flex flex-col relative overflow-hidden bg-[#08080A] text-zinc-300 font-sans border-x border-white/[0.05]">
        {/* ── Toast Alerts ─────────────────────────────────────── */}
        {toast && (
          <div
            className="absolute inset-x-4 z-[60]"
            style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
            role="status"
            aria-live="polite"
          >
            <div
              className={`flex items-start gap-3 backdrop-blur-2xl rounded-2xl px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.8)] border ${
                toast.tone === 'error'
                  ? 'bg-rose-950/80 border-rose-500/40 text-rose-100'
                  : 'bg-[#18191E]/90 border-white/[0.12] text-zinc-100'
              }`}
            >
              {toast.tone === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden />
              ) : (
                <Check className="w-4 h-4 text-[#CCFF00] shrink-0 mt-0.5" aria-hidden />
              )}
              <p className="text-xs font-medium leading-snug flex-1">{toast.message}</p>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="shrink-0 flex items-center gap-1 font-mono text-[11px] font-black text-[#CCFF00] hover:underline"
                >
                  <Undo2 className="w-3 h-3" aria-hidden />
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={dismissToast}
                aria-label="Dismiss"
                className="shrink-0 text-zinc-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── App Header ───────────────────────────────────────── */}
        <header
          className="shrink-0 px-6 pb-3 pt-3 flex items-center justify-between border-b border-white/[0.04]"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-[0.25em] text-[#CCFF00] font-black uppercase">
                [SYS:NOMINAL]
              </span>
              <span className="font-mono text-[9px] text-zinc-600 font-bold">REV_09.4</span>
            </div>
            <h1 className="font-black text-2xl tracking-tighter text-white mt-0.5">
              IRONLOG<span className="text-[#CCFF00]">.</span>OS
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              aria-label="Toggle Sound"
              className="p-2.5 rounded-full bg-[#111215] border border-white/[0.08] text-zinc-400 hover:text-white transition active:scale-90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-[#CCFF00]" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                audio.click(1900);
                setTempProfile(profile);
                setShowSettings(true);
              }}
              aria-label="Biometrics profile"
              className="p-2.5 rounded-full bg-[#111215] border border-white/[0.08] text-zinc-400 hover:text-white transition active:scale-90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
            >
              <Sliders className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </header>

        {/* ── Week Carousel Ribbon ─────────────────────────────── */}
        <nav className="shrink-0 px-5 py-2.5 grid grid-cols-7 gap-1.5 border-b border-white/[0.04]" aria-label="Timeline ribbon">
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
                    ? 'bg-[#CCFF00] text-black shadow-[0_4px_16px_rgba(204,255,0,0.25)] font-black'
                    : 'text-zinc-400 hover:text-white bg-white/[0.02]'
                } ${future ? 'opacity-25 cursor-not-allowed' : ''}`}
              >
                <span className="font-mono text-[10px] tracking-wider font-bold">{'MTWTFSS'[i]}</span>
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

        {/* ── Scrollable Kinetic Viewport ──────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-44 px-5 space-y-4 pt-4 [-webkit-overflow-scrolling:touch]">
          {/* Asymmetric WebGL Core + Telemetry */}
          <div className="bg-[#0F1013] border border-white/[0.08] rounded-3xl p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] flex items-center justify-between">
            <MetabolicCoreGL eaten={eaten} target={profile.target_calories} />
            <div className="flex flex-col gap-2 flex-1 pl-3 min-w-0">
              <div className="bg-[#141518] border border-white/[0.06] rounded-xl px-3 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 font-extrabold block">
                  INTAKE
                </span>
                <span className="font-mono text-sm font-black text-white tabular-nums">{eaten} KCAL</span>
              </div>
              <div className="bg-[#141518] border border-white/[0.06] rounded-xl px-3 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 font-extrabold block">
                  BURNED
                </span>
                <span className="font-mono text-sm font-black text-sky-400 tabular-nums">
                  {burned > 0 ? `-${burned}` : '0'} KCAL
                </span>
              </div>
              <div className="bg-[#141518] border border-white/[0.06] rounded-xl px-3 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 font-extrabold block">
                  SCALE TARGET
                </span>
                <span className="font-mono text-sm font-black text-[#CCFF00] tabular-nums">
                  {currentWeight.toFixed(1)} / {profile.goal_weight_kg} KG
                </span>
              </div>
            </div>
          </div>

          {/* Macro Split Deck */}
          <div className="grid grid-cols-3 gap-2">
            {macros.map((m) => (
              <MacroCard key={m.label} {...m} />
            ))}
          </div>

          {/* Tabs & Feed Logs */}
          <div className="space-y-3">
            <div className="sticky top-0 z-10 bg-[#08080A]/95 backdrop-blur-md py-1 border-b border-white/[0.04]">
              <div className="grid grid-cols-2 gap-1 bg-[#111215] p-1 rounded-xl border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    audio.click(2000);
                    setActiveTab('meals');
                  }}
                  className={`font-mono text-xs font-black py-2 rounded-lg transition active:scale-95 ${
                    activeTab === 'meals'
                      ? 'bg-[#CCFF00] text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  NUTRITION ({dayFoods.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audio.click(2000);
                    setActiveTab('workouts');
                  }}
                  className={`font-mono text-xs font-black py-2 rounded-lg transition active:scale-95 ${
                    activeTab === 'workouts'
                      ? 'bg-[#CCFF00] text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  TRAINING ({dayExercises.length})
                </button>
              </div>
            </div>

            {loadingDay && listEmpty ? (
              <div className="py-4 space-y-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white/[0.02] animate-pulse" />
                ))}
              </div>
            ) : listEmpty ? (
              <div className="my-6 py-12 text-center border border-dashed border-white/[0.08] rounded-3xl">
                <p className="font-mono text-xs text-zinc-400 uppercase tracking-widest font-bold">
                  {isToday ? 'No records registered today' : 'No logs for this date'}
                </p>
                <p className="font-mono text-[11px] text-zinc-500 mt-1.5">
                  Type or snap a meal/workout in the composer below
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
              <p className="font-mono text-[10px] text-zinc-500 text-center py-2 tracking-wider uppercase">
                ← Swipe left to delete an item
              </p>
            )}
          </div>
        </div>

        {/* ── Fixed Composer Dock ──────────────────────────────── */}
        <Composer
          ref={composerRef}
          parsing={parsing}
          pendingCount={pendingCount}
          onOpenReview={() => setSheetOpen(true)}
          onSubmitText={(text) => void handleParse({ message: text })}
          onSubmitImage={(b64, mime) => void handleParse({ imageBase64: b64, mimeType: mime })}
        />

        {/* ── Staging & Review Drawer ───────────────────────────── */}
        {sheetOpen && (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md"
              onClick={() => setSheetOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-label="Review Staged Logs"
              className="absolute inset-x-0 bottom-0 z-50 bg-[#141518] border-t border-white/[0.12] rounded-t-[32px] flex flex-col max-h-[88dvh] shadow-2xl"
            >
              <div className="shrink-0 px-6 pt-3 pb-3 border-b border-white/[0.06]">
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#CCFF00]" aria-hidden />
                    <span className="font-black text-lg tracking-tight text-white uppercase">
                      Review Staged Entry
                    </span>
                  </div>
                  <div className="font-mono text-xs text-right">
                    {draftFoods.length > 0 && (
                      <span className="text-[#CCFF00] font-bold mr-2">+{draftKcal} kcal</span>
                    )}
                    {draftExercises.length > 0 && (
                      <span className="text-sky-400 font-bold">-{draftBurn} kcal</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 pb-6">
                {draftWeight !== null && (
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.02] p-4 border border-white/[0.06]">
                    <span className="font-mono text-xs text-zinc-300 flex items-center gap-2 font-bold">
                      <Scale className="w-4 h-4 text-[#CCFF00]" aria-hidden /> SCALE WEIGH-IN
                    </span>
                    <NumField
                      value={draftWeight}
                      onChange={setDraftWeight}
                      suffix="KG"
                      decimal
                      width="w-20"
                    />
                  </div>
                )}

                {draftFoods.map((f, i) => (
                  <div key={i} className="rounded-2xl bg-white/[0.02] p-4 border border-white/[0.06]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{f.food_name}</p>
                        <p className="font-mono text-[11px] text-zinc-400">{f.quantity || '1 serving'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          audio.click(1000);
                          setDraftFoods((d) => d.filter((_, j) => j !== i));
                        }}
                        className="p-1 text-zinc-400 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div>
                        <span className="font-mono text-[10px] text-[#CCFF00] block mb-1 font-bold">
                          KCAL
                        </span>
                        <NumField
                          value={f.calories}
                          onChange={(v) =>
                            setDraftFoods((d) => d.map((x, j) => (j === i ? { ...x, calories: v } : x)))
                          }
                          width="w-full"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-sky-400 block mb-1 font-bold">
                          PRO
                        </span>
                        <NumField
                          value={f.protein_g}
                          onChange={(v) =>
                            setDraftFoods((d) => d.map((x, j) => (j === i ? { ...x, protein_g: v } : x)))
                          }
                          decimal
                          width="w-full"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-emerald-400 block mb-1 font-bold">
                          CARB
                        </span>
                        <NumField
                          value={f.carbs_g}
                          onChange={(v) =>
                            setDraftFoods((d) => d.map((x, j) => (j === i ? { ...x, carbs_g: v } : x)))
                          }
                          decimal
                          width="w-full"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-amber-400 block mb-1 font-bold">
                          FAT
                        </span>
                        <NumField
                          value={f.fat_g}
                          onChange={(v) =>
                            setDraftFoods((d) => d.map((x, j) => (j === i ? { ...x, fat_g: v } : x)))
                          }
                          decimal
                          width="w-full"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {draftExercises.map((e, i) => (
                  <div key={i} className="rounded-2xl bg-white/[0.02] p-4 border border-white/[0.06]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-white">{e.exercise_name}</p>
                      <button
                        type="button"
                        onClick={() => {
                          audio.click(1000);
                          setDraftExercises((d) => d.filter((_, j) => j !== i));
                        }}
                        className="p-1 text-zinc-400 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {e.cardio_minutes ? (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div>
                          <span className="font-mono text-[10px] text-zinc-400 block mb-1 font-bold">
                            MINUTES
                          </span>
                          <NumField
                            value={e.cardio_minutes}
                            onChange={(v) =>
                              setDraftExercises((d) =>
                                d.map((x, j) => (j === i ? { ...x, cardio_minutes: v } : x)),
                              )
                            }
                            width="w-full"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-[10px] text-sky-400 block mb-1 font-bold">
                            BURN (KCAL)
                          </span>
                          <NumField
                            value={e.calories_burned || 0}
                            onChange={(v) =>
                              setDraftExercises((d) =>
                                d.map((x, j) => (j === i ? { ...x, calories_burned: v } : x)),
                              )
                            }
                            width="w-full"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        <div>
                          <span className="font-mono text-[10px] text-zinc-400 block mb-1 font-bold">
                            SETS
                          </span>
                          <NumField
                            value={e.sets || 0}
                            onChange={(v) =>
                              setDraftExercises((d) =>
                                d.map((x, j) => (j === i ? { ...x, sets: v } : x)),
                              )
                            }
                            width="w-full"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-[10px] text-zinc-400 block mb-1 font-bold">
                            REPS
                          </span>
                          <NumField
                            value={e.reps || 0}
                            onChange={(v) =>
                              setDraftExercises((d) =>
                                d.map((x, j) => (j === i ? { ...x, reps: v } : x)),
                              )
                            }
                            width="w-full"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-[10px] text-zinc-400 block mb-1 font-bold">
                            KG
                          </span>
                          <NumField
                            value={e.weight_kg || 0}
                            onChange={(v) =>
                              setDraftExercises((d) =>
                                d.map((x, j) => (j === i ? { ...x, weight_kg: v } : x)),
                              )
                            }
                            decimal
                            width="w-full"
                          />
                        </div>
                        <div>
                          <span className="font-mono text-[10px] text-sky-400 block mb-1 font-bold">
                            BURN
                          </span>
                          <NumField
                            value={e.calories_burned || 0}
                            onChange={(v) =>
                              setDraftExercises((d) =>
                                d.map((x, j) => (j === i ? { ...x, calories_burned: v } : x)),
                              )
                            }
                            width="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div
                className="shrink-0 px-6 pt-3 flex gap-3 border-t border-white/[0.08] bg-[#141518]"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    audio.click(1200);
                    setSheetOpen(false);
                  }}
                  className="flex-1 py-3.5 rounded-full font-mono font-bold text-xs bg-white/[0.04] text-zinc-300 hover:text-white transition"
                >
                  DISCARD
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={saving}
                  className="flex-[2] py-3.5 rounded-full font-mono font-black text-xs bg-[#CCFF00] text-black flex items-center justify-center gap-2 active:scale-95 transition shadow-lg shadow-[#CCFF00]/20"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="w-4 h-4 stroke-[3]" aria-hidden />
                  )}
                  COMMIT TO DATABASE
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Biometric Protocol Drawer ────────────────────────── */}
        {showSettings && (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md"
              onClick={() => setShowSettings(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-label="Biometrics & Targets"
              className="absolute inset-x-0 bottom-0 z-50 bg-[#141518] border-t border-white/[0.12] rounded-t-[32px] max-h-[92dvh] flex flex-col shadow-2xl"
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-1" />
              <div className="shrink-0 px-6 pt-3 pb-4 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <h3 className="font-mono text-sm font-black tracking-wider text-white uppercase">
                    Metabolic Telemetry
                  </h3>
                  <p className="font-mono text-[10px] text-zinc-400">
                    Calculated via Mifflin-St Jeor Engine
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    audio.click(1400);
                    setShowSettings(false);
                  }}
                  className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 pb-28">
                {/* Account row */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-[#CCFF00]" aria-hidden />
                    <div>
                      <span className="text-white text-xs font-bold block">
                        {sessionUser?.email ?? 'Guest Session (Local Device)'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      audio.click(1800);
                      setShowSettings(false);
                      setShowAuthModal(true);
                    }}
                    className="bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] font-mono font-bold text-[10px] px-3 py-1.5 rounded-xl"
                  >
                    {sessionUser ? 'MANAGE' : 'CLOUD SYNC'}
                  </button>
                </div>

                {/* Biometrics */}
                <div className="grid grid-cols-2 gap-3">
                  <ProtocolField
                    label="Age"
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
                    label="Start Weight"
                    value={tempProfile.start_weight_kg}
                    unit="kg"
                    step="0.1"
                    onChange={(v) => setTempProfile((p) => ({ ...p, start_weight_kg: v }))}
                  />
                  <ProtocolField
                    label="Goal Target"
                    value={tempProfile.goal_weight_kg}
                    unit="kg"
                    step="0.1"
                    onChange={(v) => setTempProfile((p) => ({ ...p, goal_weight_kg: v }))}
                  />
                </div>

                {/* Goal Selector */}
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block mb-2 font-bold">
                    Target Protocol
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
                          audio.click(1800);
                          setTempProfile((p) => ({ ...p, goal: opt.id }));
                          haptic();
                        }}
                        className={`p-3 rounded-2xl border text-left transition font-mono ${
                          tempProfile.goal === opt.id
                            ? 'border-[#CCFF00] bg-[#CCFF00]/10 text-white'
                            : 'border-white/[0.06] bg-white/[0.02] text-zinc-400'
                        }`}
                      >
                        <span className="text-xs font-bold block text-white">{opt.label}</span>
                        <span className="text-[10px] mt-0.5 block text-zinc-400">{opt.delta}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="shrink-0 p-5 border-t border-white/[0.08] bg-[#141518]"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
              >
                <button
                  type="button"
                  onClick={saveProfile}
                  className="w-full py-4 rounded-full bg-[#CCFF00] text-black font-mono font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#CCFF00]/20 active:scale-95 transition"
                >
                  <Check className="w-4 h-4 stroke-[3]" aria-hidden />
                  APPLY RECALCULATED TARGETS
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Auth Modal ───────────────────────────────────────── */}
        {showAuthModal && (
          <>
            <div
              className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md"
              onClick={() => setShowAuthModal(false)}
              aria-hidden
            />
            <div
              role="dialog"
              className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#141518] border border-white/[0.12] rounded-3xl p-6 shadow-2xl font-mono text-xs max-w-sm mx-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
                <span className="text-sm font-black text-white uppercase tracking-wider">
                  {sessionUser ? 'Account Sync' : 'Sign In'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {sessionUser ? (
                <div className="space-y-4">
                  <p className="text-zinc-400 text-xs">Logged in as {sessionUser.email}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      audio.click(1200);
                      await supabase.auth.signOut();
                      setShowAuthModal(false);
                    }}
                    className="w-full py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold"
                  >
                    SIGN OUT
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={async () => {
                      audio.click(2000);
                      await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: window.location.origin },
                      });
                    }}
                    className="w-full py-3 rounded-2xl bg-white text-black font-bold flex items-center justify-center gap-2"
                  >
                    CONTINUE WITH GOOGLE
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}