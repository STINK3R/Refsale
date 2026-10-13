import { Mail, Phone } from 'lucide-react';
import { useAppStore } from '../../store';
import TelegramIcon from './TelegramIcon';

/**
 * Two contact pairs from the admin settings: a working one (sales) and an
 * administrative one. Each pair: phone, email, Telegram, WhatsApp, MAX.
 * Anything left empty in the admin panel simply isn't shown.
 */
export interface ContactPair {
  label: string;
  phone: string;
  email: string;
  telegram: string;
  whatsapp: string;
  max: string;
}

const DEFAULT_LABELS = ['Отдел продаж', 'Администрация'];

export function useContacts(): ContactPair[] {
  const settings = useAppStore((s) => s.settings);
  return [1, 2]
    .map((n) => ({
      label: (settings[`contact_label_${n}`] || DEFAULT_LABELS[n - 1]).trim(),
      phone: (settings[`contact_phone_${n}`] || '').trim(),
      email: (settings[`contact_email_${n}`] || '').trim(),
      telegram: (settings[`contact_tg_${n}`] || '').trim(),
      whatsapp: (settings[`contact_wa_${n}`] || '').trim(),
      max: (settings[`contact_max_${n}`] || '').trim(),
    }))
    .filter((p) => p.phone || p.email || p.telegram || p.whatsapp || p.max);
}

export function telHref(phone: string) {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}

export function telegramHref(v: string) {
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://t.me/' + v.replace(/^@/, '');
}

export function whatsappHref(v: string) {
  if (/^https?:\/\//i.test(v)) return v;
  let digits = v.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  return 'https://wa.me/' + digits;
}

export function maxHref(v: string) {
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://max.ru/' + v.replace(/^@/, '');
}

export function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  );
}

export function MaxIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" stroke="currentColor" strokeWidth="2" />
      <path d="M7 16V8l5 5 5-5v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Messenger + phone + email buttons for one pair. */
export function ContactLinks({ pair, compact = false }: { pair: ContactPair; compact?: boolean }) {
  const btn = `inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-muted hover:text-primary-light hover:border-primary/40 transition-colors ${compact ? 'w-7 h-7' : 'w-9 h-9'}`;
  const icon = compact ? 13 : 16;
  return (
    <div className="flex items-center gap-1.5">
      {pair.telegram && (
        <a href={telegramHref(pair.telegram)} target="_blank" rel="noreferrer" className={btn} aria-label="Telegram" title="Telegram"><TelegramIcon size={icon} /></a>
      )}
      {pair.whatsapp && (
        <a href={whatsappHref(pair.whatsapp)} target="_blank" rel="noreferrer" className={btn} aria-label="WhatsApp" title="WhatsApp"><WhatsAppIcon size={icon} /></a>
      )}
      {pair.max && (
        <a href={maxHref(pair.max)} target="_blank" rel="noreferrer" className={btn} aria-label="MAX" title="MAX"><MaxIcon size={icon} /></a>
      )}
      {compact && pair.phone && (
        <a href={telHref(pair.phone)} className={btn} aria-label="Позвонить" title={pair.phone}><Phone size={icon} /></a>
      )}
      {compact && pair.email && (
        <a href={`mailto:${pair.email}`} className={btn} aria-label="Написать на почту" title={pair.email}><Mail size={icon} /></a>
      )}
    </div>
  );
}

/** Full block: label, phone, email and messengers — used in the menu and footer. */
export function ContactBlock({ pair }: { pair: ContactPair }) {
  return (
    <div className="space-y-2">
      <div className="eyebrow !text-[10px] !tracking-[0.22em] text-primary/80">{pair.label}</div>
      {pair.phone && (
        <a href={telHref(pair.phone)} className="flex items-center gap-2 text-[15px] font-semibold text-text hover:text-primary-light transition-colors">
          <Phone size={14} className="text-primary" /> {pair.phone}
        </a>
      )}
      {pair.email && (
        <a href={`mailto:${pair.email}`} className="flex items-center gap-2 text-sm text-muted hover:text-primary-light transition-colors break-all">
          <Mail size={14} className="text-primary shrink-0" /> {pair.email}
        </a>
      )}
      <ContactLinks pair={pair} />
    </div>
  );
}
