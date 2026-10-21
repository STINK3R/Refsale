import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import { ArrowRight, BadgeCheck, ChevronDown, MessageCircle, Percent, Search, Wallet } from 'lucide-react';
import { useAppStore, usePromoStore } from '../../store';
import { formatPrice } from '../../utils/format';
import { priceInfo } from '../../utils/prices';
import { glideToElement } from '../../hooks/useScrollLock';
import Meerkat from '../mascot/Meerkat';
import PromoForm from '../promo/PromoForm';
import About from './About';
import { loadCatalogPage } from './catalogChunk';
import type { Category, Product } from '../../types';

const EASE = [0.22, 1, 0.36, 1] as const;
const DEFAULT_HERO = '/img/hero-1000.webp';
const DEFAULT_ACCENT = '#FFE45C';

const STEPS = [
  { title: 'Выберите товар', text: 'В каталоге цены уже ниже, чем в сетевых магазинах. Под каждой — сравнение с двумя магазинами.' },
  { title: 'Введите промокод блогера', text: 'Цена станет ещё ниже — сразу на все товары. Нет промокода? Покупайте и без него.' },
  { title: 'Оформите заказ — без оплаты', text: 'Менеджер напишет в чате заказа, подтвердит наличие, сроки и пришлёт реквизиты.' },
  { title: 'Оплатите и получите', text: 'После оплаты заказ подтверждается. Статусы с датами — в разделе «Мои заказы».' },
];

const TRUST = [
  { icon: BadgeCheck, title: 'Только оригинал', text: 'Закупаем у официальных поставщиков. Без распива и реплик — тестер всегда подписан как тестер.' },
  { icon: Percent, title: 'Дешевле сетей', text: 'Цены честно сравниваем с Золотым Яблоком и Рандеву — прямо на карточке товара.' },
  { icon: Wallet, title: 'Оплата после подтверждения', text: 'Сначала менеджер подтверждает наличие и сроки — и только потом вы платите.' },
  { icon: MessageCircle, title: 'Живой менеджер в чате', text: 'Каждый заказ — отдельный чат: вопросы, фото, статусы доставки в одном месте.' },
];

const FAQ = [
  { q: 'Это точно оригинал?', a: 'Да. Мы работаем с официальными поставщиками сетевых магазинов. Если сомневаетесь — спросите менеджера в чате, пришлём фото конкретной позиции до оплаты.' },
  { q: 'Почему у вас дешевле, чем в магазинах?', a: 'Нет аренды торговых залов и большой наценки сети. Продажи идут через блогеров, поэтому вместо рекламы скидку получает покупатель.' },
  { q: 'Где взять промокод?', a: 'У блогера, через которого вы к нам пришли, — в его соцсетях. Промокод снижает цены сразу на весь каталог. Без промокода покупать тоже можно.' },
  { q: 'Как и когда платить?', a: 'После оформления заказа менеджер подтвердит наличие в чате и пришлёт реквизиты. Оплата — только после этого подтверждения.' },
  { q: 'Как доставляете?', a: 'По всей России. Адрес и удобный способ доставки менеджер уточнит в чате заказа, сроки — до оплаты.' },
];

