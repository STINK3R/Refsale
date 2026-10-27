import { Link } from 'react-router-dom';
import { useContacts, ContactBlock } from '../ui/Contacts';

const LINKS: { label: string; href: string; route?: boolean }[] = [
  { label: 'Каталог', href: '/catalog', route: true },
  { label: 'О нас', href: '/home#about' },
  { label: 'Отзывы', href: '/catalog#reviews' },
  { label: 'Форум', href: '/forums', route: true },
  { label: 'Избранное', href: '/favorites', route: true },
  { label: 'Сообщения и заказы', href: '/orders', route: true },
];

/** The site's foot: the brand, the pages and both contact pairs, each on a plate. */
export default function Footer() {
  const contacts = useContacts();
  const year = new Date().getFullYear();
  const plate = 'rounded-[24px] max-sm:rounded-[20px] border-2 border-ink bg-card p-6 max-sm:p-5';
  return (
    <footer className="border-t-2 border-ink bg-accent">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-4 pt-16 pb-28 max-md:pt-10">
        <div className="grid grid-cols-12 gap-4">
          <div className={`${plate} col-span-4 max-lg:col-span-12 flex flex-col`}>
            <div className="flex items-center gap-2.5">
              <img src="/img/logo-meerkat.webp" alt="" width={90} height={132} className="h-10 w-auto" />
              <span className="font-display text-[28px] tracking-[0.06em] uppercase text-ink leading-none">RefSale</span>
            </div>
            <p className="text-[14px] text-muted leading-[1.7] mt-4">
              Парфюмерия, уходовая косметика, продукты и товары из Китая по ценам ниже крупных сетей. Промокод от вашего лидера мнений делает цену ещё ниже.
            </p>
          </div>

          <nav className={`${plate} col-span-3 max-lg:col-span-5 max-sm:col-span-12`} aria-label="Разделы сайта">
            <div className="label mb-4">Магазин</div>
            <ul className="grid gap-2.5 text-[15px] font-semibold">
              {LINKS.map((l) => (
                <li key={l.label}>
                  {l.route
                    ? <Link to={l.href} className="text-ink hover:text-primary transition-colors">{l.label}</Link>
                    : <a href={l.href} className="text-ink hover:text-primary transition-colors">{l.label}</a>}
                </li>
              ))}
            </ul>
          </nav>

          <div className="col-span-5 max-lg:col-span-7 max-sm:col-span-12 grid gap-4">
            {contacts.length > 0
              ? contacts.map((c) => <div key={c.label} className={plate}><ContactBlock pair={c} /></div>)
              : <div className={plate}><p className="text-[14px] text-muted">Напишите нам в чат на сайте — ответим в течение дня.</p></div>}
          </div>
        </div>

        <div className={`${plate} mt-4 !py-4 flex items-center justify-between gap-x-6 gap-y-2 text-[12.5px] text-ink/80 max-md:flex-col max-md:items-start`}>
          <span>© {year} RefSale · Только оригинальная продукция · <b className="text-ink">Проект создан в целях научной деятельности</b></span>
          <span className="tracking-[0.12em] uppercase font-semibold">refsale.ru</span>
        </div>
      </div>
    </footer>
  );
}
