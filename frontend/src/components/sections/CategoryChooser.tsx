import { m } from 'framer-motion';
import PromoForm from '../promo/PromoForm';
import CategoryCards from './CategoryCards';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The catalog's first screen when it is opened from the menu: a welcome
 * banner and the categories. Nothing is picked for the visitor — the page of
 * a category opens once they choose it.
 */
export default function CategoryChooser({ onOpen }: { onOpen: (id: number) => void }) {
  return (
    <section id="catalog" className="pt-[calc(var(--header-h,140px)+20px)] pb-16 max-md:pb-10">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4">
        <m.div
          initial={{ y: 18, scale: 0.985 }} animate={{ y: 0, scale: 1 }} transition={{ duration: 0.8, ease: EASE }}
          className="relative overflow-hidden rounded-[36px] max-sm:rounded-[26px] border-2 border-ink accent-card grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] items-center"
        >
          <div className="relative z-[1] p-12 max-lg:p-9 max-sm:p-6 max-md:pb-2">
            <span className="inline-block px-4 py-2 rounded-full bg-card border-2 border-ink text-[11px] font-bold uppercase tracking-[0.12em] text-ink">Каталог RefSale</span>
            <h1 className="mt-6 max-sm:mt-4 font-display text-[clamp(32px,4.6vw,64px)] leading-[1.02] text-ink">
              С чего начнём? <br className="max-sm:hidden" />Выберите категорию
            </h1>
            <p className="mt-5 max-sm:mt-3 text-[16px] max-sm:text-[14.5px] leading-[1.6] text-ink/75 max-w-[520px]">
              Парфюмерия, уход, продукты и товары из Китая — только оригинал и дешевле сетевых магазинов. С промокодом лидера мнений ещё ниже.
            </p>
            <div className="mt-7 max-sm:mt-5 max-w-[460px]">
              <PromoForm variant="pill" floatingError />
            </div>
          </div>
          <picture className="relative block h-full min-h-[260px] max-md:min-h-0 max-md:h-[230px] max-sm:h-[190px]">
            <img
              src="/img/hero-home-1000.webp"
              srcSet="/img/hero-home-640.webp 640w, /img/hero-home-1000.webp 1000w, /img/hero-home-1400.webp 1400w"
              sizes="(max-width: 768px) 100vw, 640px"
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              className="absolute inset-0 w-full h-full object-contain object-bottom p-6 max-md:p-3 max-md:pb-0"
            />
          </picture>
        </m.div>

        <div className="mt-10 max-sm:mt-7">
          <CategoryCards onOpen={onOpen} />
        </div>
      </div>
    </section>
  );
}
