import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useSearchParams } from 'react-router-dom';
import { useAppStore, useAuthStore, useNotificationStore, usePromoStore } from './store';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import StoreHero from './components/sections/StoreHero';
import StoreCatalog from './components/sections/StoreCatalog';
import About from './components/sections/About';
import Reviews from './components/sections/Reviews';
import PromoBar from './components/promo/PromoBar';
import Notification from './components/ui/Notification';
import SupportWidget from './components/support/SupportWidget';
import SupportChatModal from './components/support/SupportChatModal';

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

function App() {
  const loadData = useAppStore((s) => s.loadData);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const revalidatePromo = usePromoStore((s) => s.revalidate);
  const { pathname } = useLocation();
  useReferralLink();

  useEffect(() => {
    void loadData();
    void refreshUser();
    void revalidatePromo();
  }, [loadData, refreshUser, revalidatePromo]);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={
          <main className="relative">
            <StoreHero />
            <StoreCatalog />
            <About />
            <Reviews />
            <PromoBar />
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
    </>
  );
}

export default App;
