import { useEffect, useMemo, useRef } from 'react';
import type { Subcategory } from '../../types';

/** One copy of the strip holds at least this many logos, so it is wider than the screen. */
const MIN_PER_COPY = 14;
/** How fast it runs by itself, in pixels a second (about a logo in three seconds). */
const SPEED = 52;
/** After a swipe or a drag it waits this long before running again. */
const RESUME_MS = 2600;
/** Logos are sized by area, not by height: a long wordmark (CHANEL) and a
 *  stacked crest (Givenchy) then look equally heavy. */
const LOGO_AREA = 150 * 38;
const MAX_W = 172, MAX_H = 52;

function fitLogo(img: HTMLImageElement) {
  const r = img.naturalWidth / img.naturalHeight;
  if (!r) return;
  let h = Math.min(MAX_H, Math.sqrt(LOGO_AREA / r));
  let w = h * r;
  if (w > MAX_W) { w = MAX_W; h = w / r; }
  img.style.width = `${Math.round(w)}px`;
  img.style.height = `${Math.round(h)}px`;
}

/**
 * A running strip of brand logos (subcategories marked as brands in the admin
 * panel). A brand without an uploaded logo shows its name instead.
 *
 * It runs by itself, and it is also a real scroller: a finger swipes it (or a
 * mouse drags it) to look for a brand, and it runs on a moment later. Three
 * copies of the list sit side by side and the position is kept in the middle
 * one, so it never reaches an end either way. Hovering or focusing pauses it;
 * a tap picks the brand.
 */
export default function BrandMarquee({ brands, onPick, label = 'Бренды' }: {
  brands: Subcategory[];
  onPick: (brand: Subcategory) => void;
  label?: string;
}) {
  const copy = useMemo(() => {
    if (!brands.length) return [];
    const reps = Math.max(1, Math.ceil(MIN_PER_COPY / brands.length));
    return Array.from({ length: reps }, () => brands).flat();
  }, [brands]);
  const scroller = useRef<HTMLDivElement>(null);
  const firstCopy = useRef<HTMLUListElement>(null);
  // A drag with the mouse is not a click on the logo under it
  const dragged = useRef(false);

  useEffect(() => {
    const el = scroller.current;
    const one = firstCopy.current;
    if (!el || !one) return;
    let width = one.offsetWidth;
    let pos = width;            // kept as a float: scrollLeft rounds
    let last = 0;
    let frame = 0;
    let hold = 0;               // until this time it stays still (after a swipe)
    let hovering = false, focused = false, touching = false;
    let drag: { x: number; start: number; id: number } | null = null;

    const wrap = () => {
      // Stay in the middle copy: the same picture, one copy over
      if (pos < width * 0.5) pos += width;
      else if (pos >= width * 1.5) pos -= width;
    };
    el.scrollLeft = pos;

    const tick = (t: number) => {
      const dt = last ? Math.min(t - last, 64) : 0;
      last = t;
      if (!hovering && !focused && !touching && !drag && t > hold && document.visibilityState === 'visible') {
        pos += (SPEED * dt) / 1000;
        wrap();
        el.scrollLeft = pos;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const pause = () => { hold = performance.now() + RESUME_MS; };
    // The visitor scrolled it themselves (swipe, its momentum, a wheel): take
    // up from where it is, and keep it inside the middle copy
    const onScroll = () => {
      if (Math.abs(el.scrollLeft - pos) < 2) return;   // our own step
      pos = el.scrollLeft;
      const before = pos;
      wrap();
      if (pos !== before) el.scrollLeft = pos;
      pause();
    };
    const onTouchStart = () => { touching = true; pause(); };
    const onTouchEnd = () => { touching = false; pause(); };
    const onEnter = () => { hovering = true; };
    const onLeave = () => { hovering = false; };
    const onFocusIn = () => { focused = true; };
    const onFocusOut = () => { focused = false; };
    // A mouse drags it like a finger
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, start: el.scrollLeft, id: e.pointerId };
      dragged.current = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!dragged.current && Math.abs(dx) < 6) return;
      if (!dragged.current) { dragged.current = true; el.setPointerCapture(e.pointerId); el.classList.add('is-dragging'); }
      pos = drag.start - dx;
      el.scrollLeft = pos;
      const before = pos;
      wrap();
      if (pos !== before) { el.scrollLeft = pos; drag.start += pos - before; }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      el.classList.remove('is-dragging');
      pause();
    };
    const onResize = () => {
      const w = one.offsetWidth;
      if (w && w !== width) { pos = (pos % width) + w; width = w; el.scrollLeft = pos; }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(one);

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('wheel', pause, { passive: true });
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', pause);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [copy]);

  if (brands.length < 3) return null;

  return (
    <div className="bg-card border-y-2 border-ink" role="region" aria-label={label}>
      <div className="flex items-stretch">
        <div className="shrink-0 flex items-center px-6 bg-ink text-sun font-display text-[13px] uppercase tracking-[0.14em] max-md:hidden">
          {label}
        </div>
        <div ref={scroller} className="marquee flex-1 min-w-0 py-3.5 overflow-x-auto scrollbar-hide">
          <div className="flex w-max">
            {[0, 1, 2].map((part) => (
              <ul key={part} ref={part === 0 ? firstCopy : undefined} className="flex shrink-0 items-center gap-3 pr-3" aria-hidden={part > 0 || undefined}>
                {copy.map((b, i) => {
                  // Screen readers and the Tab key meet each brand once
                  const repeat = part > 0 || i >= brands.length;
                  return (
                    <li key={`${part}-${i}`} aria-hidden={repeat || undefined}>
                      <button
                        type="button"
                        tabIndex={repeat ? -1 : 0}
                        onClick={(e) => { if (dragged.current) { e.preventDefault(); dragged.current = false; return; } onPick(b); }}
                        title={b.name}
                        className="h-[76px] max-sm:h-[68px] min-w-[150px] max-sm:min-w-[132px] px-6 max-sm:px-4 rounded-ctl-md border-2 border-ink/10 bg-white grid place-items-center cursor-pointer hover:border-ink hover:-translate-y-0.5 transition-[border-color,translate]"
                      >
                        {b.image
                          ? <img src={b.image} alt={b.name} decoding="async" draggable={false} onLoad={(e) => fitLogo(e.currentTarget)} className="max-h-[52px] max-w-[172px] object-contain max-sm:scale-90" />
                          : <span className="font-display text-[17px] max-sm:text-[15px] uppercase tracking-[0.1em] text-ink whitespace-nowrap">{b.name}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
