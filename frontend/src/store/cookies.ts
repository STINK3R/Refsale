import { create } from 'zustand';

/** 'all' — necessary and analytics (Yandex Metrika); 'necessary' — only what the site needs to work. */
export type CookieChoice = 'all' | 'necessary';

const KEY = 'refsale_cookies';

function load(): CookieChoice | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && (v.choice === 'all' || v.choice === 'necessary') ? v.choice : null;
  } catch { return null; }
}

interface CookieState {
  /** null until the visitor has chosen: the banner is up and no analytics run */
  choice: CookieChoice | null;
  /** The banner opened again from «Настройки cookie» */
  settingsOpen: boolean;
  choose: (c: CookieChoice) => void;
  openSettings: () => void;
}

export const useCookieStore = create<CookieState>((set) => ({
  choice: load(),
  settingsOpen: false,
  choose: (choice) => {
    try { localStorage.setItem(KEY, JSON.stringify({ choice, at: new Date().toISOString() })); } catch { /* private mode */ }
    const was = useCookieStore.getState().choice;
    set({ choice, settingsOpen: false });
    // Analytics already running cannot be unloaded in place: a reload stops it
    if (was === 'all' && choice === 'necessary') window.location.reload();
  },
  openSettings: () => set({ settingsOpen: true }),
}));

export const openCookieSettings = () => useCookieStore.getState().openSettings();
