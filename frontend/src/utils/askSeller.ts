import { runAfterAuth, useAuthStore } from '../store';
import { useSupportStore } from '../store/support';

/**
 * "Связь с продавцом". A conversation needs an account to come back to, so a
 * guest is offered the quick sign-up first and lands in the chat right after.
 */
/** "Не нашли?" on a category page or after a search: a new question titled
 *  with what is sought, and the message already written when it is known. */
export function askToFind(what: string, text?: string) {
  const open = () => useSupportStore.getState().open({ startInNew: true, prefillSubject: `Найти: ${what.toLowerCase()}`, prefillText: text });
  if (useAuthStore.getState().user) { open(); return; }
  runAfterAuth(open);
  useAuthStore.getState().openAuth('register', 'Создайте аккаунт за полминуты — и напишите, что ищете. Ответит администратор площадки, сюда же, в чат.');
}

export function askSeller(productId?: number) {
  const open = () => useSupportStore.getState().open({ startInNew: true, prefillProductId: productId ?? null });
  if (useAuthStore.getState().user) { open(); return; }
  runAfterAuth(open);
  useAuthStore.getState().openAuth('register', 'Создайте аккаунт за полминуты — и спросите о товаре. Ответит администратор площадки, сюда же, в чат.');
}
