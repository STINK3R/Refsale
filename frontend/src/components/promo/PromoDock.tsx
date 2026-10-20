import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PromoForm from './PromoForm';
import { useUiStore } from '../../store/ui';

/**
 * The promo plate's travelling copy, pinned under the header — the way Чижик
 * handles its search bar. It shows up once the plate under the category photo
 * has scrolled away, hides while the visitor scrolls down and slides back as
 * soon as they scroll up.
 */
export default function PromoDock() {
  const heroVisible = useUiStore((s) => s.heroPromoVisible);
  const [scrollingUp, setScrollingUp] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      // A little dead zone so the plate does not flicker on tiny scrolls.
      if (Math.abs(dy) > 6) {
        setScrollingUp(dy < 0);
        lastY.current = y;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const shown = !heroVisible && scrollingUp;

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-0 right-0 top-full px-4 pt-3 pointer-events-none"
        >
          <div className="max-w-[640px] mx-auto pointer-events-auto">
            <PromoForm variant="pill" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
