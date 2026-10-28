import { useEffect, useState } from 'react';
import { BellRing, Download, Mail, Megaphone, Share, Smartphone } from 'lucide-react';
import { fetchConsent, setMarketingConsent } from '../../api/client';
import { useNotificationStore } from '../../store';
import { iosNeedsInstall, usePwaStore } from '../../store/pwa';

/** Notifications and the app, in the profile: push on this device, email, install. */
export default function NotifySettings() {
  const { push, busy, enablePush, disablePush, installEvent, install, installed, refresh } = usePwaStore();
  const show = useNotificationStore((s) => s.show);
  const [email, setEmail] = useState<boolean | null>(null);
  const [marketing, setMarketing] = useState<boolean | null>(null);

  useEffect(() => {
    void refresh();
    fetch('/api/notify/settings').then((r) => r.json()).then((d) => setEmail(!!d.email)).catch(() => setEmail(null));
    fetchConsent().then((c) => setMarketing(c ? c.marketing : null));
  }, [refresh]);

  const toggleEmail = async () => {
    const next = !email;
    setEmail(next);
    const r = await fetch('/api/notify/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: next }) }).catch(() => null);
    if (!r?.ok) { setEmail(!next); show('Не удалось сохранить', 'error'); return; }
    show(next ? 'Письма об ответах включены' : 'Письма об ответах выключены');
  };

  const toggleMarketing = async () => {
    const next = !marketing;
    setMarketing(next);
    if (!(await setMarketingConsent(next))) { setMarketing(!next); show('Не удалось сохранить', 'error'); return; }
    show(next ? 'Письма об акциях включены' : 'Письма об акциях выключены — согласие отозвано');
  };

  const togglePush = async () => {
    if (push === 'on') { await disablePush(); show('Уведомления на этом устройстве выключены'); return; }
    const err = await enablePush();
    show(err || 'Уведомления включены', err ? 'error' : 'success');
  };

  const pushHint =
    push === 'on' ? 'Включены на этом устройстве'
      : push === 'denied' ? 'Запрещены в настройках браузера — разрешите уведомления для refsale.ru в настройках сайта'
      : iosNeedsInstall ? 'На iPhone — после установки приложения на экран «Домой»'
      : push === 'unsupported' ? 'Этот браузер не умеет показывать уведомления'
      : 'Ответы менеджера и новые статусы заказа';

  return (
    <div className="mb-6 rounded-[18px] border-2 border-ink/10 p-4 space-y-4">
      <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Уведомления</div>

      <Row icon={<BellRing size={17} />} title="Push-уведомления" hint={pushHint}>
        {(push === 'on' || push === 'off' || push === 'default') && !iosNeedsInstall && (
          <Switch on={push === 'on'} disabled={busy} onClick={togglePush} label="Push-уведомления" />
        )}
      </Row>

      <Row icon={<Mail size={17} />} title="Письма об ответах" hint="Не чаще раза в 10 минут на один чат">
        {email !== null && <Switch on={email} onClick={toggleEmail} label="Письма об ответах" />}
      </Row>

      <Row icon={<Megaphone size={17} />} title="Письма об акциях и промокодах" hint="Скидки и напоминание за неделю до конца срока промокода">
        {marketing !== null && <Switch on={marketing} onClick={toggleMarketing} label="Письма об акциях и промокодах" />}
      </Row>

      <Row
        icon={<Smartphone size={17} />}
        title="Приложение RefSale"
        hint={installed ? 'Установлено' : iosNeedsInstall ? 'Safari: «Поделиться» → «На экран „Домой“»' : installEvent ? 'Иконка на экране, открывается без браузера' : 'Установите через меню браузера: «Установить приложение»'}
      >
        {!installed && installEvent && (
          <button onClick={() => void install()} className="btn-outline btn-sm shrink-0"><Download size={14} /> Установить</button>
        )}
        {!installed && iosNeedsInstall && <Share size={18} className="shrink-0 text-muted" />}
      </Row>
    </div>
  );
}

function Row({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 shrink-0 rounded-ctl-sm bg-accent-strong border-2 border-ink flex items-center justify-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-ink">{title}</div>
        <div className="text-[12px] text-muted leading-snug">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Switch({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative w-12 h-7 shrink-0 rounded-full border-2 border-ink transition-colors cursor-pointer disabled:opacity-50 ${on ? 'bg-ink' : 'bg-card'}`}
    >
      <span className={`absolute top-[2px] w-[20px] h-[20px] rounded-full transition-all ${on ? 'left-[22px] bg-sun' : 'left-[2px] bg-ink/30'}`} />
    </button>
  );
}
