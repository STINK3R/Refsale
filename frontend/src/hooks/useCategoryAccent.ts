import { useEffect } from 'react';
import { useActiveCategory } from '../store';

const DEFAULT_ACCENT = '#FFE45C';

/** The same colour a step darker: the outer edge of the photo card's glow. */
function deepen(hex: string, amount = 0.14): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Paints the page in the open category's accent colour. */
export default function useCategoryAccent() {
  const category = useActiveCategory();
  const raw = category?.accent_color?.trim() || '';
  const accent = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : DEFAULT_ACCENT;
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--color-accent', accent);
    root.setProperty('--color-accent-deep', deepen(accent));
  }, [accent]);
}
