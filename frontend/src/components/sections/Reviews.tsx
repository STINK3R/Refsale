import { useState, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useAppStore, useAuthStore, useNotificationStore } from '../../store';
import { addReview } from '../../api/client';
import ImageUploader from '../ui/ImageUploader';
import Meerkat from '../mascot/Meerkat';

import AttachedImages from '../ui/AttachedImages';
import { formatDate, unescapeHtml } from '../../utils/format';
import { initials, nickColor } from '../../utils/nick';
import { isVideoUrl } from '../../utils/media';
import type { Review } from '../../types';
import useScrollLock from '../../hooks/useScrollLock';
import { useNewsStore } from '../../store/news';

const AUTO_ROTATE_MS = 7000;

/** A review leads with its photo when it has one (videos stay in the list). */
function reviewHasPhoto(r: Review) {
  const v = r.images;
  if (!v) return false;
  let list: unknown = v;
  if (typeof v === 'string') { try { list = JSON.parse(v); } catch { return false; } }
  return Array.isArray(list) && list.some((u) => typeof u === 'string' && !isVideoUrl(u));
}
/** How long auto-rotation stays off after the reader touches the carousel. */
const MANUAL_PAUSE_MS = 45000;
const EASE = [0.22, 1, 0.36, 1] as const;

export default function Reviews() {
  const { reviews, loadReviews, activeCategoryId } = useAppStore();
  const { user, openAuth } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const pausedUntilRef = useRef(0);
  const pauseAuto = () => { pausedUntilRef.current = Date.now() + MANUAL_PAUSE_MS; };
  useScrollLock(modalOpen);

  // Each category page shows its own reviews.
  useEffect(() => { void loadReviews(); }, [loadReviews, activeCategoryId]);

  // Reviews scrolled into view count as read for the menu counter
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) useNewsStore.getState().markSeen('reviews'); }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reviews.length <= 1 || viewerOpen) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return;
      setIdx((i) => (i + 1) % reviews.length);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(t);
  }, [reviews.length, viewerOpen]);

  const submit = async () => {
    if (!user) return;
    if (!text.trim()) { show('Напишите отзыв', 'error'); return; }
    setSubmitting(true);
    const result = await addReview({ user_id: user.id, text: text.trim(), rating, images, category_id: activeCategoryId });
    setSubmitting(false);
    if (!result) { show('Не удалось отправить отзыв', 'error'); return; }
    setText(''); setRating(5); setImages([]);
    setModalOpen(false);
    loadReviews();
    show('Спасибо за отзыв');
  };

  const go = (d: number) => { pauseAuto(); setIdx((i) => (i + d + reviews.length) % reviews.length); };
  // The list changes with the category page, so wrap the position into it.
  const pos = reviews.length ? idx % reviews.length : 0;
  const review: Review | undefined = reviews[pos];

  return (
    <section ref={sectionRef} id="reviews" className="border-t border-line">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 py-28 max-md:py-16 grid grid-cols-12 gap-x-8 gap-y-10">
        <div className="col-span-4 max-lg:col-span-12 flex flex-col">
          <div className="label mb-5">Отзывы</div>
          <h2 className="font-display text-[clamp(34px,3.6vw,54px)] leading-[1.05] text-text">Что говорят покупатели</h2>
          <div className="mt-10 max-lg:mt-6">
            <button onClick={() => (user ? setModalOpen(true) : openAuth('login', 'Войдите или создайте аккаунт за полминуты — и поделитесь впечатлениями.'))} className="btn-outline">
              Оставить отзыв
            </button>
          </div>
        </div>

        <div className="col-span-7 col-start-6 max-lg:col-span-12 max-lg:col-start-1">
          {review ? (
            <div>
              <AnimatePresence mode="wait">
                <m.figure
                  key={review.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className={`bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] p-6 max-sm:p-4 grid gap-6 max-sm:gap-4 ${reviewHasPhoto(review) ? 'md:grid-cols-[minmax(0,260px)_1fr]' : ''}`}
                >
                  {reviewHasPhoto(review) && (
                    <AttachedImages
                      images={review.images}
                      size="sm"
                      className="content-start"
                      leadClassName="w-full aspect-square max-md:aspect-[16/10] rounded-[16px]"
                      onViewerChange={(open) => { setViewerOpen(open); if (!open) pauseAuto(); }}
                    />
                  )}
                  <div className="min-w-0 flex flex-col">
                    <figcaption className="flex items-center gap-3.5">
                      <span className="w-14 h-14 max-sm:w-12 max-sm:h-12 rounded-full border-2 border-ink grid place-items-center shrink-0 font-display text-[18px] text-white" style={{ background: nickColor(`u${review.user_id}`) }} aria-hidden="true">
                        {initials(unescapeHtml(review.user_name))}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-display text-[22px] max-sm:text-[19px] leading-tight text-ink truncate">{unescapeHtml(review.user_name)}</span>
                        <span className="block text-[14px] text-muted mt-1">{formatDate(review.created_at)}</span>
                      </span>
                    </figcaption>
                    <div className="mt-4 text-[28px] max-sm:text-[24px] leading-none tracking-[0.12em] text-[#F5A300]" aria-label={`Оценка ${review.rating} из 5`}>
                      {'★'.repeat(review.rating)}<span className="text-ink/15">{'★'.repeat(5 - review.rating)}</span>
                    </div>
                    <blockquote className="mt-4 text-[15px] leading-[1.65] text-ink/80 whitespace-pre-line break-words">
                      {unescapeHtml(review.text)}
                    </blockquote>
                    {!reviewHasPhoto(review) && (
                      <AttachedImages images={review.images} className="mt-4" onViewerChange={(open) => { setViewerOpen(open); if (!open) pauseAuto(); }} />
                    )}
                  </div>
                </m.figure>
              </AnimatePresence>
              {reviews.length > 1 && (
                <div className="mt-6 flex items-center gap-3">
                  <button onClick={() => go(-1)} className="w-11 h-11 rounded-ctl-sm border-2 border-ink bg-card flex items-center justify-center text-ink hover:bg-sun transition-colors cursor-pointer" aria-label="Предыдущий отзыв">
                    <ArrowLeft size={17} strokeWidth={2.2} />
                  </button>
                  <button onClick={() => go(1)} className="w-11 h-11 rounded-ctl-sm border-2 border-ink bg-card flex items-center justify-center text-ink hover:bg-sun transition-colors cursor-pointer" aria-label="Следующий отзыв">
                    <ArrowRight size={17} strokeWidth={2.2} />
                  </button>
                  <span className="ml-2 text-[13px] font-semibold text-ink/70 tabular-nums">{String(pos + 1).padStart(2, '0')} / {String(reviews.length).padStart(2, '0')}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] p-8 max-sm:p-6">
              <Meerkat pose="heart" width={120} decorative className="mb-5" />
              <p className="font-display text-[28px] text-text">Отзывов пока нет.</p>
              <p className="text-[14px] text-muted mt-3">Станьте первым, кто поделится впечатлениями о покупке.</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] bg-ink/45 flex items-end sm:items-center justify-center sm:p-6"
            onClick={() => setModalOpen(false)}
          >
            <m.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-bg border-2 border-ink rounded-t-[28px] sm:rounded-[28px] shadow-[0_8px_0_#111] max-h-[92vh] flex flex-col overflow-hidden"
            >
              <button onClick={() => setModalOpen(false)} className="absolute top-4 right-4 w-10 h-10 rounded-ctl-sm bg-card border-2 border-ink text-ink flex items-center justify-center hover:bg-sun transition-colors cursor-pointer" aria-label="Закрыть">
                <X size={18} strokeWidth={2.2} />
              </button>
              <div className="flex-1 min-h-0 overflow-y-auto modal-scroll p-10 max-sm:p-6">
              <div className="label">Отзыв</div>
              <h3 className="font-display text-[26px] leading-tight text-ink mt-3">Расскажите о покупке</h3>
              <div className="flex gap-2 mt-6" role="radiogroup" aria-label="Оценка">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className={`text-[22px] leading-none cursor-pointer transition-colors ${n <= rating ? 'text-primary' : 'text-light hover:text-muted'}`}
                    aria-label={`${n} из 5`}
                  >★</button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Аромат, упаковка, доставка — всё, что важно"
                rows={5}
                className="field resize-none mt-6"
              />
              {user && (
                <div className="mt-5">
                  <div className="label mb-3">Фото, необязательно</div>
                  <ImageUploader value={images} onChange={setImages} userId={user.id} prefix="review" max={4} />
                </div>
              )}
              <button onClick={submit} disabled={submitting} className="btn-primary w-full mt-8">
                {submitting ? 'Отправляем…' : 'Опубликовать отзыв'}
              </button>
              <p className="mt-3 text-center text-[12px] text-muted">Отзыв увидят все — с именем и первой буквой фамилии, например «Анна К.»</p>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}
