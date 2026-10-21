import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore, useAuthStore, useNotificationStore, usePromoStore } from './store';
import Header from './components/layout/Header';
import PageLoader from './components/ui/PageLoader';
import Footer from './components/layout/Footer';
import Notification from './components/ui/Notification';
import SupportWidget from './components/support/SupportWidget';
import MascotLayer from './components/mascot/MascotLayer';
import useCategoryAccent from './hooks/useCategoryAccent';
import { scrollPageToTop, glidePageToTop, glideToElement, isScrollLocked } from './hooks/useScrollLock';
import { resyncPushDevice } from './store/pwa';
import { useSupportStore } from './store/support';

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
const SupportChatModal = lazy(() => import('./components/support/SupportChatModal'));
// The main page comes with the first load: it is where most visits start.
// The shop is its own chunk, fetched in the background from the main page.
import HomePage from './components/sections/HomePage';
import { loadCatalogPage } from './components/sections/catalogChunk';
const CatalogPage = lazy(loadCatalogPage);

function PageFallback() {
  return <PageLoader className="min-h-screen pt-[var(--header-h,104px)]" />;
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
      if (isScrollLocked()) return;
      if (samePage && window.scrollY < 4) return;
      e.preventDefault();
      const go = () => {
        if (samePage) return;
        navigate(url.pathname + url.search);
        if (url.hash) setTimeout(() => glideToElement(url.hash), 250);
      };
      if (window.scrollY < 4) go(); else glidePageToTop(go);
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

  // A device with notifications on follows whoever is signed in on it
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => { if (userId) void resyncPushDevice(); }, [userId]);

  // A tapped "ответ на ваш вопрос" notification lands on /?support=12
  const [params, setParams] = useSearchParams();
  const openSupport = useSupportStore((s) => s.open);
  // The seller chat's code arrives with its first opening, then stays
  const supportOpen = useSupportStore((s) => s.isOpen);
  const [supportOpened, setSupportOpened] = useState(false);
  if (supportOpen && !supportOpened) setSupportOpened(true);
  useEffect(() => {
    const tid = Number(params.get('support'));
    if (!tid || !userId) return;
    openSupport({ ticketId: tid });
    params.delete('support');
    setParams(params, { replace: true });
  }, [params, setParams, openSupport, userId]);

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/catalog" element={<Suspense fallback={<PageFallback />}><CatalogPage /></Suspense>} />
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
      {supportOpened && <Suspense fallback={null}><SupportChatModal /></Suspense>}
      <MascotLayer />
    </>
  );
}

export default App;
