import { useState } from 'react';
import { m } from 'framer-motion';
import { X } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import { addReview } from '../../api/client';
import ImageUploader from '../ui/ImageUploader';
import useScrollLock from '../../hooks/useScrollLock';
import type { Review } from '../../types';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Writing a review: the stars, the text, photos. With a product it is a
 * review of that product (shown under it, «купил на RefSale» when a delivered
 * order holds it); without, a review of the category or the shop.
 * Wrapped in AnimatePresence by the caller.
 */
export default function ReviewFormModal({ categoryId, product, onClose, onDone }: {
  categoryId?: number | null; product?: { id: number; name: string } | null;
  onClose: () => void; onDone?: (r: Review) => void;
}) {
  useScrollLock(true);
  const user = useAuthStore((s) => s.user);
  const show = useNotificationStore((s) => s.show);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (!text.trim()) { show('Напишите отзыв', 'error'); return; }
    setSending(true);
    const res = await addReview({ user_id: user.id, text: text.trim(), rating, images, category_id: categoryId ?? null, product_id: product?.id ?? null });
    setSending(false);
    if (!res) { show('Не удалось отправить отзыв', 'error'); return; }
    show('Спасибо за отзыв');
    onDone?.(res);
    onClose();
  };

  return (
    <m.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[3300] bg-ink/45 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <m.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.4, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Отзыв"
        className="relative w-full max-w-lg bg-bg border-2 border-ink rounded-t-[28px] sm:rounded-[28px] shadow-[0_8px_0_#111] max-h-[92vh] flex flex-col overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-ctl-sm bg-card border-2 border-ink text-ink flex items-center justify-center hover:bg-sun transition-colors cursor-pointer" aria-label="Закрыть">
          <X size={18} strokeWidth={2.2} />
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto modal-scroll p-10 max-sm:p-6">
          <div className="label">Отзыв</div>
          <h3 className="font-display text-[26px] leading-tight text-ink mt-3 pr-10">{product ? 'Как вам товар?' : 'Расскажите о покупке'}</h3>
          {product && <p className="mt-2 text-[14px] font-semibold text-ink/70 pr-10">{product.name}</p>}
          <div className="flex gap-2 mt-6" role="radiogroup" aria-label="Оценка">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                role="radio"
                aria-checked={n === rating}
                className={`text-[30px] leading-none cursor-pointer transition-colors ${n <= rating ? 'text-[#F5A300]' : 'text-ink/15 hover:text-ink/30'}`}
                aria-label={`${n} из 5`}
              >★</button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={product ? 'Аромат, стойкость, упаковка — всё, что важно' : 'Товар, упаковка, доставка — всё, что важно'}
            rows={5}
            className="field resize-none mt-6"
          />
          {user && (
            <div className="mt-5">
              <div className="label mb-3">Фото, необязательно</div>
              <ImageUploader value={images} onChange={setImages} userId={user.id} prefix="review" max={4} />
            </div>
          )}
          <button onClick={submit} disabled={sending} className="btn-primary w-full mt-8">
            {sending ? 'Отправляем…' : 'Опубликовать отзыв'}
          </button>
          <p className="mt-3 text-center text-[12px] text-muted">Отзыв увидят все — с именем и первой буквой фамилии, например «Анна К.»</p>
        </div>
      </m.div>
    </m.div>
  );
}
