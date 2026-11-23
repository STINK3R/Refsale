/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, Eye, EyeOff, FileSpreadsheet, LoaderCircle, RotateCcw, Save, Search, Trash2, Upload } from 'lucide-react';
import { adminDownload, adminRequest } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import { adminArea, adminCard, adminDanger, adminInput, adminPrimary, adminSecondary, AdminBadge, AdminEmpty, AdminTitle, priceLabel } from './AdminUi';
import { unescapeHtml } from '../../utils/format';

type Item = { id: number; category_id: number; name: string; brand: string; box_weight: string; packing: string; price_cashless: number | null; price_cash: number | null; price_note: string; price_override: number | null; price: number | null; is_active: boolean; votes: number };
type Cat = { id: number; name: string; markup_percent: number | null; items: Item[] };
type Settings = { vote_enabled: string; vote_markup_default: string; vote_price_basis: string; vote_title: string; vote_intro: string };
type Data = { settings: Settings; categories: Cat[]; voters: number };

/**
 * The product vote: upload a supplier's price list (Excel / Word / CSV), set
 * markups per category, fix single prices by hand, read the results.
 */
export default function AdminVote({ notify }: { notify: AdminNotice }) {
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [sortByVotes, setSortByVotes] = useState(false);
  const load = useCallback(async () => { try { setData(await adminRequest<Data>('/api/admin/vote')); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => {
    const items = data?.categories.flatMap((c) => c.items) || [];
    return { items: items.length, active: items.filter((i) => i.is_active).length, votes: items.reduce((s, i) => s + Number(i.votes || 0), 0) };
  }, [data]);
  if (!data) return <div className="py-16 grid place-items-center"><LoaderCircle className="animate-spin" /></div>;

  const reset = async () => { if (!window.confirm('Обнулить все голоса? Список товаров останется.')) return; try { await adminRequest('/api/admin/vote/reset', { method: 'POST', body: '{}' }); notify('Голоса обнулены'); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const clear = async () => { if (!window.confirm('Удалить весь список товаров и голоса?')) return; try { await adminRequest('/api/admin/vote/clear', { method: 'POST', body: '{}' }); notify('Список очищен'); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const exportCsv = async () => { try { await adminDownload('/api/admin/vote/results.csv', 'vote_results.csv'); } catch (e) { notify((e as Error).message, 'error'); } };
  const query = q.trim().toLowerCase();

  return <>
    <AdminTitle kicker="Голосование" title="Список товаров для голосования" detail={`${totals.active} из ${totals.items} позиций на сайте · ${totals.votes} голосов от ${data.voters} человек`}
      action={<div className="flex gap-2 flex-wrap"><a href="/vote" target="_blank" rel="noreferrer" className={adminSecondary}><Eye size={14} />Открыть на сайте</a><button onClick={() => void exportCsv()} className={adminSecondary}><Download size={14} />Итоги (CSV)</button></div>} />
    <div className="grid lg:grid-cols-2 gap-4 mb-6">
      <ImportCard notify={notify} onDone={load} />
      <SettingsCard settings={data.settings} notify={notify} onSaved={load} />
    </div>
    <div className="flex gap-2 flex-wrap items-center mb-4">
      <label className="relative flex-1 min-w-[240px] max-w-[460px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти позицию" className={`${adminInput} !pl-9`} /></label>
      <label className="flex items-center gap-2 text-[11px] font-bold"><input type="checkbox" checked={sortByVotes} onChange={(e) => setSortByVotes(e.target.checked)} className="accent-primary" />Сначала популярные</label>
      <div className="ml-auto flex gap-2"><button onClick={() => void reset()} className={adminSecondary}><RotateCcw size={14} />Обнулить голоса</button><button onClick={() => void clear()} className={adminDanger}><Trash2 size={14} />Очистить список</button></div>
    </div>
    {data.categories.length === 0 ? <AdminEmpty>Загрузите прайс поставщика — товары появятся здесь и на странице /vote</AdminEmpty>
      : data.categories.map((c) => {
        const items = c.items.filter((i) => !query || `${i.name} ${i.brand}`.toLowerCase().includes(query));
        if (query && !items.length) return null;
        const list = sortByVotes ? [...items].sort((a, b) => b.votes - a.votes) : items;
        return <CategoryBlock key={c.id} cat={c} items={list} defaultMarkup={data.settings.vote_markup_default} notify={notify} onChanged={load} />;
      })}
  </>;
}

function ImportCard({ notify, onDone }: { notify: AdminNotice; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [hide, setHide] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!file) return; setBusy(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('hide_missing', hide ? '1' : '0');
      const r = await adminRequest<{ categories: number; items: number; added: number; updated: number; hidden: number; skipped: number }>('/api/admin/vote/import', { method: 'POST', body: form });
      notify(`Загружено: ${r.items} позиций в ${r.categories} категориях (новых ${r.added}, обновлено ${r.updated}${r.hidden ? `, скрыто ${r.hidden}` : ''})`);
      setFile(null); onDone();
    } catch (err) { notify((err as Error).message, 'error'); }
    setBusy(false);
  };
  return <form onSubmit={submit} className={`${adminCard} p-5`}>
    <div className="flex items-center gap-2"><FileSpreadsheet size={18} /><h2 className="font-display text-[17px]">Загрузить прайс</h2></div>
    <p className="text-[11px] text-muted mt-1">Excel (.xlsx), Word (.docx) или CSV. Колонки: Наименование · Бренд · Вес коробки · Фасовка · Цена безнал · Цена нал. Строка во всю ширину таблицы — название категории. Повторная загрузка обновит цены и сохранит голоса.</p>
    <input type="file" accept=".xlsx,.xlsm,.docx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className={`${adminInput} mt-3 !py-2`} />
    <label className="flex items-center gap-2 text-[11px] font-bold mt-3"><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="accent-primary" />Скрыть позиции, которых нет в новом файле</label>
    <button disabled={!file || busy} className={`${adminPrimary} mt-3`}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}Загрузить</button>
  </form>;
}

function SettingsCard({ settings, notify, onSaved }: { settings: Settings; notify: AdminNotice; onSaved: () => void }) {
  const [form, setForm] = useState({ enabled: settings.vote_enabled === 'true', markup_default: settings.vote_markup_default, price_basis: settings.vote_price_basis, title: unescapeHtml(settings.vote_title), intro: unescapeHtml(settings.vote_intro) });
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await adminRequest('/api/admin/vote/settings', { method: 'PATCH', body: JSON.stringify(form) }); notify('Настройки голосования сохранены'); onSaved(); }
    catch (err) { notify((err as Error).message, 'error'); }
    setBusy(false);
  };
  return <form onSubmit={save} className={`${adminCard} p-5 space-y-3`}>
    <div className="flex items-center gap-3"><h2 className="font-display text-[17px] flex-1">Настройки</h2><label className="flex items-center gap-2 text-[11px] font-bold rounded-full border-2 border-ink px-3 py-1.5 bg-surface"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-primary" />Голосование открыто</label></div>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-[10px] font-bold">Наценка по умолчанию, %<input type="number" step="0.1" value={form.markup_default} onChange={(e) => setForm({ ...form, markup_default: e.target.value })} className={`${adminInput} mt-1`} /></label>
      <label className="text-[10px] font-bold">Считать от цены<select value={form.price_basis} onChange={(e) => setForm({ ...form, price_basis: e.target.value })} className={`${adminInput} mt-1`}><option value="cash">наличными (нал)</option><option value="cashless">безналичной (безнал)</option></select></label>
    </div>
    <label className="block text-[10px] font-bold">Заголовок страницы<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${adminInput} mt-1`} /></label>
    <label className="block text-[10px] font-bold">Текст под заголовком<textarea rows={2} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} className={`${adminArea} mt-1`} /></label>
    <p className="text-[10px] text-muted">Наша цена = цена поставщика + наценка категории (или по умолчанию), округлённая до рубля. Цену любой позиции можно задать вручную.</p>
    <button disabled={busy} className={adminPrimary}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}Сохранить</button>
  </form>;
}

function CategoryBlock({ cat, items, defaultMarkup, notify, onChanged }: { cat: Cat; items: Item[]; defaultMarkup: string; notify: AdminNotice; onChanged: () => void }) {
  const [markup, setMarkup] = useState(cat.markup_percent == null ? '' : String(cat.markup_percent));
  const saveMarkup = async () => {
    try { await adminRequest(`/api/admin/vote/categories/${cat.id}`, { method: 'PATCH', body: JSON.stringify({ markup_percent: markup === '' ? null : Number(markup) }) }); notify(`Наценка «${unescapeHtml(cat.name)}» сохранена`); onChanged(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const remove = async () => { if (!window.confirm(`Удалить категорию «${unescapeHtml(cat.name)}» со всеми позициями и голосами?`)) return; try { await adminRequest(`/api/admin/vote/categories/${cat.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { notify((e as Error).message, 'error'); } };
  return <section className={`${adminCard} mb-5 overflow-hidden`}>
    <header className="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface border-b border-ink/10">
      <h3 className="font-display text-[16px] flex-1 min-w-[200px]">{unescapeHtml(cat.name)} <span className="text-muted text-[12px]">· {cat.items.length}</span></h3>
      <label className="flex items-center gap-2 text-[10px] font-bold">Наценка, %<input type="number" step="0.1" value={markup} placeholder={`${defaultMarkup} (по умолч.)`} onChange={(e) => setMarkup(e.target.value)} className={`${adminInput} !h-9 !w-[130px]`} /></label>
      <button onClick={() => void saveMarkup()} className={`${adminPrimary} !min-h-9 !py-1`}><Save size={13} />Применить</button>
      <button onClick={() => void remove()} className={`${adminDanger} !min-h-9 !px-2`} title="Удалить категорию"><Trash2 size={13} /></button>
    </header>
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[860px]">
        <thead><tr className="text-[9.5px] uppercase tracking-[0.08em] text-muted text-left"><th className="px-4 py-2">Наименование</th><th className="px-2">Вес / фасовка</th><th className="px-2 text-right">Безнал</th><th className="px-2 text-right">Нал</th><th className="px-2 text-right">Наша цена</th><th className="px-2">Своя цена</th><th className="px-2 text-right">Голоса</th><th className="px-4" /></tr></thead>
        <tbody>{items.map((it) => <ItemRow key={it.id} item={it} notify={notify} onChanged={onChanged} />)}</tbody>
      </table>
    </div>
  </section>;
}

function ItemRow({ item, notify, onChanged }: { item: Item; notify: AdminNotice; onChanged: () => void }) {
  const [override, setOverride] = useState(item.price_override == null ? '' : String(item.price_override));
  const patch = async (body: Record<string, unknown>, done?: string) => {
    try { await adminRequest(`/api/admin/vote/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) }); if (done) notify(done); onChanged(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const dirty = override !== (item.price_override == null ? '' : String(item.price_override));
  const remove = async () => { if (!window.confirm(`Удалить «${unescapeHtml(item.name)}»?`)) return; try { await adminRequest(`/api/admin/vote/items/${item.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { notify((e as Error).message, 'error'); } };
  return <tr className={`border-t border-ink/10 ${item.is_active ? '' : 'opacity-50'}`}>
    <td className="px-4 py-2.5"><b className="block">{unescapeHtml(item.name)}</b><span className="text-[10.5px] text-muted">{unescapeHtml(item.brand)}{item.price_note ? ` · ${unescapeHtml(item.price_note)}` : ''}</span></td>
    <td className="px-2 text-muted whitespace-nowrap">{[item.box_weight, item.packing].filter(Boolean).map(unescapeHtml).join(' / ')}</td>
    <td className="px-2 text-right tabular-nums">{item.price_cashless != null ? priceLabel(item.price_cashless) : '—'}</td>
    <td className="px-2 text-right tabular-nums">{item.price_cash != null ? priceLabel(item.price_cash) : '—'}</td>
    <td className="px-2 text-right tabular-nums font-bold">{item.price != null ? priceLabel(item.price) : '—'}{item.price_override != null && <div><AdminBadge tone="amber">вручную</AdminBadge></div>}</td>
    <td className="px-2"><div className="flex gap-1"><input type="number" min="0" step="1" value={override} placeholder="авто" onChange={(e) => setOverride(e.target.value)} className={`${adminInput} !h-8 !w-[90px] !px-2`} />{dirty && <button onClick={() => void patch({ price_override: override === '' ? null : Number(override) }, 'Цена сохранена')} className={`${adminPrimary} !min-h-8 !px-2 !py-0`} aria-label="Сохранить цену"><Save size={12} /></button>}</div></td>
    <td className="px-2 text-right tabular-nums font-bold">{item.votes}</td>
    <td className="px-4"><div className="flex gap-1 justify-end"><button onClick={() => void patch({ is_active: !item.is_active })} className={`${adminSecondary} !min-h-8 !px-2`} title={item.is_active ? 'Скрыть с сайта' : 'Показать на сайте'}>{item.is_active ? <Eye size={13} /> : <EyeOff size={13} />}</button><button onClick={() => void remove()} className={`${adminDanger} !min-h-8 !px-2`} title="Удалить"><Trash2 size={13} /></button></div></td>
  </tr>;
}
