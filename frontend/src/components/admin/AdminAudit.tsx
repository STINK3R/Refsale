/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, Search, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { adminRequest } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import { adminCard, adminInput, adminSecondary, AdminBadge, AdminEmpty, AdminTitle, dateLabel } from './AdminUi';

type Entry = {
  id: number; admin_id: number; admin_username: string; admin_name: string; action: string; action_label: string;
  entity: string; entity_id: string; method: string; path: string; status_code: number; ip: string; user_agent: string; created_at: string;
  details: Record<string, unknown> | null; snapshot: Record<string, unknown> | null;
};
type AdminStat = { admin_username: string; admin_name: string; admin_id: number; actions: number; deletions: number; failed: number; first_at: string; last_at: string };

const ENTITIES: Record<string, string> = {
  review: 'Отзывы', product: 'Товары', product_image: 'Фото товаров', category: 'Категории', subcategory: 'Подкатегории', user: 'Покупатели',
  admin: 'Администраторы', forum_post: 'Форум', forum: 'Форумы', support_message: 'Сообщения обращений', support_ticket: 'Обращения',
  order_message: 'Сообщения в чатах заказов', order: 'Заказы', promo: 'Промокоды', settings: 'Настройки', file: 'Файлы', news: 'Новости',
  news_comment: 'Комментарии к новостям', compare_shop: 'Магазины сравнения', vote: 'Голосование', vote_category: 'Категории голосования',
  vote_item: 'Позиции голосования', auth: 'Входы', seo: 'SEO',
};
const PAGE = 50;

/**
 * The owner's register of what every admin did: who, when, from where, what
 * exactly — and, for edits and deletions, the record as it was before. For
 * settling disputes ("кто удалил отзыв?") and looking at one person's work.
 */
export default function AdminAudit({ notify }: { notify: AdminNotice }) {
  const [stats, setStats] = useState<AdminStat[]>([]);
  const [days, setDays] = useState(30);
  const [filters, setFilters] = useState({ admin: '', entity: '', kind: '', from: '', to: '', q: '' });
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 350); return () => clearTimeout(t); }, [query]);
  useEffect(() => { adminRequest<{ admins: AdminStat[] }>(`/api/admin/audit/summary?days=${days}`).then((r) => setStats(r.admins)).catch((e) => notify((e as Error).message, 'error')); }, [days, notify]);
  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    try { const r = await adminRequest<{ items: Entry[]; total: number }>(`/api/admin/audit?${qs}`); setItems(r.items); setTotal(r.total); }
    catch (e) { notify((e as Error).message, 'error'); }
    setLoading(false);
  }, [filters, offset, notify]);
  useEffect(() => { void load(); }, [load]);
  const set = (key: keyof typeof filters, value: string) => { setOffset(0); setFilters((f) => ({ ...f, [key]: value })); };

  return <>
    <AdminTitle kicker="Только для владельца" title="Реестр действий админов" detail="Все изменения через админку: кто, когда, с какого адреса и что именно. У удалений и правок сохранено, как запись выглядела до изменения." />

    <div className="flex items-center gap-2 mb-3"><b className="text-[12px]">Активность за</b>{[7, 30, 90, 365].map((d) => <button key={d} onClick={() => setDays(d)} className={`admin-tab ${days === d ? 'admin-tab-active' : ''}`}>{d} дн.</button>)}</div>
    {stats.length === 0 ? <AdminEmpty>За этот период действий нет</AdminEmpty> : <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-7">
      {stats.map((s) => <button key={s.admin_username} onClick={() => set('admin', filters.admin === s.admin_username ? '' : s.admin_username)} className={`${adminCard} p-4 text-left cursor-pointer transition-transform hover:-translate-y-0.5 ${filters.admin === s.admin_username ? 'ring-4 ring-sun' : ''}`}>
        <div className="flex items-center gap-2.5"><span className="w-9 h-9 rounded-full bg-sun border-2 border-ink grid place-items-center"><UserRound size={16} /></span><div className="min-w-0"><b className="block truncate">{s.admin_name || s.admin_username}</b><span className="text-[10px] text-muted">@{s.admin_username}{s.admin_id === 0 && s.admin_username === 'admin' ? ' · владелец' : ''}</span></div></div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div><div className="font-display text-[20px]">{s.actions}</div><div className="text-[9.5px] text-muted uppercase tracking-wide">действий</div></div>
          <div><div className={`font-display text-[20px] ${s.deletions ? 'text-[#B4232A]' : ''}`}>{s.deletions}</div><div className="text-[9.5px] text-muted uppercase tracking-wide">удалений</div></div>
          <div><div className="font-display text-[20px]">{s.failed}</div><div className="text-[9.5px] text-muted uppercase tracking-wide">ошибок</div></div>
        </div>
        <div className="text-[10px] text-muted mt-2">Последнее: {dateLabel(s.last_at)}</div>
      </button>)}
    </div>}

    <div className={`${adminCard} p-3 mb-4 grid gap-2 md:grid-cols-[1.3fr_1fr_1fr_1fr_140px_140px]`}>
      <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: текст отзыва, id, имя…" className={`${adminInput} !pl-9 !h-10`} /></label>
      <select value={filters.admin} onChange={(e) => set('admin', e.target.value)} className={`${adminInput} !h-10`} aria-label="Администратор"><option value="">Все админы</option>{stats.map((s) => <option key={s.admin_username} value={s.admin_username}>{s.admin_name || s.admin_username}</option>)}</select>
      <select value={filters.entity} onChange={(e) => set('entity', e.target.value)} className={`${adminInput} !h-10`} aria-label="Раздел"><option value="">Все разделы</option>{Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={filters.kind} onChange={(e) => set('kind', e.target.value)} className={`${adminInput} !h-10`} aria-label="Тип"><option value="">Все действия</option><option value="delete">Только удаления</option><option value="failed">Неудачные</option><option value="auth">Входы в админку</option></select>
      <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} className={`${adminInput} !h-10`} aria-label="С даты" />
      <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} className={`${adminInput} !h-10`} aria-label="По дату" />
    </div>

    {loading ? <div className="py-14 grid place-items-center"><LoaderCircle className="animate-spin" /></div>
      : items.length === 0 ? <AdminEmpty>Записей не найдено</AdminEmpty>
        : <div className={`${adminCard} overflow-hidden`}>
          <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[760px]">
            <thead><tr className="bg-surface text-left text-[9.5px] uppercase tracking-[0.1em] text-muted"><th className="w-8" /><th className="px-3 py-2.5">Когда</th><th className="px-3">Кто</th><th className="px-3">Действие</th><th className="px-3">Запись</th><th className="px-3">IP</th></tr></thead>
            <tbody>{items.map((e) => <Fragment key={e.id}>
              <tr onClick={() => setOpen(open === e.id ? null : e.id)} className={`border-t border-ink/10 cursor-pointer hover:bg-surface/60 ${e.method === 'DELETE' ? 'bg-[#FDE2E2]/40' : ''}`}>
                <td className="pl-3 text-muted">{open === e.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{dateLabel(e.created_at)}</td>
                <td className="px-3"><b>{e.admin_name || e.admin_username}</b><span className="text-muted text-[10px]"> @{e.admin_username}</span></td>
                <td className="px-3"><span className="inline-flex items-center gap-1.5">{e.method === 'DELETE' && <Trash2 size={12} className="text-[#B4232A]" />}{e.action.startsWith('auth.failed') && <ShieldAlert size={12} className="text-[#B4232A]" />}{e.action_label}</span>{e.status_code >= 400 && <> <AdminBadge tone="red">не выполнено · {e.status_code}</AdminBadge></>}</td>
                <td className="px-3 text-muted">{ENTITIES[e.entity] || e.entity}{e.entity_id ? ` #${e.entity_id}` : ''}</td>
                <td className="px-3 text-muted tabular-nums">{e.ip}</td>
              </tr>
              {open === e.id && <tr className="bg-surface/40"><td colSpan={6} className="px-5 py-4"><EntryDetails entry={e} /></td></tr>}
            </Fragment>)}</tbody>
          </table></div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-ink/10 text-[11px]">
            <span className="text-muted">{offset + 1}–{Math.min(offset + PAGE, total)} из {total}</span>
            <div className="flex gap-2"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className={`${adminSecondary} !min-h-8`}>Назад</button><button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className={`${adminSecondary} !min-h-8`}>Дальше</button></div>
          </div>
        </div>}
  </>;
}

