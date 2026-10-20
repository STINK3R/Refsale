import { create } from 'zustand';
import type { MeerkatPose } from '../components/mascot/Meerkat';

/** A short appearance of the meerkat with a line to say ("Скидка включена!"). */
export interface MascotMoment {
  id: number;
  pose: MeerkatPose;
  text: string;
}

interface UiState {
  /** Whether the promo plate under the category photo is on screen. */
  heroPromoVisible: boolean;
  setHeroPromoVisible: (v: boolean) => void;
  mascotMoment: MascotMoment | null;
  showMascot: (pose: MeerkatPose, text: string) => void;
  hideMascot: () => void;
}

let momentId = 0;

export const useUiStore = create<UiState>((set) => ({
  heroPromoVisible: true,
  setHeroPromoVisible: (v) => set({ heroPromoVisible: v }),
  mascotMoment: null,
  showMascot: (pose, text) => set({ mascotMoment: { id: ++momentId, pose, text } }),
  hideMascot: () => set({ mascotMoment: null }),
}));
