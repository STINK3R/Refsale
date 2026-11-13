import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Box, ChevronRight, Headset, LayoutGrid, LoaderCircle, LogOut, MessageCircle, Package, Shield, Store, UsersRound } from 'lucide-react';
import { adminLogin, adminRequest, adminSession, clearAdminSession } from '../../api/adminClient';
import AdminStore from './AdminStore';
import AdminCatalog from './AdminCatalog';
import AdminSupport from './AdminSupport';
import AdminForums from './AdminForums';

type Section = 'store' | 'catalog' | 'support' | 'forums';
export type AdminNotice = (message: string, type?: 'success' | 'error') => void;
const plate = 'bg-card border-2 border-ink rounded-[22px] shadow-[0_5px_0_#111]';

export default function AdminApp() {
  const [session, setSession] = useState(() => adminSession());
  const [checking, setChecking] = useState(Boolean(adminSession()?.token));
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [badges, setBadges] = useState({ orders: 0, suppliers: 0, support: 0 });
  const [coopEnabled, setCoopEnabled] = useState(false);
  const [coopBusy, setCoopBusy] = useState(false);

  const notify: AdminNotice = useCallback((text, type = 'success') => {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 3600);
  }, []);

  const verify = useCallback(async () => {
    if (!adminSession()?.token) { setChecking(false); return; }
    try {
      await adminRequest('/api/admin/data');
      setSession(adminSession());
    } catch {
      clearAdminSession(); setSession(null);
    } finally { setChecking(false); }
  }, []);

  useEffect(() => { void verify(); }, [verify]);
  useEffect(() => { setActiveTab(0); }, [section]);
  useEffect(() => {
    const expired = () => { setSession(null); setSection(null); setLoginError('Сессия завершилась. Войдите снова.'); };
    window.addEventListener('refsale:admin-expired', expired);
    return () => window.removeEventListener('refsale:admin-expired', expired);
  }, []);

  const refreshBadges = useCallback(async () => {
    try {
      const [orders, products, tickets] = await Promise.all([
        adminRequest<{ pending_count: number }>('/api/admin/store/orders/unread-count'),
        adminRequest<Array<Record<string, unknown>>>('/api/admin/store/supplier-products?status=pending'),
        adminRequest<Array<Record<string, unknown>>>('/api/admin/support/tickets'),
      ]);
      setBadges({
        orders: Number(orders.pending_count || 0),
        suppliers: products.length,
        support: tickets.filter((t) => Boolean(t.admin_unread)).length,
      });
    } catch { /* access token may have expired; the API client handles it */ }
  }, []);

  useEffect(() => {
    if (!session) return;
    const load = async () => {
      try {
        const settings = await adminRequest<Record<string, string>>('/api/settings');
        setCoopEnabled(settings.kokonkoop_enabled === 'true');
      } catch { /* the chooser remains usable if public settings are offline */ }
      await refreshBadges();
    };
    void load();
    // Background tabs do not poll; returning to the tab refreshes at once.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshBadges(); }, 25000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshBadges(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [session, refreshBadges]);

  // Recheck when returning from an order/support screen so a reply clears its
  // red badge immediately instead of waiting for the background poll.
  useEffect(() => {
    if (session) void refreshBadges();
  }, [section, session, refreshBadges]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setLoginError('');
    try {
      const result = await adminLogin(login.trim(), password);
      setSession(adminSession()); setPassword('');
      await adminRequest('/api/admin/data');
      notify(`Добро пожаловать, ${String(result.admin.display_name || result.admin.username || 'администратор')}`);
    } catch (error) { setLoginError((error as Error).message || 'Не удалось войти'); }
    setBusy(false);
  };

  const logout = () => { clearAdminSession(); setSession(null); setSection(null); setLogin(''); setPassword(''); };
  const toggleCoop = async () => {
    setCoopBusy(true);
    try {
      const next = !coopEnabled;
      await adminRequest('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ kokonkoop_enabled: String(next) }) });
      setCoopEnabled(next); notify(next ? 'Кооператив открыт' : 'Кооператив закрыт');
    } catch (error) { notify((error as Error).message, 'error'); }
    setCoopBusy(false);
  };

  if (checking) return <div className="min-h-screen bg-bg grid place-items-center"><LoaderCircle className="animate-spin text-primary" size={30} /></div>;
  if (!session?.token) return (
    <main className="min-h-screen bg-bg px-4 py-12 grid place-items-center">
      <form onSubmit={submit} className={`${plate} w-full max-w-[440px] p-7 sm:p-9`}>
        <div className="w-14 h-14 rounded-[18px] bg-sun border-2 border-ink grid place-items-center mb-6"><Shield size={26} /></div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted font-bold">RefSale · защищённая зона</div>
        <h1 className="font-display text-[27px] leading-tight mt-2 mb-7">Вход в админку</h1>
        <label className="block text-[12px] font-bold mb-2">Логин<input autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className="field mt-1.5" required /></label>
        <label className="block text-[12px] font-bold mt-4 mb-2">Пароль<input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1.5" required /></label>
        {loginError && <div role="alert" className="mt-4 rounded-ctl-sm bg-[#FDE2E2] border border-[#F2A9AC] px-3 py-2 text-[12px] text-[#B4232A]">{loginError}</div>}
        <button disabled={busy} className="btn-primary w-full h-12 mt-6">{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Shield size={17} />} Войти</button>
        <a href="/" className="mt-5 flex justify-center text-[12px] text-muted hover:text-ink">На сайт RefSale</a>
      </form>
    </main>
  );

  const tabs: Record<Section, { title: string; icon: typeof Store; tabs: string[] }> = {
    store: { title: 'Магазин RefSale', icon: Store, tabs: ['Заказы', 'Промокоды', 'Лидеры мнений', 'Цены', 'Настройки сайта'] },
    catalog: { title: 'Каталог', icon: Box, tabs: ['Товары', 'От поставщиков', 'Категории', 'Покупатели', 'Отзывы', 'Администраторы'] },
    support: { title: 'Поддержка', icon: Headset, tabs: ['Обращения', 'Чаты участников'] },
    forums: { title: 'Форумы', icon: MessageCircle, tabs: ['Модерация'] },
  };
  const selected = section ? tabs[section] : null;
  const Icon = selected?.icon || LayoutGrid;
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 bg-sun border-b-2 border-ink">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-7 h-[68px] flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-2 font-display font-extrabold tracking-wide"><img src="/img/logo-meerkat.webp" alt="" className="w-auto h-9" /><span className={section ? 'max-sm:hidden' : ''}>REFSALE</span> <span className="hidden sm:inline text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-ink/55">админка</span></div>
          {section && <><ChevronRight size={16} className="shrink-0 text-ink/40 max-sm:hidden" /><div className="flex min-w-0 items-center gap-2 text-[13px] font-bold"><Icon size={16} className="shrink-0" /><span className="truncate">{selected?.title}</span></div></>}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {section && <button onClick={() => setSection(null)} className="admin-top-btn" aria-label="Разделы" title="Разделы"><ArrowLeft size={15} /><span className="hidden sm:inline">Разделы</span></button>}
            <a href="/" className="admin-top-btn" aria-label="Открыть сайт RefSale" title="Открыть сайт RefSale"><ArrowUpRight size={15} /><span className="hidden sm:inline">На сайт</span></a>
            <button onClick={logout} className="admin-top-btn" title="Выйти" aria-label="Выйти из админки"><LogOut size={15} /><span className="hidden sm:inline">Выйти</span></button>
          </div>
        </div>
        {section && <nav className="max-w-[1480px] mx-auto px-4 sm:px-7 pb-3 flex gap-2 overflow-x-auto" aria-label={`${selected?.title}: разделы`}>
          {selected?.tabs.map((label, i) => <button key={label} onClick={() => { setActiveTab(i); window.dispatchEvent(new CustomEvent('refsale:admin-tab', { detail: i })); }} className={`admin-tab ${activeTab === i ? 'admin-tab-active' : ''}`}>{label}{section === 'catalog' && i === 1 && badges.suppliers > 0 && <Badge>{badges.suppliers}</Badge>}{section === 'store' && i === 0 && badges.orders > 0 && <Badge>{badges.orders}</Badge>}{section === 'support' && i === 0 && badges.support > 0 && <Badge>{badges.support}</Badge>}</button>)}
        </nav>}
      </header>

      <main className="max-w-[1480px] mx-auto px-4 sm:px-7 py-7 sm:py-10">
        {!section ? <>
          <div className="mb-7"><div className="text-[11px] uppercase tracking-[0.14em] text-muted font-bold">Панель управления</div><h1 className="font-display text-[32px] mt-2">Разделы проекта</h1><p className="text-[13px] text-muted mt-2">Управляйте магазином, каталогом, обращениями и модерацией.</p></div>
          <div className="grid grid-cols-2 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4">
            <SectionCard icon={<Store />} title="Магазин RefSale" description="Заказы, чаты, промокоды, лидеры мнений и настройки сайта" badge={badges.orders} onClick={() => setSection('store')} featured />
            <SectionCard icon={<Package />} title="Каталог" description="Товары площадки, модерация поставщиков, категории и покупатели" badge={badges.suppliers} onClick={() => setSection('catalog')} />
            <SectionCard icon={<Headset />} title="Поддержка" description="Вопросы покупателей и личные чаты поставщиков и лидеров мнений" badge={badges.support} onClick={() => setSection('support')} />
            <SectionCard icon={<MessageCircle />} title="Форумы" description="Темы и сообщения участников" onClick={() => setSection('forums')} />
          </div>
          <section className={`${plate} mt-7 p-5 sm:p-6 flex items-center gap-4 flex-wrap`}>
            <div className="w-12 h-12 rounded-[15px] bg-[#DCEBFF] border-2 border-ink grid place-items-center text-[#1B5BB0]"><UsersRound size={22} /></div>
            <div className="flex-1 min-w-[220px]"><div className="font-bold">Кооператив Кокон · /kokonkoop</div><p className="text-[12px] text-muted mt-1">Отдельная React-админка кооператива. Доступ использует текущую сессию RefSale.</p><a href="/kokonkoop/admin" className="inline-flex items-center gap-1 text-[12px] text-[#1B5BB0] font-bold mt-2">Открыть админку <ArrowUpRight size={13} /></a></div>
            <label className="flex items-center gap-3 cursor-pointer rounded-full border-2 border-ink px-4 py-2 bg-surface">
              <span className="text-[12px] font-bold">Раздел открыт</span><input type="checkbox" checked={coopEnabled} disabled={coopBusy} onChange={() => void toggleCoop()} className="w-5 h-5 accent-primary" />
            </label>
          </section>
        </> : section === 'store' ? <AdminStore notify={notify} />
          : section === 'catalog' ? <AdminCatalog notify={notify} />
            : section === 'support' ? <AdminSupport notify={notify} />
              : <AdminForums notify={notify} />}
      </main>
      {notice && <div role="status" className={`fixed z-[80] bottom-5 right-5 max-w-[min(92vw,440px)] rounded-[16px] border-2 border-ink shadow-[0_4px_0_#111] px-4 py-3 text-[13px] font-bold ${notice.type === 'error' ? 'bg-[#FDE2E2] text-[#8F1D24]' : 'bg-sun text-ink'}`}>{notice.text}</div>}
    </div>
  );
}

function SectionCard({ icon, title, description, badge, onClick, featured = false }: { icon: React.ReactNode; title: string; description: string; badge?: number; onClick: () => void; featured?: boolean }) {
  return <button onClick={onClick} className={`relative text-left ${plate} p-6 min-h-[170px] hover:-translate-y-0.5 transition-transform cursor-pointer ${featured ? 'bg-sun' : 'bg-card'} ${badge ? 'ring-2 ring-danger/30' : ''}`}>
    {!!badge && <Badge className="absolute right-4 top-4 min-w-8 h-8 text-[13px] shadow-[0_2px_0_#111]" title={`${badge} требуют внимания`}>
      {badge}
    </Badge>}
    <div className="w-12 h-12 grid place-items-center rounded-[15px] border-2 border-ink bg-card mb-4">{icon}</div>
    <div className="font-display text-[18px]">{title}</div><p className="text-[12px] text-muted mt-2 max-w-[480px]">{description}</p>
  </button>;
}

function Badge({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) { return <span title={title} className={`inline-grid place-items-center min-w-6 h-6 px-1 rounded-full bg-danger text-white text-[11px] font-bold ${className}`}>{children}</span>; }
