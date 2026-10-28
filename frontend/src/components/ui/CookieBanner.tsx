import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { useCookieStore } from '../../store/cookies';

/**
 * The cookie choice, shown until the visitor makes one (and again from
 * «Настройки cookie»). Analytics (Yandex Metrika) waits for «Принять все»;
 * the necessary storage (sign-in, cart, favourites) works either way.
 */
export default function CookieBanner() {
  const { choice, settingsOpen, choose } = useCookieStore();
  if (choice && !settingsOpen) return null;
  return (
    <div role="dialog" aria-live="polite" aria-label="Cookie" className="fixed z-[2600] left-4 bottom-4 max-sm:left-2 max-sm:right-2 max-sm:bottom-2 w-[440px] max-sm:w-auto bg-card border-2 border-ink rounded-[22px] shadow-[0_6px_0_#111] p-5 max-sm:p-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-ctl-sm bg-sun border-2 border-ink grid place-items-center"><Cookie size={18} strokeWidth={2.2} /></span>
        <p className="text-[13.5px] leading-snug text-ink">
          Мы используем cookie. Необходимые — для входа, корзины и избранного. Аналитические (Яндекс Метрика) — чтобы делать сайт удобнее, только с вашего согласия.{' '}
          <Link to="/privacy#cookies" className="underline font-semibold">Подробнее</Link>
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => choose('necessary')} className={`btn-outline btn-sm ${choice === 'necessary' ? '!bg-surface' : ''}`}>Только необходимые</button>
        <button onClick={() => choose('all')} className="btn-primary btn-sm">Принять все</button>
      </div>
    </div>
  );
}
