import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu, X, ShoppingBag, LogIn, LogOut, UserPen, Package, MessageCircle,
  MessagesSquare, Star, Info, LayoutGrid, Crown, Phone, BadgePercent,
} from 'lucide-react';
import { useAuthStore, useCartStore, useNotificationStore, usePromoStore } from '../../store';
import { useSupportStore } from '../../store/support';
import { fetchOrderChatsUnread } from '../../api/client';
import { getInitials } from '../../utils/format';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [orderUnread, setOrderUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  useScrollLock(menuOpen);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
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
    else { navigate('/'); setTimeout(scroll, 120); }
  }, [location.pathname, navigate]);

  const openChats = () => {
    setMenuOpen(false);
    if (!user) { openAuth('register', 'Чтобы написать продавцу, создайте аккаунт — это займёт полминуты.'); return; }
    openSupport();
  };

  const primary = contacts[0];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-[1000] px-3 sm:px-5 pt-3 pointer-events-none">
        <div className="max-w-[1320px] mx-auto flex items-center gap-3 pointer-events-auto">
          {/* Brand island */}
          <Link
            to="/"
            className={`glass rounded-full flex items-center gap-2.5 pl-1.5 pr-4 h-[54px] max-sm:h-12 shrink-0 transition-all ${scrolled ? 'shadow-[0_10px_40px_rgba(0,0,0,0.55)]' : ''}`}
            aria-label="RefSale — на главную"
          >
            <img src="/logo.svg" alt="" className="w-10 h-10 max-sm:w-9 max-sm:h-9 rounded-full" />
            <div className="leading-none">
              <div className="font-display text-[22px] max-sm:text-[19px] font-semibold tracking-[0.12em] text-gold-gradient">REFSALE</div>
              <div className="text-[9px] tracking-[0.28em] uppercase text-muted mt-1 max-sm:hidden">оригинальная парфюмерия</div>
            </div>
          </Link>

          {/* Nav island (desktop) */}
          <nav className="glass rounded-full h-[54px] px-2 items-center gap-0.5 hidden lg:flex">
            <NavBtn onClick={() => goToSection('#catalog')}>Каталог</NavBtn>
            <NavLink to="/forums">Форум</NavLink>
            <NavBtn onClick={() => goToSection('#reviews')}>Отзывы</NavBtn>
            <NavBtn onClick={() => goToSection('#about')}>О нас</NavBtn>
            <NavLink to="/orders">
              Статусы заказов
              {orderUnread > 0 && <Dot n={orderUnread} />}
            </NavLink>
            {user?.is_leader && <NavLink to="/cabinet"><Crown size={14} className="text-primary" /> Кабинет</NavLink>}
          </nav>

          <div className="flex-1" />

          {/* Contacts island (wide screens): both pairs, phone + messengers */}
          {contacts.length > 0 && (
            <div className="glass rounded-full h-[54px] px-4 items-center gap-4 hidden 2xl:flex">
              {contacts.map((c) => (
                <div key={c.label} className="flex items-center gap-2.5">
                  <div className="leading-tight">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-muted">{c.label}</div>
                    {c.phone ? (
                      <a href={telHref(c.phone)} className="text-[13px] font-semibold text-text hover:text-primary-light whitespace-nowrap">{c.phone}</a>
                    ) : c.email ? (
                      <a href={`mailto:${c.email}`} className="text-[12px] text-text hover:text-primary-light">{c.email}</a>
                    ) : null}
                  </div>
                  <ContactLinks pair={c} compact />
                </div>
              ))}
            </div>
          )}

          {/* Actions island */}
          <div className="glass rounded-full h-[54px] max-sm:h-12 px-1.5 flex items-center gap-1">
            {primary?.phone && (
              <a href={telHref(primary.phone)} className="w-10 h-10 max-sm:w-9 max-sm:h-9 rounded-full flex items-center justify-center text-muted hover:text-primary-light transition-colors 2xl:hidden" aria-label="Позвонить">
                <Phone size={18} />
              </a>
            )}
            {promoCode && (
              <span className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-primary/12 border border-primary/30 text-[12px] font-bold text-primary-light" title="Промокод активен">
                <BadgePercent size={14} /> {promoCode}
              </span>
            )}
            <button
              onClick={openSidebar}
              className="relative w-10 h-10 max-sm:w-9 max-sm:h-9 rounded-full flex items-center justify-center text-text hover:text-primary-light transition-colors cursor-pointer"
              aria-label="Корзина"
            >
              <ShoppingBag size={19} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-ink text-[10px] font-extrabold flex items-center justify-center">{cartCount}</span>
              )}
            </button>
            {user ? (
              <button
                onClick={openProfile}
                className="w-10 h-10 max-sm:w-9 max-sm:h-9 rounded-full bg-gradient-to-br from-primary-light to-primary-dark text-ink text-xs font-extrabold flex items-center justify-center cursor-pointer max-sm:hidden"
                title={user.full_name}
              >
                {getInitials(user.full_name)}
              </button>
            ) : (
              <button
                onClick={() => openAuth('login')}
                className="hidden sm:inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-[13px] font-semibold text-text hover:text-primary-light transition-colors cursor-pointer"
              >
                <LogIn size={16} /> Войти
              </button>
            )}
            <button
              onClick={() => setMenuOpen(true)}
              className="w-10 h-10 max-sm:w-9 max-sm:h-9 rounded-full flex items-center justify-center text-text hover:text-primary-light transition-colors cursor-pointer relative"
              aria-label="Меню"
            >
              <Menu size={21} />
              {orderUnread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />}
            </button>
          </div>
        </div>
      </header>

      {/* Side menu — the "three stripes" */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2400] bg-black/60 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed top-0 right-0 bottom-0 z-[2500] w-[380px] max-w-[92vw] glass-strong flex flex-col"
            >
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <div className="font-display text-2xl tracking-[0.12em] text-gold-gradient">REFSALE</div>
                <button onClick={() => setMenuOpen(false)} className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-text cursor-pointer" aria-label="Закрыть меню">
                  <X size={18} />
                </button>
              </div>

              {user && (
                <div className="mx-6 mb-3 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-light to-primary-dark text-ink text-xs font-extrabold flex items-center justify-center shrink-0">
                    {getInitials(user.full_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text truncate">{user.full_name}</div>
                    <div className="text-[11px] text-muted truncate">{user.email}</div>
                  </div>
                </div>
              )}

              <nav className="flex-1 overflow-y-auto px-3 pb-4">
                <MenuItem icon={<LayoutGrid size={18} />} onClick={() => goToSection('#catalog')}>Каталог</MenuItem>
                <MenuItem icon={<MessagesSquare size={18} />} to="/forums">Форум</MenuItem>
                <MenuItem icon={<MessageCircle size={18} />} onClick={openChats}>Чаты с продавцом</MenuItem>
                <MenuItem icon={<Star size={18} />} onClick={() => goToSection('#reviews')}>Отзывы</MenuItem>
                <MenuItem icon={<Info size={18} />} onClick={() => goToSection('#about')}>О нас</MenuItem>
                <MenuItem icon={<Package size={18} />} to="/orders" badge={orderUnread}>Статусы заказов</MenuItem>
                {user?.is_leader && (
                  <MenuItem icon={<Crown size={18} />} to="/cabinet" accent>Кабинет лидера мнений</MenuItem>
                )}

                <div className="divider-hairline my-4 mx-3" />

                {user ? (
                  <>
                    <MenuItem icon={<UserPen size={18} />} onClick={() => { setMenuOpen(false); openProfile(); }}>Профиль</MenuItem>
                    <MenuItem icon={<LogOut size={18} />} onClick={() => { setMenuOpen(false); logout(); show('Вы вышли из аккаунта'); }} danger>Выйти</MenuItem>
                  </>
                ) : (
                  <div className="px-3 grid grid-cols-2 gap-2">
                    <button onClick={() => { setMenuOpen(false); openAuth('login'); }} className="btn-ghost rounded-xl py-3 text-sm">Войти</button>
                    <button onClick={() => { setMenuOpen(false); openAuth('register'); }} className="btn-gold rounded-xl py-3 text-sm">Регистрация</button>
                  </div>
                )}

                {contacts.length > 0 && (
                  <div className="mt-6 px-3 space-y-5">
                    {contacts.map((c) => <ContactBlock key={c.label} pair={c} />)}
                  </div>
                )}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-10 px-4 rounded-full text-[13px] font-medium text-muted hover:text-text hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap">
      {children}
    </button>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith(to);
  return (
    <Link to={to} className={`relative h-10 px-4 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${active ? 'text-primary-light bg-white/[0.06]' : 'text-muted hover:text-text hover:bg-white/[0.06]'}`}>
      {children}
    </Link>
  );
}

function Dot({ n }: { n: number }) {
  return <span className="min-w-[17px] h-[17px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">{n}</span>;
}

function MenuItem({ icon, children, onClick, to, badge, accent, danger }: {
  icon: React.ReactNode; children: React.ReactNode; onClick?: () => void; to?: string;
  badge?: number; accent?: boolean; danger?: boolean;
}) {
  const cls = `w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-[15px] font-medium transition-colors cursor-pointer text-left ${
    danger ? 'text-danger hover:bg-danger/10' : accent ? 'text-primary-light hover:bg-primary/10' : 'text-text hover:bg-white/[0.05]'
  }`;
  const inner = (
    <>
      <span className={danger ? '' : 'text-primary'}>{icon}</span>
      <span className="flex-1">{children}</span>
      {!!badge && badge > 0 && <Dot n={badge} />}
    </>
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}
