/**
 * RefSale's otter. Flat and graphic on purpose — a brown silhouette with a
 * cream muzzle and the brand's yellow price tag with a pink "%" in its paws —
 * so it reads as part of the site's style rather than a cartoon sticker.
 */
const FUR = '#4A3222';
const FUR_LIGHT = '#8A6244';
const CREAM = '#F6E4C6';
const INK = '#111111';

export default function Otter({ size = 96, className = '', waving = false }: { size?: number; className?: string; waving?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="Выдра RefSale"
    >
      {/* body: a long otter neck sliding out of the bottom edge */}
      <path d="M30 120 C28 98 38 84 60 84 C82 84 92 98 90 120 Z" fill={FUR} stroke={INK} strokeWidth="2.5" />
      <path d="M45 120 C45 104 51 95 60 95 C69 95 75 104 75 120 Z" fill={CREAM} />
      {/* small ears, low on the sides of a wide, flat head */}
      <ellipse cx="25" cy="46" rx="6" ry="5" fill={FUR} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="95" cy="46" rx="6" ry="5" fill={FUR} stroke={INK} strokeWidth="2.5" />
      <path d="M22 58 C22 38 38 26 60 26 C82 26 98 38 98 58 C98 76 82 88 60 88 C38 88 22 76 22 58 Z" fill={FUR} stroke={INK} strokeWidth="2.5" />
      {/* lighter cheeks and a broad cream muzzle */}
      <path d="M30 64 C32 54 44 50 60 50 C76 50 88 54 90 64 C88 78 76 84 60 84 C44 84 32 78 30 64 Z" fill={FUR_LIGHT} />
      <ellipse cx="60" cy="69" rx="21" ry="14" fill={CREAM} />
      {/* eyes */}
      <circle cx="45" cy="50" r="4.6" fill={INK} />
      <circle cx="75" cy="50" r="4.6" fill={INK} />
      <circle cx="46.4" cy="48.6" r="1.5" fill="#fff" />
      <circle cx="76.4" cy="48.6" r="1.5" fill="#fff" />
      {/* big nose and a small smile */}
      <path d="M51 61 C51 57.5 69 57.5 69 61 C69 65 63 67.5 60 67.5 C57 67.5 51 65 51 61 Z" fill={INK} />
      <path d="M60 67.5 V71 M60 71 C58 74 54.5 74.5 52.5 72.5 M60 71 C62 74 65.5 74.5 67.5 72.5" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* whiskers */}
      <g stroke={INK} strokeWidth="1.3" strokeLinecap="round">
        <path d="M43 66 L26 62" /><path d="M43 70 L26 71" /><path d="M44 74 L29 79" />
        <path d="M77 66 L94 62" /><path d="M77 70 L94 71" /><path d="M76 74 L91 79" />
      </g>
      {/* price tag held in the paws */}
      <g transform={waving ? 'rotate(-14 60 102)' : 'rotate(-5 60 102)'} style={{ transition: 'transform 0.3s' }}>
        <path d="M40 92 H74 L82 102 L74 112 H40 C37.8 112 36 110.2 36 108 V96 C36 93.8 37.8 92 40 92 Z" fill="#FFD60A" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="74" cy="102" r="2.6" fill={INK} />
        <text x="55" y="108" textAnchor="middle" fontFamily="Unbounded, Arial, sans-serif" fontWeight="800" fontSize="15" fill="#E8186D">%</text>
      </g>
      {/* paws over the tag */}
      <ellipse cx="38" cy="103" rx="7" ry="6" fill={FUR} stroke={INK} strokeWidth="2.2" />
      <ellipse cx="81" cy="103" rx="6.5" ry="5.8" fill={FUR} stroke={INK} strokeWidth="2.2" />
    </svg>
  );
}
