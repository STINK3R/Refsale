import { create } from 'zustand';

/**
 * The installable app and reply notifications.
 *
 * - Install: Chrome / Edge / Android hand over a `beforeinstallprompt` event that
 *   a button can fire later. iPhone has no such event: Safari installs through
 *   "Поделиться → На экран «Домой»", and only an installed app may show
 *   notifications there — so on iPhone the instructions come first.
 * - Push: the permission is asked only from a button the visitor pressed, never
 *   on page load. The subscription goes to /api/push/subscribe for the signed-in
 *   buyer; signing out forgets this device so the next person using it does not
 *   get someone else's messages.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ENDPOINT_KEY = 'refsale_push_endpoint';
const DISMISS_KEY = 'refsale_notify_dismissed';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
export const isStandalone = typeof window !== 'undefined' && (
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
);
export const pushSupported = typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone in Safari: notifications need the app on the home screen first. */
export const iosNeedsInstall = isIOS && !isStandalone;

type PushState = 'unsupported' | 'default' | 'denied' | 'on' | 'off';

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  push: PushState;
  busy: boolean;
  dismissed: boolean;
  refresh: () => Promise<void>;
  install: () => Promise<boolean>;
  enablePush: () => Promise<string | null>;
  disablePush: () => Promise<void>;
  dismissPrompt: () => void;
}

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const dismissedNow = () => {
  const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return until > Date.now();
};

export const usePwaStore = create<PwaState>((set, get) => ({
  installEvent: null,
  installed: isStandalone,
  push: pushSupported ? (Notification.permission === 'denied' ? 'denied' : 'default') : 'unsupported',
  busy: false,
  dismissed: dismissedNow(),

  refresh: async () => {
    if (!pushSupported) return;
    if (Notification.permission === 'denied') { set({ push: 'denied' }); return; }
    const sub = await currentSubscription().catch(() => null);
    set({ push: sub ? 'on' : Notification.permission === 'granted' ? 'off' : 'default' });
  },

  install: async () => {
    const ev = get().installEvent;
    if (!ev) return false;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    set({ installEvent: null, installed: outcome === 'accepted' || get().installed });
    return outcome === 'accepted';
  },

  /** Asks for permission and subscribes this device. Returns an error text or null. */
  enablePush: async () => {
    if (!pushSupported) return iosNeedsInstall ? 'Сначала добавьте RefSale на экран «Домой»' : 'Этот браузер не умеет показывать уведомления';
    set({ busy: true });
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        set({ push: permission === 'denied' ? 'denied' : 'default' });
        return permission === 'denied' ? 'Уведомления запрещены в настройках браузера' : 'Уведомления не включены';
      }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch('/api/push/key');
      const { publicKey } = await keyRes.json();
      if (!publicKey) return 'Уведомления сейчас недоступны';
      const sub = (await reg.pushManager.getSubscription())
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) as BufferSource });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) return 'Войдите в аккаунт, чтобы включить уведомления';
      localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
      set({ push: 'on' });
      void fetch('/api/push/test', { method: 'POST' });
      return null;
    } catch {
      return 'Не удалось включить уведомления';
    } finally {
      set({ busy: false });
    }
  },

  disablePush: async () => {
    set({ busy: true });
    try {
      const sub = await currentSubscription();
      if (sub) {
        void fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      localStorage.removeItem(ENDPOINT_KEY);
      set({ push: pushSupported && Notification.permission === 'granted' ? 'off' : 'default' });
    } finally {
      set({ busy: false });
    }
  },

  dismissPrompt: () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 14 * 24 * 3600 * 1000));
    set({ dismissed: true });
  },
}));

/** Called while the token is still there: the server forgets this device. */
export function forgetPushDevice(): void {
  const endpoint = localStorage.getItem(ENDPOINT_KEY);
  if (!endpoint) return;
  void fetch('/api/push/unsubscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }), keepalive: true,
  });
  localStorage.removeItem(ENDPOINT_KEY);
  void currentSubscription().then((s) => s?.unsubscribe()).catch(() => {});
  usePwaStore.setState({ push: pushSupported && Notification.permission === 'granted' ? 'off' : 'default' });
}

/** A signed-in buyer whose device is already subscribed: tie it to them again. */
export async function resyncPushDevice(): Promise<void> {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  const res = await fetch('/api/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  }).catch(() => null);
  if (res?.ok) localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
}

/** Registers the worker and catches the install offer; runs once at start. */
export function setupPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwaStore.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwaStore.setState({ installed: true, installEvent: null }));
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(() => usePwaStore.getState().refresh())
        .catch(() => {});
    });
  }
}
