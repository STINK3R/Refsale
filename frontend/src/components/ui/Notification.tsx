import { useNotificationStore } from '../../store';
import { CheckCircle, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export default function Notification() {
  const notifications = useNotificationStore((s) => s.notifications);

  return (
    <div className="fixed bottom-6 max-sm:bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-[300px] max-sm:max-w-[260px]">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="flex items-center gap-3 bg-card border border-border text-text px-4 py-3 rounded-lg text-sm font-medium shadow-xl"
          >
            {n.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-success shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-danger shrink-0" />
            )}
            <span>{n.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
