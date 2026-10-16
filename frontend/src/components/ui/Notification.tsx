import { useNotificationStore } from '../../store';
import { AnimatePresence, motion } from 'framer-motion';

/** Toasts: a single quiet line under the header. */
export default function Notification() {
  const notifications = useNotificationStore((s) => s.notifications);

  return (
    <div className="fixed top-[120px] max-lg:top-[76px] left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 w-[min(92vw,420px)] pointer-events-none" role="status" aria-live="polite">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={`px-5 py-3 text-[13px] text-center shadow-[0_18px_40px_rgba(0,0,0,0.5)] ${n.type === 'error' ? 'bg-danger text-white' : 'bg-ivory text-ink'}`}
          >
            {n.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
