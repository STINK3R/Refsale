import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgePercent, ChevronDown, Check } from 'lucide-react';
import { usePromoStore } from '../../store';
import PromoForm from './PromoForm';

const COLLAPSE_KEY = 'refsale_promobar_collapsed';

/**
 * The promo plate that travels with the visitor. It only appears once the
 * big one in the hero has scrolled away, and folds into a small chip so it
 * never covers the products.
 */
export default function PromoBar() {
  const code = usePromoStore((s) => s.code);
  const [heroVisible, setHeroVisible] = useState(true);
  // An active code only needs the small chip; the full plate is for entering one.
  const [collapsed, setCollapsed] = useState(() => !!usePromoStore.getState().code || sessionStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => setCollapsed(true), 1500);
    return () => clearTimeout(t);
  }, [code]);

  useEffect(() => {
    const target = document.getElementById('hero-promo');
    if (!target) { setHeroVisible(false); return; }
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { rootMargin: '-80px 0px 0px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  const setCollapse = (v: boolean) => {
    setCollapsed(v);
    sessionStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  };

  const expanded = !collapsed;

  return (
    <AnimatePresence>
      {!heroVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed z-[1400] bottom-4 left-3 right-[72px] sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[460px] pb-[env(safe-area-inset-bottom)]"
        >
          {expanded ? (
            <div className="glass-strong rounded-[28px] p-2 animate-pulse-glow">
              <div className="flex items-center justify-between px-3 pt-1 pb-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold">
                  {code ? 'Скидка по промокоду' : 'Есть промокод? Цены станут ниже'}
                </span>
                <button onClick={() => setCollapse(true)} className="w-7 h-7 -mr-1 rounded-full text-muted hover:text-text hover:bg-white/10 flex items-center justify-center cursor-pointer" aria-label="Свернуть">
                  <ChevronDown size={16} />
                </button>
              </div>
              <PromoForm size="sm" />
            </div>
          ) : (
            <div className="flex sm:justify-center">
              <button
                onClick={() => setCollapse(false)}
                className="glass-strong rounded-full h-11 pl-2 pr-4 flex items-center gap-2 text-[13px] font-semibold cursor-pointer hover:border-primary/40 transition-colors max-w-full"
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${code ? 'bg-gradient-to-br from-primary-light to-primary-dark text-ink' : 'bg-primary/15 text-primary'}`}>
                  {code ? <Check size={14} strokeWidth={3} /> : <BadgePercent size={15} />}
                </span>
                {code ? (
                  <span className="truncate text-text">Промокод <span className="text-primary-light">{code}</span> · цены со скидкой</span>
                ) : (
                  <span className="truncate text-text">Ввести промокод</span>
                )}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
