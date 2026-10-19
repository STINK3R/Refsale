import { priceFor, promoKey } from '../store';
import type { Product, ProductVariant } from '../types';

export interface PriceInfo {
  /** Price without a promo code. */
  base: number;
  /** What the buyer pays now. */
  now: number;
  /** A promo code would make it cheaper. */
  hasPromo: boolean;
  /** Cheapest of several variants — shown as "от …". */
  from: boolean;
  compare1: number | null;
  compare2: number | null;
}

/** Variants that can be bought; all of them when none is in stock. */
export function availableVariants(product: Product): ProductVariant[] {
  const all = product.variants || [];
  const inStock = all.filter((v) => v.is_available !== false);
  return inStock.length ? inStock : all;
}

/** Prices of one variant, or of the cheapest one when none is chosen. */
export function priceInfo(product: Product, variant: ProductVariant | null, prices: Record<string, number>): PriceInfo {
  const ofVariant = (v: ProductVariant, from: boolean): PriceInfo => ({
    base: Number(v.price) || 0,
    now: priceFor(promoKey(product.id, v.id), v.price, prices),
    hasPromo: !!v.has_promo_price,
    from,
    compare1: v.compare_price_1 ?? null,
    compare2: v.compare_price_2 ?? null,
  });
  if (variant) return ofVariant(variant, false);
  const variants = availableVariants(product);
  if (variants.length) {
    const infos = variants.map((v) => ofVariant(v, variants.length > 1));
    const cheapest = infos.reduce((a, b) => (b.now < a.now ? b : a));
    return { ...cheapest, hasPromo: infos.some((i) => i.hasPromo) };
  }
  return {
    base: Number(product.price) || 0,
    now: priceFor(product.id, product.price, prices),
    hasPromo: !!product.has_promo_price,
    from: false,
    compare1: product.compare_price_1 ?? null,
    compare2: product.compare_price_2 ?? null,
  };
}
