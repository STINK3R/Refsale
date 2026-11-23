/* eslint-disable react-hooks/set-state-in-effect -- These effects start async API reads; state changes follow awaited responses. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Download, ExternalLink, ImagePlus, LoaderCircle, Plus, Save, ShieldCheck, Store, Trash2, UserRound, X } from 'lucide-react';
import { adminDownload, adminRequest, adminUpload } from '../../api/adminClient';
import type { AdminNotice } from './AdminApp';
import { adminCard, adminDanger, adminInput, adminArea, adminPrimary, adminSecondary, AdminBadge, AdminEmpty, AdminTitle, dateLabel, priceLabel, useAdminTab, useEscape } from './AdminUi';
import type { Category, Product, ProductImage, ProductVariant, Review, Subcategory, User } from '../../types';
import Avatar from '../ui/Avatar';
import { unescapeHtml } from '../../utils/format';

const TABS = ['Товары', 'От поставщиков', 'Категории', 'Покупатели', 'Отзывы', 'Администраторы'];
type ProductRow = Product & { moderation?: string; moderation_note?: string; supplier_name?: string; seller_id?: number };
type AdminData = { categories: Category[]; products: ProductRow[]; users: User[]; admins: Array<{ id: number; username: string; display_name: string }>; };

export default function AdminCatalog({ notify }: { notify: AdminNotice }) {
  const [tab] = useAdminTab(TABS.length);
  return <>
    {tab === 0 ? <ProductsPanel notify={notify} /> : tab === 1 ? <SupplierModeration notify={notify} /> : tab === 2 ? <CategoriesPanel notify={notify} /> : tab === 3 ? <UsersPanel notify={notify} /> : tab === 4 ? <ReviewsPanel notify={notify} /> : <AdminsPanel notify={notify} />}
  </>;
}

function ProductsPanel({ notify }: { notify: AdminNotice }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ProductRow | null | false>(false);
  const load = useCallback(async () => {
    try {
      const [d, sc] = await Promise.all([adminRequest<AdminData>('/api/admin/data'), adminRequest<Subcategory[]>('/api/subcategories')]);
      setProducts(d.products || []); setCategories(d.categories || []); setSubs(sc || []);
    } catch (e) { notify((e as Error).message, 'error'); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => { const x = q.toLocaleLowerCase('ru-RU'); return products.filter((p) => !x || p.name.toLocaleLowerCase('ru-RU').includes(x)); }, [products, q]);
  const remove = async (p: ProductRow) => {
    if (!window.confirm(`Удалить товар «${p.name}»?`)) return;
    try { await adminRequest(`/api/admin/products/${p.id}`, { method: 'DELETE' }); notify('Товар удалён'); await load(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  return <>
    <div className="flex gap-3 flex-wrap mb-4"><input value={q} onChange={(e) => setQ(e.target.value)} className={`${adminInput} max-w-[460px]`} placeholder="Найти товар" /><button onClick={() => setEditing(null)} className={adminPrimary}><Plus size={15} />Добавить товар</button></div>
    {shown.length === 0 ? <AdminEmpty>Товары не найдены</AdminEmpty> : <div className={`${adminCard} overflow-hidden`}>
      <div className="grid grid-cols-[52px_minmax(0,1.5fr)_1fr_110px_100px] gap-3 px-4 py-3 bg-surface text-[10px] uppercase tracking-[.1em] font-bold text-muted max-sm:hidden"><span /><span>Название</span><span>Категория</span><span>Цена</span><span /></div>
      {shown.map((p) => <div key={p.id} className="grid grid-cols-[52px_minmax(0,1.5fr)_1fr_110px_100px] max-sm:grid-cols-[46px_minmax(0,1fr)_auto] gap-3 px-4 py-3 border-t border-ink/10 items-center">
        {p.image_url ? <img src={p.image_url} alt="" className="w-11 h-11 object-contain rounded-ctl-xs bg-surface border border-ink/10" /> : <div className="w-11 h-11 bg-surface rounded-ctl-xs" />}
        <div className="min-w-0"><b className="block text-[12px] truncate">{p.name}</b><span className="text-[10px] text-muted">{p.supplier_name ? `Поставщик: ${p.supplier_name}` : `ID ${p.id}`}{p.moderation === 'pending' && <AdminBadge tone="amber">На проверке</AdminBadge>}</span></div>
        <span className="text-[11px] text-muted truncate max-sm:hidden">{categories.find((c) => c.id === p.category_id)?.name || '—'}</span><b className="text-[12px] max-sm:hidden">{priceLabel(p.price)}</b>
        <div className="flex gap-1 justify-end"><button onClick={() => setEditing(p)} className={adminSecondary}>Изменить</button><button onClick={() => void remove(p)} className={`${adminDanger} !px-2`} aria-label="Удалить"><Trash2 size={14} /></button></div>
      </div>)}
    </div>}
    {editing !== false && <ProductEditor product={editing} categories={categories} subcategories={subs} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await load(); }} notify={notify} />}
  </>;
}

type CompareShop = { id: number; name: string; site_url?: string };
type PendingPhoto = { file: File; preview: string };

function ProductEditor({ product, categories, subcategories, onClose, onSaved, notify }: { product: ProductRow | null; categories: Category[]; subcategories: Subcategory[]; onClose: () => void; onSaved: () => void; notify: AdminNotice }) {
  const [form, setForm] = useState({
    name: product?.name || '', description: product?.description || '', price: String(product?.price ?? ''), promo_price: String(product?.promo_price ?? ''),
    compare_price_1: String(product?.compare_price_1 ?? ''), compare_price_2: String(product?.compare_price_2 ?? ''),
    compare_shop_1: product?.compare_shop_1 || '', compare_shop_2: product?.compare_shop_2 || '',
    compare_url_1: product?.compare_url_1 || '', compare_url_2: product?.compare_url_2 || '',
    category_id: String(product?.category_id || ''), subcategory_id: String(product?.subcategory_id || ''),
    badge: product?.badge || '', is_available: product?.is_available !== false, is_adult: !!product?.is_adult, requires_variant: !!product?.requires_variant,
  });
  // A new product has no id yet: its photos wait here and go up once it is saved
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [removeBg, setRemoveBg] = useState(true);
  const [shops, setShops] = useState<CompareShop[]>([]);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const loadShops = useCallback(async () => { try { setShops(await adminRequest<CompareShop[]>('/api/compare-shops')); } catch { /* the names can still be typed */ } }, []);
  useEffect(() => { void loadShops(); }, [loadShops]);
  const addShop = async (slot: 1 | 2) => {
    const name = window.prompt('Название магазина для сравнения, например «ВкусВилл»')?.trim();
    if (!name) return;
    try { await adminRequest('/api/admin/compare-shops', { method: 'POST', body: JSON.stringify({ name }) }); await loadShops(); update(`compare_shop_${slot}`, name); notify(`Магазин «${name}» добавлен`); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const num = (v: string) => (v ? Number(v) : null);
      const body = { ...form, price: num(form.price), promo_price: num(form.promo_price), compare_price_1: num(form.compare_price_1), compare_price_2: num(form.compare_price_2), category_id: num(form.category_id), subcategory_id: num(form.subcategory_id) };
      let saved: ProductRow;
      if (product) saved = await adminRequest<ProductRow>(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else saved = await adminRequest<ProductRow>('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
      if (pending.length) {
        const failed = await uploadProductPhotos(saved.id, pending.map((p) => p.file), removeBg, 0);
        pending.forEach((p) => URL.revokeObjectURL(p.preview));
        if (failed) notify(`Не загрузилось фото: ${failed}`, 'error');
      }
      notify(product ? 'Товар обновлён' : 'Товар создан'); onSaved();
    } catch (err) { notify((err as Error).message, 'error'); }
    setBusy(false);
  };
  const subs = subcategories.filter((s) => String(s.category_id) === form.category_id);
  const category = categories.find((c) => String(c.id) === form.category_id);
  return <Modal title={product ? 'Редактирование товара' : 'Новый товар'} onClose={onClose}>
    <form onSubmit={save} className="space-y-3">
      <label className="block text-[10px] font-bold">Название<input required value={form.name} onChange={(e) => update('name', e.target.value)} className={`${adminInput} mt-1`} /></label>
      <label className="block text-[10px] font-bold">Описание<textarea rows={4} value={form.description} onChange={(e) => update('description', e.target.value)} className={`${adminArea} mt-1`} /></label>
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-[10px] font-bold">Категория<select value={form.category_id} onChange={(e) => { update('category_id', e.target.value); update('subcategory_id', ''); }} className={`${adminInput} mt-1`}><option value="">Без категории</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-[10px] font-bold">Подкатегория<select value={form.subcategory_id} onChange={(e) => update('subcategory_id', e.target.value)} className={`${adminInput} mt-1`}><option value="">Без подкатегории</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
      <div className="grid sm:grid-cols-2 gap-3">{[['price', 'Цена, ₽'], ['promo_price', 'По промокоду, ₽']].map(([k, label]) => <label key={k} className="text-[10px] font-bold">{label}<input type="number" min="0" step="0.01" value={form[k as keyof typeof form] as string} onChange={(e) => update(k as keyof typeof form, e.target.value)} className={`${adminInput} mt-1`} /></label>)}</div>

      {/* One line for photos: pick files, the background goes, the result can be downloaded */}
      <PhotoRow productId={product?.id ?? null} pending={pending} setPending={setPending} removeBg={removeBg} setRemoveBg={setRemoveBg} notify={notify} />

      <section className="rounded-ctl-md bg-surface/55 p-3 space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap"><b className="text-[11px]">Цены в других магазинах</b><span className="text-[10px] text-muted">название магазина на сайте станет ссылкой на товар</span></div>
        {([1, 2] as const).map((slot) => {
          const shopKey = `compare_shop_${slot}` as const; const urlKey = `compare_url_${slot}` as const; const priceKey = `compare_price_${slot}` as const;
          const fallback = (slot === 1 ? category?.compare_label_1 : category?.compare_label_2) || (slot === 1 ? 'Золотое Яблоко' : 'Рандеву');
          const known = shops.some((x) => x.name === form[shopKey]);
          return <div key={slot} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_96px] max-sm:grid-cols-[minmax(0,1fr)_96px] gap-2 items-end">
            <label className="text-[10px] font-bold min-w-0">Магазин {slot}
              <select value={form[shopKey]} onChange={(e) => { if (e.target.value === '__new') { void addShop(slot); return; } update(shopKey, e.target.value); }} className={`${adminInput} mt-1 !h-10`}>
                <option value="">Как в категории · {fallback}</option>
                {shops.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
                {!known && form[shopKey] && <option value={form[shopKey]}>{form[shopKey]}</option>}
                <option value="__new">+ Новый магазин…</option>
              </select>
            </label>
            <label className="text-[10px] font-bold min-w-0 max-sm:col-span-2 max-sm:order-3">Ссылка на товар в магазине
              <input type="url" inputMode="url" value={form[urlKey]} onChange={(e) => update(urlKey, e.target.value)} placeholder="https://vkusvill.ru/goods/…" className={`${adminInput} mt-1 !h-10`} />
            </label>
            <label className="text-[10px] font-bold">Цена, ₽<input type="number" min="0" step="0.01" value={form[priceKey]} onChange={(e) => update(priceKey, e.target.value)} className={`${adminInput} mt-1 !h-10`} /></label>
          </div>;
        })}
      </section>

      <label className="block text-[10px] font-bold">Плашка<input value={form.badge} onChange={(e) => update('badge', e.target.value)} className={`${adminInput} mt-1`} placeholder="Например, Хит" /></label>
      <div className="flex flex-wrap gap-4 text-[11px] font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={form.is_available} onChange={(e) => update('is_available', e.target.checked)} className="accent-primary" />В наличии</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.is_adult} onChange={(e) => update('is_adult', e.target.checked)} className="accent-primary" />18+</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.requires_variant} onChange={(e) => update('requires_variant', e.target.checked)} className="accent-primary" />Обязателен вариант</label></div>
      {product && <ProductVariants productId={product.id} notify={notify} />}
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className={adminSecondary}>Отмена</button><button disabled={busy} className={adminPrimary}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Сохранить</button></div>
    </form>
  </Modal>;
}

/** Uploads photos into a product; returns the names that failed, if any. */
async function uploadProductPhotos(productId: number, files: File[], removeBg: boolean, already: number): Promise<string> {
  const failed: string[] = [];
  for (const file of files.slice(0, Math.max(0, 7 - already))) {
    try {
      const { url } = await adminUpload(file, 'product', { removeBg });
      await adminRequest(`/api/admin/products/${productId}/images`, { method: 'POST', body: JSON.stringify({ url }) });
    } catch { failed.push(file.name); }
  }
  return failed.join(', ');
}

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';

function PhotoRow({ productId, pending, setPending, removeBg, setRemoveBg, notify }: {
  productId: number | null; pending: PendingPhoto[]; setPending: (f: (p: PendingPhoto[]) => PendingPhoto[]) => void;
  removeBg: boolean; setRemoveBg: (v: boolean) => void; notify: AdminNotice;
}) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { if (!productId) return; try { setImages(await adminRequest<ProductImage[]>(`/api/admin/products/${productId}/images`)); } catch (e) { notify((e as Error).message, 'error'); } }, [productId, notify]);
  useEffect(() => { void load(); }, [load]);
  const count = images.length + pending.length;
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 7 - count)); e.target.value = '';
    if (!files.length) return;
    if (!productId) { setPending((p) => [...p, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))]); return; }
    setBusy(true);
    const failed = await uploadProductPhotos(productId, files, removeBg, images.length);
    if (failed) notify(`Не загрузилось: ${failed}`, 'error'); else notify(removeBg ? 'Фото загружены, фон убран' : 'Фото загружены');
    await load(); setBusy(false);
  };
  const setMain = async (image: ProductImage) => { try { await adminRequest(`/api/admin/product-images/${image.id}/set-main`, { method: 'POST', body: '{}' }); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const remove = async (image: ProductImage) => { if (!window.confirm('Удалить фотографию товара?')) return; try { await adminRequest(`/api/admin/product-images/${image.id}`, { method: 'DELETE' }); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const zip = async () => { try { await adminDownload(`/api/admin/products/${productId}/images.zip`, `product_${productId}_photos.zip`); } catch (e) { notify((e as Error).message, 'error'); } };
  const unqueue = (p: PendingPhoto) => { URL.revokeObjectURL(p.preview); setPending((all) => all.filter((x) => x !== p)); };
  return <section className="rounded-ctl-md bg-surface/55 p-3">
    <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
      <b className="text-[11px]">Фото товара · {count}/7</b>
      <label className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer" title="Фон вырезается автоматически, фото сохраняется в PNG на прозрачном фоне">
        <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="accent-primary" />Убрать фон (PNG)
      </label>
      <div className="ml-auto flex gap-2">
        {productId && images.length > 0 && <button type="button" onClick={() => void zip()} className={`${adminSecondary} !min-h-8 !py-1`} title="Скачать все фото одним архивом"><Download size={13} />Все (ZIP)</button>}
        <label className={`${adminPrimary} !min-h-8 !py-1 cursor-pointer ${busy || count >= 7 ? 'opacity-50 pointer-events-none' : ''}`}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <ImagePlus size={13} />}{busy ? (removeBg ? 'Убираем фон…' : 'Загрузка…') : 'Загрузить фото'}
          <input type="file" accept={PHOTO_TYPES} multiple onChange={(e) => void pick(e)} className="hidden" disabled={busy || count >= 7} />
        </label>
      </div>
    </div>
    {count === 0 ? <p className="text-[10px] text-muted mt-2">Можно выбрать несколько файлов сразу. Первое фото станет обложкой — звёздочкой её можно сменить.</p> : <div className="flex flex-wrap gap-2 mt-2">
      {images.map((image) => <div key={image.id} className="relative w-[72px] h-[72px] rounded-ctl-xs border border-ink/15 overflow-hidden admin-checker">
        <img src={image.url} alt="" className="w-full h-full object-contain" />
        <button type="button" onClick={() => void setMain(image)} className={`absolute left-1 bottom-1 px-1 rounded text-[9px] font-bold ${image.is_main ? 'bg-sun text-ink' : 'bg-white/90 text-ink'}`} title={image.is_main ? 'Обложка' : 'Сделать обложкой'}>{image.is_main ? '★' : '☆'}</button>
        <a href={image.url} download className="absolute right-1 bottom-1 w-5 h-5 rounded-full bg-white/90 text-ink grid place-items-center" title="Скачать фото" aria-label="Скачать фото"><Download size={11} /></a>
        <button type="button" onClick={() => void remove(image)} className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-ink/65 text-white grid place-items-center" aria-label="Удалить фото"><X size={10} /></button>
      </div>)}
      {pending.map((p, i) => <div key={p.preview} className="relative w-[72px] h-[72px] rounded-ctl-xs border border-dashed border-ink/30 overflow-hidden bg-white">
        <img src={p.preview} alt="" className="w-full h-full object-contain opacity-80" />
        <span className="absolute left-1 bottom-1 px-1 rounded bg-white/90 text-[8.5px] font-bold">{i === 0 && images.length === 0 ? 'обложка' : 'ждёт'}</span>
        <button type="button" onClick={() => unqueue(p)} className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-ink/65 text-white grid place-items-center" aria-label="Убрать фото"><X size={10} /></button>
      </div>)}
    </div>}
    {!productId && pending.length > 0 && <p className="text-[10px] text-muted mt-2">Фото загрузятся{removeBg ? ' и очистятся от фона' : ''} после сохранения товара.</p>}
  </section>;
}

function ProductVariants({ productId, notify }: { productId: number; notify: AdminNotice }) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setVariants(await adminRequest<ProductVariant[]>(`/api/admin/store/products/${productId}/variants`)); } catch (e) { notify((e as Error).message, 'error'); } }, [productId, notify]);
  useEffect(() => { void load(); }, [load]);
  const change = (i: number, key: keyof ProductVariant, value: string | number | boolean | null) => setVariants((rows) => rows.map((row, index) => index === i ? { ...row, [key]: value } : row));
  const add = () => setVariants((rows) => [...rows, { id: 0, label: '', price: 0, promo_price: null, compare_price_1: null, compare_price_2: null, is_available: true }]);
  const save = async () => { setBusy(true); try { await adminRequest(`/api/admin/store/products/${productId}/variants`, { method: 'PUT', body: JSON.stringify({ variants }) }); notify('Варианты товара сохранены'); await load(); } catch (e) { notify((e as Error).message, 'error'); } setBusy(false); };
  return <section className="rounded-ctl-md bg-surface/55 p-3"><div className="flex items-center gap-3 mb-2"><b className="text-[11px]">Варианты и объёмы</b><button type="button" onClick={add} className={`${adminSecondary} ml-auto !min-h-8 !py-1`}><Plus size={13} />Добавить</button></div>{variants.length === 0 ? <div className="text-[10px] text-muted">Вариантов пока нет.</div> : <div className="space-y-2">{variants.map((v, i) => <div key={v.id || `new-${i}`} className="grid grid-cols-[1fr_85px_85px_25px] gap-2 items-center"><input value={v.label} onChange={(e) => change(i, 'label', e.target.value)} placeholder="50 мл" className={`${adminInput} !h-9`} /><input type="number" value={v.price || ''} onChange={(e) => change(i, 'price', Number(e.target.value))} placeholder="Цена" className={`${adminInput} !h-9`} /><input type="number" value={v.promo_price ?? ''} onChange={(e) => change(i, 'promo_price', e.target.value ? Number(e.target.value) : null)} placeholder="Промо" className={`${adminInput} !h-9`} /><button type="button" onClick={() => setVariants((rows) => rows.filter((_, n) => n !== i))} aria-label="Удалить вариант"><X size={15} /></button></div>)}</div>}<button type="button" disabled={busy} onClick={() => void save()} className={`${adminPrimary} mt-2 !min-h-8 !py-1`}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}Сохранить варианты</button></section>;
}

