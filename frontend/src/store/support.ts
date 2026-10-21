import { create } from 'zustand';

interface SupportState {
  isOpen: boolean;
  // Whether to go straight to "new ticket" form after opening (used for guests
  // and explicit "new request" triggers).
  startInNew: boolean;
  // Optional pre-fill for the new-ticket form. Set when entering from a
  // context where we already know the topic (e.g. a product card or the
  // "Напишите ваши пожелания" hero tile).
  prefillSubject: string;
  prefillText: string;
  prefillProductId: number | null;
  // If true, show the inline product-picker expanded when the form opens.
  showProductPicker: boolean;
  /** Open straight on this question (a tapped notification). */
  ticketId: number | null;
  open: (opts?: {
    startInNew?: boolean;
    prefillSubject?: string;
    prefillText?: string;
    prefillProductId?: number | null;
    showProductPicker?: boolean;
    ticketId?: number | null;
  }) => void;
  close: () => void;
}

export const useSupportStore = create<SupportState>((set) => ({
  isOpen: false,
  startInNew: false,
  prefillSubject: '',
  prefillText: '',
  prefillProductId: null,
  showProductPicker: false,
  ticketId: null,
  open: (opts) =>
    set({
      isOpen: true,
      startInNew: !!opts?.startInNew,
      prefillSubject: opts?.prefillSubject ?? '',
      prefillText: opts?.prefillText ?? '',
      prefillProductId: opts?.prefillProductId ?? null,
      showProductPicker: !!opts?.showProductPicker,
      ticketId: opts?.ticketId ?? null,
    }),
  close: () =>
    set({
      isOpen: false,
      startInNew: false,
      prefillSubject: '',
      prefillText: '',
      prefillProductId: null,
      showProductPicker: false,
    }),
}));
