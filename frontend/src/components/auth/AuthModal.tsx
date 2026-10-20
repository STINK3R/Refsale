import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthStore, useNotificationStore } from '../../store';
import { loginUser, storeRegister } from '../../api/client';

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * Login and instant registration. No address, no email code and no admin
 * approval — the account works the moment it is created, so a buyer can ask a
 * question or place an order right away.
 */
export default function AuthModal() {
  const { authModalOpen, authTab, authReason, setAuthTab, closeAuth, setUser, openForgotPassword } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!authModalOpen) { setError(''); setPassword(''); } }, [authModalOpen]);

  const switchTab = (t: 'login' | 'register') => { setAuthTab(t); setError(''); };

  // closeAuth() drops the pending "after login" action; hide the modal without it.
  const closeKeepingCallback = () => useAuthStore.setState({ authModalOpen: false, authReason: '' });

  const register = async () => {
    setError('');
    if (!name.trim()) { setError('Укажите имя'); return; }
    if (!emailValid(email.trim())) { setError('Укажите корректный email'); return; }
    if (password.length < 6) { setError('Пароль — минимум 6 символов'); return; }
    setLoading(true);
    const res = await storeRegister({ full_name: name.trim(), email: email.trim(), password, phone: phone.trim() });
    setLoading(false);
    if (res.exists) { switchTab('login'); setError('Этот email уже зарегистрирован — войдите с паролем'); return; }
    if (!res.user) { setError(res.error || 'Не удалось зарегистрироваться'); return; }
    show(`Добро пожаловать, ${res.user.full_name.split(' ')[0]}`);
    closeKeepingCallback();
    setUser(res.user);
  };

  const login = async () => {
    setError('');
    if (!emailValid(email.trim()) || !password) { setError('Введите email и пароль'); return; }
    setLoading(true);
    const res = await loginUser(email.trim(), password);
    setLoading(false);
    if (!res.user) { setError(res.error || 'Не удалось войти'); return; }
    show(`С возвращением, ${res.user.full_name.split(' ')[0]}`);
    closeKeepingCallback();
    setUser(res.user);
  };

  const isReg = authTab === 'register';

  return (
    <Modal open={authModalOpen} onClose={closeAuth}>
      <div className="inline-flex p-1 mb-7 mr-12 rounded-full bg-surface border-2 border-line" role="tablist">
        {(['register', 'login'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={authTab === t}
            onClick={() => switchTab(t)}
            className={`h-9 px-5 rounded-full text-[13px] font-bold cursor-pointer transition-colors ${authTab === t ? 'bg-sun text-ink border-2 border-ink' : 'text-muted hover:text-ink border-2 border-transparent'}`}
          >
            {t === 'register' ? 'Регистрация' : 'Вход'}
          </button>
        ))}
      </div>

      <h2 className="font-display text-[26px] leading-tight text-ink">{isReg ? 'Регистрация за полминуты' : 'С возвращением!'}</h2>
      <p className={`mt-3 text-[14px] leading-relaxed ${authReason ? 'text-primary font-semibold' : 'text-muted'}`}>
        {authReason || (isReg ? 'Имя, почта и пароль — и всё готово. Заказы, чат с менеджером и избранное будут в одном месте.' : 'Почта и пароль, которые вы указали при регистрации.')}
      </p>

      <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void (isReg ? register() : login()); }}>
        {isReg && <Labeled label="Имя"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="field" /></Labeled>}
        <Labeled label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" className="field" /></Labeled>
        {isReg && <Labeled label="Телефон, необязательно"><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+7" className="field" /></Labeled>}
        <Labeled label={isReg ? 'Пароль, от 6 символов' : 'Пароль'}>
          <div className="relative">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPw ? 'text' : 'password'}
              autoComplete={isReg ? 'new-password' : 'current-password'}
              className="field !pr-11"
            />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-text cursor-pointer" aria-label={showPw ? 'Скрыть пароль' : 'Показать пароль'}>
              {showPw ? <EyeOff size={16} strokeWidth={1.4} /> : <Eye size={16} strokeWidth={1.4} />}
            </button>
          </div>
        </Labeled>

        {error && <div className="text-[13px] text-danger pt-1">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary w-full !mt-8">
          {loading ? <Loader2 size={17} className="animate-spin" /> : isReg ? 'Создать аккаунт' : 'Войти'}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between text-[13px]">
        {!isReg ? (
          <button onClick={openForgotPassword} className="text-muted hover:text-text cursor-pointer">Забыли пароль?</button>
        ) : <span />}
        <button onClick={() => switchTab(isReg ? 'login' : 'register')} className="text-ink font-semibold underline underline-offset-4 decoration-2 decoration-sun hover:decoration-ink cursor-pointer">
          {isReg ? 'Уже есть аккаунт' : 'Создать аккаунт'}
        </button>
      </div>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label !text-[10px] block mb-2">{label}</span>
      {children}
    </label>
  );
}
