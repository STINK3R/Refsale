import { runAfterAuth, useAuthStore } from '../store';
import { useSupportStore } from '../store/support';

/**
 * "Связь с продавцом". A conversation needs an account to come back to, so a
 * guest is offered the quick sign-up first and lands in the chat right after.
 */
export function askSeller(productId?: number) {
  const open = () => useSupportStore.getState().open({ startInNew: true, prefillProductId: productId ?? null });
  if (useAuthStore.getState().user) { open(); return; }
  runAfterAuth(open);
  useAuthStore.getState().openAuth('register', 'Чтобы написать продавцу, создайте аккаунт — это полминуты, без подтверждения администратора.');
}
