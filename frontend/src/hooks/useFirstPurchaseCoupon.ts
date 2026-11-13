import { useEffect } from 'react';
import { useAuthStore, usePromoStore } from '../store';
import { useUiStore } from '../store/ui';
import { fetchFirstPurchaseCoupon, fetchFirstPurchaseOffer } from '../api/client';
import { formatPrice } from '../utils/format';

const SHOWN_KEY = 'refsale-welcome-gift-shown';

/**
 * The welcome gift for a first order. A guest learns its size (a reason to
 * sign up); a signed-in buyer without orders gets their own code, loaded on
 * any page so the cart counts it wherever it is opened. The first time a code
 * arrives, the meerkat hands it over.
 */
export function useFirstPurchaseCoupon(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  const setCoupon = usePromoStore((s) => s.setFirstPurchaseCoupon);
  const setOffer = usePromoStore((s) => s.setFirstPurchaseOffer);
  const showMascot = useUiStore((s) => s.showMascot);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setCoupon(null);
    if (!userId) {
      void fetchFirstPurchaseOffer().then((o) => { if (active) setOffer(o.enabled ? o.discount_amount : 0); });
      return () => { active = false; };
    }
    setOffer(0);
    void fetchFirstPurchaseCoupon().then((result) => {
      if (!active || !result.eligible || !result.code) return;
      const discountAmount = Math.max(0, Number(result.discount_amount) || 0);
      setCoupon({ code: result.code, discountAmount, expiresAt: result.expires_at || null, userId });
      let shown = '';
      try { shown = localStorage.getItem(SHOWN_KEY) || ''; } catch { /* private mode */ }
      if (shown !== result.code) {
        try { localStorage.setItem(SHOWN_KEY, result.code); } catch { /* private mode */ }
        setTimeout(() => showMascot('jump', `Вам подарок: −${formatPrice(discountAmount)} на первую покупку! Применится сам.`), 600);
      }
    });
    return () => { active = false; };
  }, [enabled, userId, setCoupon, setOffer, showMascot]);
}
