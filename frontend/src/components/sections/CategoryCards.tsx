import { useMemo } from 'react';
import { m } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store';

const EASE = [0.22, 1, 0.36, 1] as const;
const DEFAULT_HERO = '/img/hero-1000.webp';
const DEFAULT_ACCENT = '#FFE45C';

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/**
 * One card per category: its colour, picture and how many products it holds.
 * The main page and the catalog's "выберите категорию" screen share it.
 */
export default function CategoryCards({ onOpen }: { onOpen: (id: number) => void }) {
  const { categories, products, loading } = useAppStore();
  const stats = useMemo(() => {
    const count = new Map<number, number>();
    for (const p of products) if (p.category_id) count.set(p.category_id, (count.get(p.category_id) || 0) + 1);
    return categories.map((c) => ({ category: c, count: count.get(c.id) || 0 }));
  }, [categories, products]);

  return (
    <div className="grid grid-cols-4 max-lg:grid-cols-2 gap-5 max-sm:gap-3">
      {(loading && !stats.length ? [0, 1, 2, 3] : stats).map((s, i) => {
        if (typeof s === 'number') return <div key={i} className="rounded-[28px] bg-ink/[0.05] aspect-[4/5]" />;
        const { category: c, count } = s;
        return (
          <m.a
            key={c.id}
            href={`/catalog?c=${c.id}`}
            data-own-nav
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, delay: i * 0.06, ease: EASE }}
            onClick={(e) => { e.preventDefault(); onOpen(c.id); }}
            className="group relative flex flex-col justify-start text-left rounded-[28px] max-sm:rounded-[20px] border-2 border-ink overflow-hidden aspect-[4/5] max-sm:aspect-[3/4] cursor-pointer hover:-translate-y-1 hover:shadow-[0_6px_0_#111] transition-[translate,box-shadow] duration-300"
            style={{ background: `radial-gradient(ellipse at 60% 30%, #fff 0%, ${c.accent_color || DEFAULT_ACCENT} 62%)` }}
          >
            <div className="relative z-[1] p-5 max-sm:p-3.5">
              <div className="font-display text-[22px] max-sm:text-[16px] leading-tight text-ink">{c.name}</div>
              <div className="mt-1 text-[13px] max-sm:text-[11.5px] font-semibold text-ink/70">{count} {plural(count, 'товар', 'товара', 'товаров')}</div>
            </div>
            <img
              src={c.hero_image || DEFAULT_HERO}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="absolute inset-x-[4%] bottom-[14%] max-sm:bottom-[18%] w-[92%] h-[52%] object-contain transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <span className="absolute left-4 right-4 bottom-4 max-sm:left-2.5 max-sm:right-2.5 max-sm:bottom-2.5 h-10 max-sm:h-9 rounded-ctl-sm bg-card border-2 border-ink flex items-center justify-between px-3.5 text-[13px] max-sm:text-[11.5px] font-bold">
              <span className="truncate"><span className="max-sm:hidden">Смотреть: {c.name}</span><span className="sm:hidden">Смотреть</span></span>
              <ArrowRight size={15} strokeWidth={2.4} className="shrink-0" />
            </span>
          </m.a>
        );
      })}
    </div>
  );
}
