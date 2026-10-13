import { useMemo, useRef, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingBag, Check, MessageCircle, X, ChevronLeft, ChevronRight, Maximize2, BadgePercent, ChevronDown, Sparkles } from 'lucide-react';
import { useAppStore, useCartStore, useNotificationStore, usePromoStore, priceFor } from '../../store';
import { formatPrice } from '../../utils/format';
import { askSeller } from '../../utils/askSeller';
import Lightbox from '../ui/Lightbox';
import useScrollLock from '../../hooks/useScrollLock';
import type { Product } from '../../types';

const PAGE = 12;

const BADGES: Record<string, string> = {
  new: 'Новинка', hit: 'Хит', sale: 'Скидка', rare: 'Редкое', custom: 'Под заказ', vip: 'Premium',
};

export default function StoreCatalog() {
  const { products, categories, subcategories, loading } = useAppStore();
  const prices = usePromoStore((s) => s.prices);
  const promoCode = usePromoStore((s) => s.code);
  const [category, setCategory] = useState<number | null>(null);
  const [subcategory, setSubcategory] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Product | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);

  const onSearch = (v: string) => {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebounced(v.trim().toLowerCase()); setShown(PAGE); }, 220);
  };

  const subs = useMemo(
    () => (category ? subcategories.filter((s) => s.category_id === category) : []),
    [subcategories, category],
  );

  const filtered = useMemo(() => {
    let list = products;
    if (debounced) {
      list = list.filter((p) => p.name.toLowerCase().includes(debounced) || (p.description || '').toLowerCase().includes(debounced));
    } else {
      if (category) list = list.filter((p) => p.category_id === category);
      if (subcategory) list = list.filter((p) => p.subcategory_id === subcategory);
    }
    // Available first; keep admin order otherwise
    return [...list].sort((a, b) => Number(b.is_available !== false) - Number(a.is_available !== false));
  }, [products, category, subcategory, debounced]);

  const visible = filtered.slice(0, shown);
  const promoCount = useMemo(() => products.filter((p) => prices[String(p.id)] != null).length, [products, prices]);

  const pickCategory = (id: number | null) => { setCategory(id); setSubcategory(null); setShown(PAGE); };

  return (
    <section id="catalog" className="py-16 max-sm:py-10">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="flex items-end justify-between gap-6 mb-8 max-md:flex-col max-md:items-start">
          <div>
            <div className="eyebrow mb-3">Каталог</div>
            <h2 className="font-display text-[48px] leading-none text-text max-sm:text-[36px]">Парфюмерия и уход</h2>
            {promoCode ? (
              <p className="mt-3 text-[14px] text-primary-light flex items-center gap-1.5">
                <BadgePercent size={15} /> Промокод {promoCode}: цена со скидкой на {promoCount} {plural(promoCount, 'товар', 'товара', 'товаров')}
              </p>
            ) : (
              <p className="mt-3 text-[14px] text-muted">Цены указаны без промокода — с ним будет дешевле</p>
            )}
          </div>
          <div className="relative w-[360px] max-md:w-full">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Поиск: бренд, аромат, средство…"
              className="field !rounded-full !pl-11"
              aria-label="Поиск товаров"
            />
          </div>
        </div>

        {/* Categories */}
        {!debounced && categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-3">
            <Pill active={category === null} onClick={() => pickCategory(null)}>Все <Count n={products.length} /></Pill>
            {categories.map((c) => {
              const n = products.filter((p) => p.category_id === c.id).length;
              if (!n) return null;
              return <Pill key={c.id} active={category === c.id} onClick={() => pickCategory(c.id)}>{c.name} <Count n={n} /></Pill>;
            })}
          </div>
        )}
        {!debounced && subs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-3">
            <Pill small active={subcategory === null} onClick={() => { setSubcategory(null); setShown(PAGE); }}>Все</Pill>
            {subs.map((s) => (
              <Pill key={s.id} small active={subcategory === s.id} onClick={() => { setSubcategory(s.id); setShown(PAGE); }}>{s.name}</Pill>
            ))}
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card-luxe rounded-3xl overflow-hidden animate-pulse">
                  <div className="pt-[110%] bg-white/[0.03]" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-white/[0.06] rounded w-3/4" />
                    <div className="h-5 bg-white/[0.06] rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-20 text-muted">
              <Sparkles size={32} className="mx-auto mb-3 text-primary/50" />
              {debounced ? 'Ничего не нашли — попробуйте другое название' : 'Скоро здесь появятся товары'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:gap-3">
                {visible.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} onOpen={() => setSelected(p)} onNeedVariant={() => setVariantFor(p)} />
                ))}
              </div>
              {filtered.length > shown && (
                <div className="text-center mt-8">
                  <button onClick={() => setShown((n) => n + PAGE)} className="btn-ghost rounded-full px-7 py-3 text-sm">
                    <ChevronDown size={16} /> Показать ещё {Math.min(PAGE, filtered.length - shown)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
    </section>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function Pill({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-2 rounded-full border transition-all cursor-pointer whitespace-nowrap ${small ? 'px-3.5 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[13px]'} font-semibold ${
        active
          ? 'bg-gradient-to-br from-primary-light to-primary-dark text-ink border-transparent shadow-[0_6px_20px_rgba(212,175,90,0.25)]'
          : 'bg-white/[0.03] text-muted border-white/10 hover:text-text hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-[11px] opacity-70">{n}</span>;
}

/** Base price, or было/стало once a promo code is active. */
export function PriceTag({ product, size = 'md' }: { product: Product; size?: 'md' | 'lg' }) {
  const prices = usePromoStore((s) => s.prices);
  const code = usePromoStore((s) => s.code);
  const base = Number(product.price) || 0;
  const now = priceFor(product.id, base, prices);
  const discounted = now < base;
  const pct = discounted ? Math.round((1 - now / base) * 100) : 0;
  const big = size === 'lg';
  return (
    <div className="min-w-0">
      {discounted && (
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`${big ? 'text-[15px]' : 'text-[12px]'} text-light line-through`}>{formatPrice(base)}</span>
          <span className={`${big ? 'text-[12px] px-2' : 'text-[10px] px-1.5'} py-0.5 rounded-full bg-primary/15 text-primary-light font-bold`}>−{pct}%</span>
        </div>
      )}
      <div className={`font-display ${big ? 'text-[38px]' : 'text-[26px] max-sm:text-[22px]'} leading-none ${discounted ? 'text-gold-gradient' : 'text-text'}`}>
        {formatPrice(now)}
      </div>
      {!discounted && !code && product.has_promo_price && (
        <div className={`${big ? 'text-[12px]' : 'text-[10.5px]'} text-primary/90 mt-1 flex items-center gap-1`}>
          <BadgePercent size={big ? 13 : 11} /> с промокодом дешевле
        </div>
      )}
    </div>
  );
}

function useAddToCart(product: Product, onNeedVariant: () => void) {
  const { addItem, items, openSidebar } = useCartStore();
  const show = useNotificationStore((s) => s.show);
  const inCart = items.some((i) => i.id === product.id);
  const add = useCallback(() => {
    if (inCart) { openSidebar(); return; }
    if (product.requires_variant || product.badge === 'custom') { onNeedVariant(); return; }
    addItem(product);
    show(`«${product.name}» в корзине`);
  }, [inCart, product, addItem, openSidebar, show, onNeedVariant]);
  return { inCart, add };
}

const ProductCard = memo(function ProductCard({ product, index, onOpen, onNeedVariant }: {
  product: Product; index: number; onOpen: () => void; onNeedVariant: () => void;
}) {
  const unavailable = product.is_available === false;
  const { inCart, add } = useAddToCart(product, onNeedVariant);
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index % PAGE, 8) * 0.035 }}
      className={`card-luxe group rounded-3xl overflow-hidden flex flex-col ${unavailable ? 'opacity-60' : 'hover:-translate-y-1'}`}
    >
      <button onClick={onOpen} className="relative block w-full pt-[110%] bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,90,0.10),transparent_65%)] cursor-pointer" aria-label={`Подробнее: ${product.name}`}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy" className="absolute inset-0 w-full h-full object-contain p-5 max-sm:p-3 transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-primary/30"><Sparkles size={40} /></div>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {unavailable && <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/60 text-muted border border-white/10">Нет в наличии</span>}
          {!unavailable && product.badge && BADGES[product.badge] && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/55 text-primary-light border border-primary/30 backdrop-blur">{BADGES[product.badge]}</span>
          )}
        </div>
      </button>
      <div className="p-4 max-sm:p-3 flex-1 flex flex-col gap-3">
        <button onClick={onOpen} className="text-left text-[15px] max-sm:text-[13px] font-semibold text-text leading-snug line-clamp-2 hover:text-primary-light transition-colors cursor-pointer">
          {product.name}
        </button>
        <div className="mt-auto"><PriceTag product={product} /></div>
        <div className="flex gap-2">
          <button
            onClick={add}
            disabled={unavailable}
            className={`flex-1 h-10 max-sm:h-9 rounded-full text-[13px] max-sm:text-[12px] ${inCart ? 'btn-ghost' : 'btn-gold'}`}
          >
            {unavailable ? 'Нет в наличии' : inCart ? <><Check size={15} /> В корзине</> : <><ShoppingBag size={15} /> В корзину</>}
          </button>
          <button
            onClick={() => askSeller(product.id)}
            className="btn-ghost w-10 h-10 max-sm:w-9 max-sm:h-9 rounded-full shrink-0"
            title="Связаться с продавцом"
            aria-label="Связаться с продавцом"
          >
            <MessageCircle size={16} />
          </button>
        </div>
      </div>
    </motion.article>
  );
});