function useCategoryStats(categories: Category[], products: Product[]) {
  return useMemo(() => {
    const count = new Map<number, number>();
    for (const p of products) if (p.category_id) count.set(p.category_id, (count.get(p.category_id) || 0) + 1);
    return categories.map((c) => ({ category: c, count: count.get(c.id) || 0 }));
  }, [categories, products]);
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/**
 * The main page: what RefSale is and how buying works, the categories, a real
 * saving from the catalog, best sellers, why to trust it and the answers to
 * the usual questions. The shop itself lives at /catalog.
 */
export default function HomePage() {
  const { categories, products, loading, setActiveCategory } = useAppStore();
  const prices = usePromoStore((s) => s.prices);
  const navigate = useNavigate();
  const stats = useCategoryStats(categories, products);
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Most visits go on to the shop: fetch its code while the visitor reads,
  // so the catalog opens at once
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const warm = () => { void loadCatalogPage(); };
    const t = idle ? idle(warm) : window.setTimeout(warm, 1500);
    return () => { if (!idle) window.clearTimeout(t); };
  }, []);

  const openCategory = (id: number) => { setActiveCategory(id); navigate('/catalog'); };
  const openProduct = (p: Product) => navigate(`/catalog?product=${p.id}`);
  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog');
  };

  // Products with a known saving against the first shop, biggest first
  const savings = useMemo(() => products
    .filter((p) => p.is_available !== false)
    .map((p) => {
      const info = priceInfo(p, null, prices);
      const shop = info.compare1 || info.compare2;
      return { p, info, saved: shop ? shop - info.now : 0, pct: shop ? (shop - info.now) / shop : 0 };
    })
    .filter((x) => x.saved > 0)
    .sort((a, b) => b.pct - a.pct), [products, prices]);
  const best = savings[0];
  const maxPct = best ? Math.round(best.pct * 100) : 0;
  const hits = useMemo(() => {
    const byBadge = savings.filter((x) => x.p.badge === 'hit');
    const rest = savings.filter((x) => x.p.badge !== 'hit');
    return [...byBadge, ...rest].slice(0, 8);
  }, [savings]);
  const categoryOf = (p: Product) => categories.find((c) => c.id === p.category_id);

  return (
    <main className="relative">
      {/* 1. What it is, a search, the way in */}
      <section className="pt-[calc(var(--header-h,140px)+28px)] pb-16 max-md:pb-10">
        <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4 grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-10 items-center">
          {/* No fade on the first screen's text: it is the largest thing painted,
              and a fade would hold it back on slow phones. It only slides. */}
          <m.div initial={{ y: 14 }} animate={{ y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
            <h1 className="font-display text-[clamp(34px,5vw,68px)] leading-[1.02] text-ink">
              Оригинал дешевле, чем в&nbsp;магазинах
            </h1>
            <p className="mt-5 text-[18px] max-sm:text-[16px] leading-relaxed text-muted max-w-[620px]">
              Парфюмерия, уходовая косметика, продукты и товары из Китая.{' '}
              <b className="text-ink">С промокодом вашего блогера цена ещё ниже</b>, а платить нужно только после того, как менеджер подтвердит наличие.
            </p>
            <form onSubmit={search} className="mt-8 flex gap-2 max-w-[620px]" role="search">
              <label className="relative flex-1 min-w-0">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Dior, крем, наушники…"
                  aria-label="Найти товар"
                  className="field !h-14 !pl-11 !border-2 !border-ink !rounded-ctl-md !text-[16px]"
                />
              </label>
              <button type="submit" className="btn-primary !h-14 shrink-0">Найти</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={() => navigate('/catalog')} className="btn-outline">Весь каталог <ArrowRight size={16} strokeWidth={2.2} /></button>
              <button onClick={() => glideToElement('#how')} className="btn-outline">Как это работает <ChevronDown size={16} strokeWidth={2.2} /></button>
            </div>
          </m.div>

          <m.div
            initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="relative rounded-[36px] max-sm:rounded-[26px] border-2 border-ink accent-card overflow-hidden aspect-[4/3] max-lg:aspect-[16/11]"
          >
            <img
              src="/img/hero-home-1000.webp"
              srcSet="/img/hero-home-640.webp 640w, /img/hero-home-1000.webp 1000w, /img/hero-home-1400.webp 1400w"
              sizes="(max-width: 1024px) 100vw, 620px"
              width={1400}
              height={775}
              fetchPriority="high"
              alt="Сурикат RefSale с парфюмерией, косметикой, продуктами и техникой"
              className="absolute left-[3%] right-[3%] bottom-[-4%] w-[94%] h-auto object-contain"
            />
            <div className="absolute top-5 left-5 right-5 flex flex-wrap gap-2">
              {maxPct > 0 && <Chip tone="bg-primary-dark text-white">до −{maxPct}% к сетям</Chip>}
              <Chip>Оплата после подтверждения</Chip>
              <Chip>Только оригинал</Chip>
            </div>
          </m.div>
        </div>
      </section>

      <About />

      {/* 2. Categories as the first way in */}
      <section id="categories" className="pb-20 max-md:pb-14">
        <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4">
          <SectionHead label="Каталог" title="Что у нас есть" />
          <div className="grid grid-cols-4 max-lg:grid-cols-2 gap-5 max-sm:gap-3">
            {(loading && !stats.length ? [0, 1, 2, 3] : stats).map((s, i) => {
              if (typeof s === 'number') return <div key={i} className="rounded-[28px] bg-ink/[0.05] aspect-[4/5]" />;
              const { category: c, count } = s;
              return (
                <m.button
                  key={c.id}
                  initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.6, delay: i * 0.06, ease: EASE }}
                  onClick={() => openCategory(c.id)}
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
                </m.button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. How buying works, said plainly */}
      <section id="how" className="py-20 max-md:py-14 bg-accent-strong border-y-2 border-ink">
        <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4">
          <SectionHead label="Как это работает" title="Четыре шага до заказа" />
          <ol className="grid grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-[24px] bg-card border-2 border-ink p-6 max-sm:p-5">
                <span className="w-10 h-10 rounded-ctl-sm bg-ink text-sun font-display text-[18px] flex items-center justify-center">{i + 1}</span>
                <div className="mt-4 text-[18px] font-extrabold text-ink leading-snug">{s.title}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button onClick={() => navigate('/catalog')} className="btn-primary">Перейти в каталог <ArrowRight size={16} strokeWidth={2.2} /></button>
            <span className="text-[14px] font-bold text-ink">Платить сразу не нужно — сначала подтверждение наличия.</span>
          </div>
        </div>
      </section>

      {/* 4. A real saving from the catalog */}
      {best && (
        <section className="py-20 max-md:py-14">
          <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4 grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <SectionHead label="Пример из каталога" title={`Экономия ${formatPrice(best.saved)} на одном товаре`} inline />
              <p className="text-[16px] leading-relaxed text-muted max-w-[520px]">
                Так выглядит сравнение на каждой карточке: наша цена и цены того же товара в двух сетевых магазинах.
                {Object.keys(prices).length === 0 && ' С промокодом блогера разница ещё больше.'}
              </p>
            </div>
            <button
              onClick={() => openProduct(best.p)}
              className="group text-left rounded-[28px] border-2 border-ink bg-card p-5 max-sm:p-4 grid grid-cols-[120px_1fr] max-sm:grid-cols-[88px_1fr] gap-5 items-center cursor-pointer hover:-translate-y-1 hover:shadow-[0_6px_0_#111] transition-[translate,box-shadow] duration-300"
            >
              <span className="aspect-square rounded-[16px] tile-bg overflow-hidden flex items-center justify-center">
                {best.p.image_url ? <img src={best.p.image_url} alt="" loading="lazy" className="w-full h-full object-contain p-2" /> : <span className="font-display text-[44px] text-ink/10">R</span>}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-ink leading-snug">{best.p.name}</span>
                <span className="mt-3 flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-muted">RefSale</span>
                  <span className="font-display text-[26px] max-sm:text-[22px] text-primary-dark leading-none">{formatPrice(best.info.now)}</span>
                </span>
                {[
                  [categoryOf(best.p)?.compare_label_1 || 'Золотое Яблоко', best.info.compare1],
                  [categoryOf(best.p)?.compare_label_2 || 'Рандеву', best.info.compare2],
                ].filter(([, v]) => v).map(([label, v]) => (
                  <span key={String(label)} className="mt-1.5 flex justify-between gap-3 text-[13px] text-muted">
                    <span>{label}</span><span className="line-through tabular-nums">{formatPrice(Number(v))}</span>
                  </span>
                ))}
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink group-hover:text-primary">Открыть товар <ArrowRight size={14} strokeWidth={2.4} /></span>
              </span>
            </button>
          </div>
        </section>
      )}

      {/* 5. Best sellers */}
      {loading && !products.length && (
        <section className="pb-20 max-md:pb-14" aria-hidden="true">
          <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4">
            <div className="h-4 w-16 rounded bg-ink/[0.06]" />
            <div className="mt-3 mb-8 h-10 w-72 max-w-full rounded-lg bg-ink/[0.06]" />
            <div className="flex gap-4 max-sm:gap-3 overflow-hidden">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="shrink-0 w-[220px] max-sm:w-[170px] rounded-[22px] max-sm:rounded-[18px] bg-ink/[0.05] p-2">
                  <div className="aspect-square rounded-[12px] bg-ink/[0.05] animate-pulse" />
                  <div className="mt-3 h-3.5 w-4/5 rounded bg-ink/[0.07]" />
                  <div className="mt-2 mb-2 h-5 w-1/2 ml-auto rounded bg-ink/[0.07]" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hits.length > 0 && (
        <section className="pb-20 max-md:pb-14">
          <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4">
            <div className="flex items-end justify-between gap-4">
              <SectionHead label="Хиты" title="Берут чаще всего" />
              <button onClick={() => navigate('/catalog')} className="mb-8 max-md:mb-6 shrink-0 inline-flex items-center gap-1.5 text-[14px] font-bold text-ink hover:text-primary cursor-pointer">Все товары <ArrowRight size={15} strokeWidth={2.4} /></button>
            </div>
            {/* pt-2 / pb-3: room for a card lifted on hover and its shadow,
                which the scroll box would otherwise clip */}
            <div className="flex gap-4 max-sm:gap-3 overflow-x-auto scrollbar-hide snap-x pt-2 pb-3 -mt-2 -mx-1 px-1">
              {hits.map(({ p, info }) => (
                <button
                  key={p.id}
                  onClick={() => openProduct(p)}
                  className="snap-start shrink-0 w-[220px] max-sm:w-[170px] text-left rounded-[22px] max-sm:rounded-[18px] border-2 border-ink bg-card p-2 cursor-pointer hover:-translate-y-1 hover:shadow-[0_6px_0_#111] transition-[translate,box-shadow] duration-300"
                >
                  <span className="block aspect-square rounded-[12px] tile-bg overflow-hidden">
                    {p.image_url ? <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-contain p-[10%]" /> : null}
                  </span>
                  <span className="block px-1.5 pt-2.5 text-[13.5px] font-semibold text-ink leading-snug line-clamp-2 min-h-[2.75em]">{p.name}</span>
                  <span className="flex items-end justify-between gap-2 px-1.5 pt-1.5 pb-1">
                    <span className="text-[12px] text-muted line-through tabular-nums">{info.compare1 ? formatPrice(info.compare1) : ''}</span>
                    <span className={`text-[18px] font-extrabold tabular-nums ${info.now < info.base ? 'text-primary' : 'text-ink'}`}>{info.from ? <span className="text-[12px]">от </span> : null}{formatPrice(info.now)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6. Why to trust it */}
      <section className="pb-20 max-md:pb-14">
        <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4">
          <SectionHead label="Почему RefSale" title="Покупать у нас спокойно" />
          <div className="grid grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-[24px] border-2 border-ink bg-card p-6 max-sm:p-5">
                <span className="w-11 h-11 rounded-ctl bg-accent-strong border-2 border-ink flex items-center justify-center"><Icon size={20} strokeWidth={2.2} /></span>
                <div className="mt-4 text-[17px] font-extrabold text-ink">{title}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. The usual questions */}
      <section className="pb-20 max-md:pb-14">
        <div className="max-w-[920px] mx-auto px-8 max-sm:px-4">
          <SectionHead label="Вопросы" title="Частые вопросы" />
          <div className="grid gap-3">
            {FAQ.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className="rounded-[20px] border-2 border-ink bg-card overflow-hidden">
                  <button onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer">
                    <span className="text-[16px] max-sm:text-[15px] font-bold text-ink">{f.q}</span>
                    <ChevronDown size={18} strokeWidth={2.4} className={`shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <p className="px-5 pb-5 -mt-1 text-[15px] leading-relaxed text-muted">{f.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. The promo code and the way into the shop */}
      <section className="pb-24 max-md:pb-16">
        <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4">
          <div className="relative rounded-[36px] max-sm:rounded-[26px] border-2 border-ink accent-card px-10 py-12 max-sm:px-5 max-sm:py-8 grid lg:grid-cols-[1fr_auto] gap-8 items-center overflow-hidden">
            <div className="relative z-[1]">
              <div className="font-display text-[clamp(26px,3.4vw,44px)] leading-[1.05] text-ink">Есть промокод от блогера?</div>
              <p className="mt-3 text-[16px] text-ink/80 max-w-[560px]">Введите его — цены снизятся сразу на весь каталог.</p>
              <div className="mt-6 max-w-[560px]"><PromoForm variant="pill" /></div>
              <button onClick={() => navigate('/catalog')} className="btn-outline mt-5">В каталог <ArrowRight size={16} strokeWidth={2.2} /></button>
            </div>
            <Meerkat pose="sunglasses" width={210} decorative className="max-lg:hidden self-end -mb-12" />
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHead({ label, title, inline = false }: { label: string; title: string; inline?: boolean }) {
  return (
    <div className={inline ? 'mb-4' : 'mb-8 max-md:mb-6'}>
      <div className="label">{label}</div>
      <h2 className="mt-2 font-display text-[clamp(26px,3.2vw,42px)] leading-[1.08] text-ink">{title}</h2>
    </div>
  );
}

function Chip({ children, tone = 'bg-card text-ink' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`px-3 py-1.5 rounded-full border-2 border-ink text-[12px] max-sm:text-[11px] font-bold ${tone}`}>{children}</span>;
}
