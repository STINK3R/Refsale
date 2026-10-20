import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowDown } from 'lucide-react';
import PromoForm from '../promo/PromoForm';
import { useActiveCategory } from '../../store';
import { useUiStore } from '../../store/ui';

const EASE = [0.22, 1, 0.36, 1] as const;

const FACTS = [
  { n: '01', title: 'Только оригинал', text: 'Каждая позиция — от проверенных поставщиков. Без распива и реплик.', tone: 'bg-sun' },
  { n: '02', title: 'Дешевле сетей', text: 'Даже без промокода цены ниже, чем в крупных магазинах.', tone: 'bg-card' },
  { n: '03', title: 'Промокод — ещё ниже', text: 'Слово от вашего блогера снижает цену на весь каталог сразу.', tone: 'bg-primary text-white' },
];

/** Built-in pictures ship in three widths: /img/hero-eda-1000.webp → 640/1000/1400. */
function heroSrcSet(url: string): string | undefined {
  const m = url.match(/^(\/img\/hero-[a-z0-9-]+)-(?:640|1000|1400)\.webp$/);
  return m ? `${m[1]}-640.webp 640w, ${m[1]}-1000.webp 1000w, ${m[1]}-1400.webp 1400w` : undefined;
}

const DEFAULT_INTRO = 'Оригинальные товары по ценам ниже крупных магазинов. С промокодом от вашего блогера цена станет ещё ниже — сразу на всех товарах.';

/**
 * A category page opens in the brief's order: the category photo, the promo
 * plate, the slogan in big letters, then "Как это работает" folded away.
 */
export default function StoreHero() {
  const category = useActiveCategory();
  const [howOpen, setHowOpen] = useState(false);
  const slogan = category?.slogan?.trim();
  const intro = category?.intro?.trim() || DEFAULT_INTRO;
  const heroImage = category?.hero_image?.trim();
  // Wide pictures (2:1, like the gadgets) hit the sides of the near-square
  // phone card first and look small there, so they get a little more room.
  const [wideFor, setWideFor] = useState<string | null>(null);
  const wide = !!heroImage && wideFor === heroImage;

  // The plate's travelling copy in the header appears once this one is gone.
  const promoRef = useRef<HTMLDivElement>(null);
  const setHeroPromoVisible = useUiStore((s) => s.setHeroPromoVisible);
  useEffect(() => {
    const el = promoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroPromoVisible(e.isIntersecting), { rootMargin: '-90px 0px 0px 0px' });
    io.observe(el);
    return () => { io.disconnect(); setHeroPromoVisible(true); };
  }, [setHeroPromoVisible]);

  return (
    <section className="relative pt-[calc(var(--header-h,140px)+20px)] pb-10 max-md:pb-6">
      <div className="max-w-[1200px] mx-auto px-8 max-sm:px-4">
        {/* 1. Category photo */}
        <motion.div
          key={`photo-${heroImage || 'default'}`}
          // No fade-in: this picture is the page's largest paint, and an
          // opacity animation would hold it back on slow phones.
          initial={false}
          className="relative overflow-hidden rounded-[36px] max-sm:rounded-[26px] border-2 border-ink accent-card aspect-[21/9] max-md:aspect-[4/3]"
        >
          <span className="absolute top-5 left-5 max-sm:top-3.5 max-sm:left-3.5 z-[1] px-4 py-2 rounded-full bg-card border-2 border-ink text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
            {category?.description?.trim() || 'Оригинальная продукция'}
          </span>
          {heroImage ? (
            <div className={`absolute inset-0 flex items-end justify-center ${wide ? 'px-[3%] max-sm:px-0' : 'px-[3%]'}`}>
              <img
                src={heroImage}
                srcSet={heroSrcSet(heroImage)}
                sizes="(max-width: 1024px) 100vw, 1200px"
                alt={category?.name || ''}
                fetchPriority="high"
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  if (h && w / h > 1.7) setWideFor(heroImage);
                }}
                className={`h-[96%] max-w-full w-auto object-contain object-bottom ${wide ? 'max-sm:scale-[1.08] max-sm:origin-bottom' : ''}`}
              />
            </div>
          ) : (
            <picture className="absolute inset-0 flex items-end justify-center">
              <source type="image/webp" srcSet="/img/hero-640.webp 640w, /img/hero-1000.webp 1000w, /img/hero-1327.webp 1327w" sizes="(max-width: 1024px) 100vw, 1200px" />
              <img
                src="/img/hero-1000.webp"
                alt="Флаконы Versace Eros Energy, Jean Paul Gaultier Scandal и Chanel Coco Noir"
                width={1327}
                height={965}
                fetchPriority="high"
                className="h-[82%] lg:h-[90%] w-auto object-contain"
              />
            </picture>
          )}
        </motion.div>

        {/* 2. Promo plate, half over the photo's edge */}
        <div ref={promoRef} id="hero-promo" className="relative z-[2] -mt-7 max-sm:-mt-6 max-w-[640px] mx-auto px-2">
          <PromoForm variant="pill" />
        </div>

        {/* 3. Slogan */}
        <motion.h1
          key={`slogan-${category?.id ?? 'default'}`}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.06, ease: EASE }}
          className="mt-12 max-sm:mt-9 text-center font-display text-[clamp(34px,6vw,84px)] leading-[1.02] text-ink max-w-[1000px] mx-auto"
        >
          {slogan || <>Любимые ароматы <mark className="bg-sun px-2 rounded-xl text-ink">дешевле</mark>, чем в&nbsp;соцсетях</>}
        </motion.h1>

        {/* 4. How it works, folded away */}
        <div className="mt-9 max-sm:mt-7 flex flex-col items-center">
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button onClick={() => setHowOpen((v) => !v)} aria-expanded={howOpen} className="btn-outline">
              Как это работает
              <ChevronDown size={16} strokeWidth={2.2} className={`transition-transform duration-300 ${howOpen ? 'rotate-180' : ''}`} />
            </button>
            <a href="#catalog" className="btn-primary">Смотреть товары <ArrowDown size={16} strokeWidth={2.2} /></a>
          </div>
          <AnimatePresence initial={false}>
            {howOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="overflow-hidden w-full"
              >
                <p className="pt-8 text-center text-[17px] max-sm:text-[15px] leading-[1.65] text-muted max-w-[680px] mx-auto whitespace-pre-line">{intro}</p>
                <div className="mt-8 grid grid-cols-3 max-md:grid-cols-1 gap-4">
                  {FACTS.map((f) => (
                    <div key={f.n} className={`rounded-[24px] border-2 border-ink p-6 ${f.tone}`}>
                      <div className="font-display text-[28px] leading-none">{f.n}</div>
                      <div className="mt-4 text-[17px] font-bold">{f.title}</div>
                      <p className="mt-1.5 text-[14px] leading-relaxed opacity-80">{f.text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
