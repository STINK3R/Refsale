import { create } from 'zustand';

/**
 * The radio in the menu: RauteMusik FM TechHouse, played only when the visitor
 * turns it on. One audio element for the whole site, so the music goes on when
 * the menu closes or another page opens.
 *
 * The address is the station's own redirector, which hands out the nearest of
 * its *.radiohost.de servers — both are allowed by media-src in nginx.conf.
 */
export const RADIO = {
  url: 'https://streams.rautemusik.fm/techhouse',
  title: 'TechHouse',
  station: 'RauteMusik FM',
};

let audio: HTMLAudioElement | null = null;

interface RadioState {
  playing: boolean;
  loading: boolean;
  error: string;
  volume: number;
  toggle: () => void;
  setVolume: (v: number) => void;
}

function setupMediaSession(toggle: () => void) {
  if (!('mediaSession' in navigator)) return;
  // Phones show it on the lock screen and in the notification shade
  navigator.mediaSession.metadata = new MediaMetadata({
    title: RADIO.title,
    artist: RADIO.station,
    album: 'Радио RefSale',
    artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  });
  navigator.mediaSession.setActionHandler('play', toggle);
  navigator.mediaSession.setActionHandler('pause', toggle);
  navigator.mediaSession.setActionHandler('stop', toggle);
}

const savedVolume = (() => {
  const v = Number(localStorage.getItem('refsale_radio_volume'));
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.7;
})();

export const useRadioStore = create<RadioState>((set, get) => ({
  playing: false,
  loading: false,
  error: '',
  volume: savedVolume,
  toggle: () => {
    if (get().playing || get().loading) {
      // A live stream keeps downloading while paused: drop it altogether, and
      // the next start begins at the live point instead of minutes behind.
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      set({ playing: false, loading: false });
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      return;
    }
    if (!audio) {
      audio = new Audio();
      audio.preload = 'none';
      audio.addEventListener('playing', () => set({ playing: true, loading: false, error: '' }));
      audio.addEventListener('waiting', () => set({ loading: true }));
      audio.addEventListener('error', () => {
        if (!audio?.getAttribute('src')) return; // our own stop
        set({ playing: false, loading: false, error: 'Радио сейчас недоступно, попробуйте позже' });
      });
      setupMediaSession(() => get().toggle());
    }
    audio.volume = get().volume;
    audio.src = RADIO.url;
    set({ loading: true, error: '' });
    audio.play().catch(() => set({ playing: false, loading: false, error: 'Не удалось включить радио' }));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  },
  setVolume: (v) => {
    const volume = Math.min(1, Math.max(0, v));
    if (audio) audio.volume = volume;
    localStorage.setItem('refsale_radio_volume', String(volume));
    set({ volume });
  },
}));
