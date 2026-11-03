import { initials, nickColor } from '../../utils/nick';

/** A member's picture, or their initials on a colour of their own. */
export default function Avatar({ name, url, colorKey, size = 44, className = '' }: {
  name: string; url?: string | null; colorKey?: string; size?: number; className?: string;
}) {
  const style = { width: size, height: size };
  if (url) {
    return <img src={url} alt="" width={size} height={size} loading="lazy" className={`rounded-full object-cover border-2 border-ink shrink-0 bg-card ${className}`} style={style} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`rounded-full border-2 border-ink grid place-items-center shrink-0 font-bold text-white ${className}`}
      style={{ ...style, background: nickColor(colorKey || name), fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}
