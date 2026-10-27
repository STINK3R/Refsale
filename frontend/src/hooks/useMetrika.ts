import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store';

type Ym = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
let counter = 0;

/** Loads Yandex Metrika once the admin has set a counter number. */
function start(id: number, webvisor: boolean) {
  if (counter) return;
  counter = id;
  const w = window as unknown as { ym?: Ym };
  const ym: Ym = w.ym || Object.assign((...args: unknown[]) => { (ym.a = ym.a || []).push(args); }, {});
  ym.l = Date.now();
  w.ym = ym;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(s);
  // defer: the pages of a single-page site are counted by hand, below
  ym(id, 'init', { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor });
}

/**
 * Yandex Metrika, switched on from the admin panel (Контакты, FAQ, Метрика).
 * Every page change is a view of its own: the site never reloads between them.
 */
export default function useMetrika() {
  const settings = useAppStore((s) => s.settings);
  const { pathname, search } = useLocation();
  const id = Number(settings.metrika_id) || 0;
  const webvisor = settings.metrika_webvisor === 'true';

  useEffect(() => { if (id) start(id, webvisor); }, [id, webvisor]);

  useEffect(() => {
    if (!counter) return;
    const ym = (window as unknown as { ym?: Ym }).ym;
    ym?.(counter, 'hit', window.location.href, { title: document.title, referer: document.referrer });
  }, [pathname, search, id]);
}
