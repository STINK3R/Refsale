import { useState, useEffect } from 'react';
import { Mail, Loader2, ArrowLeft, Lock, CheckCircle2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthStore } from '../../store';
import { forgotPassword, resetPassword } from '../../api/client';

export default function ForgotPassword() {
  const { forgotPasswordOpen, closeForgotPassword, openAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Token-based reset form state
  const [resetToken, setResetToken] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [resetDone, setResetDone] = useState(false);

  // Check URL for reset_token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      setResetToken(token);
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('reset_token');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Введите email'); return; }
    setError('');
    setLoading(true);
    const result = await forgotPassword(email.trim());
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    setSuccess('Если такой email зарегистрирован, мы отправили на него ссылку для сброса пароля.');
  };

  const handleResetPassword = async () => {
    if (!newPass || newPass.length < 6) { setError('Пароль минимум 6 символов'); return; }
    if (newPass !== newPass2) { setError('Пароли не совпадают'); return; }
    setError('');
    setLoading(true);
    const result = await resetPassword(resetToken, newPass);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    setResetDone(true);
  };

  // Reset token form — shown when user arrives via email link
  if (resetToken) {
    return (
      <Modal
        open={true}
        onClose={() => setResetToken('')}
        title="Новый пароль"
        subtitle="Введите новый пароль для вашего аккаунта"
      >
        {error && <div className="text-[13px] text-danger mb-4">{error}</div>}
        {resetDone ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} className="text-primary" />
            </div>
            <p className="text-sm text-primary font-semibold mb-2">Пароль успешно изменён!</p>
            <p className="text-xs text-muted mb-6">Теперь вы можете войти с новым паролем</p>
            <button
              onClick={() => { setResetToken(''); setResetDone(false); openAuth('login'); }}
              className="btn-outline mx-auto"
            >
              <ArrowLeft size={16} /> Войти
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-[13px] font-semibold text-text mb-1.5">Новый пароль</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="field !pl-10"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-[13px] font-semibold text-text mb-1.5">Повторите пароль</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  value={newPass2}
                  onChange={e => setNewPass2(e.target.value)}
                  placeholder="Повторите новый пароль"
                  className="field !pl-10"
                  onKeyDown={e => { if (e.key === 'Enter') handleResetPassword(); }}
                />
              </div>
            </div>
            <button
              onClick={handleResetPassword}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
              {loading ? 'Сохраняем...' : 'Сохранить пароль'}
            </button>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open={forgotPasswordOpen}
      onClose={closeForgotPassword}
      title="Восстановление пароля"
      subtitle="Введите email, указанный при регистрации"
    >
      {error && (
        <div className="text-[13px] text-danger mb-4">{error}</div>
      )}
      {success ? (
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-primary" />
          </div>
          <p className="text-sm text-primary font-semibold mb-2">{success}</p>
          <p className="text-xs text-muted mb-6">Проверьте папку «Спам», если письмо не пришло</p>
          <button
            onClick={() => { closeForgotPassword(); openAuth('login'); setSuccess(''); setEmail(''); }}
            className="btn-outline mx-auto"
          >
            <ArrowLeft size={16} /> Вернуться к входу
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <label className="block text-[13px] font-semibold text-text mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="field"
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
            {loading ? 'Отправляем...' : 'Отправить ссылку'}
          </button>
          <div className="text-center mt-4">
            <button
              onClick={() => { closeForgotPassword(); openAuth('login'); }}
              className="text-sm text-primary font-semibold bg-transparent border-none cursor-pointer hover:underline"
            >
              ← Вернуться к входу
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
