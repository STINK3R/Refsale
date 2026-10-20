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

export const isScrollLocked = (): boolean => lockCount > 0;

let glideFrame = 0;
let glideStop: ((superseded?: boolean) => void) | null = null;

/**
 * Glides the page to `target` — a y offset, or a function giving one, read
 * again every frame so a target that moves while pictures load is still hit.
 *
 * Our own frame-by-frame scroll instead of the browser's smooth one: Chrome
 * turns that into a jump when Windows has "Animation effects" off, and cuts it
 * short when the page changes height underneath (a category switch swaps the
 * whole catalog). It runs for "reduce motion" too — it is short, and a wheel
 * or touch from the visitor stops it at once.
 */
export function glidePageTo(target: number | (() => number), onDone?: () => void): void {
  glideStop?.(true); // a newer glide wins; the old one's onDone is dropped
  const read = typeof target === 'number' ? () => target : target;
  const clamp = (y: number) => Math.max(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, y));
  const from = window.scrollY;
  const to = clamp(read());
  if (lockCount > 0) {
    // An overlay holds the page: put it where it should be once released
    savedScrollY = to;
    document.body.style.top = `-${to}px`;
    onDone?.();
    return;
  }
  if (Math.abs(to - from) < 4) {
    window.scrollTo({ top: to, left: 0, behavior: 'instant' });
    onDone?.();
    return;
  }
  const duration = Math.min(900, Math.max(350, Math.abs(to - from) * 0.35));
  const start = performance.now();
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const byVisitor = () => stop();
  const stop = (superseded = false) => {
    cancelAnimationFrame(glideFrame);
    window.removeEventListener('wheel', byVisitor);
    window.removeEventListener('touchstart', byVisitor);
    glideStop = null;
    if (!superseded) onDone?.();
  };
  glideStop = stop;
  window.addEventListener('wheel', byVisitor, { passive: true });
  window.addEventListener('touchstart', byVisitor, { passive: true });
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    window.scrollTo({ top: from + (clamp(read()) - from) * ease(t), left: 0, behavior: 'instant' });
    if (t < 1) glideFrame = requestAnimationFrame(step);
    else stop();
  };
  glideFrame = requestAnimationFrame(step);
}

/** Glides to the top, then calls `onTop` (also when the visitor stops it). */
export function glidePageToTop(onTop?: () => void): void {
  glidePageTo(0, onTop);
}

/** Glides to a section; it stops just under the header (scroll-margin-top). */
export function glideToElement(selector: string): void {
  const el = document.querySelector(selector);
  if (!el) return;
  glidePageTo(() => el.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0));
}

/** Locks page scrolling while `active` is true. */
export default function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}
