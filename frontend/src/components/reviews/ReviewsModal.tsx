import { useCallback, useEffect, useState } from 'react';
import { m } from 'framer-motion';
import { Loader2, PenLine, X } from 'lucide-react';
import useScrollLock from '../../hooks/useScrollLock';
import { fetchReviewList, type ReviewSummary } from '../../api/client';
import type { Review } from '../../types';
import RatingSummary from './RatingSummary';
import ReviewCard from './ReviewCard';

const PAGE = 12;
const EASE = [0.22, 1, 0.36, 1] as const;

type Filter = 'all' | 'photos' | 1 | 2 | 3 | 4 | 5;

/**
 * All reviews of a category, a product or the whole shop, the way a
 * marketplace lists them: the summary, filters (with photos, by stars),
 * sorting and «показать ещё». Wrapped in AnimatePresence by the caller.
 */
export default function ReviewsModal({ title, categoryId, productId, initialStar, onClose, onWrite }: {
  title: string; categoryId?: number | null; productId?: number | null; initialStar?: number | null;
  onClose: () => void; onWrite?: () => void;
}) {
  useScrollLock(true);
  const [filter, setFilter] = useState<Filter>(initialStar ? (initialStar as Filter) : 'all');
  const [sort, setSort] = useState<'new' | 'high' | 'low'>('new');
  const [items, setItems] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  const query = useCallback((offset: number) => fetchReviewList({
    category_id: productId ? undefined : categoryId ?? undefined,
    product_id: productId ?? undefined,
    rating: typeof filter === 'number' ? filter : undefined,
    photos: filter === 'photos',
    sort, limit: PAGE, offset,
  }), [categoryId, productId, filter, sort]);

  // The first page on open and on every filter or sort change
  useEffect(() => {
    let alive = true;
    query(0).then((res) => {
      if (!alive) return;
      if (res) { setItems(res.items); setTotal(res.total); setSummary(res.summary); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [query]);

  const pickFilter = (f: Filter) => { setLoading(true); setFilter(f); };
  const pickSort = (s: 'new' | 'high' | 'low') => { setLoading(true); setSort(s); };
  const showMore = async () => {
    setMore(true);
    const res = await query(items.length);
    if (res) { setItems((prev) => [...prev, ...res.items]); setTotal(res.total); }
    setMore(false);
  };

  const chip = (f: Filter, label: string, n?: number) => (
    <button
      key={String(f)}
      onClick={() => pickFilter(f)}
      aria-pressed={filter === f}
      className={`shrink-0 h-9 px-3.5 rounded-ctl-sm border-2 text-[12.5px] font-bold whitespace-nowrap cursor-pointer transition-colors ${filter === f ? 'bg-ink border-ink text-sun' : 'bg-card border-ink/15 text-ink hover:border-ink'}`}
    >
      {label}{n != null && <span className="ml-1.5 opacity-60 tabular-nums">{n}</span>}
    </button>
  );

  return (
    <m.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[3200] bg-ink/45 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <m.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.45, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
        className="relative w-full max-w-[920px] h-[min(92dvh,860px)] max-sm:h-[92dvh] bg-bg border-2 border-ink rounded-t-[28px] sm:rounded-[28px] shadow-[0_8px_0_#111] flex flex-col overflow-hidden"
      >
        <header className="shrink-0 flex items-center gap-3 px-7 max-sm:px-4 py-4 bg-accent border-b-2 border-ink">
          <h2 className="font-display text-[24px] max-sm:text-[19px] leading-tight text-ink flex-1 min-w-0 truncate">{title}</h2>
          {onWrite && (
            <button onClick={onWrite} className="btn-primary btn-sm max-sm:!px-3 shrink-0"><PenLine size={14} strokeWidth={2.4} /> <span className="max-sm:hidden">Написать отзыв</span></button>
          )}
          <button onClick={onClose} className="w-10 h-10 rounded-ctl-sm bg-card border-2 border-ink grid place-items-center hover:bg-sun cursor-pointer shrink-0" aria-label="Закрыть">
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain modal-scroll px-7 max-sm:px-4 py-6 max-sm:py-4">
          {summary && summary.count > 0 && (
            <div className="bg-card border-2 border-ink rounded-[22px] p-6 max-sm:p-4">
              <RatingSummary summary={summary} onStar={(s) => pickFilter(filter === s ? 'all' : (s as Filter))} activeStar={typeof filter === 'number' ? filter : null} />
            </div>
          )}
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide max-w-full">
              {chip('all', 'Все', summary?.count)}
              {chip('photos', 'С фото', summary?.with_photos)}
              {[5, 4, 3, 2, 1].map((s) => chip(s as Filter, `${s} ★`, summary?.by_star[String(s)]))}
            </div>
            <select value={sort} onChange={(e) => pickSort(e.target.value as 'new' | 'high' | 'low')} className="field !w-auto !h-9 !py-0 !pl-3 !text-[12.5px] ml-auto" aria-label="Порядок отзывов">
              <option value="new">Сначала новые</option>
              <option value="high">Сначала с высокой оценкой</option>
              <option value="low">Сначала с низкой оценкой</option>
            </select>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="py-14 flex justify-center"><Loader2 className="animate-spin text-ink" /></div>
            ) : items.length === 0 ? (
              <div className="py-14 text-center text-[14px] text-muted">{filter === 'all' ? 'Отзывов пока нет — будьте первым.' : 'С таким фильтром отзывов нет.'}</div>
            ) : (
              items.map((r) => <ReviewCard key={r.id} review={r} showProduct={!productId} />)
            )}
          </div>
          {!loading && items.length < total && (
            <div className="mt-6 text-center">
              <button onClick={showMore} disabled={more} className="btn-outline">
                {more ? <Loader2 size={16} className="animate-spin" /> : `Показать ещё · ${Math.min(PAGE, total - items.length)}`}
              </button>
            </div>
          )}
        </div>
      </m.div>
    </m.div>
  );
}
