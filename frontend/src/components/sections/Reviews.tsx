import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, PenLine } from 'lucide-react';
import { runAfterAuth, useAppStore, useAuthStore } from '../../store';
import { fetchReviewList, type ReviewSummary } from '../../api/client';
import type { Review } from '../../types';
import Meerkat from '../mascot/Meerkat';
import SectionHead from '../ui/SectionHead';
import RatingSummary from '../reviews/RatingSummary';
import ReviewCard from '../reviews/ReviewCard';
import ReviewsModal from '../reviews/ReviewsModal';
import ReviewFormModal from '../reviews/ReviewFormModal';
import { reviewsWord } from '../../utils/words';
import { useNewsStore } from '../../store/news';

const LATEST = 10;

/**
 * Reviews the way marketplaces show them: the rating summary, a row of the
 * latest reviews and «Все отзывы» with filters and sorting. On a category
 * page — that category's reviews; with `all` (the main page) — every one.
 */
export default function Reviews({ all = false }: { all?: boolean }) {
  const activeCategoryId = useAppStore((s) => s.activeCategoryId);
  const categoryId = all ? null : activeCategoryId;
  const { user, openAuth } = useAuthStore();
  const [items, setItems] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [listOpen, setListOpen] = useState<{ star?: number | null } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchReviewList({ category_id: categoryId ?? undefined, limit: LATEST }).then((res) => {
      if (!alive) return;
      if (res) { setItems(res.items); setSummary(res.summary); }
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [categoryId, version]);

  // Reviews scrolled into view count as read for the menu counter
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) useNewsStore.getState().markSeen('reviews'); }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const write = () => {
    if (user) { setFormOpen(true); return; }
    runAfterAuth(() => setFormOpen(true));
    openAuth('login', 'Войдите или создайте аккаунт за полминуты — и поделитесь впечатлениями.');
  };
  const scrollRow = (d: number) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: d * Math.min(el.clientWidth * 0.9, 680), behavior: 'smooth' });
  };
  const count = summary?.count || 0;

  return (
    <section ref={sectionRef} id="reviews" className="border-t border-line">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 py-24 max-md:py-14">
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8 max-md:mb-6">
          <SectionHead label="Отзывы" title="Что говорят покупатели" className="!mb-0" />
          <div className="flex gap-2 flex-wrap">
            {count > 0 && <button onClick={() => setListOpen({})} className="btn-outline">Все {count} {reviewsWord(count)}</button>}
            <button onClick={write} className="btn-primary"><PenLine size={16} strokeWidth={2.2} /> Оставить отзыв</button>
          </div>
        </div>

        {loaded && count === 0 ? (
          <div className="bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] p-8 max-sm:p-6 flex items-center gap-6 max-sm:flex-col max-sm:text-center">
            <Meerkat pose="heart" width={120} decorative className="shrink-0" />
            <div>
              <p className="font-display text-[26px] text-text">Отзывов пока нет.</p>
              <p className="text-[14px] text-muted mt-2">Станьте первым, кто поделится впечатлениями о покупке.</p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
            {summary && (
              <div className="bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] p-6 max-sm:p-5">
                <RatingSummary summary={summary} onStar={(star) => setListOpen({ star })} />
                <button onClick={() => setListOpen({})} className="mt-5 w-full h-11 rounded-ctl-sm border-2 border-ink bg-sun text-[13px] font-bold cursor-pointer hover:bg-ink hover:text-sun transition-colors">
                  Смотреть все отзывы
                </button>
              </div>
            )}
            <div className="relative min-w-0">
              <div ref={rowRef} className="flex gap-4 max-sm:gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 -mb-2">
                {items.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    compact
                    onOpen={() => setListOpen({})}
                    className="snap-start shrink-0 w-[340px] max-sm:w-[84vw] min-h-[250px]"
                  />
                ))}
              </div>
              {items.length > 2 && (
                <div className="mt-4 flex items-center gap-2 max-sm:hidden">
                  <button onClick={() => scrollRow(-1)} className="w-11 h-11 rounded-ctl-sm border-2 border-ink bg-card grid place-items-center hover:bg-sun cursor-pointer" aria-label="Предыдущие отзывы"><ArrowLeft size={17} strokeWidth={2.2} /></button>
                  <button onClick={() => scrollRow(1)} className="w-11 h-11 rounded-ctl-sm border-2 border-ink bg-card grid place-items-center hover:bg-sun cursor-pointer" aria-label="Следующие отзывы"><ArrowRight size={17} strokeWidth={2.2} /></button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {listOpen && (
          <ReviewsModal
            title={all ? 'Все отзывы' : 'Отзывы'}
            categoryId={categoryId}
            initialStar={listOpen.star}
            onClose={() => setListOpen(null)}
            onWrite={() => { setListOpen(null); write(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {formOpen && <ReviewFormModal categoryId={categoryId} onClose={() => setFormOpen(false)} onDone={() => setVersion((v) => v + 1)} />}
      </AnimatePresence>
    </section>
  );
}
