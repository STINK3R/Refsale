import Stars from './Stars';
import { reviewsWord } from '../../utils/words';
import type { ReviewSummary } from '../../api/client';

/** The average, the count and a bar for each star; a bar picks that star. */
export default function RatingSummary({ summary, onStar, activeStar, compact = false }: {
  summary: ReviewSummary; onStar?: (star: number) => void; activeStar?: number | null; compact?: boolean;
}) {
  const { avg, count, by_star } = summary;
  return (
    <div className={`flex ${compact ? 'items-center gap-5' : 'max-sm:flex-col sm:items-center gap-6 max-sm:gap-4'}`}>
      <div className="shrink-0">
        <div className="flex items-end gap-2">
          <span className={`font-display leading-none text-ink ${compact ? 'text-[40px]' : 'text-[56px] max-sm:text-[46px]'}`}>{avg ? avg.toFixed(1) : '—'}</span>
          <span className="text-[13px] text-muted pb-1.5">из 5</span>
        </div>
        <Stars value={avg || 0} size={compact ? 18 : 22} className="mt-2" />
        <div className="mt-1.5 text-[13px] font-semibold text-ink/70">{count} {reviewsWord(count)}</div>
      </div>
      {!compact && (
        <ul className="flex-1 min-w-0 w-full space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = by_star[String(star)] || 0;
            const pct = count ? Math.round((n / count) * 100) : 0;
            const Row = onStar ? 'button' : 'div';
            return (
              <li key={star}>
                <Row
                  {...(onStar ? { onClick: () => onStar(star), type: 'button' as const } : {})}
                  className={`w-full flex items-center gap-2.5 text-[13px] font-semibold ${onStar ? 'cursor-pointer hover:opacity-80' : ''} ${activeStar === star ? 'text-ink' : 'text-ink/70'}`}
                >
                  <span className="w-7 shrink-0 text-left tabular-nums">{star} <span className="text-[#F5A300]">★</span></span>
                  <span className={`flex-1 h-2.5 rounded-full overflow-hidden ${activeStar === star ? 'bg-ink/20' : 'bg-ink/10'}`}>
                    <span className="block h-full rounded-full bg-[#F5A300]" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted">{n}</span>
                </Row>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