function SupplierModeration({ notify }: { notify: AdminNotice }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const load = useCallback(async () => { try { setProducts(await adminRequest<ProductRow[]>('/api/admin/store/supplier-products?status=pending')); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const moderate = async (p: ProductRow, decision: 'approve' | 'reject') => {
    const note = notes[p.id] || '';
    if (decision === 'reject' && !note.trim()) { notify('Добавьте пояснение для поставщика', 'error'); return; }
    try { await adminRequest(`/api/admin/store/supplier-products/${p.id}/moderate`, { method: 'POST', body: JSON.stringify({ decision, note }) }); notify(decision === 'approve' ? 'Товар опубликован' : 'Товар отправлен на доработку'); await load(); }
    catch (e) { notify((e as Error).message, 'error'); }
  };
  return <>
    <AdminTitle title="Проверка товаров поставщиков" detail="После одобрения товар появляется в каталоге. При возврате укажите, что поправить." />
    {products.length === 0 ? <AdminEmpty>Новых товаров на проверке нет</AdminEmpty> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{products.map((p) => <article key={p.id} className={`${adminCard} overflow-hidden`}>
      <div className="aspect-[4/3] bg-surface border-b-2 border-ink grid place-items-center">{p.image_url ? <img src={p.image_url} alt="" className="max-w-full max-h-full object-contain p-4" /> : <ImagePlus size={30} className="text-muted/50" />}</div>
      <div className="p-4"><div className="text-[10px] uppercase font-bold tracking-wider text-muted">{p.supplier_name || 'Поставщик'} · #{p.id}</div><h3 className="font-display text-[17px] mt-1">{p.name}</h3><p className="text-[12px] text-muted mt-2 line-clamp-4">{p.description}</p><div className="font-bold mt-3">{priceLabel(p.price)}{p.compare_price_1 ? <span className="ml-2 text-[11px] text-muted">сравнение {priceLabel(p.compare_price_1)}</span> : null}</div><textarea rows={2} value={notes[p.id] || ''} onChange={(e) => setNotes((x) => ({ ...x, [p.id]: e.target.value }))} className={`${adminArea} mt-3`} placeholder="Пояснение, если отправляете на доработку" /><div className="flex gap-2 mt-3"><button onClick={() => void moderate(p, 'approve')} className={`${adminPrimary} flex-1`}><ShieldCheck size={15} />Одобрить</button><button onClick={() => void moderate(p, 'reject')} className={`${adminDanger} flex-1`}>Вернуть</button></div></div>
    </article>)}</div>}
  </>;
}

function CategoriesPanel({ notify }: { notify: AdminNotice }) {
  const [data, setData] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [editing, setEditing] = useState<Category | null | false>(false);
  const [subForm, setSubForm] = useState({ id: 0, category_id: '', name: '', description: '', image: '', accent_color: '', slogan: '', is_brand: false });
  const [creatingSub, setCreatingSub] = useState(false);
  const load = useCallback(async () => { try { const [d, sc] = await Promise.all([adminRequest<AdminData>('/api/admin/data'), adminRequest<Subcategory[]>('/api/subcategories')]); setData(d.categories || []); setSubs(sc || []); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const saveSub = async (e: FormEvent) => { e.preventDefault(); try { const body = { ...subForm, category_id: Number(subForm.category_id) }; await adminRequest(subForm.id ? `/api/admin/subcategories/${subForm.id}` : '/api/admin/subcategories', { method: subForm.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }); setCreatingSub(false); setSubForm({ id: 0, category_id: '', name: '', description: '', image: '', accent_color: '', slogan: '', is_brand: false }); notify('Подкатегория сохранена'); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const deleteSub = async (id: number) => { if (!window.confirm('Удалить подкатегорию?')) return; try { await adminRequest(`/api/admin/subcategories/${id}`, { method: 'DELETE' }); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  return <>
    <AdminTitle title="Категории и подкатегории" detail="Для категории — обложка и описание; для подкатегории/бренда — логотип, цвет, слоган и текст." action={<button onClick={() => setEditing(null)} className={adminPrimary}><Plus size={15} />Категория</button>} />
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{data.map((c) => <div key={c.id} className={`${adminCard} p-4 min-w-0`}><div className="flex gap-3 items-start"><div className="flex-1 min-w-0"><div className="font-display text-[18px] break-words">{c.name}</div><div className="text-[11px] text-muted">{c.description}</div></div><button onClick={() => setEditing(c)} className={adminSecondary}>Изменить</button><button onClick={async () => { if (!window.confirm(`Удалить категорию «${c.name}»?`)) return; try { await adminRequest(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); await load(); } catch (e) { notify((e as Error).message, 'error'); } }} className={`${adminDanger} !px-2`}><Trash2 size={14} /></button></div>
      <div className="mt-4 space-y-2">{subs.filter((s) => s.category_id === c.id).map((s) => <div key={s.id} className="flex gap-2 items-center rounded-ctl-sm bg-surface/55 px-3 py-2 min-w-0">{s.image && <img src={s.image} alt="" className="w-8 h-8 object-contain rounded-full bg-white" />}<div className="flex-1 min-w-0"><b className="text-[12px]">{s.name}</b><div className="text-[10px] text-muted truncate">{s.is_brand ? 'Бренд' : 'Подкатегория'} · {s.description || s.slogan || 'без описания'}</div></div><button onClick={() => { setSubForm({ id: s.id, category_id: String(s.category_id), name: s.name, description: s.description || '', image: s.image || '', accent_color: s.accent_color || '', slogan: s.slogan || '', is_brand: !!s.is_brand }); setCreatingSub(true); }} className={adminSecondary}>Изменить</button><button onClick={() => void deleteSub(s.id)} className={`${adminDanger} !px-2`} aria-label="Удалить"><Trash2 size={13} /></button></div>)}</div>
      <button onClick={() => { setSubForm({ id: 0, category_id: String(c.id), name: '', description: '', image: '', accent_color: '', slogan: '', is_brand: false }); setCreatingSub(true); }} className={`${adminSecondary} mt-3`}><Plus size={13} />Подкатегория</button>
    </div>)}</div>
    <CompareShopsPanel notify={notify} />
    {editing !== false && <CategoryEditor category={editing} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await load(); }} notify={notify} />}
    {creatingSub && <Modal title={subForm.id ? 'Подкатегория' : 'Новая подкатегория'} onClose={() => setCreatingSub(false)}><form onSubmit={saveSub} className="space-y-3"><label className="block text-[10px] font-bold">Категория<select required value={subForm.category_id} onChange={(e) => setSubForm({ ...subForm, category_id: e.target.value })} className={`${adminInput} mt-1`}>{data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="block text-[10px] font-bold">Название<input required value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} className={`${adminInput} mt-1`} /></label><label className="block text-[10px] font-bold">Описание<textarea rows={3} value={subForm.description} onChange={(e) => setSubForm({ ...subForm, description: e.target.value })} className={`${adminArea} mt-1`} /></label><label className="block text-[10px] font-bold">Слоган<input value={subForm.slogan} onChange={(e) => setSubForm({ ...subForm, slogan: e.target.value })} className={`${adminInput} mt-1`} /></label><label className="block text-[10px] font-bold">Логотип / изображение<input value={subForm.image} onChange={(e) => setSubForm({ ...subForm, image: e.target.value })} className={`${adminInput} mt-1`} /></label><label className="block text-[10px] font-bold">Цвет акцента<input type="color" value={/^#[0-9a-f]{6}$/i.test(subForm.accent_color) ? subForm.accent_color : '#FFD60A'} onChange={(e) => setSubForm({ ...subForm, accent_color: e.target.value })} className="mt-1 h-10 w-full rounded-ctl-sm border border-ink/15" /></label><label className="flex items-center gap-2 text-[11px] font-bold"><input type="checkbox" checked={subForm.is_brand} onChange={(e) => setSubForm({ ...subForm, is_brand: e.target.checked })} className="accent-primary" />Показывать как бренд в бегущей ленте</label><button className={adminPrimary}><Save size={14} />Сохранить</button></form></Modal>}
  </>;
}

/** The shops prices are compared with: names to pick in a product window. */
function CompareShopsPanel({ notify }: { notify: AdminNotice }) {
  const [shops, setShops] = useState<CompareShop[]>([]);
  const [form, setForm] = useState({ name: '', site_url: '' });
  const load = useCallback(async () => { try { setShops(await adminRequest<CompareShop[]>('/api/compare-shops')); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const add = async (e: FormEvent) => { e.preventDefault(); try { await adminRequest('/api/admin/compare-shops', { method: 'POST', body: JSON.stringify(form) }); setForm({ name: '', site_url: '' }); notify('Магазин добавлен'); await load(); } catch (err) { notify((err as Error).message, 'error'); } };
  const rename = async (shop: CompareShop) => {
    const name = window.prompt('Название магазина', shop.name)?.trim(); if (name === undefined || name === '') return;
    const site_url = window.prompt('Сайт магазина (необязательно)', shop.site_url || '')?.trim() ?? shop.site_url ?? '';
    try { await adminRequest(`/api/admin/compare-shops/${shop.id}`, { method: 'PATCH', body: JSON.stringify({ name, site_url }) }); await load(); } catch (err) { notify((err as Error).message, 'error'); }
  };
  const remove = async (shop: CompareShop) => { if (!window.confirm(`Убрать «${shop.name}» из списка? У товаров название останется.`)) return; try { await adminRequest(`/api/admin/compare-shops/${shop.id}`, { method: 'DELETE' }); await load(); } catch (err) { notify((err as Error).message, 'error'); } };
  return <section className={`${adminCard} p-4 mt-6`}>
    <div className="flex items-center gap-2 mb-1"><Store size={17} /><h2 className="font-display text-[17px]">Магазины для сравнения цен</h2></div>
    <p className="text-[11px] text-muted mb-3">Из этого списка выбирается магазин в окне товара. Ссылку на конкретный товар в магазине указывают там же — на сайте название магазина станет ссылкой.</p>
    <div className="flex flex-wrap gap-2 mb-3">{shops.map((x) => <span key={x.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-surface pl-3 pr-1 h-8 text-[12px] font-bold">
      <button type="button" onClick={() => void rename(x)} className="cursor-pointer hover:underline" title="Переименовать">{x.name}</button>
      {x.site_url && <a href={x.site_url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" title={x.site_url}><ExternalLink size={12} /></a>}
      <button type="button" onClick={() => void remove(x)} className="w-6 h-6 rounded-full grid place-items-center hover:bg-[#FDE2E2]" aria-label={`Удалить ${x.name}`}><X size={12} /></button>
    </span>)}</div>
    <form onSubmit={add} className="grid sm:grid-cols-[1fr_1.3fr_auto] gap-2"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название, например ВкусВилл" className={adminInput} /><input value={form.site_url} onChange={(e) => setForm({ ...form, site_url: e.target.value })} placeholder="https://vkusvill.ru (необязательно)" className={adminInput} /><button className={adminPrimary}><Plus size={14} />Добавить</button></form>
  </section>;
}

function CategoryEditor({ category, onClose, onSaved, notify }: { category: Category | null; onClose: () => void; onSaved: () => void; notify: AdminNotice }) {
  const [form, setForm] = useState({ name: category?.name || '', description: category?.description || '', hero_image: category?.hero_image || '', slogan: category?.slogan || '', intro: category?.intro || '', request_text: category?.request_text || '', compare_label_1: category?.compare_label_1 || '', compare_label_2: category?.compare_label_2 || '', accent_color: category?.accent_color || '#FFE45C', accent_strong: category?.accent_strong || '#FAD52C', sort_order: String(category?.sort_order ?? 0) });
  const [file, setFile] = useState<File | null>(null);
  const save = async (e: FormEvent) => { e.preventDefault(); try { let hero_image = form.hero_image; if (file) hero_image = (await adminUpload(file, 'category')).url; await adminRequest(category ? `/api/admin/categories/${category.id}` : '/api/admin/categories', { method: category ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, hero_image, sort_order: Number(form.sort_order) }) }); notify('Категория сохранена'); onSaved(); } catch (e) { notify((e as Error).message, 'error'); } };
  return <Modal title={category ? 'Категория' : 'Новая категория'} onClose={onClose}><form onSubmit={save} className="space-y-3"><label className="block text-[10px] font-bold">Название<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${adminInput} mt-1`} /></label><label className="block text-[10px] font-bold">Краткое описание<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${adminArea} mt-1`} /></label><label className="block text-[10px] font-bold">Слоган<input value={form.slogan} onChange={(e) => setForm({ ...form, slogan: e.target.value })} className={`${adminInput} mt-1`} /></label><label className="block text-[10px] font-bold">Текст вступления<textarea rows={3} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} className={`${adminArea} mt-1`} /></label><label className="block text-[10px] font-bold">Плашка запроса (если не нашли товар)<textarea rows={2} value={form.request_text} onChange={(e) => setForm({ ...form, request_text: e.target.value })} className={`${adminArea} mt-1`} /></label><div className="grid grid-cols-2 gap-3">{[['compare_label_1','Сравнение с 1'],['compare_label_2','Сравнение с 2']].map(([k,l]) => <label key={k} className="text-[10px] font-bold">{l}<input value={form[k as keyof typeof form]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={`${adminInput} mt-1`} /></label>)}</div><label className="block text-[10px] font-bold">Изображение (URL)<input value={form.hero_image} onChange={(e) => setForm({ ...form, hero_image: e.target.value })} className={`${adminInput} mt-1`} /></label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className={`${adminInput} !py-2`} /><div className="grid grid-cols-2 gap-3"><label className="text-[10px] font-bold">Цвет акцента<input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="mt-1 h-10 w-full" /></label><label className="text-[10px] font-bold">Яркий цвет<input type="color" value={form.accent_strong} onChange={(e) => setForm({ ...form, accent_strong: e.target.value })} className="mt-1 h-10 w-full" /></label></div><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={adminSecondary}>Отмена</button><button className={adminPrimary}><Save size={14} />Сохранить</button></div></form></Modal>;
}

function UsersPanel({ notify }: { notify: AdminNotice }) {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(async () => { try { const d = await adminRequest<AdminData>('/api/admin/data'); setUsers(d.users || []); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => users.filter((u) => !q || `${u.full_name} ${u.email || ''} ${u.phone}`.toLowerCase().includes(q.toLowerCase())), [users, q]);
  const toggleBlock = async (u: User) => { try { await adminRequest(`/api/admin/users/${u.id}/${u.is_blocked ? 'unblock' : 'block'}`, { method: 'PATCH', body: '{}' }); await load(); notify(u.is_blocked ? 'Доступ восстановлен' : 'Пользователь заблокирован'); } catch (e) { notify((e as Error).message, 'error'); } };
  const remove = async (u: User) => { if (!window.confirm(`Удалить аккаунт «${u.full_name}»?`)) return; try { await adminRequest(`/api/admin/users/${u.id}`, { method: 'DELETE' }); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  return <><div className="mb-4"><input value={q} onChange={(e) => setQ(e.target.value)} className={`${adminInput} max-w-[460px]`} placeholder="Поиск по имени, телефону и почте" /></div>{shown.length === 0 ? <AdminEmpty>Пользователей не найдено</AdminEmpty> : <div className={`${adminCard} overflow-hidden`}>{shown.map((u) => <div key={u.id} className="flex gap-3 items-center p-4 border-b border-ink/10"><Avatar name={u.full_name} url={u.avatar_url} size={40} /><div className="min-w-0 flex-1"><b className="block truncate text-[13px]">{u.full_name} <span className="text-[10px] text-muted">#{u.id}</span></b><span className="text-[11px] text-muted">{u.email || '—'} · {u.phone || '—'}</span></div>{u.is_supplier && <AdminBadge tone="blue">Поставщик</AdminBadge>}{u.is_leader && <AdminBadge tone="purple">Лидер</AdminBadge>}{u.is_blocked && <AdminBadge tone="red">Заблокирован</AdminBadge>}<button onClick={() => void toggleBlock(u)} className={adminSecondary}>{u.is_blocked ? 'Разблокировать' : 'Блок'}</button><button onClick={() => void remove(u)} className={`${adminDanger} !px-2`} title="Удалить"><Trash2 size={14} /></button></div>)}</div>}</>;
}

function ReviewsPanel({ notify }: { notify: AdminNotice }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const load = useCallback(async () => { try { const [r, d] = await Promise.all([adminRequest<Review[]>('/api/reviews'), adminRequest<AdminData>('/api/admin/data')]); setReviews(r || []); setCategories(d.categories || []); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const update = async (id: number, category_id: number | null) => { try { await adminRequest(`/api/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ category_id }) }); notify('Раздел отзыва изменён'); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const remove = async (r: Review) => { if (!window.confirm('Удалить этот отзыв?')) return; try { await adminRequest(`/api/admin/reviews/${r.id}`, { method: 'DELETE' }); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  return <><AdminTitle title="Отзывы" detail="Последние отзывы покупателей и привязка к категории." />{reviews.length === 0 ? <AdminEmpty>Отзывов пока нет</AdminEmpty> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{reviews.map((r) => <article key={r.id} className={`${adminCard} p-4`}><div className="flex items-center gap-3"><Avatar name={r.user_name || 'Покупатель'} url={r.avatar_url} size={42} /><div className="min-w-0"><b className="block truncate">{r.user_name || 'Покупатель'}</b><div className="text-[10px] text-muted">{dateLabel(r.created_at)} · {'★'.repeat(r.rating || 0)}{r.verified && <AdminBadge tone="green">Покупка подтверждена</AdminBadge>}</div></div></div>{r.product_name && <a href={`/catalog?product=${r.product_id}`} target="_blank" rel="noreferrer" className="flex gap-2 items-center rounded-ctl-sm bg-surface p-2 mt-3 hover:bg-sun">{r.product_image && <img src={r.product_image} alt="" className="w-10 h-10 object-contain bg-white rounded" />}<span className="text-[11px] font-bold">{r.product_name} ↗</span></a>}<p className="text-[12px] mt-3 whitespace-pre-line break-words">{unescapeHtml(r.text || '')}</p><div className="flex gap-2 mt-3"><select value={r.category_id || ''} onChange={(e) => void update(r.id, e.target.value ? Number(e.target.value) : null)} className={`${adminInput} !h-9`} aria-label="Категория отзыва"><option value="">Не показывать на главной</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={() => void remove(r)} className={`${adminDanger} !px-2`} title="Удалить"><Trash2 size={14} /></button></div><div className="mt-2"><AttachedReviewImages review={r} /></div></article>)}</div>}</>;
}
function AttachedReviewImages({ review }: { review: Review }) { const value = review.images || []; const urls = Array.isArray(value) ? value : (() => { try { return JSON.parse(value); } catch { return []; } })(); return urls.length ? <div className="flex gap-2 overflow-x-auto">{urls.map((url: string) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Фото из отзыва" className="w-16 h-16 object-cover rounded-ctl-xs border border-ink/10" /></a>)}</div> : null; }

function AdminsPanel({ notify }: { notify: AdminNotice }) {
  const [admins, setAdmins] = useState<AdminData['admins']>([]);
  const [form, setForm] = useState({ username: '', display_name: '', password: '' });
  const load = useCallback(async () => { try { const d = await adminRequest<AdminData>('/api/admin/data'); setAdmins(d.admins || []); } catch (e) { notify((e as Error).message, 'error'); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const create = async (e: FormEvent) => { e.preventDefault(); try { await adminRequest('/api/admin/admins', { method: 'POST', body: JSON.stringify(form) }); setForm({ username: '', display_name: '', password: '' }); notify('Администратор добавлен'); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  const remove = async (id: number, name: string) => { if (!window.confirm(`Удалить администратора ${name}?`)) return; try { await adminRequest(`/api/admin/admins/${id}`, { method: 'DELETE' }); await load(); } catch (e) { notify((e as Error).message, 'error'); } };
  return <><AdminTitle title="Администраторы" detail="Добавляйте отдельные учётные записи с паролем." /><div className="grid lg:grid-cols-[1fr_1.2fr] gap-5"><form onSubmit={create} className={`${adminCard} p-5 space-y-3`}><h2 className="font-display text-[17px]">Добавить администратора</h2>{[['username','Логин'],['display_name','Имя'],['password','Пароль']].map(([key,label]) => <label key={key} className="block text-[10px] font-bold">{label}<input required type={key === 'password' ? 'password' : 'text'} minLength={key === 'password' ? 12 : undefined} autoComplete={key === 'password' ? 'new-password' : 'off'} value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={`${adminInput} mt-1`} /></label>)}<p className="text-[10px] text-muted">Используйте уникальный пароль длиной не менее 12 символов.</p><button className={adminPrimary}><Plus size={15} />Добавить</button></form><div className={`${adminCard} overflow-hidden`}>{admins.map((a) => <div key={a.id} className="p-4 flex gap-3 items-center border-b border-ink/10"><div className="w-10 h-10 rounded-full bg-sun border-2 border-ink grid place-items-center"><UserRound size={17} /></div><div className="flex-1"><b>{a.display_name || a.username}</b><div className="text-[11px] text-muted">@{a.username} · #{a.id}</div></div><button onClick={() => void remove(a.id, a.username)} className={adminDanger}><Trash2 size={14} />Удалить</button></div>)}</div></div></>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEscape(onClose);
  return <div className="fixed inset-0 z-[100] bg-ink/45 backdrop-blur-sm grid place-items-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className={`${adminCard} w-full max-w-[620px] max-h-[92vh] overflow-y-auto p-5 sm:p-6`}><header className="flex items-center gap-3 mb-5"><h2 className="font-display text-[19px] flex-1">{title}</h2><button onClick={onClose} className="w-9 h-9 rounded-full bg-surface border border-ink/15 grid place-items-center"><X size={16} /></button></header>{children}</div></div>;
}
