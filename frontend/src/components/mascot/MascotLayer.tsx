import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import Otter from './Otter';

/**
 * The otter that makes the site memorable, as the brief asks:
 * - with a mouse it trails the cursor on a soft spring and hops on click;
 * - on a touch screen it pops up where the screen was tapped.
 * It never takes clicks itself and stays away for "reduce motion" users.
 */
export default function MascotLayer() {
  const [mode] = useState<'cursor' | 'tap' | null>(() => {
    // localStorage.refsale_mascot = 'on' shows it anyway (for demos on such machines).
    const forced = localStorage.getItem('refsale_mascot') === 'on';
    if (!forced && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    return window.matchMedia('(pointer: fine)').matches ? 'cursor' : 'tap';
  });

  if (mode === 'cursor') return <CursorOtter />;
  if (mode === 'tap') return <TapOtter />;
  return null;
}

const OFFSET = 18;

function CursorOtter() {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
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
        animate={hop ? { y: [0, -16, 0], rotate: [0, -8, 0] } : undefined}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="drop-shadow-[0_3px_0_rgba(17,17,17,0.18)]"
      >
        <Otter size={52} waving={hop % 2 === 1} />
      </motion.div>
    </motion.div>
  );
}

interface Pop { id: number; x: number; y: number }

function TapOtter() {
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
      setPop({ id: ++nextId.current, x: e.clientX, y: e.clientY });
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
          animate={{ opacity: 1, scale: 1, y: -34 }}
          exit={{ opacity: 0, scale: 0.6, y: -50 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          style={{ left: pop.x - 30, top: pop.y - 50 }}
          className="fixed z-[5000] pointer-events-none"
        >
          <Otter size={60} waving />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
