import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import useScrollLock from '../../hooks/useScrollLock';

/**
 * Full-screen image viewer.
 *
 * Product images are shown uncropped everywhere else in the UI, so this is
 * where a user goes to actually inspect one: wheel / pinch / buttons to zoom,
 * drag to pan, arrows or swipe between images of the same product.
 */
interface LightboxProps {
  images: string[];
  startIndex?: number;
  alt?: string;
  onClose: () => void;
}

const MAX_SCALE = 5;
const MIN_SCALE = 1;

export default function Lightbox({ images, startIndex = 0, alt = '', onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  useScrollLock(true);

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);

  const go = useCallback((delta: number) => {
    setIndex(i => (i + delta + images.length) % images.length);
    reset();
  }, [images.length, reset]);

  const zoomBy = useCallback((factor: number) => {
    setScale(s => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Keyboard: Esc closes, arrows page, +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && images.length > 1) go(-1);
      else if (e.key === 'ArrowRight' && images.length > 1) go(1);
      else if (e.key === '+' || e.key === '=') zoomBy(1.4);
      else if (e.key === '-') zoomBy(1 / 1.4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go, zoomBy, images.length]);

  // Plain wheel must not resize the photo — scrolling is scrolling. Zoom is an
  // explicit action: Ctrl/⌘ + wheel, the buttons, double click, or a pinch.
  // Once zoomed in, the wheel pans around the enlarged image instead.
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
      return;
    }
    if (scale > 1) {
      setOffset(o => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }));
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale === 1) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  // Two-finger pinch on touch devices.
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    pinchRef.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.scale * (dist / pinchRef.current.dist)));
    setScale(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
  };
  const onTouchEnd = () => { pinchRef.current = null; };

  if (!images.length) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[5000] bg-black/90 flex flex-col select-none"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 text-white/90 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-sm font-medium tabular-nums">
          {images.length > 1 ? `${index + 1} / ${images.length}` : ''}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => zoomBy(1 / 1.4)} disabled={scale <= MIN_SCALE} title="Уменьшить" aria-label="Уменьшить"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 disabled:opacity-30 transition-colors cursor-pointer bg-transparent border-none text-white">
            <ZoomOut size={20} />
          </button>
          <span className="text-xs w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => zoomBy(1.4)} disabled={scale >= MAX_SCALE} title="Увеличить" aria-label="Увеличить"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 disabled:opacity-30 transition-colors cursor-pointer bg-transparent border-none text-white">
            <ZoomIn size={20} />
          </button>
          <button onClick={reset} disabled={scale === 1} title="Сбросить" aria-label="Сбросить масштаб"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 disabled:opacity-30 transition-colors cursor-pointer bg-transparent border-none text-white">
            <RotateCcw size={18} />
          </button>
          <button onClick={onClose} title="Закрыть" aria-label="Закрыть"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors cursor-pointer bg-transparent border-none text-white ml-1">
            <X size={22} />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={images[index]}
          alt={alt}
          draggable={false}
          onDoubleClick={() => (scale === 1 ? zoomBy(2) : reset())}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in',
          }}
          className="max-w-full max-h-full object-contain transition-transform duration-100 will-change-transform"
        />

        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Предыдущее фото"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white transition-colors cursor-pointer border-none">
              <ChevronLeft size={24} />
            </button>
            <button onClick={() => go(1)} aria-label="Следующее фото"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white transition-colors cursor-pointer border-none">
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="shrink-0 flex gap-2 justify-center px-4 py-3 overflow-x-auto" onClick={e => e.stopPropagation()}>
          {images.map((src, i) => (
            <button key={src + i} onClick={() => { setIndex(i); reset(); }}
              className={`w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-white/10 ${i === index ? 'border-bg' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
