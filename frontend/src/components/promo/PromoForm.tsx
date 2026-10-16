import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { useNotificationStore, usePromoStore } from '../../store';

/**
 * Promo word input. "line" sits in the hero as an underlined field; "box" is
 * the compact framed version for the floating bar and the cart. Once a code
 * works, every price on the site switches to было/стало.
 */
export default function PromoForm({ variant = 'box', onApplied }: { variant?: 'line' | 'box'; onApplied?: () => void }) {
  const { code, leaderName, label, checking, apply, clear } = usePromoStore();
  const show = useNotificationStore((s) => s.show);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const line = variant === 'line';

  const submit = async () => {
    setError('');
    const res = await apply(value);
    if (!res.ok) { setError(res.error || 'Промокод не найден'); return; }
    setValue('');
    show('Промокод применён — цены обновлены');
    onApplied?.();
  };

  if (code) {
    const from = label || (leaderName ? `от ${leaderName}` : '');
    return (
      <div className={`flex items-center gap-4 ${line ? 'py-4 border-b border-line' : 'h-12 px-4 border border-line'}`}>
        <Check size={line ? 18 : 15} strokeWidth={1.6} className="text-primary shrink-0" />
        <div className="min-w-0 flex-1 leading-snug">
          <div className={`${line ? 'text-[15px]' : 'text-[13px]'} text-text truncate`}>
            Промокод <span className="tracking-[0.12em] text-primary">{code}</span> применён
          </div>
          {line && <div className="text-[13px] text-muted truncate">{from ? `${from} · ` : ''}цены со скидкой на всём сайте</div>}
        </div>
        <button
          onClick={() => { clear(); show('Промокод сброшен'); }}
          className="label !text-[10px] hover:!text-text transition-colors cursor-pointer shrink-0"
        >
          Убрать
        </button>
      </div>
    );
  }

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className={`flex items-center gap-4 transition-colors ${line
          ? `border-b ${error ? 'border-danger/70' : 'border-line focus-within:border-text'}`
          : `h-12 pl-4 pr-1 border ${error ? 'border-danger/70' : 'border-line focus-within:border-text'}`}`}
      >
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(''); }}
          placeholder={line ? 'Введите промокод' : 'Промокод'}
          aria-label="Промокод"
          autoCapitalize="characters"
          spellCheck={false}
          className={`flex-1 min-w-0 bg-transparent border-none text-text uppercase tracking-[0.14em] placeholder:normal-case placeholder:tracking-normal placeholder:text-light ${line ? 'text-[17px] py-4' : 'text-[14px] py-2'}`}
        />
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text disabled:text-light transition-colors cursor-pointer disabled:cursor-default ${line ? '' : 'h-10 px-3'}`}
        >
          {checking ? <Loader2 size={15} className="animate-spin" /> : <>Применить <ArrowRight size={14} strokeWidth={1.5} /></>}
        </button>
      </form>
      {error && <div className={`mt-2 text-[12px] text-danger ${line ? '' : 'pl-1'}`}>{error}</div>}
    </div>
  );
}
