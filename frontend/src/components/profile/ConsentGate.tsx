import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import { grantConsent } from '../../api/client';

/**
 * Accounts made before the consent was asked for (or for an older edition of
 * it) confirm it once: until then the account is used without a recorded
 * consent, which 152-ФЗ does not allow.
 */
export default function ConsentGate() {
  const { user, setUser, logout } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const [checked, setChecked] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || user.pd_consent_at) return null;

  const accept = async () => {
    setBusy(true);
    const ok = await grantConsent(marketing);
    setBusy(false);
    if (!ok) { show('Не удалось сохранить согласие', 'error'); return; }
    setUser({ ...user, pd_consent_at: new Date().toISOString(), marketing_consent: marketing });
  };

  return (
    <div className="fixed inset-0 z-[3100] bg-ink/45 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="w-full max-w-lg bg-bg border-2 border-ink rounded-t-[28px] sm:rounded-[28px] shadow-[0_8px_0_#111] p-8 max-sm:p-6">
        <span className="w-12 h-12 rounded-ctl-md bg-sun border-2 border-ink grid place-items-center"><ShieldCheck size={22} strokeWidth={2.2} /></span>
        <h2 id="consent-title" className="mt-5 font-display text-[24px] leading-tight text-ink">Подтвердите согласие на обработку данных</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Мы опубликовали <Link to="/privacy" target="_blank" className="underline font-semibold text-ink">Политику обработки персональных данных</Link>. Чтобы и дальше пользоваться аккаунтом, заказами и чатами, нужно ваше согласие.
        </p>
        <ConsentChecks pd={checked} setPd={setChecked} marketing={marketing} setMarketing={setMarketing} />
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => { logout(); show('Вы вышли из аккаунта'); }} className="btn-outline">Выйти</button>
          <button onClick={accept} disabled={!checked || busy} className="btn-primary">{busy ? <Loader2 size={16} className="animate-spin" /> : 'Подтвердить'}</button>
        </div>
      </div>
    </div>
  );
}

/** The two ticks: the processing consent (required) and letters about offers (optional). */
export function ConsentChecks({ pd, setPd, marketing, setMarketing }: {
  pd: boolean; setPd: (v: boolean) => void; marketing: boolean; setMarketing: (v: boolean) => void;
}) {
  return (
    <div className="mt-5 space-y-3">
      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink cursor-pointer">
        <input type="checkbox" checked={pd} onChange={(e) => setPd(e.target.checked)} required className="mt-0.5 w-[18px] h-[18px] shrink-0 accent-[#111]" />
        <span>
          Даю <Link to="/consent" target="_blank" className="underline font-semibold">согласие на обработку персональных данных</Link> и принимаю <Link to="/privacy" target="_blank" className="underline font-semibold">Политику</Link> <span className="text-danger">*</span>
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-muted cursor-pointer">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 w-[18px] h-[18px] shrink-0 accent-[#111]" />
        <span>Хочу получать письма об акциях и об окончании срока моих промокодов (<Link to="/consent#marketing" target="_blank" className="underline">согласие</Link>, по желанию)</span>
      </label>
    </div>
  );
}
