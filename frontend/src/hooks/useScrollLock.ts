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

/** Locks page scrolling while `active` is true. */
export default function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}
