import { useMemo, useState } from 'react';
import Lightbox from './Lightbox';

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
}

export default function AttachedImages({ images, size = 'md', className = '', onViewerChange }: AttachedImagesProps) {
  const urls = useMemo(() => parseImages(images), [images]);
  const [openAt, setOpenAt] = useState<number | null>(null);

  const setOpen = (index: number | null) => {
    setOpenAt(index);
    onViewerChange?.(index !== null);
  };

  if (!urls.length) return null;

  const box = size === 'sm' ? 'w-16 h-16' : 'w-20 h-20';

  return (
    <>
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {urls.map((url, i) => (
          <button
            key={url + i}
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(i); }}
            title="Открыть фото"
            className={`${box} rounded-lg overflow-hidden border border-border bg-bg cursor-zoom-in hover:opacity-90 transition-opacity p-0`}
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
