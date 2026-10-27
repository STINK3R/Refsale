import { useState } from 'react';
import { ArrowRight, Check, Loader2, Percent, Plus } from 'lucide-react';
import { useNotificationStore, usePromoStore } from '../../store';

/**
 * Promo word input.
 * - "pill": the big yellow plate under the category photo and in the dock that
 *   follows the visitor down the page;
 * - "line": an underlined field;
 * - "box": the compact framed version for the cart and favourites.
 * Once a code works, every price it covers switches to было/стало. Several
 * codes can be on, one per category: "Ещё" opens the field for the next one.
 * `floatingError` lays the error line over the space under the field instead
 * of adding a line, so the hero card does not grow when a code is wrong.
 */
export default function PromoForm({ variant = 'box', onApplied, floatingError = false }: {
  variant?: 'line' | 'box' | 'pill'; onApplied?: () => void; floatingError?: boolean;
}) {
  const { codes, checking, apply, remove, clear } = usePromoStore();
  const show = useNotificationStore((s) => s.show);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  // With codes on, the field opens on request: another code is for another category
  const [adding, setAdding] = useState(false);
  const line = variant === 'line';
  const pill = variant === 'pill';

  const submit = async () => {
    setError('');
    const res = await apply(value);
    if (!res.ok) { setError(res.error || 'Промокод не найден'); return; }
    setValue('');
    setAdding(false);
    const { scopeText: scope, code } = usePromoStore.getState();
    show(res.replaced
      ? `Промокод ${code} заменил ${res.replaced}${scope ? ` — скидка ${scope}` : ''}`
      : scope ? `Промокод применён — скидка ${scope}` : 'Промокод применён — цены обновлены');
    onApplied?.();
  };

  if (codes.length && !adding) {
    const one = codes.length === 1 ? codes[0] : null;
    if (pill) {
      const from = one ? one.label || (one.leaderName ? `от ${one.leaderName}` : '') : 'по одному на категорию';
      return (
        <div className="flex items-center gap-3 h-14 max-sm:h-12 pl-2 pr-4 rounded-ctl-lg max-sm:rounded-ctl-md bg-primary text-white border-2 border-ink shadow-[0_4px_0_#111]">
          <span className="w-10 h-10 max-sm:w-8 max-sm:h-8 rounded-ctl-sm max-sm:rounded-[10px] bg-sun text-ink flex items-center justify-center shrink-0">
            <Check size={18} strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[15px] max-sm:text-[13px] font-bold truncate">
              {one
                ? <>Промокод {one.code} — {one.scopeText ? `скидка ${one.scopeText}` : 'цены со скидкой'}</>
                : <>Промокоды {codes.map((c) => c.code).join(', ')}</>}
            </div>
            {from && <div className="text-[12px] text-white/80 truncate max-sm:hidden">{from}</div>}
          </div>
          <button
            onClick={() => setAdding(true)}
            className="h-8 px-2.5 rounded-ctl-xs bg-white/15 hover:bg-white/25 text-[11px] font-bold uppercase tracking-[0.08em] text-white cursor-pointer shrink-0 inline-flex items-center gap-1"
            title="Добавить промокод для другой категории"
          >
            <Plus size={13} strokeWidth={2.6} /><span className="max-sm:hidden">Ещё</span>
          </button>
          <button
            onClick={() => { clear(); show(codes.length > 1 ? 'Промокоды сброшены' : 'Промокод сброшен'); }}
            className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/85 hover:text-white cursor-pointer shrink-0"
          >
            Убрать
          </button>
        </div>
      );
    }
    return (
      <div className={line ? '' : 'grid grid-cols-[minmax(0,1fr)] gap-2'}>
        {codes.map((c) => {
          const from = c.label || (c.leaderName ? `от ${c.leaderName}` : '');
          return (
            <div key={c.code} className={`flex items-center gap-4 ${line ? 'py-4 border-b border-line' : 'min-h-12 py-2 px-4 border border-line rounded-ctl bg-card'}`}>
              <Check size={line ? 18 : 15} strokeWidth={1.8} className="text-primary shrink-0" />
              <div className="min-w-0 flex-1 leading-snug">
                <div className={`${line ? 'text-[15px]' : 'text-[13px]'} text-text truncate`}>
                  Промокод <span className="font-bold tracking-[0.08em] text-primary">{c.code}</span>
                </div>
                <div className={`${line ? 'text-[13px]' : 'text-[11.5px]'} text-muted line-clamp-2`}>
                  {[c.scopeText ? `скидка ${c.scopeText}` : 'скидка на весь каталог', line ? from : '', c.expiresAt ? `до ${new Date(c.expiresAt).toLocaleDateString('ru-RU')}` : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                onClick={() => { remove(c.code); show(`Промокод ${c.code} убран`); }}
                className="label !text-[10px] hover:!text-text transition-colors cursor-pointer shrink-0"
              >
                Убрать
              </button>
            </div>
          );
        })}
        <button
          onClick={() => setAdding(true)}
          className={`inline-flex items-center gap-1.5 text-[12px] font-bold text-ink/70 hover:text-ink cursor-pointer ${line ? 'mt-3' : 'px-1'}`}
        >
          <Plus size={14} strokeWidth={2.4} /> Промокод для другой категории
        </button>
      </div>
    );
  }

  const cancelAdd = adding && (
    <button type="button" onClick={() => { setAdding(false); setError(''); setValue(''); }} className="mt-2 pl-1 text-[12px] font-semibold text-ink/60 hover:text-ink cursor-pointer">
      Отмена
    </button>
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
            placeholder="Реферальный промокод"
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
          <div role="alert" className={`pl-4 text-[13px] font-semibold text-danger ${floatingError ? 'absolute inset-x-0 top-full mt-2 truncate' : 'mt-2'}`}>
            {error}
          </div>
        )}
        {!error && cancelAdd && <div className={floatingError ? 'absolute left-3 top-full' : ''}>{cancelAdd}</div>}
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
          placeholder={line ? 'Введите промокод' : 'Промокод'}
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
      {cancelAdd}
    </div>
  );
}
