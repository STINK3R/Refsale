/** RefSale's meerkat in the yellow hoodie: one picture per pose in /public/mascot. */
export type MeerkatPose =
  | 'thumbs-up' | 'peek' | 'wave' | 'jump' | 'sunglasses' | 'phone'
  | 'boxes' | 'cart' | 'heart' | 'laptop' | 'thinking';

const ALT: Record<MeerkatPose, string> = {
  'thumbs-up': 'Сурикат RefSale показывает большой палец',
  peek: 'Сурикат RefSale выглядывает',
  wave: 'Сурикат RefSale машет лапой',
  jump: 'Сурикат RefSale радостно подпрыгивает',
  sunglasses: 'Сурикат RefSale в тёмных очках',
  phone: 'Сурикат RefSale с телефоном',
  boxes: 'Сурикат RefSale несёт коробки',
  cart: 'Сурикат RefSale с тележкой',
  heart: 'Сурикат RefSale обнимает сердце',
  laptop: 'Сурикат RefSale с ноутбуком',
  thinking: 'Сурикат RefSale задумался',
};

/** Height per pixel of width, so the browser reserves the space before the picture loads. */
const RATIO: Record<MeerkatPose, number> = {
  'thumbs-up': 316 / 240, peek: 229 / 360, wave: 318 / 240, jump: 257 / 240, sunglasses: 265 / 240,
  phone: 291 / 240, boxes: 281 / 240, cart: 287 / 240, heart: 243 / 240, laptop: 244 / 240, thinking: 257 / 240,
};

export default function Meerkat({ pose, width = 120, className = '', decorative = false, eager = false }: {
  pose: MeerkatPose;
  width?: number;
  className?: string;
  /** Next to text that already says the same: hide it from screen readers. */
  decorative?: boolean;
  eager?: boolean;
}) {
  return (
    <img
      src={`/mascot/${pose}.webp`}
      srcSet={`/mascot/${pose}.webp 1x, /mascot/${pose}@2x.webp 2x`}
      width={width}
      height={Math.round(width * RATIO[pose])}
      alt={decorative ? '' : ALT[pose]}
      aria-hidden={decorative || undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={`h-auto select-none ${className}`}
    />
  );
}
