import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useAppStore, useAuthStore, useNotificationStore } from '../../store';
import { addReview } from '../../api/client';
import ImageUploader from '../ui/ImageUploader';
import AttachedImages from '../ui/AttachedImages';
import { formatDate, unescapeHtml } from '../../utils/format';
import type { Review } from '../../types';
import useScrollLock from '../../hooks/useScrollLock';

const AUTO_ROTATE_MS = 7000;
/** How long auto-rotation stays off after the reader touches the carousel. */
const MANUAL_PAUSE_MS = 45000;
const EASE = [0.22, 1, 0.36, 1] as const;

export default function Reviews() {
  const { reviews, loadReviews } = useAppStore();
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

  useEffect(() => { loadReviews(); }, [loadReviews]);

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
    const result = await addReview({ user_id: user.id, text: text.trim(), rating, images });
    setSubmitting(false);
    if (!result) { show('Не удалось отправить отзыв', 'error'); return; }
    setText(''); setRating(5); setImages([]);
    setModalOpen(false);
    loadReviews();
    show('Спасибо за отзыв');
  };

  const go = (d: number) => { pauseAuto(); setIdx((i) => (i + d + reviews.length) % reviews.length); };
  const review: Review | undefined = reviews[idx];

  return (
    <section id="reviews" className="border-t border-line">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 py-28 max-md:py-16 grid grid-cols-12 gap-x-8 gap-y-10">
        <div className="col-span-4 max-lg:col-span-12 flex flex-col">
          <div className="label mb-5">Отзывы</div>
          <h2 className="font-display text-[clamp(34px,3.6vw,54px)] leading-[1.05] text-text">Что говорят покупатели</h2>
          <div className="mt-10 max-lg:mt-6">
            <button onClick={() => (user ? setModalOpen(true) : openAuth('login', 'Войдите, чтобы оставить отзыв.'))} className="btn-outline">
              Оставить отзыв
            </button>
          </div>
        </div>

        <div className="col-span-7 col-start-6 max-lg:col-span-12 max-lg:col-start-1">
          {review ? (
            <div className="border-t border-line pt-10">
              <AnimatePresence mode="wait">
                <motion.figure
                  key={review.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.6, ease: EASE }}
                >
                  <div className="text-[13px] tracking-[0.3em] text-primary" aria-label={`Оценка ${review.rating} из 5`}>
                    {'★'.repeat(review.rating)}<span className="text-light">{'★'.repeat(5 - review.rating)}</span>
                  </div>
                  <blockquote className="font-display text-[clamp(22px,2.2vw,32px)] leading-[1.4] text-text mt-6">
                    «{unescapeHtml(review.text)}»
                  </blockquote>
                  <AttachedImages
                    images={review.images}
                    className="mt-6"
                    onViewerChange={(open) => { setViewerOpen(open); if (!open) pauseAuto(); }}
                  />
                  <figcaption className="mt-8 text-[13px] text-muted">
                    <span className="text-text">{unescapeHtml(review.user_name)}</span> · {formatDate(review.created_at)}
                  </figcaption>
                </motion.figure>
              </AnimatePresence>
              {reviews.length > 1 && (
                <div className="mt-10 flex items-center gap-6">
                  <button onClick={() => go(-1)} className="w-11 h-11 border border-line flex items-center justify-center text-text hover:border-text transition-colors cursor-pointer" aria-label="Предыдущий отзыв">
                    <ArrowLeft size={16} strokeWidth={1.4} />
                  </button>
                  <button onClick={() => go(1)} className="w-11 h-11 border border-line flex items-center justify-center text-text hover:border-text transition-colors cursor-pointer" aria-label="Следующий отзыв">
                    <ArrowRight size={16} strokeWidth={1.4} />
                  </button>
                  <span className="text-[12px] text-muted tabular-nums">{String(idx + 1).padStart(2, '0')} / {String(reviews.length).padStart(2, '0')}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="border-t border-line pt-10">
              <p className="font-display text-[28px] text-text">Отзывов пока нет.</p>
              <p className="text-[14px] text-muted mt-3">Станьте первым, кто поделится впечатлениями о покупке.</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] bg-black/80 flex items-end sm:items-center justify-center sm:p-6"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-bg border border-line p-10 max-sm:p-6 max-h-[92vh] overflow-y-auto"
            >
              <button onClick={() => setModalOpen(false)} className="absolute top-5 right-5 text-muted hover:text-text cursor-pointer" aria-label="Закрыть">
                <X size={20} strokeWidth={1.3} />
              </button>
              <div className="label">Отзыв</div>
              <h3 className="font-display text-[32px] leading-tight text-text mt-3">Расскажите о покупке</h3>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
