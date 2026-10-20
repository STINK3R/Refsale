import { useMemo, useRef, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronLeft, ChevronRight, MessageCircle, Plus, Minus, Trash2, Check, Maximize2, Heart } from 'lucide-react';
import {
  useAppStore, useCartStore, useNotificationStore, usePromoStore, useFavoritesStore, useActiveCategory,
  priceFor, promoKey, cartKey,
} from '../../store';
import { formatPrice } from '../../utils/format';
import { priceInfo, availableVariants, type PriceInfo } from '../../utils/prices';
import { askSeller } from '../../utils/askSeller';
import Lightbox from '../ui/Lightbox';
import Meerkat from '../mascot/Meerkat';

import useScrollLock from '../../hooks/useScrollLock';
import type { CartItem, Category, Product, ProductVariant } from '../../types';

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
    <section id="catalog" className="pt-8 pb-24 max-md:pt-6 max-md:pb-14">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5">
        <div className="flex items-end justify-between gap-10 pb-6 max-md:flex-col max-md:items-stretch max-md:gap-5">
          <div>
            <div className="label mb-5">Каталог</div>
            {/* A highlighter stroke in the category's strong colour */}
            <h2 className="font-display text-[clamp(34px,4.4vw,60px)] leading-[1.02] text-ink">
              <span className="px-1 -mx-1 bg-[linear-gradient(transparent_58%,var(--color-accent-strong)_58%,var(--color-accent-strong)_92%,transparent_92%)]">{category?.name || 'Каталог'}</span>
            </h2>
          </div>
          <label className="relative w-[340px] max-md:w-full block">
            <Search size={18} strokeWidth={2.2} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink" />
            <input
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={category ? `Поиск: ${category.name.toLowerCase()}` : 'Поиск товаров'}
              className="field !h-12 !pl-11 !border-2 !border-ink"
              aria-label="Поиск товаров"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-6 pt-6 max-md:flex-col max-md:items-start max-md:gap-4">
          {!debounced && subs.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide max-w-full">
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
          <div className="text-[13px] font-semibold text-muted shrink-0">
            {promoCode
              ? <>Цены по промокоду <span className="px-2 py-0.5 rounded-full bg-primary text-white tracking-[0.06em]">{promoCode}</span> · {promoCount} {plural(promoCount, 'позиция', 'позиции', 'позиций')} дешевле</>
              : 'Цены без промокода — с ним будет дешевле'}
          </div>
        </div>

        <div className="mt-12">
          {loading ? (
            <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-[22px] border-2 border-line p-2">
                  <div className="aspect-square rounded-[12px] max-sm:rounded-[9px] bg-tile" />
                  <div className="h-3.5 bg-ink/[0.05] w-3/4 mt-5" />
                  <div className="h-3.5 bg-ink/[0.05] w-1/3 mt-3" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <Meerkat pose="thinking" width={130} decorative className="mx-auto mb-6" />
              <div className="font-display text-[28px] text-text">{debounced ? 'Ничего не нашлось' : 'Каталог скоро пополнится'}</div>
              <p className="text-[14px] text-muted mt-3">{debounced ? 'Попробуйте другое название или бренд' : 'Загляните чуть позже'}</p>
            </div>
          ) : (
            <>
              <motion.div
                key={`grid-${categoryId ?? 'all'}-${subcategory ?? 'all'}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}
                className="grid grid-cols-4 gap-5 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:gap-3"
              >
                {visible.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} onOpen={() => setSelected(p)} onNeedVariant={() => setVariantFor(p)} />
                ))}
              </motion.div>
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
      className={`shrink-0 h-9 px-4 rounded-ctl-sm border-2 whitespace-nowrap cursor-pointer transition-colors text-[13px] font-bold ${active ? 'bg-ink border-ink text-sun' : 'bg-card border-line text-muted hover:border-ink hover:text-ink'}`}
    >
      {children}
      {count != null && <span className="ml-1.5 text-[11px] opacity-60">{count}</span>}
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
          <span className={`font-display text-[38px] leading-none ${discounted ? 'text-primary' : 'text-ink'}`}>{pre}{formatPrice(now)}</span>
          {discounted && <span className="text-[16px] text-light line-through">{formatPrice(base)}</span>}
          {discounted && <span className="px-3 py-1 rounded-full bg-primary text-white text-[12px] font-bold">−{Math.round((1 - now / base) * 100)}% по промокоду</span>}
        </div>
        {!discounted && !code && hasPromo && (
          <div className="text-[13px] font-semibold text-primary mt-3">С промокодом от блогера эта позиция дешевле</div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2.5 flex-wrap">
      <span className={`text-[17px] max-sm:text-[15px] font-extrabold tabular-nums ${discounted ? 'text-primary' : 'text-ink'}`}>{pre}{formatPrice(now)}</span>
      {discounted && <span className="text-[13px] text-light line-through tabular-nums">{formatPrice(base)}</span>}
      {!discounted && !code && hasPromo && <span className="block w-full text-[11px] font-semibold text-primary">дешевле с промокодом</span>}
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
      <div className="mt-5 grid gap-1.5 p-4 rounded-2xl bg-surface">
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
    <div className="mt-1.5 grid gap-0.5 text-[11px] leading-snug text-muted">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-2">
          <span className="truncate">{r.label}</span>
          <span className="line-through tabular-nums shrink-0">{formatPrice(Number(r.price))}</span>
        </div>
      ))}
    </div>
  );
}

// ── Cart and favourites ─────────────────────────────

function useAddToCart(product: Product, variant: ProductVariant | null, onNeedVariant: () => void, onNeedChoice?: () => void) {
  const { addItem, items, openSidebar } = useCartStore();
  const show = useNotificationStore((s) => s.show);
  const hasVariants = (product.variants || []).length > 0;
  const line = items.find((i) => cartKey(i) === cartKey({ id: product.id, variant_id: variant?.id ?? null }));
  const inCart = hasVariants ? !!variant && !!line : items.some((i) => i.id === product.id);
  const add = useCallback(() => {
    if (inCart) { openSidebar(); return; }
    if (hasVariants && !variant) { onNeedChoice?.(); return; }
    if (!hasVariants && (product.requires_variant || product.badge === 'custom')) { onNeedVariant(); return; }
    addItem(product, undefined, variant);
    show(`«${product.name}${variant ? ` — ${variant.label}` : ''}» в корзине`);
  }, [inCart, hasVariants, variant, product, addItem, openSidebar, show, onNeedVariant, onNeedChoice]);
  return { inCart, add, line };
}

/**
 * A line already in the cart, right on the card: minus takes one off (a bin
 * at the last one takes the line out), the middle opens the cart, plus adds.
 */
function CartStepper({ line, size = 'sm', className = '' }: { line: CartItem; size?: 'sm' | 'lg'; className?: string }) {
  const changeQty = useCartStore((s) => s.changeQty);
  const openSidebar = useCartStore((s) => s.openSidebar);
  const show = useNotificationStore((s) => s.show);
  const key = cartKey(line);
  const last = line.qty <= 1;
  const lg = size === 'lg';
  const icon = lg ? 17 : 14;
  const side = `${lg ? 'w-[42px] rounded-[11px]' : 'w-8 rounded-ctl-xs'} h-full shrink-0 flex items-center justify-center text-ink hover:bg-sun transition-colors cursor-pointer disabled:opacity-35 disabled:pointer-events-none`;
  const name = `«${line.name}${line.variant_label ? ` — ${line.variant_label}` : ''}»`;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}
      className={`${lg ? 'h-[50px] rounded-ctl-md' : 'h-10 rounded-ctl-sm'} border-2 border-ink bg-card flex items-center p-[3px] ${className}`}
    >
      <button
        onClick={() => { changeQty(key, -1); if (last) show(`${name} убран из корзины`); }}
        className={side}
        aria-label={last ? 'Убрать из корзины' : 'На одну меньше'}
        title={last ? 'Убрать из корзины' : 'На одну меньше'}
      >
        {last ? <Trash2 size={icon} strokeWidth={2.2} /> : <Minus size={icon} strokeWidth={2.4} />}
      </button>
      <button
        onClick={openSidebar}
        className={`flex-1 min-w-0 h-full px-1 rounded-ctl-xs font-bold tabular-nums whitespace-nowrap text-ink hover:text-primary transition-colors cursor-pointer ${lg ? 'text-[14px]' : 'text-[12.5px] max-sm:text-[12px]'}`}
        title="Открыть корзину"
      >
        {lg ? `В корзине · ${line.qty}` : <><span className="max-sm:hidden">В корзине · </span>{line.qty}<span className="sm:hidden"> шт</span></>}
      </button>
      <button onClick={() => changeQty(key, 1)} disabled={line.qty >= 99} className={side} aria-label="Ещё одну" title="Ещё одну">
        <Plus size={icon} strokeWidth={2.4} />
      </button>
    </motion.div>
  );
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
      <span className={`font-display text-ink/[0.06] ${big ? 'text-[140px]' : 'text-[88px]'}`}>R</span>
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
  const { inCart, add, line } = useAddToCart(product, null, onNeedVariant, onOpen);
  const info = priceInfo(product, null, prices);
  const pct = info.now < info.base ? Math.round((1 - info.now / info.base) * 100) : 0;
  const hasVariants = (product.variants || []).length > 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.8, delay: (index % 4) * 0.06, ease: EASE }}
      className="group flex flex-col bg-card rounded-[22px] max-sm:rounded-[18px] border-2 border-ink p-2 hover:-translate-y-1 hover:shadow-[0_6px_0_#111] transition-all duration-300"
    >
      <div className="relative aspect-square overflow-hidden rounded-[12px] max-sm:rounded-[9px] tile-bg">
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
        <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-start gap-2 pointer-events-none">
          <div className="flex flex-wrap gap-1">
            {(unavailable || (product.badge && BADGES[product.badge])) && (
              <span className="px-2.5 py-1 rounded-full bg-card border-2 border-ink text-[10px] font-bold uppercase tracking-[0.06em]">
                {unavailable ? 'Нет в наличии' : BADGES[product.badge as string]}
              </span>
            )}
            {pct > 0 && !unavailable && <span className="px-2.5 py-1 rounded-full bg-primary text-white text-[11px] font-extrabold">−{pct}%</span>}
          </div>
          <span className="pointer-events-auto w-9 h-9 rounded-full bg-card/90 flex items-center justify-center"><FavoriteButton productId={product.id} /></span>
        </div>
      </div>

      <div className="px-2 pt-3 pb-1 flex flex-col flex-1">
        <button onClick={onOpen} className="block text-left text-[14px] max-sm:text-[13px] font-semibold leading-snug text-ink line-clamp-2 min-h-[2.75em] cursor-pointer hover:text-primary">
          {product.name}
        </button>
        <div className="mt-2">
          <PriceTag info={info} />
        </div>
        <ComparePrices info={info} category={category} />
        <div className="mt-auto pt-3 flex gap-1.5">
          {!unavailable && !hasVariants && line ? (
            <CartStepper line={line} className="flex-1 min-w-0" />
          ) : !unavailable && (
            <button
              onClick={add}
              className={`flex-1 h-10 rounded-ctl-sm border-2 border-ink flex items-center justify-center gap-1 text-[12.5px] max-sm:text-[12px] font-bold whitespace-nowrap cursor-pointer transition-colors ${inCart ? 'bg-card text-ink' : 'bg-sun text-ink hover:bg-ink hover:text-sun'}`}
            >
              {hasVariants ? <><span className="max-sm:hidden">Выбрать объём</span><span className="sm:hidden">Объёмы</span></> : inCart ? <><Check size={14} strokeWidth={2.4} /> В корзине</> : <><Plus size={14} strokeWidth={2.4} /> В корзину</>}
            </button>
          )}
          <button
            onClick={() => askSeller(product.id)}
            className={`${unavailable ? 'flex-1' : 'w-10 max-sm:hidden'} h-10 rounded-ctl-sm flex items-center justify-center gap-1.5 border-2 border-ink bg-card text-ink hover:bg-sun-soft cursor-pointer`}
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
      className="fixed inset-0 z-[3000] bg-ink/45 flex items-end sm:items-center justify-center sm:p-6"
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
  const { inCart, add, line } = useAddToCart(product, variant, onNeedVariant, () => show('Выберите объём или упаковку', 'error'));
  const info = priceInfo(product, variant, prices);
  const images = useMemo(() => {
    const list = [...(product.images || [])].sort((a, b) => Number(!!b.is_main) - Number(!!a.is_main)).map((i) => i.url).filter(Boolean);
    if (!list.length && product.image_url) list.push(product.image_url);
    return list;
  }, [product]);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);

  const discounted = info.now < info.base;
  const code = usePromoStore((s) => s.code);

  return (
    <Overlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.5, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        // Fixed height: the photo keeps its half whole, only the details scroll,
        // and the close button, price and buttons never leave the screen.
        className="relative w-full max-w-[1040px] h-[min(92dvh,720px)] max-md:h-[92dvh] bg-bg border-2 border-ink rounded-t-[28px] sm:rounded-[28px] shadow-[0_8px_0_#111] flex flex-col md:grid md:grid-cols-2"
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-ctl-sm bg-card border-2 border-ink text-ink flex items-center justify-center cursor-pointer hover:bg-sun" aria-label="Закрыть">
          <X size={18} strokeWidth={2.2} />
        </button>

        <div className="relative shrink-0 h-[34dvh] md:h-auto tile-bg overflow-hidden rounded-t-[26px] md:rounded-tr-none md:rounded-l-[26px]">
          {images.length ? (
            <img src={images[idx]} alt={product.name} onClick={() => setZoom(true)} className="absolute inset-0 w-full h-full object-contain p-[8%] cursor-zoom-in" />
          ) : <Monogram big />}
          {/* The meerkat peeking up from behind the photo's bottom edge — the
              corner products never reach, so it covers nothing. */}
          <Meerkat pose="peek" width={132} decorative className="absolute -bottom-[6px] left-6 max-md:-bottom-[4px] max-md:left-4 max-md:w-[96px] pointer-events-none" />
          {images.length > 0 && (
            <button onClick={() => setZoom(true)} className="absolute top-4 left-4 w-9 h-9 rounded-ctl-sm bg-card/90 border-2 border-ink text-ink flex items-center justify-center cursor-pointer hover:bg-sun" aria-label="Открыть фото">
              <Maximize2 size={15} strokeWidth={2} />
            </button>
          )}
          {images.length > 1 && (
            <div className="absolute bottom-4 right-4 flex items-center gap-2 px-1 py-1 rounded-ctl-sm bg-card/90 border-2 border-ink text-ink">
              <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)} className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-sun cursor-pointer" aria-label="Предыдущее фото"><ChevronLeft size={16} strokeWidth={2.2} /></button>
              <span className="text-[12px] font-bold tabular-nums">{idx + 1} / {images.length}</span>
              <button onClick={() => setIdx((i) => (i + 1) % images.length)} className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-sun cursor-pointer" aria-label="Следующее фото"><ChevronRight size={16} strokeWidth={2.2} /></button>
            </div>
          )}
          {zoom && <Lightbox images={images} startIndex={idx} alt={product.name} onClose={() => setZoom(false)} />}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0 overflow-y-auto modal-scroll px-10 max-lg:px-8 max-sm:px-5 pt-9 max-sm:pt-5 pb-8">
              <div className="flex items-center gap-3 pr-12">
                <span className="px-3 py-1 rounded-full bg-card border-2 border-ink text-[10px] font-bold uppercase tracking-[0.08em]">
                  {product.badge && BADGES[product.badge] ? BADGES[product.badge] : 'Оригинал'}
                </span>
                <FavoriteButton productId={product.id} />
              </div>
              <h3 className="font-display text-[28px] max-lg:text-[24px] max-sm:text-[21px] leading-[1.12] text-ink mt-4 pr-6">{product.name}</h3>
              {product.description && (
                <p className="mt-4 text-[14px] text-muted leading-[1.65] whitespace-pre-line">{product.description}</p>
              )}
              {variants.length > 0 && (
                <div className="mt-6">
                  <div className="label !text-[10px] mb-2.5">Объём и упаковка</div>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Объём и упаковка">
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
                          className={`flex flex-col items-start gap-1 px-3.5 py-2.5 rounded-2xl border-2 text-left cursor-pointer transition-colors ${active ? 'border-ink bg-accent-strong text-ink' : 'border-line bg-card text-muted hover:border-ink hover:text-ink'} ${out ? 'opacity-50' : ''}`}
                        >
                          <span className="text-[12.5px] font-semibold leading-snug">{v.label}{out && ' · нет'}</span>
                          <span className="flex items-baseline gap-1.5 tabular-nums">
                            <span className={`text-[15px] font-extrabold ${vi.now < vi.base ? 'text-primary' : 'text-ink'}`}>{formatPrice(vi.now)}</span>
                            {vi.now < vi.base && <span className="text-[11px] text-light line-through">{formatPrice(vi.base)}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <ComparePrices info={info} category={category} size="lg" />
              <p className="mt-6 text-[12px] text-light leading-relaxed">
                Оплачивать сразу не нужно: после оформления менеджер подтвердит наличие в чате заказа и пришлёт реквизиты для предоплаты.
              </p>
            </div>
            {/* A soft fade says there is more below without drawing a scrollbar */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-bg to-transparent" />
          </div>

          <div className="shrink-0 border-t-2 border-ink/10 px-8 max-lg:px-6 max-sm:px-5 py-5 max-sm:py-4 flex items-center gap-3 flex-wrap lg:flex-nowrap">
            <div className="mr-auto min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className={`font-display text-[28px] max-sm:text-[26px] leading-none whitespace-nowrap ${discounted ? 'text-primary' : 'text-ink'}`}>{info.from ? 'от ' : ''}{formatPrice(info.now)}</span>
                {discounted && <span className="text-[14px] text-light line-through tabular-nums">{formatPrice(info.base)}</span>}
                {discounted && <span className="px-2.5 py-0.5 rounded-full bg-primary text-white text-[11px] font-bold">−{Math.round((1 - info.now / info.base) * 100)}%</span>}
              </div>
              {!discounted && !code && info.hasPromo && (
                <div className="mt-1.5 text-[12px] font-semibold text-primary">С промокодом блогера дешевле</div>
              )}
            </div>
            <div className="flex gap-2 shrink-0 max-sm:w-full">
              {line && !unavailable ? (
                <CartStepper line={line} size="lg" className="w-[220px] max-sm:w-auto max-sm:flex-1" />
              ) : (
                <button onClick={add} disabled={unavailable} className="btn-primary max-sm:flex-1 !px-6">
                  {unavailable ? 'Нет в наличии' : inCart ? 'В корзине' : 'В корзину'}
                </button>
              )}
              <button
                onClick={() => { onClose(); askSeller(product.id); }}
                className="w-[50px] h-[50px] shrink-0 rounded-ctl-md bg-card border-2 border-ink text-ink flex items-center justify-center hover:bg-sun-soft cursor-pointer"
                aria-label="Спросить продавца"
                title="Спросить продавца"
              >
                <MessageCircle size={19} strokeWidth={2} />
              </button>
            </div>
          </div>
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
        className="w-full max-w-md bg-bg border-2 border-ink rounded-t-[28px] sm:rounded-[28px] p-10 max-sm:p-6"
      >
        <div className="label">Уточните вариант</div>
        <h3 className="font-display text-[24px] leading-tight text-ink mt-3">{product.name}</h3>
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
