import { AnimatePresence, motion } from 'framer-motion';
import { X, ShoppingBag, Minus, Plus, Trash2, BadgePercent, Sparkles } from 'lucide-react';
import { useCartStore, useAuthStore, usePromoStore, priceFor, runAfterAuth } from '../../store';
import { formatPrice } from '../../utils/format';
import useScrollLock from '../../hooks/useScrollLock';
import PromoForm from '../promo/PromoForm';

export default function CartSidebar() {
  const { items, sidebarOpen, closeSidebar, changeQty, removeItem, openCheckout } = useCartStore();
  const { user, openAuth } = useAuthStore();
  const prices = usePromoStore((s) => s.prices);
  useScrollLock(sidebarOpen);

  const baseTotal = items.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);
  const total = items.reduce((s, i) => s + priceFor(i.id, i.price, prices) * i.qty, 0);
  const saved = baseTotal - total;

  const checkout = () => {
    if (!items.length) return;
    if (!user) {
      closeSidebar();
      runAfterAuth(openCheckout);
      openAuth('register', 'Создайте аккаунт, чтобы оформить заказ: в нём будет чат с менеджером и статусы заказа.');
      return;
    }
    openCheckout();
  };

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm" onClick={closeSidebar} />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed top-0 right-0 bottom-0 z-[2100] w-[440px] max-w-full glass-strong flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
              <div className="flex items-center gap-2.5">
                <ShoppingBag size={20} className="text-primary" />
                <span className="font-display text-[28px] leading-none text-text">Корзина</span>
              </div>
              <button onClick={closeSidebar} className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-text cursor-pointer" aria-label="Закрыть корзину">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 max-sm:px-4">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                    <Sparkles size={30} className="text-primary" />
                  </div>
                  <div className="font-display text-[26px] text-text">Корзина пуста</div>
                  <p className="text-sm text-muted mt-2 mb-6 max-w-[240px]">Выберите аромат или средство ухода в каталоге</p>
                  <button onClick={closeSidebar} className="btn-ghost rounded-full px-6 py-3 text-sm">Перейти в каталог</button>
                </div>
              ) : (
                items.map((item) => {
                  const unit = priceFor(item.id, item.price, prices);
                  const discounted = unit < (Number(item.price) || 0);
                  return (
                    <div key={item.id} className="flex gap-3.5 py-4 border-b border-white/[0.06] last:border-b-0">
                      <div className="w-[76px] h-[76px] rounded-2xl bg-white/[0.04] border border-white/[0.07] shrink-0 overflow-hidden flex items-center justify-center">
                        {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-contain p-1.5" /> : <Sparkles size={22} className="text-primary/40" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text leading-snug line-clamp-2">{item.name}</div>
                        {item.variant_comment && <div className="text-[11px] text-muted mt-0.5 truncate">Вариант: {item.variant_comment}</div>}
                        <div className="flex items-baseline gap-2 mt-1">
                          {discounted && <span className="text-[12px] text-light line-through">{formatPrice(item.price)}</span>}
                          <span className={`text-[15px] font-bold ${discounted ? 'text-primary-light' : 'text-text'}`}>{formatPrice(unit)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => changeQty(item.id, -1)} className="w-7 h-7 rounded-full border border-white/12 flex items-center justify-center text-text hover:border-primary/50 cursor-pointer" aria-label="Меньше"><Minus size={13} /></button>
                          <span className="min-w-6 text-center text-sm font-bold">{item.qty}</span>
                          <button onClick={() => changeQty(item.id, 1)} className="w-7 h-7 rounded-full border border-white/12 flex items-center justify-center text-text hover:border-primary/50 cursor-pointer" aria-label="Больше"><Plus size={13} /></button>
                          <button onClick={() => removeItem(item.id)} className="ml-auto w-7 h-7 rounded-full text-muted hover:text-danger hover:bg-danger/10 flex items-center justify-center cursor-pointer" aria-label="Удалить"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <div className="px-6 py-5 border-t border-white/[0.07] space-y-4 max-sm:px-4">
                <PromoForm size="sm" />
                {saved > 0 && (
                  <div className="flex items-center justify-between text-[13px] text-primary-light">
                    <span className="flex items-center gap-1.5"><BadgePercent size={14} /> Скидка по промокоду</span>
                    <span className="font-semibold">−{formatPrice(saved)}</span>
                  </div>
                )}
                <div className="flex items-end justify-between">
                  <span className="text-sm text-muted">Итого</span>
                  <div className="text-right">
                    {saved > 0 && <div className="text-[13px] text-light line-through">{formatPrice(baseTotal)}</div>}
                    <div className="font-display text-[34px] leading-none text-text">{formatPrice(total)}</div>
                  </div>
                </div>
                <button onClick={checkout} className="btn-gold w-full h-12 rounded-full text-[15px]">Оформить заказ</button>
                <p className="text-[11px] text-light text-center leading-relaxed">Оплата после подтверждения менеджером в чате заказа</p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
