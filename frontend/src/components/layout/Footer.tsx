import { Link } from 'react-router-dom';
import { useContacts, ContactBlock } from '../ui/Contacts';

export default function Footer() {
  const contacts = useContacts();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-black">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 pt-20 pb-28 max-md:pt-14">
        <div className="grid grid-cols-12 gap-x-8 gap-y-12">
          <div className="col-span-4 max-lg:col-span-12">
            <div className="font-display text-[34px] tracking-[0.32em] uppercase text-text leading-none">RefSale</div>
            <p className="text-[14px] text-muted leading-[1.75] mt-6 max-w-[320px]">
              Оригинальная парфюмерия и уходовая косметика по ценам ниже крупных сетей. Промокод от вашего блогера делает цену ещё ниже.
            </p>
          </div>
          <div className="col-span-2 max-lg:col-span-4 max-sm:col-span-12">
            <div className="label mb-5">Магазин</div>
            <ul className="space-y-3 text-[14px]">
              <li><a href="/#catalog" className="text-muted hover:text-text transition-colors">Каталог</a></li>
              <li><a href="/#about" className="text-muted hover:text-text transition-colors">О нас</a></li>
              <li><a href="/#reviews" className="text-muted hover:text-text transition-colors">Отзывы</a></li>
              <li><Link to="/forums" className="text-muted hover:text-text transition-colors">Форум</Link></li>
              <li><Link to="/orders" className="text-muted hover:text-text transition-colors">Статусы заказов</Link></li>
            </ul>
          </div>
          <div className="col-span-6 max-lg:col-span-8 max-sm:col-span-12">
            <div className="grid grid-cols-2 gap-8 max-sm:grid-cols-1">
              {contacts.length > 0
                ? contacts.map((c) => <ContactBlock key={c.label} pair={c} />)
                : <p className="text-[14px] text-muted">Напишите нам в чат на сайте — ответим в течение дня.</p>}
            </div>
          </div>
        </div>
        <div className="mt-16 pt-6 border-t border-line flex items-center justify-between gap-4 text-[12px] text-light max-sm:flex-col max-sm:items-start">
          <span>© {year} RefSale · Только оригинальная продукция</span>
          <span className="tracking-[0.12em] uppercase">refsale.ru</span>
        </div>
      </div>
    </footer>
  );
}