function ProductModal({ product, onClose, onNeedVariant }: { product: Product; onClose: () => void; onNeedVariant: () => void }) {
  useScrollLock(true);
  const unavailable = product.is_available === false;
  const { inCart, add } = useAddToCart(product, onNeedVariant);
  const images = useMemo(() => {
    const list = [...(product.images || [])].sort((a, b) => Number(!!b.is_main) - Number(!!a.is_main)).map((i) => i.url).filter(Boolean);
    if (!list.length && product.image_url) list.push(product.image_url);
    return list;
  }, [product]);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[3000] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong w-full max-w-[920px] max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] grid grid-cols-2 max-md:grid-cols-1 relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-muted hover:text-text cursor-pointer" aria-label="Закрыть">
          <X size={18} />
        </button>
        <div className="relative min-h-[360px] max-sm:min-h-[300px] bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,90,0.12),transparent_65%)]">
          {images.length ? (
            <img src={images[idx]} alt={product.name} onClick={() => setZoom(true)} className="absolute inset-0 w-full h-full object-contain p-8 cursor-zoom-in" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-primary/30"><Sparkles size={56} /></div>
          )}
          {images.length > 0 && (
            <button onClick={() => setZoom(true)} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-muted hover:text-text cursor-pointer" aria-label="Открыть фото">
              <Maximize2 size={15} />
            </button>
          )}
          {images.length > 1 && (
            <>
              <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-text cursor-pointer" aria-label="Предыдущее фото"><ChevronLeft size={18} /></button>
              <button onClick={() => setIdx((i) => (i + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-text cursor-pointer" aria-label="Следующее фото"><ChevronRight size={18} /></button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-primary' : 'w-1.5 bg-white/30'}`} />)}
              </div>
            </>
          )}
          {zoom && <Lightbox images={images} startIndex={idx} alt={product.name} onClose={() => setZoom(false)} />}
        </div>
        <div className="p-8 max-sm:p-5 flex flex-col">
          {product.badge && BADGES[product.badge] && <div className="eyebrow mb-3">{BADGES[product.badge]}</div>}
          <h3 className="font-display text-[34px] leading-tight text-text max-sm:text-[28px] pr-8">{product.name}</h3>
          {product.description && (
            <p className="mt-4 text-[14px] text-muted leading-relaxed whitespace-pre-line">{product.description}</p>
          )}
          <div className="divider-hairline my-6" />
          <PriceTag product={product} size="lg" />
          <div className="mt-6 flex flex-col gap-2.5">
            <button onClick={add} disabled={unavailable} className={`h-12 rounded-full text-[15px] ${inCart ? 'btn-ghost' : 'btn-gold'}`}>
              {unavailable ? 'Нет в наличии' : inCart ? <><Check size={17} /> В корзине — оформить</> : <><ShoppingBag size={17} /> Добавить в корзину</>}
            </button>
            <button onClick={() => { onClose(); askSeller(product.id); }} className="btn-ghost h-11 rounded-full text-[14px]">
              <MessageCircle size={16} /> Связаться с продавцом
            </button>
          </div>
          <p className="mt-5 text-[12px] text-light leading-relaxed">
            После оформления откроется чат с менеджером: он подтвердит наличие и пришлёт реквизиты для предоплаты.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function VariantModal({ product, onClose }: { product: Product; onClose: () => void }) {
  useScrollLock(true);
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[3100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} onClick={(e) => e.stopPropagation()} className="glass-strong rounded-[28px] w-full max-w-md p-7">
        <div className="eyebrow mb-2">Уточните вариант</div>
        <h3 className="font-display text-[28px] leading-tight text-text">{product.name}</h3>
        <p className="text-sm text-muted mt-2 mb-4">Напишите, какой именно вариант нужен: объём, оттенок, аромат линейки.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Например: 100 мл, EDP" className="field resize-none" autoFocus />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost flex-1 h-11 rounded-full text-sm">Отмена</button>
          <button onClick={submit} className="btn-gold flex-1 h-11 rounded-full text-sm"><ShoppingBag size={16} /> В корзину</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
