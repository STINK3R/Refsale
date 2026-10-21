import { useEffect, useRef } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import Meerkat from './Meerkat';
import { useUiStore } from '../../store/ui';
import { usePromoStore } from '../../store';

/**
 * The meerkat comes out with a line on the big moments: a promo code applied,
 * an order placed. It never takes clicks itself. Elsewhere it sits still —
 * in the menu, on product cards and in empty states.
 */
export default function MascotLayer() {
  return <MascotMoments />;
}

/** The meerkat with a speech bubble for a couple of seconds. */
function MascotMoments() {
  const moment = useUiStore((s) => s.mascotMoment);
  const showMascot = useUiStore((s) => s.showMascot);
  const hideMascot = useUiStore((s) => s.hideMascot);

  // A promo code switched on is worth a cool meerkat.
  const code = usePromoStore((s) => s.code);
  const prevCode = useRef(code);
  useEffect(() => {
    if (code && code !== prevCode.current) showMascot('sunglasses', 'Скидка включена! Цены уже ниже.');
    prevCode.current = code;
  }, [code, showMascot]);

  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(hideMascot, 2800);
    return () => clearTimeout(t);
  }, [moment, hideMascot]);

  return (
    <AnimatePresence>
      {moment && (
        <m.div
          key={moment.id}
          role="status"
          initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="fixed z-[4500] bottom-0 inset-x-0 flex justify-center pointer-events-none"
        >
          {/* On wider screens the meerkat itself sits on the centre line and the
              bubble hangs off to its right; on a phone they share the row. */}
          <div className="flex items-end gap-2 sm:block sm:relative">
            <Meerkat pose={moment.pose} width={120} decorative eager className="max-sm:w-[86px]" />
            <div className="mb-16 max-sm:mb-12 sm:absolute sm:left-full sm:bottom-16 sm:mb-0 sm:ml-2 sm:w-max px-4 py-2.5 rounded-2xl rounded-bl-sm bg-sun border-2 border-ink shadow-[0_4px_0_#111] text-[14px] max-sm:text-[13px] font-bold max-w-[220px]">
              {moment.text}
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
