import { useEffect } from 'react';
import { useActiveCategory, useAppStore } from '../store';

const DEFAULT_ACCENT = '#FFE45C';

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

const isHex = (v?: string) => /^#[0-9a-fA-F]{6}$/.test(v?.trim() || '');

/**
 * Paints the page in the open category's colours:
 * - accent: the soft colour set in the admin panel — the photo card, tiles, footer;
 * - accent-deep: a step darker, the edge of the photo card's glow;
 * - accent-strong: the contact bar, the active tab, highlights. Taken from the
 *   admin panel when set there, otherwise the card's own edge colour, so the
 *   bars always match the photo card rather than shouting over it.
 * The page background is the soft colour mixed into cream (index.css). The
 * header takes the same colours at once through its own, unanimated pair.
 */
export default function useCategoryAccent() {
  const category = useActiveCategory();
  const loading = useAppStore((s) => s.loading);
  const accent = isHex(category?.accent_color) ? category!.accent_color!.trim() : DEFAULT_ACCENT;
  const strongSet = isHex(category?.accent_strong) ? category!.accent_strong!.trim() : '';
  useEffect(() => {
    const [h, s, l] = hexToHsl(accent);
    const edge = Math.min(0.8, Math.max(0.55, l - 0.14));
    const root = document.documentElement.style;
    const strong = strongSet || hsl(h, s < 0.15 ? s : Math.max(s, 0.7), edge);
    root.setProperty('--color-accent', accent);
    root.setProperty('--color-accent-deep', hsl(h, s, Math.max(0, l - 0.12)));
    root.setProperty('--color-accent-strong', strong);
    // The header's copy, which switches at once (index.css)
    root.setProperty('--header-accent', accent);
    root.setProperty('--header-accent-strong', strong);
    // Glide from the next change on. The first category's colours apply at
    // once: a glide at load would restyle the whole page every frame.
    const html = document.documentElement;
    if (!loading && !html.classList.contains('accent-glide')) {
      requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add('accent-glide')));
    }
  }, [accent, strongSet, loading]);
}
