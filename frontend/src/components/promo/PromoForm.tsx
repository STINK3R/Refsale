import { useState } from 'react';
import { ArrowRight, BadgePercent, Check, Loader2, X } from 'lucide-react';
import { useNotificationStore, usePromoStore } from '../../store';

/**
 * Promo word input. Used in the hero ("плашка в центре") and in the floating
 * bar that follows the visitor down the page. Once a code works, every price
 * on the site switches to было/стало.
 */
export default function PromoForm({ size = 'lg', onApplied }: { size?: 'lg' | 'sm'; onApplied?: () => void }) {
  const { code, leaderName, label, checking, apply, clear } = usePromoStore();
  const show = useNotificationStore((s) => s.show);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const lg = size === 'lg';

  const submit = async () => {
    setError('');
    const res = await apply(value);
    if (!res.ok) { setError(res.error || 'Промокод не найден'); return; }
    setValue('');
    show('Промокод применён — цены обновлены', 'success');
    onApplied?.();
  };

  if (code) {
    return (
      <div className={`flex items-center gap-3 ${lg ? 'p-2 pl-4' : 'p-1.5 pl-3'} rounded-full bg-primary/10 border border-primary/35`}>
        <span className={`shrink-0 rounded-full bg-gradient-to-br from-primary-light to-primary-dark text-ink flex items-center justify-center ${lg ? 'w-9 h-9' : 'w-7 h-7'}`}>
          <Check size={lg ? 18 : 14} strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className={`${lg ? 'text-[15px]' : 'text-[13px]'} font-bold text-text truncate`}>
            Промокод <span className="text-primary-light tracking-wide">{code}</span> активен
          </div>
          <div className={`${lg ? 'text-[12px]' : 'text-[11px]'} text-muted truncate`}>
            {label ? `${label} · ` : leaderName ? `от ${leaderName} · ` : ''}цены со скидкой на всём сайте
          </div>
        </div>
        <button
          onClick={() => { clear(); show('Промокод сброшен'); }}
          className={`shrink-0 rounded-full text-muted hover:text-text hover:bg-white/10 flex items-center justify-center cursor-pointer ${lg ? 'w-9 h-9' : 'w-7 h-7'}`}
          title="Убрать промокод"
          aria-label="Убрать промокод"
        >
          <X size={lg ? 16 : 14} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className={`flex items-center gap-2 rounded-full bg-black/35 border ${error ? 'border-danger/60' : 'border-white/12'} focus-within:border-primary/60 transition-colors ${lg ? 'p-1.5 pl-5' : 'p-1 pl-3.5'}`}
      >
        <BadgePercent size={lg ? 20 : 16} className="text-primary shrink-0" />
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(''); }}
          placeholder={lg ? 'Промокод от блогера' : 'Промокод'}
          aria-label="Промокод"
          autoCapitalize="characters"
          spellCheck={false}
          className={`flex-1 min-w-0 bg-transparent border-none focus:!shadow-none outline-none text-text uppercase tracking-[0.12em] font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:font-normal ${lg ? 'text-[16px] py-2' : 'text-[14px] py-1.5'}`}
        />
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className={`btn-gold rounded-full shrink-0 ${lg ? 'h-11 px-6 text-[14px]' : 'h-8 px-3.5 text-[12px]'}`}
        >
          {checking ? <Loader2 size={16} className="animate-spin" /> : lg ? <>Применить <ArrowRight size={16} /></> : <ArrowRight size={15} />}
        </button>
      </form>
      {error && <div className={`mt-2 ${lg ? 'text-[13px] pl-5' : 'text-[11px] pl-3.5'} text-danger`}>{error}</div>}
    </div>
  );
}
