import { useEffect, useState } from 'react';
import NotifySettings from './NotifySettings';
import PrivacyControls from './PrivacyControls';
import { Link } from 'react-router-dom';
import { Loader2, Package, Crown } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthStore, useNotificationStore } from '../../store';
import { updateUser } from '../../api/client';
import { getInitials } from '../../utils/format';

export default function ProfileModal() {
  const { user, profileModalOpen, closeProfile, setUser } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [telegram, setTelegram] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profileModalOpen || !user) return;
    setName(user.full_name || '');
    setPhone(user.phone || '');
    setEmail(user.email || '');
    setTelegram(user.telegram_username || '');
    setPassword('');
  }, [profileModalOpen, user]);

  if (!user) return null;

  const save = async () => {
    if (!name.trim()) { show('Укажите имя', 'error'); return; }
    if (password && password.length < 6) { show('Пароль — минимум 6 символов', 'error'); return; }
    setSaving(true);
    const updates: { full_name: string; phone: string; email: string; telegram_username: string; password?: string } = { full_name: name.trim(), phone: phone.trim(), email: email.trim(), telegram_username: telegram.trim().replace(/^@/, '') };
    if (password) updates.password = password;
    const res = await updateUser(user.id, updates);
    setSaving(false);
    if (!res.user) { show(res.error || 'Не удалось сохранить', 'error'); return; }
    setUser(res.user);
    show('Профиль сохранён');
    closeProfile();
  };

  return (
    <Modal open={profileModalOpen} onClose={closeProfile}>
      <div className="flex items-center gap-4 mb-6 pr-8">
        <div className="w-14 h-14 rounded-full bg-ivory text-ink font-extrabold flex items-center justify-center text-lg">
          {getInitials(user.full_name)}
        </div>
        <div className="min-w-0">
          <div className="font-display text-[28px] leading-none text-text truncate">{user.full_name}</div>
          <div className="text-[13px] text-muted truncate mt-1">{user.email}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6">
        <Link to="/orders" onClick={closeProfile} className="btn-outline h-11 text-[13px]"><Package size={15} /> Мои заказы</Link>
        {user.is_leader ? (
          <Link to="/cabinet" onClick={closeProfile} className="btn-primary h-11 text-[13px]"><Crown size={15} /> Кабинет</Link>
        ) : <span />}
      </div>

      <NotifySettings />

      <div className="space-y-3">
        <Labeled label="Имя"><input value={name} onChange={(e) => setName(e.target.value)} className="field" /></Labeled>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Labeled label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="field" /></Labeled>
          <Labeled label="Telegram"><input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" className="field" /></Labeled>
        </div>
        <Labeled label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="field" /></Labeled>
        <Labeled label="Новый пароль (оставьте пустым, чтобы не менять)"><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" className="field" /></Labeled>
      </div>
      <button onClick={save} disabled={saving} className="btn-primary w-full h-12 text-[15px] mt-6">
        {saving ? <Loader2 size={18} className="animate-spin" /> : 'Сохранить'}
      </button>

      <PrivacyControls />
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] text-muted mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
