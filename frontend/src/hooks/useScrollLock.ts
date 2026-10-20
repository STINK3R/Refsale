import { useEffect } from 'react';

/**
 * Freezes the page behind an overlay.
 *
 * Two reasons this is a shared hook rather than `body.style.overflow` inline:
 *
 *  1. Reference counting. Modals stack (product card → photo viewer), and the
 *     inner one closing used to clear the lock while the outer one was still
 *     open, so the page started scrolling under it again.
 *  2. `overflow: hidden` alone does not hold on iOS Safari — the page keeps
 *     scrolling behind the overlay. Pinning the body and restoring the offset
 *     afterwards does, without the reading position jumping on close.
 */
let lockCount = 0;
let savedScrollY = 0;

function applyLock() {
  savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const body = document.body;
  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
}

function releaseLock() {
  const body = document.body;
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';
  body.style.overflow = '';
  window.scrollTo(0, savedScrollY);
}

export function lockScroll(): void {
  if (lockCount === 0) applyLock();
  lockCount += 1;
}

export function unlockScroll(): void {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) releaseLock();
}

/**
 * Sends the page to the top — also when an overlay holds the scroll right now.
 * Navigating from the side menu used to land at the bottom of the new page:
 * the menu closed after the route change and restored the old offset.
 */
export function scrollPageToTop(): void {
  if (lockCount > 0) {
    savedScrollY = 0;
    document.body.style.top = '0px';
    return;
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

let glideFrame = 0;

/**
 * Glides the page to the top, frame by frame. The browser's own smooth scroll
 * gets cut short when the page changes height underneath it (switching a
 * category swaps the whole catalog), this one does not. A wheel or touch from
 * the visitor stops it, and "reduce motion" jumps straight up.
 */
export function glidePageToTop(onTop?: () => void): void {
  cancelAnimationFrame(glideFrame);
  const from = window.scrollY;
  if (lockCount > 0 || from < 4 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scrollPageToTop();
    onTop?.();
    return;
  }
  const duration = Math.min(900, Math.max(350, from * 0.35));
  const start = performance.now();
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let finished = false;
  const stop = () => {
    cancelAnimationFrame(glideFrame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    if (!finished) { finished = true; onTop?.(); }
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    window.scrollTo({ top: from * (1 - ease(t)), left: 0, behavior: 'instant' });
    if (t < 1) glideFrame = requestAnimationFrame(step);
    else stop();
  };
  glideFrame = requestAnimationFrame(step);
}

/** Locks page scrolling while `active` is true. */
export default function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}
