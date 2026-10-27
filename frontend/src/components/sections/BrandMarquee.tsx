import { useMemo, type CSSProperties } from 'react';
import type { Subcategory } from '../../types';

/** One copy of the strip holds at least this many logos, so it is wider than the screen. */
const MIN_PER_COPY = 14;
const SECONDS_PER_LOGO = 3.2;
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
 * panel). A brand without an uploaded logo shows its name instead. Hovering
 * or focusing pauses it; a tap picks the brand.
 */
export default function BrandMarquee({ brands, onPick, label = 'Бренды' }: {
  brands: Subcategory[];
  onPick: (brand: Subcategory) => void;
  label?: string;
}) {
  // The list repeated to fill one copy; the track holds two copies and slides
  // by exactly one, so the loop has no seam.
  const copy = useMemo(() => {
    if (!brands.length) return [];
    const reps = Math.max(1, Math.ceil(MIN_PER_COPY / brands.length));
    return Array.from({ length: reps }, () => brands).flat();
  }, [brands]);

  if (brands.length < 3) return null;

  return (
    <div className="bg-card border-y-2 border-ink" role="region" aria-label={label}>
      <div className="flex items-stretch">
        <div className="shrink-0 flex items-center px-6 bg-ink text-sun font-display text-[13px] uppercase tracking-[0.14em] max-md:hidden">
          {label}
        </div>
        <div className="marquee flex-1 min-w-0 py-3.5" style={{ '--marquee-duration': `${copy.length * SECONDS_PER_LOGO}s` } as CSSProperties}>
          <div className="marquee-track">
            {[0, 1].map((half) => (
              <ul key={half} className="flex shrink-0 items-center gap-3 pr-3" aria-hidden={half === 1 || undefined}>
                {copy.map((b, i) => {
                  // Screen readers and the Tab key meet each brand once
                  const repeat = half === 1 || i >= brands.length;
                  return (
                    <li key={`${half}-${i}`} aria-hidden={repeat || undefined}>
                      <button
                        type="button"
                        tabIndex={repeat ? -1 : 0}
                        onClick={() => onPick(b)}
                        title={b.name}
                        className="h-[76px] max-sm:h-[68px] min-w-[150px] max-sm:min-w-[132px] px-6 max-sm:px-4 rounded-ctl-md border-2 border-ink/10 bg-white grid place-items-center cursor-pointer hover:border-ink hover:-translate-y-0.5 transition-[border-color,translate]"
                      >
                        {b.image
                          ? <img src={b.image} alt={b.name} decoding="async" onLoad={(e) => fitLogo(e.currentTarget)} className="max-h-[52px] max-w-[172px] object-contain max-sm:scale-90" />
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
