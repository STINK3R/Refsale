import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, ThumbsUp, Vote } from 'lucide-react';
import { API_BASE } from '../../api/client';
import { runAfterAuth, useAuthStore, useNotificationStore } from '../../store';
import { formatPrice, unescapeHtml } from '../../utils/format';
import usePageMeta from '../../hooks/usePageMeta';
import SectionHead from '../ui/SectionHead';
import Meerkat from '../mascot/Meerkat';

interface VoteItem { id: number; name: string; brand: string; box_weight: string; packing: string; price: number | null; price_note: string; votes: number; voted: boolean }
interface VoteCategory { id: number; name: string; items: VoteItem[] }
interface VoteData { enabled: boolean; title: string; intro: string; categories: VoteCategory[]; my_votes: number }

/**
 * Vote for new products (/vote): a supplier's price list as a list by
 * category with our prices. A signed-in member marks what is worth bringing
 * in; the counts tell the admin what to order.
 */
export default function VotePage() {
  const user = useAuthStore((s) => s.user);
  const openAuth = useAuthStore((s) => s.openAuth);
  const show = useNotificationStore((s) => s.show);
  const [data, setData] = useState<VoteData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<number | 'all' | 'mine'>('all');
  const [busy, setBusy] = useState<number | null>(null);
  usePageMeta('Голосование за новые товары | RefSale', 'Отметьте товары, которые стоит привезти: больше голосов — быстрее появятся в каталоге.', '/vote');

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/vote`).then((r) => r.json()).then((d: VoteData) => { if (alive) { setData(d); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [user?.id]);

  const toggle = (item: VoteItem) => {
    if (user) { void send(item); return; }
    runAfterAuth(() => void send(item));
    openAuth('login', 'Войдите или создайте аккаунт за полминуты — и голосуйте за товары.');
  };
  const send = async (item: VoteItem) => {
    setBusy(item.id);
    try {
      const r = await fetch(`${API_BASE}/api/vote/items/${item.id}`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Не удалось проголосовать');
      setData((prev) => prev && ({
        ...prev,
        my_votes: prev.my_votes + (d.voted ? 1 : -1),
        categories: prev.categories.map((c) => ({ ...c, items: c.items.map((x) => (x.id === item.id ? { ...x, voted: d.voted, votes: d.votes } : x)) })),
      }));
    } catch (e) { show((e as Error).message, 'error'); }
    setBusy(null);
  };

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.categories
      .filter((c) => active === 'all' || active === 'mine' || c.id === active)
      .map((c) => ({
        ...c,
        items: c.items.filter((it) => (active !== 'mine' || it.voted)
          && (!q || `${it.name} ${it.brand}`.toLowerCase().includes(q))),
      }))
      .filter((c) => c.items.length);
  }, [data, query, active]);

  return (
    <main className="pt-[calc(var(--header-h,140px)+28px)] pb-28 max-md:pb-16 min-h-screen">
      <div className="max-w-[1100px] mx-auto px-8 max-sm:px-4">
        <SectionHead label={<span className="inline-flex items-center gap-1.5"><Vote size={14} />Голосование</span>} title={unescapeHtml(data?.title) || 'Голосование за новые товары'} level={1} className="!mb-3" />
        <p className="text-[15px] max-sm:text-[14px] text-ink/75 max-w-[680px] leading-relaxed">{unescapeHtml(data?.intro)}</p>

        {failed ? (
          <Empty text="Список сейчас недоступен. Обновите страницу чуть позже." />
        ) : !data ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : !data.enabled || data.categories.length === 0 ? (
          <Empty text={data.enabled ? 'Скоро здесь появится список товаров для голосования.' : 'Голосование сейчас закрыто.'} />
        ) : (
          <>
            <div className="sticky top-[calc(var(--header-h,140px)+8px)] z-10 mt-7 -mx-2 px-2 py-2 bg-bg/90 backdrop-blur">
              <div className="flex gap-2 items-center flex-wrap">
                <label className="relative flex-1 min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти товар или бренд" className="field !pl-9 !h-10 !text-[13px]" />
                </label>
                <span className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-card border-2 border-ink text-[12.5px] font-bold">
                  <ThumbsUp size={14} />Мои голоса: {data.my_votes}
                </span>
              </div>
              <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                <Chip on={active === 'all'} onClick={() => setActive('all')}>Все</Chip>
                {data.categories.map((c) => <Chip key={c.id} on={active === c.id} onClick={() => setActive(c.id)}>{unescapeHtml(c.name)}</Chip>)}
                {data.my_votes > 0 && <Chip on={active === 'mine'} onClick={() => setActive('mine')}>Отмеченные мной</Chip>}
              </div>
            </div>

            {shown.length === 0 ? <Empty text="Ничего не нашлось." /> : shown.map((c) => (
              <section key={c.id} className="mt-8">
                <h2 className="font-display text-[22px] max-sm:text-[19px] leading-tight mb-3">{unescapeHtml(c.name)} <span className="text-ink/35 text-[0.75em] tabular-nums">{c.items.length}</span></h2>
                <div className="bg-card border-2 border-ink rounded-[22px] max-sm:rounded-[18px] shadow-[0_5px_0_#111] overflow-hidden">
                  <div className="grid grid-cols-[minmax(0,1fr)_120px_110px_150px] gap-3 px-5 py-2.5 bg-surface text-[10.5px] uppercase tracking-[0.1em] font-bold text-muted max-md:hidden">
                    <span>Наименование</span><span>Вес / фасовка</span><span className="text-right">Наша цена</span><span />
                  </div>
                  {c.items.map((it) => (
                    <div key={it.id} className={`grid grid-cols-[minmax(0,1fr)_120px_110px_150px] max-md:grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-5 max-sm:px-4 py-3.5 border-t border-ink/10 items-center ${it.voted ? 'bg-accent/40' : ''}`}>
                      <div className="min-w-0">
                        <div className="text-[14.5px] max-sm:text-[14px] font-semibold leading-snug break-words">{unescapeHtml(it.name)}</div>
                        {it.brand && <div className="text-[12px] text-muted mt-0.5">{unescapeHtml(it.brand)}</div>}
                      </div>
                      <div className="text-[12.5px] text-muted max-md:col-start-1 max-md:row-start-2">
                        {[it.box_weight && `коробка ${unescapeHtml(it.box_weight)}`, it.packing && (it.packing === 'вал' ? 'весовой' : `фасовка ${unescapeHtml(it.packing)}`)].filter(Boolean).join(' · ')}
                      </div>
                      <div className="text-right max-md:col-start-2 max-md:row-start-1 tabular-nums">
                        {it.price != null
                          ? <><span className="text-[16px] font-extrabold">{formatPrice(it.price)}</span>{it.price_note && <span className="block text-[11px] text-muted">{unescapeHtml(it.price_note)}</span>}</>
                          : <span className="text-[12px] text-muted">цена уточняется</span>}
                      </div>
                      <div className="flex justify-end max-md:col-start-2 max-md:row-start-2">
                        <button
                          onClick={() => toggle(it)} disabled={busy === it.id} aria-pressed={it.voted}
                          className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border-2 text-[12.5px] font-bold tabular-nums cursor-pointer transition-colors ${it.voted ? 'bg-ink border-ink text-sun' : 'bg-card border-ink/20 hover:border-ink'}`}
                        >
                          {busy === it.id ? <Loader2 size={14} className="animate-spin" /> : it.voted ? <Check size={14} strokeWidth={2.8} /> : <ThumbsUp size={14} />}
                          {it.voted ? 'Хочу' : 'Хочу такое'}<span className="opacity-60">· {it.votes}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-pressed={on} className={`shrink-0 h-8 px-3 rounded-ctl-sm border-2 text-[12px] font-bold whitespace-nowrap cursor-pointer transition-colors ${on ? 'bg-ink border-ink text-sun' : 'bg-card border-ink/15 hover:border-ink'}`}>{children}</button>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-8 bg-card border-2 border-ink rounded-[24px] shadow-[0_6px_0_#111] p-8 max-sm:p-6 flex items-center gap-6 max-sm:flex-col max-sm:text-center">
      <Meerkat pose="thinking" width={110} decorative className="shrink-0" />
      <p className="font-display text-[22px] text-ink">{text}</p>
    </div>
  );
}
