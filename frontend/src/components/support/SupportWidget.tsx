import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useAuthStore, runAfterAuth } from '../../store';
import { useSupportStore } from '../../store/support';
import { fetchSupportUnreadCount } from '../../api/client';

/**
 * Floating "request chat" bubble.
 *
 * The actual chat UI lives in <SupportChatModal />; this component only:
 *   1. Polls the unread-reply count for the signed-in user.
 *   2. Opens the shared support store when clicked.
 *
 * Using a single modal keeps the "from main page" CTA and "from the bubble"
 * CTA visually identical.
 */
export default function SupportWidget() {
  const { user } = useAuthStore();
  const openSupport = useSupportStore((s) => s.open);
  const isOpen = useSupportStore((s) => s.isOpen);
  const [unreadCount, setUnreadCount] = useState(0);
  const { pathname } = useLocation();
  // Order and cabinet pages are chats themselves; the floating button would cover their input.
  const hidden = pathname.startsWith('/orders') || pathname.startsWith('/cabinet');

  useEffect(() => {
    if (!user?.id) { setUnreadCount(0); return; }
    const check = () => {
      fetchSupportUnreadCount(user.id)
        .then((count) => { if (!isOpen) setUnreadCount(count); })
        .catch(() => { /* ignore */ });
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [user, isOpen]);

  // Clear the badge as soon as the chat opens (same UX as clicking a ticket).
  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  if (hidden) return null;

  return (
    <button
      onClick={() => {
        if (user) { openSupport(); return; }
        runAfterAuth(() => openSupport());
        useAuthStore.getState().openAuth('register', 'Создайте аккаунт за полминуты — и сразу пишите продавцу. Ответ придёт сюда же, в чат.');
      }}
      className="fixed bottom-5 right-5 max-sm:right-3 max-sm:bottom-3 z-[1500] btn-primary !h-11 !px-5 max-sm:!w-11 max-sm:!px-0"
      aria-label="Чат с продавцом"
    >
      <MessageCircle size={16} strokeWidth={1.6} className="shrink-0" />
      <span className="max-sm:hidden">Чат с продавцом</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-primary text-ink text-[10px] font-semibold leading-none tracking-normal">{unreadCount}</span>
      )}
    </button>
  );
}
