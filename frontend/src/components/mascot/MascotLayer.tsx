import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import Meerkat from './Meerkat';
import { useUiStore } from '../../store/ui';
import { usePromoStore } from '../../store';

/**
 * The meerkat that makes the site memorable, as the brief asks:
 * - with a mouse it peeks out next to the cursor on a soft spring and hops on click;
 * - on a touch screen it pops up where the screen was tapped, waving or jumping;
 * - on big moments (promo code applied, order placed) it comes out with a line.
 * It never takes clicks itself. "Reduce motion" users get only the big moments.
 */
export default function MascotLayer() {
  const [mode] = useState<'cursor' | 'tap' | null>(() => {
    // localStorage.refsale_mascot = 'on' shows it anyway (for demos on such machines).
    const forced = localStorage.getItem('refsale_mascot') === 'on';
    if (!forced && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    return window.matchMedia('(pointer: fine)').matches ? 'cursor' : 'tap';
  });

  return (
    <>
      {mode === 'cursor' && <CursorMeerkat />}
      {mode === 'tap' && <TapMeerkat />}
      <MascotMoments />
    </>
  );
}

const OFFSET = 16;

function CursorMeerkat() {
  const x = useMotionValue(-300);
  const y = useMotionValue(-300);
  const sx = useSpring(x, { stiffness: 140, damping: 18, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 140, damping: 18, mass: 0.6 });
  const [visible, setVisible] = useState(false);
  const [hop, setHop] = useState(0);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      x.set(e.clientX + OFFSET);
      y.set(e.clientY + OFFSET);
      setVisible(true);
    };
    const leave = (e: MouseEvent) => { if (!e.relatedTarget) setVisible(false); };
    const click = () => setHop((n) => n + 1);
    window.addEventListener('mousemove', move, { passive: true });
    document.addEventListener('mouseout', leave);
    window.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseout', leave);
      window.removeEventListener('mousedown', click);
    };
  }, [x, y]);

  return (
    <motion.div
      aria-hidden="true"
      style={{ x: sx, y: sy }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.25 }}
      className="fixed top-0 left-0 z-[5000] pointer-events-none"
    >
      <motion.div
        key={hop}
        initial={hop ? { y: 0, rotate: 0 } : false}
        animate={hop ? { y: [0, -14, 0], rotate: [0, -6, 0] } : undefined}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <Meerkat pose="peek" width={70} decorative eager />
      </motion.div>
    </motion.div>
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
          <div className="flex items-end gap-2">
            <Meerkat pose={moment.pose} width={110} decorative eager className="max-sm:w-[86px]" />
            <div className="mb-16 max-sm:mb-12 px-4 py-2.5 rounded-2xl rounded-bl-sm bg-sun border-2 border-ink shadow-[0_4px_0_#111] text-[14px] max-sm:text-[13px] font-bold max-w-[220px]">
              {moment.text}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
