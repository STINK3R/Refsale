/* eslint-disable react-refresh/only-export-components -- Shared primitives and hooks are exported from this internal admin UI module. */
import { useEffect, useState } from 'react';

export const adminCard = 'bg-card border-2 border-ink rounded-[20px] shadow-[0_4px_0_#111]';
export const adminInput = 'w-full min-w-0 h-11 rounded-ctl-sm border-2 border-ink/15 bg-white px-3.5 text-[13px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-sun/70';
export const adminArea = 'w-full min-w-0 rounded-ctl-sm border-2 border-ink/15 bg-white px-3.5 py-3 text-[13px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-sun/70';
export const adminPrimary = 'inline-flex items-center justify-center gap-2 min-h-10 rounded-ctl-sm border-2 border-ink bg-sun px-4 py-2 text-[12px] font-bold text-ink hover:bg-accent-strong disabled:opacity-50 disabled:cursor-wait cursor-pointer transition-colors';
export const adminSecondary = 'inline-flex items-center justify-center gap-2 min-h-10 rounded-ctl-sm border-2 border-ink/15 bg-white px-4 py-2 text-[12px] font-bold text-ink hover:border-ink hover:bg-surface disabled:opacity-50 cursor-pointer transition-colors';
export const adminDanger = 'inline-flex items-center justify-center gap-2 min-h-10 rounded-ctl-sm border-2 border-[#B4232A] bg-[#FDE2E2] px-4 py-2 text-[12px] font-bold text-[#9A1C24] hover:bg-[#FAD4D5] cursor-pointer transition-colors';

export function useAdminTab(count: number) {
  const [tab, setTab] = useState(0);
  useEffect(() => {
    const onTab = (event: Event) => {
      const index = Number((event as CustomEvent).detail);
      if (Number.isInteger(index) && index >= 0 && index < count) setTab(index);
    };
    window.addEventListener('refsale:admin-tab', onTab);
    return () => window.removeEventListener('refsale:admin-tab', onTab);
  }, [count]);
  return [tab, setTab] as const;
}

/** Closes an admin window or side panel with Escape. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function AdminTitle({ kicker, title, detail, action }: { kicker?: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
    <div><div className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted">{kicker || 'Управление'}</div><h1 className="font-display text-[25px] sm:text-[30px] mt-1">{title}</h1>{detail && <p className="text-[12px] text-muted mt-1">{detail}</p>}</div>
    {action}
  </div>;
}

export function AdminBadge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'green' | 'red' | 'blue' | 'purple' | 'amber' }) {
  const colors = { default: 'bg-surface text-ink border-ink/15', green: 'bg-[#DDF5E5] text-[#13723A] border-[#9ED6B0]', red: 'bg-[#FDE2E2] text-[#B4232A] border-[#F2A9AC]', blue: 'bg-[#DCEBFF] text-[#1B5BB0] border-[#9DC3F0]', purple: 'bg-[#EDE4FF] text-[#6326C9] border-[#C4B0F5]', amber: 'bg-[#FFF1C7] text-[#8A5A00] border-[#F0CF72]' };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] leading-none font-bold ${colors[tone]}`}>{children}</span>;
}

export function AdminEmpty({ children = 'Здесь пока нет данных' }: { children?: React.ReactNode }) {
  return <div className={`${adminCard} p-8 text-center text-[13px] text-muted`}>{children}</div>;
}

export function dateLabel(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function priceLabel(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString('ru-RU')} ₽` : '—';
}
