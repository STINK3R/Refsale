import type { ReactNode } from 'react';

/** The small pill over a heading — the same chip as on the photo cards. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center h-8 max-sm:h-7 px-3.5 max-sm:px-3 rounded-full border-2 border-ink bg-card text-[11.5px] max-sm:text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink ${className}`}>
      {children}
    </span>
  );
}

/**
 * A section's heading: the pill, then the title with a highlighter stroke in
 * the page's strong colour — one look for every section on every page.
 */
export default function SectionHead({ label, title, inline = false, className = '', level = 2 }: {
  label: ReactNode; title: ReactNode; inline?: boolean; className?: string; level?: 1 | 2;
}) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div className={`${inline ? 'mb-4' : 'mb-8 max-md:mb-6'} ${className}`}>
      <Eyebrow>{label}</Eyebrow>
      <H className="mt-3.5 max-sm:mt-3 font-display text-[clamp(28px,3.4vw,46px)] leading-[1.08] text-ink">
        <span className="marker">{title}</span>
      </H>
    </div>
  );
}

/** A heading inside a section ("Как проходит заказ"): smaller, same stroke. */
export function SubHead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`font-display text-[22px] max-sm:text-[19px] leading-tight text-ink ${className}`}>
      <span className="marker">{children}</span>
    </h3>
  );
}
