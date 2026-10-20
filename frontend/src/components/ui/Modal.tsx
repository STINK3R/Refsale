import { useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useScrollLock from '../../hooks/useScrollLock';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: string;
}

export default function Modal({ open, onClose, children, title, subtitle, maxWidth = 'max-w-md' }: ModalProps) {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  useScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-ink/45 p-0 sm:p-6"
          onMouseDown={(e) => { mouseDownTarget.current = e.target; }}
          onMouseUp={(e) => {
            if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
              onClose();
            }
            mouseDownTarget.current = null;
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={`bg-bg border border-line p-7 sm:p-10 w-full ${maxWidth} max-h-[94vh] overflow-y-auto relative`}
            style={{ overscrollBehavior: 'contain' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-muted hover:text-text transition-colors cursor-pointer z-10"
              aria-label="Закрыть"
            >
              <X size={20} strokeWidth={1.3} />
            </button>
            {title && <h2 className="font-display text-[30px] leading-tight text-text mb-2 pr-8">{title}</h2>}
            {subtitle && <p className="text-sm text-muted mb-6">{subtitle}</p>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
