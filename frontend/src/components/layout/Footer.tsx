import { Link } from 'react-router-dom';
import { useContacts, ContactBlock } from '../ui/Contacts';

export default function Footer() {
  const contacts = useContacts();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-10 pt-14 pb-28 border-t border-white/[0.06] bg-gradient-to-b from-transparent to-black/40">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="grid grid-cols-[1.4fr_1fr_1.6fr] gap-10 max-md:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img src="/logo.svg" alt="" className="w-11 h-11 rounded-full" />
              <div className="font-display text-[28px] tracking-[0.12em] text-gold-gradient leading-none">REFSALE</div>
            </div>
            <p className="text-[13px] text-muted leading-relaxed max-w-[300px]">
              Оригинальная парфюмерия и уходовая косметика по ценам ниже крупных сетей. Промокод от вашего блогера делает цену ещё ниже.
            </p>
          </div>
          <div>
            <h4 className="eyebrow mb-4">Навигация</h4>
            <div className="flex flex-col gap-2.5 text-sm">
              <a href="/#catalog" className="text-muted hover:text-primary-light transition-colors">Каталог</a>
              <Link to="/forums" className="text-muted hover:text-primary-light transition-colors">Форум</Link>
              <a href="/#reviews" className="text-muted hover:text-primary-light transition-colors">Отзывы</a>
              <a href="/#about" className="text-muted hover:text-primary-light transition-colors">О нас</a>
              <Link to="/orders" className="text-muted hover:text-primary-light transition-colors">Статусы заказов</Link>
            </div>
          </div>
          <div>
            <h4 className="eyebrow mb-4">Контакты</h4>
            {contacts.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 max-sm:grid-cols-1">
                {contacts.map((c) => <ContactBlock key={c.label} pair={c} />)}
              </div>
            ) : (
              <p className="text-sm text-muted">Напишите нам в чат на сайте — ответим в течение дня.</p>
            )}
          </div>
        </div>
        <div className="divider-hairline my-8" />
        <div className="flex items-center justify-between gap-3 text-[12px] text-light max-sm:flex-col max-sm:text-center">
          <span>© {year} RefSale. Только оригинальная продукция.</span>
          <span>refsale.ru</span>
        </div>
      </div>
    </footer>
  );
}
