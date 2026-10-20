import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowDown } from 'lucide-react';
import PromoForm from '../promo/PromoForm';
import { useActiveCategory, useAppStore } from '../../store';
import { useUiStore } from '../../store/ui';

const EASE = [0.22, 1, 0.36, 1] as const;

const FACTS = [
  { n: '01', title: 'Только оригинал', text: 'Каждая позиция — от проверенных поставщиков. Без распива и реплик.', tone: 'bg-accent-strong' },
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
  const loading = useAppStore((s) => s.loading);

  // Which picture the card shows. Until the catalog has loaded it shows none
  // (just its colour), so a remembered category never flashes the bottles first.
  const pictureKey = category ? (heroImage || 'default') : loading ? null : 'default';
  // The first picture slides in; later ones (a category switch) cross-fade.
  const [seenKey, setSeenKey] = useState(pictureKey);
  const [switched, setSwitched] = useState(false);
  if (pictureKey !== seenKey) {
    setSeenKey(pictureKey);
    if (seenKey) setSwitched(true);
  }
  const label = category?.description?.trim() || (loading ? '' : 'Оригинальная продукция');
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
        {/* 1. Category photo. The card itself only moves (no fade): the picture
            is the page's largest paint, and an opacity animation would hold it
            back on slow phones. Its colour glides between categories (@property
            in index.css). */}
        <motion.div
          initial={{ y: 18, scale: 0.985 }} animate={{ y: 0, scale: 1 }} transition={{ duration: 0.8, ease: EASE }}
          className="relative overflow-hidden rounded-[36px] max-sm:rounded-[26px] border-2 border-ink accent-card aspect-[21/9] max-md:aspect-[4/3]"
        >
          <AnimatePresence mode="wait" initial={false}>
            {label && (
              <motion.span
                key={label}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="absolute top-5 left-5 max-sm:top-3.5 max-sm:left-3.5 z-[1] px-4 py-2 rounded-full bg-card border-2 border-ink text-[11px] font-bold uppercase tracking-[0.12em] text-ink"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {pictureKey && (
              <motion.div
                key={pictureKey}
                initial={switched ? { opacity: 0, scale: 1.05, y: 14 } : { scale: 1.06, y: 22 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={{ duration: switched ? 0.6 : 0.95, ease: EASE }}
                className="absolute inset-0"
              >
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
            )}
          </AnimatePresence>
        </motion.div>

        {/* 2. Promo plate, half over the photo's edge */}
        <motion.div
          ref={promoRef}
          id="hero-promo"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25, ease: EASE }}
          className="relative z-[2] -mt-7 max-sm:-mt-6 max-w-[640px] mx-auto px-2"
        >
          <PromoForm variant="pill" />
        </motion.div>

        {/* 3. Slogan: the old one lifts away, the new one rises in. Two lines are
            reserved so the page does not jump while the catalog loads. */}
        <div className="mt-12 max-sm:mt-9 min-h-[2.04em] text-[clamp(34px,6vw,84px)] max-w-[1000px] mx-auto">
          <AnimatePresence mode="wait" initial={true}>
            {!loading && (
              <motion.h1
                key={`slogan-${category?.id ?? 'default'}`}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="text-center font-display text-[length:inherit] leading-[1.02] text-ink"
              >
                {slogan || <>Любимые ароматы <mark className="bg-accent-strong px-2 rounded-xl text-ink">дешевле</mark>, чем в&nbsp;соцсетях</>}
              </motion.h1>
            )}
          </AnimatePresence>
        </div>

        {/* 4. How it works, folded away */}
        <div className="mt-9 max-sm:mt-7 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4, ease: EASE }}
            className="flex items-center gap-3 flex-wrap justify-center"
          >
            <button onClick={() => setHowOpen((v) => !v)} aria-expanded={howOpen} className="btn-outline">
              Как это работает
              <ChevronDown size={16} strokeWidth={2.2} className={`transition-transform duration-300 ${howOpen ? 'rotate-180' : ''}`} />
            </button>
            <a href="#catalog" className="btn-primary">Смотреть товары <ArrowDown size={16} strokeWidth={2.2} /></a>
          </motion.div>
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
