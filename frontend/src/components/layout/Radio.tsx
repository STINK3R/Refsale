import { useRef } from 'react';
import { Loader2, Pause, Play, Volume2 } from 'lucide-react';
import { RADIO, useRadioStore } from '../../store/radio';

/** Bars that dance while the radio plays: the music "waves". */
export function RadioBars({ className = '', count = 3 }: { className?: string; count?: number }) {
  return (
    <span className={`inline-flex items-end gap-[2px] h-3.5 ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="radio-bar w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

/**
 * Volume, upright on the card's right edge: drag or tap anywhere on it, or use
 * the arrow keys. A drawn track and fill, so it reads the same in every
 * browser (the native range input's track was nearly invisible).
 */
function VolumeSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const setFrom = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onChange(Math.round(Math.min(1, Math.max(0, (r.bottom - clientY) / r.height)) * 20) / 20);
  };
  return (
    <div className={`flex flex-col items-center gap-1.5 shrink-0 ${disabled ? 'opacity-35' : ''}`}>
      <div
        ref={ref}
        role="slider"
        aria-label="Громкость"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); setFrom(e.clientY); }}
        onPointerMove={(e) => { if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) setFrom(e.clientY); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(1, value + 0.05)); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(0, value - 0.05)); }
        }}
        className={`relative w-7 h-[76px] flex justify-center touch-none ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <span className="absolute inset-y-0 w-[6px] rounded-full bg-ink/15" />
        <span className="absolute bottom-0 w-[6px] rounded-full bg-ink" style={{ height: `${value * 100}%` }} />
        <span
          className="absolute w-[18px] h-[18px] -translate-y-1/2 rounded-full bg-sun border-2 border-ink shadow-[0_2px_0_#111]"
          style={{ top: `${(1 - value) * 100}%` }}
        />
      </div>
      <Volume2 size={14} className="text-muted" aria-hidden="true" />
    </div>
  );
}

/** The radio card in the menu, under the meerkat. */
export default function RadioCard() {
  const { playing, loading, error, volume, toggle, setVolume } = useRadioStore();
  const on = playing || loading;
  return (
    <div className="rounded-[20px] border-2 border-ink bg-card p-4 flex items-center gap-3">
      <button
        onClick={toggle}
        className={`w-12 h-12 shrink-0 rounded-ctl border-2 border-ink flex items-center justify-center cursor-pointer transition-colors ${on ? 'bg-ink text-sun' : 'bg-sun text-ink hover:bg-ink hover:text-sun'}`}
        aria-label={on ? 'Выключить радио' : 'Включить радио'}
        aria-pressed={on}
      >
        {loading ? <Loader2 size={20} className="animate-spin" /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="label !text-[10px] flex items-center gap-2">
          Радио {playing && <RadioBars className="text-primary" count={4} />}
        </div>
        <div className="text-[15px] font-bold text-ink truncate mt-0.5">{RADIO.title}</div>
        {loading ? (
          <div className="text-[12px] font-semibold text-primary-dark flex items-center gap-1.5" role="status">
            Подключаемся к эфиру <span className="loader-dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
        ) : error ? (
          <div className="text-[12px] font-semibold text-danger leading-snug">{error}</div>
        ) : (
          <div className="text-[12px] text-muted truncate">{playing ? `${RADIO.station} · в эфире` : RADIO.station}</div>
        )}
      </div>
      <VolumeSlider value={volume} onChange={setVolume} disabled={!on} />
    </div>
  );
}
