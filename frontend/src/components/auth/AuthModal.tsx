import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, User, Phone, Info } from 'lucide-react';
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
    show(`Добро пожаловать, ${res.user.full_name.split(' ')[0]}!`);
    closeAuthKeepingCallback();
    setUser(res.user);
  };

  const login = async () => {
    setError('');
    if (!emailValid(email.trim()) || !password) { setError('Введите email и пароль'); return; }
    setLoading(true);
    const res = await loginUser(email.trim(), password);
    setLoading(false);
    if (!res.user) { setError(res.error || 'Не удалось войти'); return; }
    show(`С возвращением, ${res.user.full_name.split(' ')[0]}!`);
    closeAuthKeepingCallback();
    setUser(res.user);
  };

  // closeAuth() drops the pending "after login" action; hide the modal without it.
  const closeAuthKeepingCallback = () => useAuthStore.setState({ authModalOpen: false, authReason: '' });

  const isReg = authTab === 'register';

  return (
    <Modal open={authModalOpen} onClose={closeAuth}>
      <div className="flex gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.07] mb-5 mr-8">
        {(['register', 'login'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`flex-1 h-9 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${authTab === t ? 'bg-gradient-to-br from-primary-light to-primary-dark text-ink' : 'text-muted hover:text-text'}`}
          >
            {t === 'register' ? 'Регистрация' : 'Вход'}
          </button>
        ))}
      </div>

      <h2 className="font-display text-[32px] leading-none text-text">{isReg ? 'Создать аккаунт' : 'Войти'}</h2>
      {authReason ? (
        <p className="mt-3 text-[13px] text-primary-light/90 flex gap-2 leading-relaxed"><Info size={15} className="shrink-0 mt-0.5" /> {authReason}</p>
      ) : (
        <p className="mt-2 text-[13px] text-muted">{isReg ? 'Аккаунт активируется сразу — без ожидания одобрения.' : 'Email и пароль, указанные при регистрации.'}</p>
      )}

      <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); void (isReg ? register() : login()); }}>
        {isReg && (
          <Field icon={<User size={16} />}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" autoComplete="name" className="field !pl-11" />
          </Field>
        )}
        <Field icon={<Mail size={16} />}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" inputMode="email" autoComplete="email" className="field !pl-11" />
        </Field>
        {isReg && (
          <Field icon={<Phone size={16} />}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон (необязательно)" type="tel" autoComplete="tel" className="field !pl-11" />
          </Field>
        )}
        <Field icon={<Lock size={16} />}>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isReg ? 'Придумайте пароль (от 6 символов)' : 'Пароль'}
            type={showPw ? 'text' : 'password'}
            autoComplete={isReg ? 'new-password' : 'current-password'}
            className="field !pl-11 !pr-11"
          />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-text cursor-pointer" aria-label={showPw ? 'Скрыть пароль' : 'Показать пароль'}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </Field>

        {error && <div className="text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-xl px-4 py-2.5">{error}</div>}

        <button type="submit" disabled={loading} className="btn-gold w-full h-12 rounded-full text-[15px] !mt-5">
          {loading ? <Loader2 size={18} className="animate-spin" /> : isReg ? 'Создать аккаунт' : 'Войти'}
        </button>
      </form>

      {!isReg && (
        <div className="text-center mt-4">
          <button onClick={openForgotPassword} className="text-[13px] text-primary hover:underline cursor-pointer">Забыли пароль?</button>
        </div>
      )}
      <p className="text-center text-[13px] text-muted mt-4">
        {isReg ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
        <button onClick={() => switchTab(isReg ? 'login' : 'register')} className="text-primary font-semibold hover:underline cursor-pointer">
          {isReg ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </p>
    </Modal>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-[1]">{icon}</span>
      {children}
    </div>
  );
}
