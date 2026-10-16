import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { usePromoStore } from '../../store';
import PromoForm from './PromoForm';

const COLLAPSE_KEY = 'refsale_promobar_collapsed';

/**
 * The promo plate that follows the visitor down the page. It appears once the
 * hero field has scrolled away and folds into a quiet tab so it never sits on
 * top of the products.
 */
export default function PromoBar() {
  const code = usePromoStore((s) => s.code);
  const [heroVisible, setHeroVisible] = useState(true);
  // An active code only needs the small tab; the full plate is for entering one.
  const [collapsed, setCollapsed] = useState(() => !!usePromoStore.getState().code || sessionStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => setCollapsed(true), 1500);
    return () => clearTimeout(t);
  }, [code]);

  useEffect(() => {
    const target = document.getElementById('hero-promo');
    if (!target) { setHeroVisible(false); return; }
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { rootMargin: '-100px 0px 0px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  // Shown open the first time it appears, then tucks itself away unless the
  // visitor is using it — it must not sit on the catalogue.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (heroVisible || collapsed || touched) return;
    const t = setTimeout(() => setCollapsed(true), 6000);
    return () => clearTimeout(t);
  }, [heroVisible, collapsed, touched]);

  const setCollapse = (v: boolean) => {
    setCollapsed(v);
    sessionStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  };

  return (
    <AnimatePresence>
      {!heroVisible && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed z-[1400] bottom-5 left-5 max-sm:left-3 max-sm:right-[72px] max-sm:bottom-3 pb-[env(safe-area-inset-bottom)]"
        >
          {collapsed ? (
            <button
              onClick={() => { setTouched(true); setCollapse(false); }}
              className="h-11 px-5 bg-bg border border-line hover:border-text transition-colors flex items-center gap-3 cursor-pointer max-w-full"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${code ? 'bg-primary' : 'bg-muted'}`} />
              <span className="text-[11px] uppercase tracking-[0.16em] text-text truncate">
                {code ? <>Промокод <span className="text-primary">{code}</span></> : 'Есть промокод?'}
              </span>
            </button>
          ) : (
            <div
              onMouseEnter={() => setTouched(true)}
              onFocus={() => setTouched(true)}
              className="w-[380px] max-sm:w-full bg-bg border border-line p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="label">{code ? 'Скидка по промокоду' : 'Промокод от блогера'}</div>
                  {!code && <div className="text-[13px] text-muted mt-1.5">Введите — цены на сайте сразу станут ниже</div>}
                </div>
                <button onClick={() => setCollapse(true)} className="text-muted hover:text-text cursor-pointer" aria-label="Свернуть">
                  <X size={16} strokeWidth={1.4} />
                </button>
              </div>
              <PromoForm variant="box" />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
