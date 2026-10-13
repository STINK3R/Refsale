import { useState, useEffect } from 'react';
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

  return (
    <button
      onClick={() => {
        if (user) { openSupport(); return; }
        runAfterAuth(() => openSupport());
        useAuthStore.getState().openAuth('register', 'Чтобы написать продавцу, создайте аккаунт — это полминуты, без подтверждения администратора.');
      }}
      className="fixed bottom-4 right-5 max-sm:right-3 z-[1500] w-[52px] h-[52px] max-sm:w-[48px] max-sm:h-[48px] rounded-full btn-gold shadow-[0_4px_20px_rgba(212,175,90,0.4)] hover:shadow-[0_6px_28px_rgba(212,175,90,0.55)] hover:scale-105 transition-all flex items-center justify-center cursor-pointer"
      aria-label="Написать продавцу"
    >
      <MessageCircle size={20} className="max-sm:w-[17px] max-sm:h-[17px]" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] flex items-center justify-center px-1 rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">{unreadCount}</span>
      )}
    </button>
  );
}
