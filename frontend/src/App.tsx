import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore, useAuthStore, useNotificationStore, usePromoStore } from './store';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import StoreHero from './components/sections/StoreHero';
import StoreCatalog from './components/sections/StoreCatalog';
import About from './components/sections/About';
import Reviews from './components/sections/Reviews';
import Notification from './components/ui/Notification';
import SupportWidget from './components/support/SupportWidget';
import SupportChatModal from './components/support/SupportChatModal';
import MascotLayer from './components/mascot/MascotLayer';
import PromoDock from './components/promo/PromoDock';
import useCategoryAccent from './hooks/useCategoryAccent';
import { scrollPageToTop, glidePageToTop, glideToElement, isScrollLocked } from './hooks/useScrollLock';

const AuthModal = lazy(() => import('./components/auth/AuthModal'));
const ForgotPassword = lazy(() => import('./components/auth/ForgotPassword'));
const CartSidebar = lazy(() => import('./components/cart/CartSidebar'));
const CheckoutModal = lazy(() => import('./components/order/CheckoutModal'));
const ProfileModal = lazy(() => import('./components/profile/ProfileModal'));
const StoreForum = lazy(() => import('./components/sections/StoreForum'));
const OrdersPage = lazy(() => import('./components/sections/OrdersPage'));
const LeaderCabinet = lazy(() => import('./components/sections/LeaderCabinet'));
const FavoritesPage = lazy(() => import('./components/sections/FavoritesPage'));
const NotFound = lazy(() => import('./components/sections/NotFound'));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

/** Referral links look like refsale.ru/?promo=ANNA — apply the code and tidy the URL. */
function useReferralLink() {
  const [params, setParams] = useSearchParams();
  const apply = usePromoStore((s) => s.apply);
  const show = useNotificationStore((s) => s.show);
  useEffect(() => {
    const code = params.get('promo') || params.get('ref');
    if (!code) return;
    apply(code).then((res) => {
      show(res.ok ? `Промокод ${code.toUpperCase()} применён — цены со скидкой` : (res.error || 'Промокод не найден'), res.ok ? 'success' : 'error');
    });
    params.delete('promo');
    params.delete('ref');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Links move the page smoothly: one to another page glides up first and opens
 * the page once at the top (the way a category switch does), one to a section
 * ("/#catalog") glides to it. Runs in the capture phase, before the router's
 * own handler, which leaves alone a click whose default is already prevented.
 */
function useGlidingLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      // Other sites, files and the admin page are left to the browser
      if (url.origin !== window.location.origin || /\.[a-z0-9]+$/i.test(url.pathname)) return;
      const samePage = url.pathname === window.location.pathname;
      if (samePage && url.hash) {
        if (!document.querySelector(url.hash)) return;
        e.preventDefault();
        glideToElement(url.hash);
        return;
      }
      if (isScrollLocked() || window.scrollY < 4) return;
      e.preventDefault();
      glidePageToTop(() => {
        if (samePage) return;
        navigate(url.pathname + url.search);
        if (url.hash) setTimeout(() => glideToElement(url.hash), 250);
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
}

function App() {
  const loadData = useAppStore((s) => s.loadData);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const revalidatePromo = usePromoStore((s) => s.revalidate);
  const { pathname } = useLocation();
  useReferralLink();
  useCategoryAccent();

  useEffect(() => {
    void loadData();
    void refreshUser();
    void revalidatePromo();
  }, [loadData, refreshUser, revalidatePromo]);

  useEffect(() => { scrollPageToTop(); }, [pathname]);
  useGlidingLinks();

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={
          <main className="relative">
            <StoreHero />
            <StoreCatalog />
            <Reviews />
            <About />
            <PromoDock />
          </main>
        } />
        <Route path="/forums" element={<Suspense fallback={<PageFallback />}><StoreForum /></Suspense>} />
        <Route path="/orders" element={<Suspense fallback={<PageFallback />}><OrdersPage /></Suspense>} />
        <Route path="/cabinet" element={<Suspense fallback={<PageFallback />}><LeaderCabinet /></Suspense>} />
        <Route path="/favorites" element={<Suspense fallback={<PageFallback />}><FavoritesPage /></Suspense>} />
        <Route path="*" element={<Suspense fallback={null}><NotFound /></Suspense>} />
      </Routes>
      <Footer />
      <Suspense fallback={null}>
        <AuthModal />
        <ForgotPassword />
        <CartSidebar />
        <CheckoutModal />
        <ProfileModal />
      </Suspense>
      <Notification />
      <SupportWidget />
      <SupportChatModal />
      <MascotLayer />
    </>
  );
}

export default App;
