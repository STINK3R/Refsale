import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight, Send, X, MessageSquarePlus } from 'lucide-react';
import { useAppStore, useAuthStore, useNotificationStore } from '../../store';
import { addReview } from '../../api/client';
import ImageUploader from '../ui/ImageUploader';
import AttachedImages from '../ui/AttachedImages';
import { formatDate } from '../../utils/format';
import type { Review } from '../../types';
import useScrollLock from '../../hooks/useScrollLock';

const AUTO_ROTATE_MS = 5000;
/** How long auto-rotation stays off after the reader touches the carousel. */
const MANUAL_PAUSE_MS = 45000;

export default function Reviews() {
  const { reviews, loadReviews } = useAppStore();
  const { user } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  useScrollLock(modalOpen);
  // Auto-rotation must not yank the carousel out from under the reader: it
  // stops entirely while a photo is open, and stands down for a while after
  // any manual paging.
  const [viewerOpen, setViewerOpen] = useState(false);
  const pausedUntilRef = useRef(0);
  const pauseAuto = () => { pausedUntilRef.current = Date.now() + MANUAL_PAUSE_MS; };

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    if (reviews.length <= 1 || viewerOpen) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return;
      setCurrentIdx(i => (i + 1) % reviews.length);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [reviews.length, viewerOpen]);

  const handleSubmit = async () => {
    if (!user) return;
    if (!text.trim()) { show('Напишите отзыв', 'error'); return; }
    setSubmitting(true);
    const result = await addReview({ user_id: user.id, text: text.trim(), rating, images });
    setSubmitting(false);
    if (result) {
      setText('');
      setRating(5);
      setImages([]);
      loadReviews();
      show('Отзыв добавлен!', 'success');
    } else {
      show('Ошибка при добавлении отзыва', 'error');
    }
  };

  const prev = () => { pauseAuto(); setCurrentIdx(i => (i - 1 + reviews.length) % reviews.length); };
  const next = () => { pauseAuto(); setCurrentIdx(i => (i + 1) % reviews.length); };

  return (
    <section id="reviews" className="py-16 max-sm:py-10">
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="text-center mb-9">
          <div className="eyebrow mb-3">Отзывы</div>
          <h3 className="font-display text-[46px] leading-none text-text max-sm:text-[34px]">
            Что говорят покупатели
          </h3>
        </div>

        {/* Carousel */}
        {reviews.length > 0 ? (
          <div className="relative max-w-2xl mx-auto mb-10">
            <div className="overflow-hidden rounded-3xl card-luxe">
              <ReviewCard
                review={reviews[currentIdx]}
                onViewerChange={(open) => { setViewerOpen(open); if (!open) pauseAuto(); }}
              />
            </div>
            {reviews.length > 1 && (
              <>
                <button onClick={prev} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-10 h-10 bg-card border border-border rounded-full flex items-center justify-center shadow-md hover:shadow-lg hover:border-primary transition-all cursor-pointer max-sm:-translate-x-2">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={next} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-10 h-10 bg-card border border-border rounded-full flex items-center justify-center shadow-md hover:shadow-lg hover:border-primary transition-all cursor-pointer max-sm:translate-x-2">
                  <ChevronRight size={18} />
                </button>
                <div className="flex justify-center gap-2 mt-4">
                  {reviews.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { pauseAuto(); setCurrentIdx(i); }}
                      className={`w-2 h-2 rounded-full transition-all cursor-pointer ${i === currentIdx ? 'bg-primary w-6' : 'bg-border'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted text-sm">
            Пока нет отзывов. Будьте первым!
          </div>
        )}

        {/* Leave Review Button */}
        {user && (
          <div className="text-center">
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-primary to-primary-light text-ink rounded-xl text-sm font-bold border-none cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(212,175,90,0.25)] transition-all"
            >
              <MessageSquarePlus size={18} />
              Оставить отзыв
            </button>
          </div>
        )}

        {/* Review Modal */}
        <AnimatePresence>
          {modalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/55 p-4"
              onClick={() => setModalOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="glass-strong rounded-[28px] max-w-md w-full p-7 relative"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setModalOpen(false)}
                  className="absolute top-4 right-4 w-8 h-8 bg-bg rounded-full flex items-center justify-center text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
                <h4 className="text-lg font-extrabold text-text mb-1">Оставить отзыв</h4>
                <p className="text-sm text-muted mb-5">Расскажите о покупке — можно приложить фото</p>
                <div className="flex gap-1.5 mb-5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      className="cursor-pointer bg-transparent border-none p-0.5 hover:scale-110 transition-transform"
                    >
                      <Star
                        size={28}
                        className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-border'}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Расскажите о вашем опыте..."
                  className="w-full p-3.5 border-[1.5px] border-border rounded-xl text-sm text-text bg-card resize-y min-h-[100px] focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(212,175,90,0.1)] transition-all font-[inherit]"
                />
                {user && (
                  <div className="mt-3">
                    <span className="block text-[13px] font-semibold text-text mb-1.5">Фото (необязательно)</span>
                    <ImageUploader
                      value={images}
                      onChange={setImages}
                      userId={user.id}
                      prefix="review"
                      max={4}
                    />
                  </div>
                )}
                <button
                  onClick={async () => {
                    await handleSubmit();
                    if (text.trim()) return; // handleSubmit clears text on success
                    setModalOpen(false);
                  }}
                  disabled={submitting}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-br from-primary to-primary-light text-ink rounded-xl text-[15px] font-bold border-none cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(212,175,90,0.25)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {submitting ? 'Отправляем...' : 'Отправить отзыв'}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function ReviewCard({ review, onViewerChange }: { review: Review; onViewerChange?: (open: boolean) => void }) {
  return (
    <div className="p-8 max-sm:p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center text-white text-sm font-bold">
          {review.user_name?.charAt(0) || '?'}
        </div>
        <div>
          <div className="font-bold text-sm text-text">{review.user_name}</div>
          <div className="text-xs text-muted">{formatDate(review.created_at)}</div>
        </div>
        <div className="flex gap-0.5 ml-auto">
          {[1, 2, 3, 4, 5].map(n => (
            <Star key={n} size={14} className={n <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-border'} />
          ))}
        </div>
      </div>
      <p className="text-sm text-text leading-relaxed">{review.text}</p>
      <AttachedImages images={review.images} className="mt-3" onViewerChange={onViewerChange} />
    </div>
  );
}
