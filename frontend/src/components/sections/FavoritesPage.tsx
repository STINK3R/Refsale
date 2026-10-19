import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Percent } from 'lucide-react';
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
    <main className="pt-[120px] max-lg:pt-24 pb-28 max-md:pb-16 min-h-screen">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5">
        <div className="label mb-5">Избранное</div>
        <h1 className="font-display text-[clamp(38px,4.4vw,64px)] leading-[1.02] text-text">Сохранённые товары</h1>

        <PromoStatus />

        {loading ? (
          <div className="py-24 text-center text-muted text-[14px]">Загружаем…</div>
        ) : groups.length === 0 ? (
          <div className="py-24 text-center">
            <Heart size={32} strokeWidth={1.2} className="mx-auto text-light" />
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
    <div className="mt-10 border border-line p-8 max-sm:p-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 items-start max-sm:grid-cols-1">
      <span className="w-12 h-12 rounded-full border border-primary/40 text-primary flex items-center justify-center max-sm:hidden">
        <Percent size={20} strokeWidth={1.5} />
      </span>
      <div>
        <div className="label !text-primary">Скидка</div>
        {code ? (
          <p className="mt-2 text-[16px] text-text">
            Ваш промокод <span className="tracking-[0.1em] text-primary">{code}</span>{' '}
            {expiresAt ? <>действует до {formatDate(expiresAt)}</> : 'действует без ограничения по сроку'} — цены ниже уже со скидкой.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[16px] text-text">Введите промокод, чтобы применить скидку ко всем товарам</p>
            <div className="mt-5 max-w-[440px]"><PromoForm variant="box" /></div>
          </>
        )}
      </div>
    </div>
  );
}
