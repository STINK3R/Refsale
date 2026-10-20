import { useEffect } from 'react';
import { useNotificationStore } from '../../store';
import { AnimatePresence, motion } from 'framer-motion';
import { OVERLAY_OPEN_EVENT } from '../../hooks/useScrollLock';

/**
 * The toast under the header. Only one is ever on screen: a new message
 * swaps in where the old one was, and a repeated one shows a ×N counter.
 */
export default function Notification() {
  const notifications = useNotificationStore((s) => s.notifications);
  const clear = useNotificationStore((s) => s.clear);

  // A toast left over from the page would sit on top of a window opened right
  // after it (a product, the cart): it goes when the window comes. Toasts the
  // window itself shows come after this and stay.
  useEffect(() => {
    window.addEventListener(OVERLAY_OPEN_EVENT, clear);
    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, clear);
  }, [clear]);

  return (
    <div className="fixed top-[calc(var(--header-h,104px)+16px)] inset-x-0 z-[9999] flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
      <div className="relative w-full max-w-[420px] h-12">
        <AnimatePresence initial={false}>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-0 top-0 flex justify-center"
            >
              <div className={`inline-flex items-center gap-2 px-5 py-3 rounded-full border-2 border-ink text-[13px] font-semibold text-center shadow-[0_6px_0_#111] ${n.type === 'error' ? 'bg-danger text-white' : 'bg-ivory text-ink'}`}>
                <span>{n.text}</span>
                {n.count > 1 && (
                  <motion.span
                    key={n.count}
                    initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums ${n.type === 'error' ? 'bg-white text-danger' : 'bg-ink text-sun'}`}
                  >
                    ×{n.count}
                  </motion.span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
