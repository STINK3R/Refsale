/** Five stars, the first `value` (rounded) lit. */
export default function Stars({ value, size = 16, className = '' }: { value: number; size?: number; className?: string }) {
  const lit = Math.round(value);
  return (
    <span role="img" aria-label={`Оценка ${value} из 5`} className={`inline-flex leading-none tracking-[0.06em] ${className}`} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= lit ? 'text-[#F5A300]' : 'text-ink/15'}>★</span>)}
    </span>
  );
}
