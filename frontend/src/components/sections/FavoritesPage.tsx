import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
            <Link to="/catalog" className="btn-outline">Перейти в каталог</Link>
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

/**
 * The promo code for the saved items: the same plate as on the main page —
 * the field, or the pink "Промокод … — цены со скидкой" once one works — so
 * the % sign has one look everywhere.
 */
function PromoStatus() {
  const { code, expiresAt } = usePromoStore();
  return (
    <div className="mt-10 relative rounded-[28px] max-sm:rounded-[22px] border-2 border-ink accent-card shadow-[0_6px_0_#111] p-8 max-sm:p-5 overflow-hidden">
      <div className="relative z-[1] max-w-[560px]">
        <div className="font-display text-[24px] max-sm:text-[20px] leading-tight text-ink">
          {code ? 'Скидка уже работает' : 'Есть промокод от блогера?'}
        </div>
        <p className="mt-2 text-[15px] font-semibold text-ink/80 leading-snug">
          {code
            ? <>{expiresAt ? `Действует до ${formatDate(expiresAt)}.` : 'Без ограничения по сроку.'} Цены ниже уже со скидкой.</>
            : 'Введите его — цены в избранном и в каталоге станут ниже.'}
        </p>
        <div className="mt-5"><PromoForm variant="pill" /></div>
      </div>
      <Meerkat pose="sunglasses" width={150} decorative className="absolute right-8 -bottom-2 max-md:hidden" />
    </div>
  );
}
