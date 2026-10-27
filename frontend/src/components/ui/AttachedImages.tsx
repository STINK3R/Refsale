import { useMemo, useState } from 'react';
import Lightbox from './Lightbox';
import { isVideoUrl } from '../../utils/media';

/**
 * Renders photo attachments (reviews, chat messages) as a small thumbnail grid
 * that opens the zoomable viewer on click.
 *
 * The API stores the list as a JSON string, but hands it back as a string or an
 * array depending on the endpoint, so both shapes are accepted here.
 */
function parseImages(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(u => typeof u === 'string');
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

interface AttachedImagesProps {
  images: string | string[] | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
  /** Fires when the viewer opens/closes — lets a carousel pause itself. */
  onViewerChange?: (open: boolean) => void;
  /** Classes for the first photo, shown large (reviews); the rest stay thumbnails. */
  leadClassName?: string;
}

export default function AttachedImages({ images, size = 'md', className = '', onViewerChange, leadClassName }: AttachedImagesProps) {
  const all = useMemo(() => parseImages(images), [images]);
  const urls = useMemo(() => all.filter((u) => !isVideoUrl(u)), [all]);
  const videos = useMemo(() => all.filter(isVideoUrl), [all]);
  const [openAt, setOpenAt] = useState<number | null>(null);

  const setOpen = (index: number | null) => {
    setOpenAt(index);
    onViewerChange?.(index !== null);
  };

  if (!all.length) return null;

  const box = size === 'sm' ? 'w-16 h-16' : 'w-20 h-20';

  return (
    <>
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {videos.map((url) => (
          <video
            key={url}
            src={url}
            controls
            playsInline
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[260px] max-h-[320px] rounded-[12px] border border-border bg-ink"
          />
        ))}
        {urls.map((url, i) => (
          <button
            key={url + i}
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(i); }}
            title="Открыть фото"
            className={`${i === 0 && leadClassName ? leadClassName : `${box} rounded-ctl-xs`} overflow-hidden border border-border bg-bg cursor-zoom-in hover:opacity-90 transition-opacity p-0`}
          >
            <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {openAt !== null && (
        <Lightbox images={urls} startIndex={openAt} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
