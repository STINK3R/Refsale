import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { PenLine } from 'lucide-react';
import { runAfterAuth, useAuthStore } from '../../store';
import { fetchReviewList, type ReviewSummary } from '../../api/client';
import type { Product, Review } from '../../types';
import RatingSummary from './RatingSummary';
import ReviewCard from './ReviewCard';
import ReviewsModal from './ReviewsModal';
import ReviewFormModal from './ReviewFormModal';
import { reviewsWord } from '../../utils/words';

/** Under a product: its rating, the latest reviews and the way to all of them. */
export default function ProductReviews({ product }: { product: Product }) {
  const { user, openAuth } = useAuthStore();
  const [items, setItems] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchReviewList({ product_id: product.id, limit: 2 }).then((res) => {
      if (alive && res) { setItems(res.items); setSummary(res.summary); }
    });
    return () => { alive = false; };
  }, [product.id, version]);

  const write = () => {
    if (user) { setFormOpen(true); return; }
    runAfterAuth(() => setFormOpen(true));
    openAuth('login', 'Войдите — и расскажите о товаре: отзыв появится прямо под ним.');
  };
  const count = summary?.count || 0;

  return (
    <div className="mt-7 pt-6 border-t-2 border-ink/10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="font-display text-[20px] text-ink"><span className="marker">Отзывы о товаре</span></div>
        <button onClick={write} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink underline underline-offset-4 decoration-2 decoration-sun hover:decoration-ink cursor-pointer">
          <PenLine size={14} strokeWidth={2.4} /> Написать
        </button>
      </div>
      {count === 0 ? (
        <p className="text-[13.5px] text-muted">Отзывов пока нет — будьте первым, кто расскажет об этом товаре.</p>
      ) : (
        <>
          {summary && <RatingSummary summary={summary} compact />}
          <div className="mt-4 space-y-2.5">
            {items.map((r) => <ReviewCard key={r.id} review={r} compact showProduct={false} onOpen={() => setListOpen(true)} className="!p-4" />)}
          </div>
          <button onClick={() => setListOpen(true)} className="mt-3 w-full h-11 rounded-ctl-sm border-2 border-ink bg-card text-[13px] font-bold cursor-pointer hover:bg-sun transition-colors">
            Все {count} {reviewsWord(count)} о товаре
          </button>
        </>
      )}

      <AnimatePresence>
        {listOpen && <ReviewsModal title={`Отзывы: ${product.name}`} productId={product.id} onClose={() => setListOpen(false)} onWrite={() => { setListOpen(false); write(); }} />}
      </AnimatePresence>
      <AnimatePresence>
        {formOpen && <ReviewFormModal product={product} categoryId={product.category_id} onClose={() => setFormOpen(false)} onDone={() => setVersion((v) => v + 1)} />}
      </AnimatePresence>
    </div>
  );
}
