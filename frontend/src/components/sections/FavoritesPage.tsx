import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Percent } from 'lucide-react';
import Meerkat from '../mascot/Meerkat';

import { useAppStore, useFavoritesStore, usePromoStore } from '../../store';
import { formatDate } from '../../utils/format';
import PromoForm from '../promo/PromoForm';
import { ProductCard, ProductModals } from './StoreCatalog';
import type { Product } from '../../types';

/** Saved products, grouped by category, with the promo code's state on top. */
export default function FavoritesPage() {
  const { products, categories, loading } = useAppStore();
  const ids = useFavoritesStore((s) => s.ids);
  const [selected, setSelected] = useState<Product | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);

  const groups = useMemo(() => {
    const saved = products.filter((p) => ids.includes(p.id));
    const byCategory = categories
      .map((c) => ({ id: c.id, name: c.name, items: saved.filter((p) => p.category_id === c.id) }))
      .filter((g) => g.items.length);
    const rest = saved.filter((p) => !categories.some((c) => c.id === p.category_id));
    if (rest.length) byCategory.push({ id: 0, name: 'Другое', items: rest });
    return byCategory;
  }, [products, categories, ids]);

  return (
    <main className="pt-[calc(var(--header-h,104px)+28px)] pb-28 max-md:pb-16 min-h-screen">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5">
        <div className="label mb-5">Избранное</div>
        <h1 className="font-display text-[clamp(38px,4.4vw,64px)] leading-[1.02] text-text">Сохранённые товары</h1>

        <PromoStatus />

        {loading ? (
          <div className="py-24 text-center text-muted text-[14px]">Загружаем…</div>
        ) : groups.length === 0 ? (
          <div className="py-24 text-center">
            <Meerkat pose="heart" width={150} decorative className="mx-auto" />
            <div className="font-display text-[28px] text-text mt-6">Здесь пока пусто</div>
            <p className="text-[14px] text-muted mt-3 mb-8">Нажмите на сердечко у товара, чтобы сохранить его</p>
            <Link to="/" className="btn-outline">Перейти в каталог</Link>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.id} className="mt-16 max-md:mt-12">
              <div className="flex items-baseline justify-between gap-6 pb-5 border-b border-line">
                <h2 className="font-display text-[clamp(26px,2.6vw,36px)] text-text">{g.name}</h2>
                <span className="text-[12px] text-muted tabular-nums">{g.items.length}</span>
              </div>
              <div className="mt-10 grid grid-cols-4 gap-x-6 gap-y-14 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-10">
                {g.items.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} onOpen={() => setSelected(p)} onNeedVariant={() => setVariantFor(p)} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <ProductModals selected={selected} setSelected={setSelected} variantFor={variantFor} setVariantFor={setVariantFor} />
    </main>
  );
}

/** "Скидка: ваш промокод действует до …", or the field to enter one. */
function PromoStatus() {
  const { code, expiresAt } = usePromoStore();
  return (
    <div className="mt-10 rounded-[28px] border-2 border-ink bg-sun shadow-[0_6px_0_#111] p-8 max-sm:p-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 items-start max-sm:grid-cols-1">
      <span className="w-14 h-14 rounded-full bg-primary text-white border-2 border-ink flex items-center justify-center max-sm:hidden">
        <Percent size={24} strokeWidth={2.4} />
      </span>
      <div>
        <div className="font-display text-[22px] text-ink">Скидка</div>
        {code ? (
          <p className="mt-2 text-[16px] font-semibold text-ink">
            Ваш промокод <span className="px-2 py-0.5 rounded-full bg-primary text-white tracking-[0.06em]">{code}</span>{' '}
            {expiresAt ? <>действует до {formatDate(expiresAt)}</> : 'действует без ограничения по сроку'} — цены ниже уже со скидкой.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[16px] font-semibold text-ink">Введите промокод, чтобы применить скидку ко всем товарам</p>
            <div className="mt-5 max-w-[520px]"><PromoForm variant="pill" /></div>
          </>
        )}
      </div>
    </div>
  );
}
