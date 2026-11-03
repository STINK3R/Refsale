import { useState } from 'react';
import { ArrowRight, Check, Loader2, Percent, X } from 'lucide-react';
import { useNotificationStore, usePromoStore } from '../../store';

/**
 * Promo word input.
 * - "pill": the big plate under the category photo, in the dock that follows
 *   the visitor down the page, on the favourites page;
 * - "line": an underlined field;
 * - "box": the compact framed version for the cart.
 * Once a code works, every price it covers switches to было/стало. Several
 * codes can be on, one per category: the applied ones sit under the field as
 * chips, and the field stays open for the next one.
 * `floatingError` lays the error line over the space under the field instead
 * of adding a line, so the hero card does not grow when a code is wrong.
 */
export default function PromoForm({ variant = 'box', onApplied, floatingError = false }: {
  variant?: 'line' | 'box' | 'pill'; onApplied?: () => void; floatingError?: boolean;
}) {
  const { codes, checking, apply, remove } = usePromoStore();
  const show = useNotificationStore((s) => s.show);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const line = variant === 'line';
  const pill = variant === 'pill';
  const more = codes.length > 0;
  const placeholder = more ? 'Ещё промокод' : pill ? 'Реферальный промокод' : line ? 'Введите промокод' : 'Промокод';

  const submit = async () => {
    setError('');
    const res = await apply(value);
    if (!res.ok) { setError(res.error || 'Промокод не найден'); return; }
    setValue('');
    const { scopeText: scope, code } = usePromoStore.getState();
    show(res.replaced
      ? `Промокод ${code} заменил ${res.replaced}${scope ? ` — скидка ${scope}` : ''}`
      : scope ? `Промокод применён — скидка ${scope}` : 'Промокод применён — цены обновлены');
    onApplied?.();
  };

  // The codes on, each with its own «убрать»
  const applied = more && (
    <ul className={`flex flex-wrap gap-1.5 ${pill ? 'mt-2.5' : 'mt-2'}`} aria-label="Применённые промокоды">
      {codes.map((c) => (
        <li key={c.code} className="max-w-full">
          <span
            className="inline-flex items-center max-w-full gap-1.5 h-8 pl-1 pr-1 rounded-full bg-primary text-white border-2 border-ink text-[12px] font-bold"
            title={c.label || (c.leaderName ? `от ${c.leaderName}` : '')}
          >
            <span className="w-5 h-5 shrink-0 rounded-full bg-sun text-ink grid place-items-center"><Check size={12} strokeWidth={3} /></span>
            <span className="tracking-[0.06em] shrink-0">{c.code}</span>
            <span className="font-semibold text-white/80 truncate">{c.scopeText ? c.scopeText.replace(/^на /, '') : 'весь каталог'}</span>
            <button
              type="button"
              onClick={() => { remove(c.code); show(`Промокод ${c.code} убран`); }}
              className="w-6 h-6 shrink-0 rounded-full grid place-items-center hover:bg-white/20 cursor-pointer"
              aria-label={`Убрать промокод ${c.code}`}
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );

  if (pill) {
    return (
      <div className="relative">
        <form
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
          className={`flex items-center gap-2 h-14 max-sm:h-12 pl-2 pr-1.5 rounded-ctl-lg max-sm:rounded-ctl-md bg-card border-2 shadow-[0_4px_0_#111] ${error ? 'border-danger' : 'border-ink'}`}
        >
          <span className="w-10 h-10 max-sm:w-8 max-sm:h-8 rounded-ctl-sm max-sm:rounded-[10px] bg-primary text-white flex items-center justify-center shrink-0" aria-hidden="true">
            <Percent size={18} strokeWidth={2.4} />
          </span>
          <input
            value={value}
            onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(''); }}
            placeholder={placeholder}
            aria-label="Промокод"
            autoCapitalize="characters"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent border-none text-ink font-bold uppercase tracking-[0.1em] placeholder:normal-case placeholder:tracking-normal placeholder:font-semibold placeholder:text-ink/55 text-[16px] max-sm:text-[15px]"
          />
          <button
            type="submit"
            disabled={checking || !value.trim()}
            aria-label="Применить промокод"
            className="h-11 max-sm:h-9 px-5 max-sm:px-3.5 rounded-ctl max-sm:rounded-ctl-sm bg-ink text-sun text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-default shrink-0"
          >
            {checking ? <Loader2 size={16} className="animate-spin" /> : <><span className="max-sm:hidden">Применить</span><ArrowRight size={16} strokeWidth={2.2} /></>}
          </button>
        </form>
        {error && (
          <div role="alert" className={`pl-4 text-[13px] font-semibold text-danger ${floatingError && !more ? 'absolute inset-x-0 top-full mt-2 truncate' : 'mt-2'}`}>
            {error}
          </div>
        )}
        {applied}
      </div>
    );
  }

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className={`flex items-center gap-4 transition-colors ${line
          ? `border-b-2 ${error ? 'border-danger/70' : 'border-line focus-within:border-text'}`
          : `h-12 pl-5 pr-1 rounded-ctl bg-card border-2 ${error ? 'border-danger/70' : 'border-line focus-within:border-ink'}`}`}
      >
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(''); }}
          placeholder={placeholder}
          aria-label="Промокод"
          autoCapitalize="characters"
          spellCheck={false}
          className={`flex-1 min-w-0 bg-transparent border-none text-text font-semibold uppercase tracking-[0.12em] placeholder:normal-case placeholder:tracking-normal placeholder:font-normal placeholder:text-light ${line ? 'text-[17px] py-4' : 'text-[14px] py-2'}`}
        />
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] cursor-pointer disabled:cursor-default transition-colors ${line ? 'text-text disabled:text-light' : 'h-9 px-4 rounded-ctl-xs bg-ink text-sun disabled:opacity-50'}`}
        >
          {checking ? <Loader2 size={15} className="animate-spin" /> : <>Применить <ArrowRight size={14} strokeWidth={2} /></>}
        </button>
      </form>
      {error && <div className={`mt-2 text-[12px] text-danger ${line ? '' : 'pl-4'}`}>{error}</div>}
      {applied}
    </div>
  );
}
