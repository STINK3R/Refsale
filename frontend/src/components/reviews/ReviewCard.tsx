import { BadgeCheck } from 'lucide-react';
import AttachedImages from '../ui/AttachedImages';
import Avatar from '../ui/Avatar';
import Stars from './Stars';
import { formatDate, unescapeHtml } from '../../utils/format';
import type { Review } from '../../types';

/**
 * One review, the way marketplaces show it: who, when, the stars, the product
 * it is about, «купил на RefSale», the text and the photos. `compact` clamps
 * the text for the row of latest reviews; the full list shows it whole.
 */
export default function ReviewCard({ review, compact = false, onOpen, onViewerChange, showProduct = true, className = '' }: {
  review: Review; compact?: boolean; onOpen?: () => void; onViewerChange?: (open: boolean) => void; showProduct?: boolean; className?: string;
}) {
  const name = unescapeHtml(review.user_name);
  const long = review.text.length > 220;
  return (
    <article className={`bg-card border-2 border-ink rounded-[22px] max-sm:rounded-[18px] p-5 max-sm:p-4 flex flex-col ${className}`}>
      <header className="flex items-center gap-3">
        <Avatar name={name} url={review.avatar_url} colorKey={`u${review.user_id}`} size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] leading-tight text-ink truncate">{name}</div>
          <div className="text-[12.5px] text-muted mt-0.5">{formatDate(review.created_at)}</div>
        </div>
        <Stars value={review.rating} size={18} className="shrink-0" />
      </header>
      {(review.verified || (showProduct && review.product_name)) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {review.verified && (
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#DDF5E5] border border-[#9ED6B0] text-[11px] font-bold text-[#13723A]">
              <BadgeCheck size={13} strokeWidth={2.4} /> Купил на RefSale
            </span>
          )}
          {showProduct && review.product_name && (
            <span className="inline-flex items-center gap-1.5 h-6 max-w-full pl-0.5 pr-2 rounded-full bg-surface border border-ink/10 text-[11.5px] font-semibold text-ink/80">
              {review.product_image && <img src={review.product_image} alt="" className="w-5 h-5 rounded-full object-contain bg-white" />}
              <span className="truncate">{review.product_name}</span>
            </span>
          )}
        </div>
      )}
      <p className={`mt-3 text-[14px] leading-[1.6] text-ink/80 whitespace-pre-line break-words ${compact ? 'line-clamp-4' : ''}`}>
        {unescapeHtml(review.text)}
      </p>
      <AttachedImages images={review.images} size="sm" className="mt-3" onViewerChange={onViewerChange} />
      {compact && onOpen && (long || (review.images && review.images !== '[]')) && (
        <button onClick={onOpen} className="mt-auto pt-3 self-start text-[13px] font-bold text-ink underline underline-offset-4 decoration-2 decoration-sun hover:decoration-ink cursor-pointer">
          Читать полностью
        </button>
      )}
    </article>
  );
}
