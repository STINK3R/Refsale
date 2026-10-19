import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import PromoForm from '../promo/PromoForm';
import { useActiveCategory } from '../../store';

const EASE = [0.22, 1, 0.36, 1] as const;

const FACTS = [
  { n: '01', title: 'Только оригинал', text: 'Каждая позиция — от проверенных поставщиков. Без распива и реплик.' },
  { n: '02', title: 'Дешевле сетей', text: 'Даже без промокода цены ниже, чем в крупных парфюмерных магазинах.' },
  { n: '03', title: 'Промокод — ещё ниже', text: 'Слово от вашего блогера снижает цену на весь каталог сразу.' },
];

const DEFAULT_INTRO = 'Оригинальные духи и уходовая косметика по ценам ниже крупных магазинов. С промокодом от вашего блогера цена станет ещё ниже — сразу на всех товарах.';

export default function StoreHero() {
  // Every category page has its own picture, slogan and "как это работает".
  const category = useActiveCategory();
  const [howOpen, setHowOpen] = useState(false);
  const slogan = category?.slogan?.trim();
  const intro = category?.intro?.trim() || DEFAULT_INTRO;
  const heroImage = category?.hero_image?.trim();

  return (
    <section className="relative overflow-hidden pt-[140px] max-lg:pt-[100px]">
      {/* A single warm pool of light behind the bottles — the only "effect" on the page */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[12%] top-[2%] w-[78vw] max-w-[1180px] aspect-square rounded-full max-lg:-right-[30%] max-lg:top-[4%] max-lg:w-[150vw]"
        style={{ background: 'radial-gradient(closest-side, rgba(198,167,105,0.16), rgba(198,167,105,0.05) 52%, transparent 75%)' }}
      />

      <div className="relative max-w-[1440px] mx-auto px-8 max-sm:px-5 grid grid-cols-12 gap-x-8 items-center min-h-[calc(100svh-140px)] max-lg:min-h-0 max-lg:grid-cols-1 max-lg:pt-6">
        <div className="col-span-6 max-lg:col-span-1 max-lg:order-2 py-16 max-lg:pt-4 max-lg:pb-12 relative z-[1]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }} className="label mb-8 max-sm:mb-5">
            {category?.description?.trim() || 'Оригинальная парфюмерия · Уход'}
          </motion.div>
          <motion.h1
            key={category?.id ?? 'default'}
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.08, ease: EASE }}
            className="font-display text-[clamp(42px,5vw,76px)] leading-[1.04] text-text"
          >
            {slogan || <>Любимые ароматы <br className="max-sm:hidden" /><span className="italic text-primary-light">дешевле</span>, чем&nbsp;в&nbsp;сетях</>}
          </motion.h1>

          <div className="mt-7 max-w-[440px]">
            <button
              onClick={() => setHowOpen((v) => !v)}
              aria-expanded={howOpen}
              className="flex items-center gap-2 text-[13px] uppercase tracking-[0.12em] text-text cursor-pointer hover:text-primary-light transition-colors"
            >
              Как это работает
              <ChevronDown size={16} strokeWidth={1.5} className={`transition-transform duration-300 ${howOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {howOpen && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="overflow-hidden text-[16px] leading-[1.7] text-muted whitespace-pre-line"
                >
                  <span className="block pt-4">{intro}</span>
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <motion.div
            id="hero-promo"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.28, ease: EASE }}
            className="mt-10 max-w-[440px]"
          >
            <PromoForm variant="line" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }}
            className="mt-10 flex items-center gap-8 flex-wrap"
          >
            <a href="#catalog" className="btn-primary">Смотреть каталог</a>
            <a href="#about" className="link-line">О нас</a>
          </motion.div>
        </div>

        <div className="col-span-6 max-lg:col-span-1 max-lg:order-1 relative flex items-center justify-center lg:-ml-16 lg:-mr-20">
          <motion.picture
            key={heroImage || 'default'}
            initial={{ opacity: 0, scale: 1.04, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.6, ease: EASE }}
            className="relative block w-full max-w-[880px]"
          >
            {heroImage ? (
              <img src={heroImage} alt={category?.name || ''} fetchPriority="high" className="relative w-full h-auto max-h-[70vh] object-contain" />
            ) : (
              <>
                <source type="image/webp" srcSet="/img/hero-640.webp 640w, /img/hero-1000.webp 1000w, /img/hero-1327.webp 1327w" sizes="(max-width: 1024px) 100vw, 56vw" />
                <img
                  src="/img/hero-1000.webp"
                  alt="Флаконы Versace Eros Energy, Jean Paul Gaultier Scandal и Chanel Coco Noir"
                  width={1327}
                  height={965}
                  fetchPriority="high"
                  className="relative w-full h-auto"
                />
              </>
            )}
          </motion.picture>
          {/* contact shadow so the bottles stand on something */}
          <div aria-hidden="true" className="absolute left-[12%] right-[8%] bottom-[3%] h-10 rounded-[50%] bg-black/70 blur-2xl -z-0" />
        </div>
      </div>

      <div className="relative border-t border-line">
        <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 grid grid-cols-3 max-md:grid-cols-1">
          {FACTS.map((f, i) => (
            <motion.div
              key={f.n}
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.9, delay: i * 0.08, ease: EASE }}
              className={`py-9 max-md:py-6 flex gap-5 ${i > 0 ? 'md:pl-10 md:border-l border-line max-md:border-t' : ''} ${i < 2 ? 'md:pr-10' : ''}`}
            >
              <span className="text-[11px] text-light tabular-nums pt-1">{f.n}</span>
              <div>
                <div className="text-[15px] text-text">{f.title}</div>
                <p className="text-[13px] leading-relaxed text-muted mt-1.5 max-w-[340px]">{f.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
