import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Meerkat from './Meerkat';
import { useUiStore } from '../../store/ui';
import { usePromoStore } from '../../store';

/**
 * The meerkat that makes the site memorable, as the brief asks:
 * - on a touch screen it pops up where the screen was tapped, waving or jumping;
 * - on big moments (promo code applied, order placed) it comes out with a line.
 * It never takes clicks itself. "Reduce motion" users get only the big moments.
 */
export default function MascotLayer() {
  const [tap] = useState(() => {
    // localStorage.refsale_mascot = 'on' shows it anyway (for demos on such machines).
    const forced = localStorage.getItem('refsale_mascot') === 'on';
    if (!forced && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return !window.matchMedia('(pointer: fine)').matches;
  });

  return (
    <>
      {tap && <TapMeerkat />}
      <MascotMoments />
    </>
  );
}

interface Pop { id: number; x: number; y: number; pose: 'wave' | 'jump' }

function TapMeerkat() {
  const [pop, setPop] = useState<Pop | null>(null);
  const last = useRef(0);
  const nextId = useRef(0);

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const now = Date.now();
      if (now - last.current < 450) return;
      last.current = now;
      const id = ++nextId.current;
      setPop({ id, x: e.clientX, y: e.clientY, pose: id % 2 ? 'wave' : 'jump' });
      clearTimeout(hide);
      hide = setTimeout(() => setPop(null), 1100);
    };
    window.addEventListener('pointerdown', down, { passive: true });
    return () => { window.removeEventListener('pointerdown', down); clearTimeout(hide); };
  }, []);

  return (
    <AnimatePresence>
      {pop && (
        <motion.div
          key={pop.id}
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.4, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: -40 }}
          exit={{ opacity: 0, scale: 0.6, y: -56 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          style={{ left: pop.x - 34, top: pop.y - 70 }}
          className="fixed z-[5000] pointer-events-none"
        >
          <Meerkat pose={pop.pose} width={68} decorative eager />
        </motion.div>
      )}
    </AnimatePresence>
  );
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
        <motion.div
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
