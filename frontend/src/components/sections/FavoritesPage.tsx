import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Meerkat from '../mascot/Meerkat';
import { codesForCategory, useAppStore, useFavoritesStore, usePromoStore, type PromoEntry } from '../../store';
import { formatDate } from '../../utils/format';
import { glideToElement } from '../../hooks/useScrollLock';
import PromoForm from '../promo/PromoForm';
import { ProductCard, ProductModals } from './StoreCatalog';
import type { Product } from '../../types';

/** Saved products, grouped by category; each category says which code lowers
 *  its prices and for how long. */
export default function FavoritesPage() {
  const { products, categories, loading } = useAppStore();
  const ids = useFavoritesStore((s) => s.ids);
  const codes = usePromoStore((s) => s.codes);
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
              <div className="flex items-center justify-between gap-x-6 gap-y-3 flex-wrap bg-card border-2 border-ink rounded-[22px] max-sm:rounded-[18px] shadow-[0_4px_0_#111] px-6 py-4 max-sm:px-4">
                <h2 className="font-display text-[clamp(24px,2.4vw,32px)] leading-tight text-ink">
                  {g.name} <span className="text-ink/40 text-[0.7em] tabular-nums">{g.items.length}</span>
                </h2>
                <CategoryPromo codes={codesForCategory(codes, g.id || null, g.items.map((p) => p.id))} />
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
  const codes = usePromoStore((s) => s.codes);
  const code = codes.length > 0;
  const one = codes.length === 1 ? codes[0] : null;
  return (
    <div id="fav-promo" className="mt-10 relative rounded-[28px] max-sm:rounded-[22px] border-2 border-ink accent-card shadow-[0_6px_0_#111] p-8 max-sm:p-5 overflow-hidden">
      <div className="relative z-[1] max-w-[560px]">
        <div className="font-display text-[24px] max-sm:text-[20px] leading-tight text-ink">
          {code ? 'Скидка уже работает' : 'Есть промокод от лидера мнений?'}
        </div>
        <p className="mt-2 text-[15px] font-semibold text-ink/80 leading-snug">
          {one
            ? <>{one.expiresAt ? `Действует до ${formatDate(one.expiresAt)}.` : 'Без ограничения по сроку.'} Цены ниже уже со скидкой.</>
            : code
              ? 'У каждой категории ниже — какой промокод на неё действует и до какого числа.'
              : 'Введите его — цены в избранном и в каталоге станут ниже.'}
        </p>
        <div className="mt-5"><PromoForm variant="pill" /></div>
      </div>
      <Meerkat pose="sunglasses" width={150} decorative className="absolute right-8 -bottom-2 max-md:hidden" />
    </div>
  );
}

const DAY = 86_400_000;

function daysWord(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}

/** The category's code: which, until when and how many days are left — or
 *  that the prices here are the usual ones. */
function CategoryPromo({ codes }: { codes: PromoEntry[] }) {
  // Days are counted from when the page opened
  const [now] = useState(() => Date.now());
  if (!codes.length) {
    return (
      <div className="flex items-center gap-3 flex-wrap text-[13px] font-semibold text-muted">
        Промокода на эту категорию нет — обычные цены
        <button onClick={() => glideToElement('#fav-promo')} className="h-8 px-3 rounded-ctl-xs border-2 border-ink bg-sun text-ink text-[12px] font-bold cursor-pointer">Ввести промокод</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end max-sm:items-start gap-1.5">
      {codes.map((c) => {
        const left = c.expiresAt ? Math.max(0, Math.ceil((new Date(c.expiresAt).getTime() - now) / DAY)) : null;
        const soon = left !== null && left <= 7;
        return (
          <div key={c.code} className="flex items-center gap-2.5 flex-wrap justify-end max-sm:justify-start text-[13px]">
            <span className="px-2.5 py-1 rounded-full bg-primary text-white text-[12px] font-bold tracking-[0.06em]">{c.code}</span>
            <span className="font-semibold text-ink/75">
              {c.expiresAt ? `до ${formatDate(c.expiresAt)}` : 'бессрочно'}
            </span>
            {left !== null && (
              <span className={`px-2 py-0.5 rounded-full border text-[12px] font-bold ${soon ? 'text-[#B4232A] bg-[#FDE2E2] border-[#F2A9AC]' : 'text-[#13723A] bg-[#DDF5E5] border-[#9ED6B0]'}`}>
                {left === 0 ? 'последний день' : `осталось ${left} ${daysWord(left)}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
