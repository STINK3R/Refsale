import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ShoppingBag, User, Package, Heart } from 'lucide-react';
import { useAppStore, useAuthStore, useCartStore, useFavoritesStore, useNotificationStore, usePromoStore } from '../../store';
import { useSupportStore } from '../../store/support';
import { fetchOrderChatsUnread } from '../../api/client';
import { useContacts, ContactBlock, ContactLinks, telHref } from '../ui/Contacts';
import useScrollLock from '../../hooks/useScrollLock';


export default function Header() {
  const { user, openAuth, openProfile, logout } = useAuthStore();
  const { openSidebar, totalItems } = useCartStore();
  const cartCount = totalItems();
  const promoCode = usePromoStore((s) => s.code);
  const openSupport = useSupportStore((s) => s.open);
  const show = useNotificationStore((s) => s.show);
  const contacts = useContacts();
  const favCount = useFavoritesStore((s) => s.ids.length);
  const { categories, activeCategoryId, setActiveCategory } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [orderUnread, setOrderUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  useScrollLock(menuOpen);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!user?.id) { setOrderUnread(0); return; }
    const check = () => { fetchOrderChatsUnread(user.id).then(setOrderUnread).catch(() => {}); };
    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const goToSection = useCallback((hash: string) => {
    setMenuOpen(false);
    const scroll = () => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
    if (location.pathname === '/') scroll();
    else { navigate('/'); setTimeout(scroll, 150); }
  }, [location.pathname, navigate]);

  const openChats = () => {
    setMenuOpen(false);
    if (!user) { openAuth('register', 'Чтобы написать продавцу, создайте аккаунт — это полминуты.'); return; }
    openSupport();
  };

  const pickCategory = (id: number) => {
    setActiveCategory(id);
    if (!isHome) navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const solid = scrolled || !isHome;

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-[1000]">
        {/* Utility bar: both contact pairs, as the brief asks */}
        <div className="hidden lg:block bg-black border-b border-line">
          <div className="max-w-[1440px] mx-auto px-8 h-9 flex items-center justify-between text-[12px] text-muted">
            <span className="tracking-[0.04em]">Только оригинальная продукция · Доставка по России</span>
            <div className="flex items-center gap-8">
              {contacts.map((c) => (
                <div key={c.label} className="flex items-center gap-3">
                  <span className="label !text-[10px] !text-light">{c.label}</span>
                  {c.phone && <a href={telHref(c.phone)} className="text-text hover:text-white transition-colors">{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="hover:text-text transition-colors">{c.email}</a>}
                  <ContactLinks pair={c} size={13} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main bar */}
        <div className={`transition-colors duration-500 ${solid ? 'bar-blur border-b border-line' : 'bg-transparent border-b border-transparent'}`}>
          <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4 h-[68px] max-lg:h-16 grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="flex items-center gap-8">
              <button onClick={() => setMenuOpen(true)} className="group flex items-center gap-3 cursor-pointer" aria-label="Открыть меню">
                <span className="flex flex-col gap-[5px] w-6">
                  <span className="h-px w-6 bg-text" />
                  <span className="h-px w-4 bg-text transition-all duration-300 group-hover:w-6" />
                </span>
                <span className="label !text-text max-md:hidden">Меню</span>
              </button>
              <nav className="hidden xl:flex items-center gap-7">
                <NavItem onClick={() => goToSection('#catalog')}>Каталог</NavItem>
                <NavItem to="/forums">Форум</NavItem>
                <NavItem onClick={() => goToSection('#reviews')}>Отзывы</NavItem>
                <NavItem onClick={() => goToSection('#about')}>О нас</NavItem>
              </nav>
            </div>

            <Link to="/" className="font-display text-[26px] max-sm:text-[21px] tracking-[0.32em] uppercase text-text pl-[0.32em] leading-none" aria-label="RefSale — на главную">
              RefSale
            </Link>

            <div className="flex items-center justify-end gap-6 max-sm:gap-4">
              {promoCode && (
                <span className="hidden md:inline label !text-primary" title="Промокод активен — цены со скидкой">
                  Промокод · {promoCode}
                </span>
              )}
              <Link to="/favorites" className="relative text-text hover:text-white transition-colors max-sm:hidden" aria-label="Избранное" title="Избранное">
                <Heart size={19} strokeWidth={1.4} />
                {favCount > 0 && <span className="absolute -top-1.5 -right-2 text-[10px] tabular-nums text-primary">{favCount}</span>}
              </Link>
              <Link to="/orders" className="relative text-text hover:text-white transition-colors max-sm:hidden" aria-label="Сообщения и заказы" title="Сообщения и заказы">
                <Package size={19} strokeWidth={1.4} />
                {orderUnread > 0 && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-primary" />}
              </Link>
              <button
                onClick={() => (user ? openProfile() : openAuth('login'))}
                className="text-text hover:text-white transition-colors cursor-pointer"
                aria-label={user ? 'Профиль' : 'Войти'}
                title={user ? user.full_name : 'Войти'}
              >
                <User size={19} strokeWidth={1.4} />
              </button>
              <button onClick={openSidebar} className="relative flex items-center gap-2 text-text hover:text-white transition-colors cursor-pointer" aria-label="Корзина">
                <ShoppingBag size={19} strokeWidth={1.4} />
                <span className="text-[12px] tabular-nums min-w-[1ch]">{cartCount > 0 ? cartCount : ''}</span>
              </button>
            </div>
          </div>

          {/* Category pages: each switches the hero, products and reviews */}
          {isHome && categories.length > 1 && (
            <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4 pb-3 -mt-1 flex justify-center gap-8 max-sm:gap-5 overflow-x-auto scrollbar-hide">
              {categories.map((c) => {
                const active = c.id === activeCategoryId;
                return (
                  <button
                    key={c.id}
                    onClick={() => pickCategory(c.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative shrink-0 pb-1.5 text-[13px] max-sm:text-[12px] uppercase tracking-[0.14em] whitespace-nowrap cursor-pointer transition-colors ${active ? 'text-text' : 'text-muted hover:text-text'}`}
                  >
                    {c.name}
                    <span className={`absolute left-0 right-0 bottom-0 h-px bg-primary transition-transform duration-500 origin-left ${active ? 'scale-x-100' : 'scale-x-0'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Side menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
              className="fixed inset-0 z-[2400] bg-black/70"
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-0 left-0 bottom-0 z-[2500] w-[440px] max-w-[92vw] bg-bg border-r border-line flex flex-col"
            >
              <div className="flex items-center justify-between px-8 max-sm:px-6 h-[68px] border-b border-line shrink-0">
                <span className="label">Меню</span>
                <button onClick={() => setMenuOpen(false)} className="text-muted hover:text-text cursor-pointer" aria-label="Закрыть меню">
                  <X size={20} strokeWidth={1.4} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 max-sm:px-6 py-8">
                <nav className="flex flex-col">
                  <MenuItem n="01" onClick={() => goToSection('#catalog')}>Каталог</MenuItem>
                  <MenuItem n="02" to="/orders" badge={orderUnread > 0}>Сообщения и заказы</MenuItem>
                  <MenuItem n="03" to="/favorites">Избранное{favCount > 0 && <sup className="ml-1.5 text-[13px] text-primary">{favCount}</sup>}</MenuItem>
                  <MenuItem n="04" to="/forums">Форум</MenuItem>
                  <MenuItem n="05" onClick={() => goToSection('#reviews')}>Отзывы</MenuItem>
                  <MenuItem n="06" onClick={() => goToSection('#about')}>О нас</MenuItem>
                  <MenuItem n="07" onClick={openChats}>Вопрос продавцу</MenuItem>
                  {user?.is_leader && <MenuItem n="08" to="/cabinet">Кабинет лидера мнений</MenuItem>}
                </nav>

                <div className="mt-10 flex flex-col gap-3">
                  {user ? (
                    <>
                      <div className="text-[13px] text-muted">Вы вошли как <span className="text-text">{user.full_name}</span></div>
                      <div className="flex gap-3">
                        <button onClick={() => { setMenuOpen(false); openProfile(); }} className="btn-outline btn-sm flex-1">Профиль</button>
                        <button onClick={() => { setMenuOpen(false); logout(); show('Вы вышли из аккаунта'); }} className="btn-outline btn-sm flex-1">Выйти</button>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => { setMenuOpen(false); openAuth('login'); }} className="btn-outline btn-sm flex-1">Войти</button>
                      <button onClick={() => { setMenuOpen(false); openAuth('register'); }} className="btn-primary btn-sm flex-1">Регистрация</button>
                    </div>
                  )}
                </div>

                {contacts.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-line grid gap-8">
                    {contacts.map((c) => <ContactBlock key={c.label} pair={c} />)}
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavItem({ to, onClick, children }: { to?: string; onClick?: () => void; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = !!to && pathname.startsWith(to);
  const cls = `label !text-[11px] transition-colors cursor-pointer ${active ? '!text-text' : '!text-muted hover:!text-text'}`;
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return <button onClick={onClick} className={cls}>{children}</button>;
}

function MenuItem({ n, to, onClick, children, badge }: { n: string; to?: string; onClick?: () => void; children: React.ReactNode; badge?: boolean }) {
  const inner = (
    <>
      <span className="text-[11px] text-light tabular-nums w-7 pt-3">{n}</span>
      <span className="font-display text-[30px] max-sm:text-[26px] leading-[1.25] text-text group-hover:translate-x-1.5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">{children}</span>
      {badge && <span className="ml-2 mt-4 w-1.5 h-1.5 rounded-full bg-primary" />}
    </>
  );
  const cls = 'group flex items-start py-2.5 border-b border-line/60 text-left cursor-pointer';
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}