/** The request and, for edits and deletions, the record as it was before. */
function EntryDetails({ entry }: { entry: Entry }) {
  const body = (entry.details?.body ?? entry.details?.form) as Record<string, unknown> | undefined;
  const snapshot = entry.snapshot;
  return <div className="grid lg:grid-cols-2 gap-4">
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted mb-1.5">Запрос</div>
      <div className="text-[11px] font-mono break-all text-muted mb-2">{entry.method} {entry.path}</div>
      {body && typeof body === 'object' ? <KeyValues data={body} /> : <div className="text-[11px] text-muted">Без данных</div>}
      {Array.isArray(entry.details?.files) && <div className="text-[11px] mt-2">Файлы: {(entry.details?.files as string[]).join(', ')}</div>}
      {typeof entry.details?.result_url === 'string' && <a href={entry.details.result_url as string} target="_blank" rel="noreferrer" className="text-[11px] underline">Загруженный файл</a>}
      {typeof entry.details?.error === 'string' && <div className="text-[11px] text-[#B4232A] mt-2">Ошибка: {entry.details.error as string}</div>}
      <div className="text-[10px] text-muted mt-3 break-all">Браузер: {entry.user_agent || '—'}</div>
    </div>
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted mb-1.5">{entry.method === 'DELETE' ? 'Что было удалено' : 'Как было до изменения'}</div>
      {snapshot ? <KeyValues data={snapshot} /> : <div className="text-[11px] text-muted">Не сохраняется для этого действия</div>}
    </div>
  </div>;
}

function KeyValues({ data }: { data: Record<string, unknown> }) {
  const rows = Object.entries(data).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
  if (!rows.length) return <div className="text-[11px] text-muted">Пусто</div>;
  return <dl className="rounded-ctl-sm bg-card border border-ink/10 divide-y divide-ink/5 text-[11.5px]">
    {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 px-3 py-1.5">
      <dt className="text-muted break-all">{k}</dt>
      <dd className="break-words whitespace-pre-wrap">{typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}</dd>
    </div>)}
  </dl>;
}
