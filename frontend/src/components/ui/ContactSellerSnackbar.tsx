import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, MessageCircle, X } from 'lucide-react';
import { askSeller } from '../../utils/askSeller';

/**
 * Unobtrusive snackbar shown when a product is added to the cart, inviting the
 * user to ask the seller a question about it. Listens for the
 * `product-added-cart` event dispatched from the product cards. Auto-hides
 * after a few seconds and never blocks shopping.
 */
export default function ContactSellerSnackbar() {
  const [product, setProduct] = useState<{ id: number; name: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: number; name: string } | undefined;
      if (!detail?.id) return;
      setProduct(detail);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setProduct(null), 6000);
    };
    window.addEventListener('product-added-cart', handler);
    return () => {
      window.removeEventListener('product-added-cart', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const ask = () => {
    if (!product) return;
    askSeller(product.id);
    setProduct(null);
  };

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          // Sits above the mobile cart bar / support bubble, centered on desktop.
          className="fixed bottom-32 sm:bottom-24 left-1/2 -translate-x-1/2 z-[1600] w-[calc(100%-24px)] max-w-sm pointer-events-auto"
        >
          <div className="flex items-center gap-3 bg-card border border-border rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.14)] px-3.5 py-2.5">
            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <Check size={16} className="text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-text truncate">«{product.name}» в корзине</div>
              <div className="text-[11px] text-muted">Есть вопрос по товару?</div>
            </div>
            <button
              onClick={ask}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-ink rounded-lg text-[12px] font-bold cursor-pointer hover:bg-primary-dark transition"
            >
              <MessageCircle size={14} /> Спросить
            </button>
            <button
              onClick={() => setProduct(null)}
              aria-label="Закрыть"
              className="shrink-0 w-6 h-6 rounded-full text-muted hover:text-danger hover:bg-danger/10 flex items-center justify-center cursor-pointer transition"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
