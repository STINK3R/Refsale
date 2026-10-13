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
          className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-5"
          onMouseDown={(e) => { mouseDownTarget.current = e.target; }}
          onMouseUp={(e) => {
            if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
              onClose();
            }
            mouseDownTarget.current = null;
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`glass-strong rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-8 w-full ${maxWidth} max-h-[92vh] sm:max-h-[90vh] overflow-y-auto relative`}
            style={{ overscrollBehavior: 'contain' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5 sm:hidden" />
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-9 h-9 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer z-10"
            >
              <X size={16} />
            </button>
            {title && <h2 className="text-xl sm:text-2xl font-extrabold text-text mb-1">{title}</h2>}
            {subtitle && <p className="text-sm text-muted mb-6">{subtitle}</p>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
