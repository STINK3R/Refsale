import { create } from 'zustand';

/** Whether the promo plate under the category photo is on screen. */
interface UiState {
  heroPromoVisible: boolean;
  setHeroPromoVisible: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  heroPromoVisible: true,
  setHeroPromoVisible: (v) => set({ heroPromoVisible: v }),
}));
