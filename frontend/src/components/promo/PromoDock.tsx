import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Percent, X } from 'lucide-react';
import PromoForm from './PromoForm';
import { usePromoStore } from '../../store';
import { useUiStore } from '../../store/ui';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The promo entry that stays with the visitor once the plate under the
 * category photo has scrolled away. It waits at the bottom of the screen as a
 * small chip — "Есть промокод?", or the active code in pink — and opens into
 * the full field only when tapped, so it never covers the products.
 */
export default function PromoDock() {
  const heroVisible = useUiStore((s) => s.heroPromoVisible);
  const code = usePromoStore((s) => s.code);
  const [wantOpen, setOpen] = useState(false);
  // Back at the top the big plate is on screen again, so the dock folds away.
  const shown = !heroVisible;
  const open = wantOpen && shown;

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="fixed z-[1400] bottom-5 left-4 max-sm:bottom-3 max-sm:left-3 max-sm:right-[68px]"
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.div
                key="open"
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="w-[min(520px,calc(100vw-96px))] max-sm:w-auto flex items-start gap-2"
              >
                <div className="flex-1 min-w-0">
                  <PromoForm variant="pill" onApplied={() => setOpen(false)} />
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="shrink-0 w-11 h-11 mt-1.5 max-sm:mt-0.5 rounded-ctl bg-card border-2 border-ink flex items-center justify-center cursor-pointer hover:bg-sun"
                  aria-label="Свернуть"
                >
                  <X size={18} strokeWidth={2.4} />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="chip"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, ease: EASE }}
                onClick={() => setOpen(true)}
                className={`h-12 max-sm:h-11 pl-1.5 pr-5 rounded-ctl-md max-sm:rounded-ctl border-2 border-ink shadow-[0_4px_0_#111] flex items-center gap-2.5 text-[13px] font-bold cursor-pointer ${code ? 'bg-primary text-white' : 'bg-card text-ink hover:bg-sun-soft'}`}
              >
                <span className={`w-8 h-8 rounded-ctl-xs flex items-center justify-center ${code ? 'bg-sun text-ink' : 'bg-primary text-white'}`}>
                  {code ? <Check size={16} strokeWidth={2.6} /> : <Percent size={16} strokeWidth={2.6} />}
                </span>
                {code ? <>Промокод {code}</> : 'Есть промокод?'}
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
