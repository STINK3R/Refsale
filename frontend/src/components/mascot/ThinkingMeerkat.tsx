import { useEffect, useRef } from 'react';

/** 40 frames of 133×145 in an 8×5 sheet, on white (the plates it sits on are
 *  white). Cut from the generated sheet (img/mascot/thinking-sheet-source.webp,
 *  kept out of git like the other sources) and aligned on the feet, so the
 *  meerkat does not jump between frames. */
const SHEET = '/mascot/thinking-anim.webp';
const FIRST = '/mascot/thinking-anim-0.webp';
const COLS = 8, ROWS = 5;
const FPS = 12;
/** Thinks, blinks, gets the idea, winks: frames 0–31. The yawn (32–39) only
 *  every third time — in «Не нашли?» it should not read as boredom. */
const STORY_END = 32, ALL = COLS * ROWS, YAWN_EVERY = 3;
/** On the first frame between two runs, thinking. */
const PAUSE_MS = 1600;

/**
 * The thinking meerkat, alive, for the «Не нашли?» plate. It runs only while
 * it is on screen and the tab is open; the sheet loads only when it is near.
 * It runs under reduced motion too, like the brand strip: it is small and
 * slow, and it is the point of the plate — and Windows with «Эффекты
 * анимации» off reports reduced motion to every site, so it would just stand.
 */
export default function ThinkingMeerkat({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0, runs = 0, visible = false, loaded = false, loading = false;
    let resumeAt = 0;
    const show = (f: number) => {
      el.style.backgroundPosition = `${((f % COLS) / (COLS - 1)) * 100}% ${(Math.floor(f / COLS) / (ROWS - 1)) * 100}%`;
    };
    const load = () => {
      if (loading) return;
      loading = true;
      const img = new Image();
      img.onload = () => {
        loaded = true;
        el.style.backgroundImage = `url(${SHEET})`;
        el.style.backgroundSize = `${COLS * 100}% ${ROWS * 100}%`;
        show(0);
        resumeAt = performance.now() + PAUSE_MS / 2;
      };
      img.src = SHEET;
    };
    const timer = window.setInterval(() => {
      if (!visible || !loaded || document.hidden) return;
      const now = performance.now();
      if (now < resumeAt) return;
      frame += 1;
      const end = runs % YAWN_EVERY === YAWN_EVERY - 1 ? ALL : STORY_END;
      if (frame >= end) { frame = 0; runs += 1; resumeAt = now + PAUSE_MS; }
      show(frame);
    }, 1000 / FPS);
    // Fetch the sheet a little before the plate comes into view
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) load(); }, { rootMargin: '400px 0px' });
    const seen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.4 });
    near.observe(el);
    seen.observe(el);
    return () => { clearInterval(timer); near.disconnect(); seen.disconnect(); };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`bg-no-repeat select-none ${className}`}
      style={{ aspectRatio: '133 / 145', backgroundImage: `url(${FIRST})`, backgroundSize: '100% 100%' }}
    />
  );
}
