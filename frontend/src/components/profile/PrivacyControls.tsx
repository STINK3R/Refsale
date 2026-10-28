import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import { deleteAccount } from '../../api/client';

/**
 * The profile's personal-data corner: the documents, and the account's
 * deletion — which is also how consent is withdrawn (152-ФЗ, ст. 9).
 */
export default function PrivacyControls() {
  const { logout, closeProfile } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    const err = await deleteAccount(password);
    setBusy(false);
    if (err) { show(err, 'error'); return; }
    closeProfile();
    logout();
    show('Аккаунт удалён, согласие на обработку данных отозвано');
  };

  return (
    <div className="mt-6 rounded-[18px] border-2 border-ink/10 p-4">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
        <ShieldCheck size={15} /> Персональные данные
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-semibold">
        <Link to="/privacy" onClick={closeProfile} className="underline underline-offset-4 decoration-2 decoration-sun hover:decoration-ink">Политика</Link>
        <Link to="/consent" onClick={closeProfile} className="underline underline-offset-4 decoration-2 decoration-sun hover:decoration-ink">Согласие</Link>
        <Link to="/terms" onClick={closeProfile} className="underline underline-offset-4 decoration-2 decoration-sun hover:decoration-ink">Условия продажи</Link>
      </div>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-danger hover:underline cursor-pointer">
          <Trash2 size={14} /> Удалить аккаунт и отозвать согласие
        </button>
      ) : (
        <div className="mt-4 rounded-ctl-md bg-[#FDE2E2] border-2 border-[#F2A9AC] p-3.5 space-y-3">
          <p className="text-[13px] leading-snug text-ink">
            Имя, почта, телефон и адрес будут удалены из аккаунта, отзывов, форума и вопросов, войти в аккаунт будет нельзя. Сведения о заказах останутся — их продавец обязан хранить для бухгалтерского учёта.
          </p>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Пароль для подтверждения" className="field !h-11" />
          <label className="flex items-start gap-2 text-[13px] text-ink cursor-pointer">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#B4232A]" />
            Понимаю, что удаление нельзя отменить
          </label>
          <div className="flex gap-2">
            <button onClick={() => { setOpen(false); setPassword(''); setSure(false); }} className="btn-outline btn-sm flex-1">Отмена</button>
            <button onClick={remove} disabled={!sure || !password || busy} className="btn-sm flex-1 rounded-ctl-sm bg-[#B4232A] text-white font-bold uppercase tracking-[0.08em] disabled:opacity-50 cursor-pointer">
              {busy ? <Loader2 size={15} className="animate-spin mx-auto" /> : 'Удалить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
