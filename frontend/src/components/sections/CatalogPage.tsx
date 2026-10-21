import StoreHero from './StoreHero';
import StoreCatalog from './StoreCatalog';
import Reviews from './Reviews';
import PromoDock from '../promo/PromoDock';

/**
 * The shop at /catalog: the category's first screen, its products and
 * reviews ("О нас" is on the main page). A chunk of its own — the main page
 * does not need any of it to show up, and fetches it in the background once
 * it has (HomePage).
 */
export default function CatalogPage() {
  return (
    <main className="relative">
      <StoreHero />
      <StoreCatalog />
      <Reviews />
      <PromoDock />
    </main>
  );
}
