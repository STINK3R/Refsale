/**
 * Shown while a page's code or data is on its way. It fades in only after a
 * moment, so on a fast connection nothing flickers; on a slow one the visitor
 * sees the site is working rather than an empty screen.
 */
export default function PageLoader({ label = 'Загружаем', className = 'min-h-[70vh]' }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`page-loader flex flex-col items-center justify-center gap-4 ${className}`}>
      <img src="/icon-192.png" alt="" width={64} height={64} className="loader-pulse w-16 h-16 rounded-[18px] border-2 border-ink" />
      <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-ink">
        {label}
        <span className="loader-dots" aria-hidden="true"><i /><i /><i /></span>
      </div>
    </div>
  );
}
