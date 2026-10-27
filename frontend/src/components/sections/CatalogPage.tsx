import { useCallback, useLayoutEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import StoreHero from './StoreHero';
import StoreCatalog from './StoreCatalog';
import CategoryChooser from './CategoryChooser';
import Reviews from './Reviews';
import PromoDock from '../promo/PromoDock';
import { useAppStore } from '../../store';
import usePageMeta from '../../hooks/usePageMeta';

/**
 * The shop at /catalog: the category's first screen, its products and
 * reviews ("О нас" is on the main page). A chunk of its own — the main page
 * does not need any of it to show up, and fetches it in the background once
 * it has (HomePage).
 *
 * The open category lives in the address (/catalog?c=3), so a link, a reload
 * and the back button all land on it. Without one — the catalog opened from
 * the menu — the visitor first picks a category.
 */
export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const categoryParam = Number(params.get('c')) || null;
  const handoff = !!params.get('product');
  const { categories, loading, setActiveCategory } = useAppStore();

  // The address leads; the store follows before the frame is painted.
  useLayoutEffect(() => { setActiveCategory(categoryParam); }, [categoryParam, setActiveCategory]);

  // A link to a category that is gone falls back to the choice.
  const missing = !loading && categories.length > 0 && categoryParam !== null && !categories.some((c) => c.id === categoryParam);
  useLayoutEffect(() => { if (missing) setParams({}, { replace: true }); }, [missing, setParams]);

  const open = useCallback((id: number) => {
    navigate(`/catalog?c=${id}`);
    window.scrollTo(0, 0);
  }, [navigate]);

  const choosing = categoryParam === null && !handoff;
  const category = categories.find((c) => c.id === categoryParam);
  usePageMeta(
    category ? `${category.name} — оригинал дешевле сетевых магазинов | RefSale` : choosing ? 'Каталог RefSale — парфюмерия, уход, продукты, товары из Китая' : null,
    category
      ? (category.intro?.trim() || category.slogan?.trim() || `${category.name}: оригинальная продукция по ценам ниже сетевых магазинов. С промокодом лидера мнений — ещё дешевле.`).slice(0, 200)
      : 'Оригинальная парфюмерия, уходовая косметика, продукты и товары из Китая дешевле сетевых магазинов. Выберите категорию.',
    category ? `/catalog?c=${category.id}` : '/catalog',
  );
  return (
    <main className="relative">
      {choosing ? <CategoryChooser onOpen={open} /> : <><StoreHero /><StoreCatalog /></>}
      <Reviews />
      <PromoDock />
    </main>
  );
}
