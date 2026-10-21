import { useState } from 'react';
import { BellRing, Download, Share, X } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import { iosNeedsInstall, usePwaStore } from '../../store/pwa';

/**
 * "Сообщим, когда менеджер ответит": offered right where an answer is awaited
 * (a placed order, a question to the seller), never as a browser pop-up on
 * load. Hidden once notifications are on, refused, or put off for two weeks.
 */
export default function NotifyPrompt({ className = '' }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  const { push, busy, dismissed, enablePush, dismissPrompt, installEvent, install } = usePwaStore();
  const show = useNotificationStore((s) => s.show);
  const [iosHelp, setIosHelp] = useState(false);

  if (!user || dismissed || push === 'on' || push === 'denied') return null;
  if (push === 'unsupported' && !iosNeedsInstall) return null;

  const enable = async () => {
    const err = await enablePush();
    show(err || 'Уведомления включены — сообщим, когда вам ответят', err ? 'error' : 'success');
  };

  return (
    <div className={`relative rounded-[18px] border-2 border-ink bg-accent-strong p-4 pr-10 ${className}`}>
      <button onClick={dismissPrompt} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-ctl-xs flex items-center justify-center text-ink/70 hover:text-ink hover:bg-ink/10 cursor-pointer" aria-label="Не сейчас">
        <X size={15} strokeWidth={2.4} />
      </button>
      <div className="flex gap-3">
        <span className="w-10 h-10 shrink-0 rounded-ctl-sm bg-ink text-sun flex items-center justify-center"><BellRing size={18} /></span>
        <div className="min-w-0">
          <div className="text-[14.5px] font-extrabold text-ink leading-snug">Сообщим, когда вам ответят</div>
          {iosNeedsInstall ? (
            <>
              <p className="mt-1 text-[13px] font-semibold text-ink/80 leading-snug">На iPhone уведомления приходят в приложение RefSale. Его можно установить за 10 секунд.</p>
              {iosHelp ? (
                <ol className="mt-2 space-y-1 text-[13px] font-semibold text-ink leading-snug list-decimal pl-4">
                  <li>Нажмите <Share size={13} className="inline -mt-0.5" /> «Поделиться» внизу Safari</li>
                  <li>Выберите «На экран „Домой“»</li>
                  <li>Откройте RefSale с экрана и включите уведомления здесь же</li>
                </ol>
              ) : (
                <button onClick={() => setIosHelp(true)} className="mt-2.5 btn-primary btn-sm !bg-card">Как установить</button>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 text-[13px] font-semibold text-ink/80 leading-snug">Уведомление придёт на телефон или компьютер — даже когда сайт закрыт.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button onClick={enable} disabled={busy} className="btn-primary btn-sm !bg-card">Включить уведомления</button>
                {installEvent && (
                  <button onClick={() => void install()} className="btn-outline btn-sm"><Download size={14} /> Установить приложение</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
