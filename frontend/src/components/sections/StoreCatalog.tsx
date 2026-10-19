import { useMemo, useRef, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronLeft, ChevronRight, MessageCircle, Plus, Check, Maximize2, Heart } from 'lucide-react';
import {
  useAppStore, useCartStore, useNotificationStore, usePromoStore, useFavoritesStore, useActiveCategory,
  priceFor, promoKey, cartKey,
} from '../../store';
import { formatPrice } from '../../utils/format';
import { priceInfo, availableVariants, type PriceInfo } from '../../utils/prices';
import { askSeller } from '../../utils/askSeller';
import Lightbox from '../ui/Lightbox';
import useScrollLock from '../../hooks/useScrollLock';
import type { Category, Product, ProductVariant } from '../../types';

const PAGE = 12;
const EASE = [0.22, 1, 0.36, 1] as const;

const BADGES: Record<string, string> = {
  new: 'Новинка', hit: 'Бестселлер', sale: 'Выгодно', rare: 'Редкое', custom: 'Под заказ', vip: 'Premium',
};

export default function StoreCatalog() {
  const { products, subcategories, loading } = useAppStore();
  const category = useActiveCategory();
  const prices = usePromoStore((s) => s.prices);
  const promoCode = usePromoStore((s) => s.code);
  const [subcategory, setSubcategory] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Product | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const categoryId = category?.id ?? null;

  // A new category page starts from the top of its list.
  const [seenCategory, setSeenCategory] = useState(categoryId);
  if (seenCategory !== categoryId) {
    setSeenCategory(categoryId);
    setSubcategory(null);
    setShown(PAGE);
  }

  const onSearch = (v: string) => {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebounced(v.trim().toLowerCase()); setShown(PAGE); }, 220);
  };

  const inCategory = useMemo(
    () => (categoryId ? products.filter((p) => p.category_id === categoryId) : products),
    [products, categoryId],
  );
  const subs = useMemo(
    () => subcategories.filter((s) => s.category_id === categoryId && inCategory.some((p) => p.subcategory_id === s.id)),
    [subcategories, categoryId, inCategory],
  );

  const filtered = useMemo(() => {
    let list = inCategory;
    if (debounced) {
      list = list.filter((p) => p.name.toLowerCase().includes(debounced) || (p.description || '').toLowerCase().includes(debounced));
    } else if (subcategory) {
      list = list.filter((p) => p.subcategory_id === subcategory);
    }
    return [...list].sort((a, b) => Number(b.is_available !== false) - Number(a.is_available !== false));
  }, [inCategory, subcategory, debounced]);

  const visible = filtered.slice(0, shown);
  const promoCount = useMemo(
    () => inCategory.filter((p) => prices[String(p.id)] != null || (p.variants || []).some((v) => prices[promoKey(p.id, v.id)] != null)).length,
    [inCategory, prices],
  );

  return (
    <section id="catalog" className="py-28 max-md:py-16">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5">
        <div className="flex items-end justify-between gap-10 pb-8 border-b border-line max-md:flex-col max-md:items-stretch max-md:gap-6">
          <div>
            <div className="label mb-5">Каталог</div>
            <h2 className="font-display text-[clamp(38px,4.4vw,64px)] leading-[1.02] text-text">{category?.name || 'Каталог'}</h2>
          </div>
          <label className="relative w-[340px] max-md:w-full block">
            <Search size={16} strokeWidth={1.4} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={category ? `Поиск: ${category.name.toLowerCase()}` : 'Поиск товаров'}
              className="field-line !pl-7"
              aria-label="Поиск товаров"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-6 pt-6 max-md:flex-col max-md:items-start max-md:gap-4">
          {!debounced && subs.length > 0 ? (
            <div className="flex gap-8 overflow-x-auto scrollbar-hide max-w-full">
              <Tab active={subcategory === null} onClick={() => { setSubcategory(null); setShown(PAGE); }} count={inCategory.length}>Все</Tab>
              {subs.map((s) => (
                <Tab
                  key={s.id}
                  active={subcategory === s.id}
                  onClick={() => { setSubcategory(s.id); setShown(PAGE); }}
                  count={inCategory.filter((p) => p.subcategory_id === s.id).length}
                >
                  {s.name}
                </Tab>
              ))}
            </div>
          ) : <div className="text-[13px] text-muted">{debounced ? `Найдено: ${filtered.length}` : ''}</div>}
          <div className="text-[12px] text-muted shrink-0">
            {promoCode
              ? <>Цены по промокоду <span className="text-primary tracking-[0.1em]">{promoCode}</span> · {promoCount} {plural(promoCount, 'позиция', 'позиции', 'позиций')} дешевле</>
              : 'Цены без промокода — с ним будет дешевле'}
          </div>
        </div>

        <div className="mt-12">
          {loading ? (
            <div className="grid grid-cols-4 gap-x-6 gap-y-14 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-10">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/5] bg-tile" />
                  <div className="h-3.5 bg-white/[0.05] w-3/4 mt-5" />
                  <div className="h-3.5 bg-white/[0.05] w-1/3 mt-3" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="py-24 text-center">
              <div className="font-display text-[28px] text-text">{debounced ? 'Ничего не нашлось' : 'Каталог скоро пополнится'}</div>
              <p className="text-[14px] text-muted mt-3">{debounced ? 'Попробуйте другое название или бренд' : 'Загляните чуть позже'}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-x-6 gap-y-14 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-10">
                {visible.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} onOpen={() => setSelected(p)} onNeedVariant={() => setVariantFor(p)} />
                ))}
              </div>
              {filtered.length > shown && (
                <div className="text-center mt-16">
                  <button onClick={() => setShown((n) => n + PAGE)} className="btn-outline">
                    Показать ещё · {Math.min(PAGE, filtered.length - shown)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ProductModals selected={selected} setSelected={setSelected} variantFor={variantFor} setVariantFor={setVariantFor} />
    </section>
  );
}

/** Product details and the "уточните вариант" prompt; shared with the favourites page. */
export function ProductModals({ selected, setSelected, variantFor, setVariantFor }: {
  selected: Product | null; setSelected: (p: Product | null) => void;
  variantFor: Product | null; setVariantFor: (p: Product | null) => void;
}) {
  return (
    <>
      <AnimatePresence>
        {selected && (
          <ProductModal
            product={selected}
            onClose={() => setSelected(null)}
            onNeedVariant={() => { setVariantFor(selected); setSelected(null); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {variantFor && <VariantModal product={variantFor} onClose={() => setVariantFor(null)} />}
      </AnimatePresence>
    </>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function Tab({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative shrink-0 pb-2 whitespace-nowrap cursor-pointer transition-colors text-[13px] uppercase tracking-[0.12em] ${active ? 'text-text' : 'text-muted hover:text-text'}`}
    >
      {children}
      {count != null && <sup className="ml-1 text-[10px] text-light tracking-normal">{count}</sup>}
      <span className={`absolute left-0 right-0 bottom-0 h-px bg-text transition-transform duration-500 origin-left ${active ? 'scale-x-100' : 'scale-x-0'}`} />
    </button>
  );
}

// ── Prices ──────────────────────────────────────────

/** Base price, or было/стало once a promo code is active. */
export function PriceTag({ info, size = 'md' }: { info: PriceInfo; size?: 'md' | 'lg' }) {
  const code = usePromoStore((s) => s.code);
  const { base, now, hasPromo, from } = info;
  const discounted = now < base;
  const pre = from ? 'от ' : '';
  if (size === 'lg') {
    return (
      <div>
        <div className="flex items-baseline gap-4 flex-wrap">
          <span className="font-display text-[40px] leading-none text-text">{pre}{formatPrice(now)}</span>
          {discounted && <span className="text-[16px] text-light line-through">{formatPrice(base)}</span>}
          {discounted && <span className="label !text-primary">−{Math.round((1 - now / base) * 100)}% по промокоду</span>}
        </div>
        {!discounted && !code && hasPromo && (
          <div className="text-[13px] text-muted mt-3">С промокодом от блогера эта позиция дешевле</div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2.5 flex-wrap">
      <span className="text-[15px] text-text tabular-nums">{pre}{formatPrice(now)}</span>
      {discounted && <span className="text-[13px] text-light line-through tabular-nums">{formatPrice(base)}</span>}
      {!discounted && !code && hasPromo && <span className="text-[11px] text-primary/90">дешевле с промокодом</span>}
    </div>
  );
}

/** "Золотое Яблоко 16 500 ₽ · Рандеву 17 200 ₽" — only the shops that have a price. */
export function ComparePrices({ info, category, size = 'md' }: { info: PriceInfo; category?: Category; size?: 'md' | 'lg' }) {
  const rows = [
    { label: category?.compare_label_1 || 'Золотое Яблоко', price: info.compare1 },
    { label: category?.compare_label_2 || 'Рандеву', price: info.compare2 },
  ].filter((r) => r.price != null && Number(r.price) > 0);
  if (!rows.length) return null;
  if (size === 'lg') {
    return (
      <div className="mt-5 grid gap-1.5">
        <div className="label !text-[10px]">В других магазинах</div>
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4 text-[14px]">
            <span className="text-muted">{r.label}</span>
            <span className="text-light line-through tabular-nums">{formatPrice(Number(r.price))}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-1.5 text-[11px] leading-snug text-light">
      {rows.map((r, i) => (
        <span key={r.label}>{i > 0 && ' · '}{r.label} <span className="line-through tabular-nums">{formatPrice(Number(r.price))}</span></span>
      ))}
    </div>
  );
}

// ── Cart and favourites ─────────────────────────────

function useAddToCart(product: Product, variant: ProductVariant | null, onNeedVariant: () => void, onNeedChoice?: () => void) {
  const { addItem, items, openSidebar } = useCartStore();
  const show = useNotificationStore((s) => s.show);
  const hasVariants = (product.variants || []).length > 0;
  const inCart = hasVariants
    ? !!variant && items.some((i) => cartKey(i) === cartKey({ id: product.id, variant_id: variant.id }))
    : items.some((i) => i.id === product.id);
  const add = useCallback(() => {
    if (inCart) { openSidebar(); return; }
    if (hasVariants && !variant) { onNeedChoice?.(); return; }
    if (!hasVariants && (product.requires_variant || product.badge === 'custom')) { onNeedVariant(); return; }
    addItem(product, undefined, variant);
    show(`«${product.name}${variant ? ` — ${variant.label}` : ''}» в корзине`);
  }, [inCart, hasVariants, variant, product, addItem, openSidebar, show, onNeedVariant, onNeedChoice]);
  return { inCart, add };
}

export function FavoriteButton({ productId, className = '' }: { productId: number; className?: string }) {
  const active = useFavoritesStore((s) => s.ids.includes(productId));
  const toggle = useFavoritesStore((s) => s.toggle);
  const show = useNotificationStore((s) => s.show);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); show(toggle(productId) ? 'Добавлено в избранное' : 'Убрано из избранного'); }}
      className={`cursor-pointer transition-colors ${active ? 'text-primary' : 'text-muted hover:text-text'} ${className}`}
      aria-label={active ? 'Убрать из избранного' : 'В избранное'}
      aria-pressed={active}
      title={active ? 'Убрать из избранного' : 'В избранное'}
    >
      <Heart size={18} strokeWidth={1.5} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}

function Monogram({ big }: { big?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className={`font-display text-white/[0.06] ${big ? 'text-[140px]' : 'text-[88px]'}`}>R</span>
    </div>
  );
}

export const ProductCard = memo(function ProductCard({ product, index, onOpen, onNeedVariant }: {
  product: Product; index: number; onOpen: () => void; onNeedVariant: () => void;
}) {
  const unavailable = product.is_available === false;
  const prices = usePromoStore((s) => s.prices);
  const categories = useAppStore((s) => s.categories);
  const category = categories.find((c) => c.id === product.category_id);
  // Products with sizes are added from the details window, where the size is picked.
  const { inCart, add } = useAddToCart(product, null, onNeedVariant, onOpen);
  const info = priceInfo(product, null, prices);
  const pct = info.now < info.base ? Math.round((1 - info.now / info.base) * 100) : 0;
  const hasVariants = (product.variants || []).length > 0;
  const addLabel = hasVariants ? 'Выбрать объём' : inCart ? 'В корзине — открыть' : 'Добавить в корзину';

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.8, delay: (index % 4) * 0.06, ease: EASE }}
      className="group"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(ellipse_at_50%_42%,#1C1C1C_0%,#121212_68%)]">
        <button onClick={onOpen} className="absolute inset-0 cursor-pointer" aria-label={`Подробнее: ${product.name}`}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className={`absolute inset-0 w-full h-full object-contain p-[11%] transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045] ${unavailable ? 'opacity-40 grayscale' : ''}`}
            />
          ) : <Monogram />}
        </button>
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
          <span className="label !text-[10px] !text-text/80">
            {unavailable ? 'Нет в наличии' : product.badge && BADGES[product.badge] ? BADGES[product.badge] : ''}
          </span>
          <div className="flex items-center gap-3">
            {pct > 0 && !unavailable && <span className="label !text-[10px] !text-primary">−{pct}%</span>}
            <span className="pointer-events-auto"><FavoriteButton productId={product.id} /></span>
          </div>
        </div>
        {!unavailable && (
          <button
            onClick={add}
            className="max-lg:hidden absolute inset-x-0 bottom-0 h-12 bg-ivory text-ink text-[11px] font-medium uppercase tracking-[0.16em] translate-y-full group-hover:translate-y-0 focus-visible:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer"
          >
            {addLabel}
          </button>
        )}
      </div>

      <div className="pt-5">
        <button onClick={onOpen} className="block text-left text-[14px] max-sm:text-[13px] leading-snug text-text line-clamp-2 min-h-[2.75em] cursor-pointer hover:text-white">
          {product.name}
        </button>
        <div className="mt-2 flex items-center justify-between gap-3">
          <PriceTag info={info} />
          <button
            onClick={() => askSeller(product.id)}
            className="max-lg:hidden shrink-0 text-muted hover:text-text transition-colors cursor-pointer"
            title="Связаться с продавцом"
            aria-label="Связаться с продавцом"
          >
            <MessageCircle size={16} strokeWidth={1.4} />
          </button>
        </div>
        <ComparePrices info={info} category={category} />
        <div className="lg:hidden mt-3 flex gap-1.5">
          {!unavailable && (
            <button
              onClick={add}
              className={`flex-1 h-9 flex items-center justify-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] border cursor-pointer transition-colors ${inCart ? 'border-line text-text' : 'border-ivory bg-ivory text-ink'}`}
            >
              {hasVariants ? 'Выбрать объём' : inCart ? <><Check size={13} strokeWidth={1.6} /> В корзине</> : <><Plus size={13} strokeWidth={1.6} /> В корзину</>}
            </button>
          )}
          <button
            onClick={() => askSeller(product.id)}
            className={`${unavailable ? 'flex-1' : 'w-9'} h-9 flex items-center justify-center gap-1.5 border border-line text-muted hover:text-text cursor-pointer`}
            aria-label="Связаться с продавцом"
          >
            <MessageCircle size={14} strokeWidth={1.4} />{unavailable && <span className="text-[10.5px] uppercase tracking-[0.12em]">Спросить</span>}
          </button>
        </div>
      </div>
    </motion.article>
  );
});

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useScrollLock(true);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[3000] bg-black/80 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      {children}
    </motion.div>
  );
}

function ProductModal({ product, onClose, onNeedVariant }: { product: Product; onClose: () => void; onNeedVariant: () => void }) {
  const prices = usePromoStore((s) => s.prices);
  const category = useAppStore((s) => s.categories.find((c) => c.id === product.category_id));
  const show = useNotificationStore((s) => s.show);
  const variants = product.variants || [];
  // Preselect the cheapest variant in stock, so the price shown is one you can buy.
  const [variantId, setVariantId] = useState<number | null>(() => {
    if (!variants.length) return null;
    const pick = availableVariants(product).reduce((a, b) =>
      priceFor(promoKey(product.id, b.id), b.price, prices) < priceFor(promoKey(product.id, a.id), a.price, prices) ? b : a);
    return pick.id;
  });
  const variant = variants.find((v) => v.id === variantId) || null;
  const variantOut = variant?.is_available === false;
  const unavailable = product.is_available === false || variantOut;
  const { inCart, add } = useAddToCart(product, variant, onNeedVariant, () => show('Выберите объём или упаковку', 'error'));
  const info = priceInfo(product, variant, prices);
  const images = useMemo(() => {
    const list = [...(product.images || [])].sort((a, b) => Number(!!b.is_main) - Number(!!a.is_main)).map((i) => i.url).filter(Boolean);
    if (!list.length && product.image_url) list.push(product.image_url);
    return list;
  }, [product]);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);

  return (
    <Overlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.5, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[1040px] max-h-[94vh] overflow-y-auto bg-bg border border-line grid grid-cols-2 max-md:grid-cols-1"
      >
        <button onClick={onClose} className="absolute top-5 right-5 z-10 text-muted hover:text-text cursor-pointer" aria-label="Закрыть">
          <X size={22} strokeWidth={1.3} />
        </button>
        <div className="relative aspect-[4/5] max-md:aspect-square bg-[radial-gradient(ellipse_at_50%_42%,#1E1E1E_0%,#121212_70%)]">
          {images.length ? (
            <img src={images[idx]} alt={product.name} onClick={() => setZoom(true)} className="absolute inset-0 w-full h-full object-contain p-[10%] cursor-zoom-in" />
          ) : <Monogram big />}
          {images.length > 0 && (
            <button onClick={() => setZoom(true)} className="absolute bottom-5 left-5 text-muted hover:text-text cursor-pointer" aria-label="Открыть фото">
              <Maximize2 size={16} strokeWidth={1.4} />
            </button>
          )}
          {images.length > 1 && (
            <div className="absolute bottom-4 right-5 flex items-center gap-4 text-muted">
              <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)} className="hover:text-text cursor-pointer" aria-label="Предыдущее фото"><ChevronLeft size={18} strokeWidth={1.4} /></button>
              <span className="text-[12px] tabular-nums">{idx + 1} / {images.length}</span>
              <button onClick={() => setIdx((i) => (i + 1) % images.length)} className="hover:text-text cursor-pointer" aria-label="Следующее фото"><ChevronRight size={18} strokeWidth={1.4} /></button>
            </div>
          )}
          {zoom && <Lightbox images={images} startIndex={idx} alt={product.name} onClose={() => setZoom(false)} />}
        </div>
        <div className="p-12 max-lg:p-8 max-sm:p-6 flex flex-col">
          <div className="flex items-center gap-4">
            <div className="label">{product.badge && BADGES[product.badge] ? BADGES[product.badge] : 'Оригинал'}</div>
            <FavoriteButton productId={product.id} />
          </div>
          <h3 className="font-display text-[38px] max-sm:text-[30px] leading-[1.08] text-text mt-4 pr-6">{product.name}</h3>
          {product.description && (
            <p className="mt-6 text-[15px] text-muted leading-[1.75] whitespace-pre-line">{product.description}</p>
          )}
          {variants.length > 0 && (
            <div className="mt-8">
              <div className="label !text-[10px] mb-3">Объём и упаковка</div>
              <div className="grid gap-2" role="radiogroup" aria-label="Объём и упаковка">
                {variants.map((v) => {
                  const vi = priceInfo(product, v, prices);
                  const active = v.id === variantId;
                  const out = v.is_available === false;
                  return (
                    <button
                      key={v.id}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setVariantId(v.id)}
                      className={`flex items-center justify-between gap-4 px-4 py-3 border text-left cursor-pointer transition-colors ${active ? 'border-primary text-text' : 'border-line text-muted hover:text-text'} ${out ? 'opacity-50' : ''}`}
                    >
                      <span className="text-[14px]">{v.label}{out && ' · нет в наличии'}</span>
                      <span className="flex items-baseline gap-2 tabular-nums">
                        <span className="text-[14px] text-text">{formatPrice(vi.now)}</span>
                        {vi.now < vi.base && <span className="text-[12px] text-light line-through">{formatPrice(vi.base)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="hairline my-8" />
          <PriceTag info={info} size="lg" />
          <ComparePrices info={info} category={category} size="lg" />
          <div className="mt-8 flex flex-col gap-3">
            <button onClick={add} disabled={unavailable} className="btn-primary w-full">
              {unavailable ? 'Нет в наличии' : inCart ? 'В корзине — оформить' : 'Добавить в корзину'}
            </button>
            <button onClick={() => { onClose(); askSeller(product.id); }} className="btn-outline w-full">
              Спросить продавца
            </button>
          </div>
          <p className="mt-auto pt-8 text-[12px] text-light leading-relaxed">
            Оплачивать сразу не нужно: после оформления менеджер подтвердит наличие в чате заказа и пришлёт реквизиты для предоплаты.
          </p>
        </div>
      </motion.div>
    </Overlay>
  );
}

function VariantModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem } = useCartStore();
  const show = useNotificationStore((s) => s.show);
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) { show('Укажите вариант — объём, оттенок или аромат', 'error'); return; }
    addItem(product, text.trim());
    show(`«${product.name}» в корзине`);
    onClose();
  };
  return (
    <Overlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.4, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-bg border border-line p-10 max-sm:p-6"
      >
        <div className="label">Уточните вариант</div>
        <h3 className="font-display text-[30px] leading-tight text-text mt-3">{product.name}</h3>
        <p className="text-[14px] text-muted mt-3 mb-6">Напишите, какой вариант нужен: объём, оттенок, концентрация.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Например: 100 мл, EDP" className="field resize-none" autoFocus />
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-outline flex-1">Отмена</button>
          <button onClick={submit} className="btn-primary flex-1">В корзину</button>
        </div>
      </motion.div>
    </Overlay>
  );
}
