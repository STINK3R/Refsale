import { useState } from 'react';
import { m } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MessageCircle, ShoppingBag, Crown, Truck } from 'lucide-react';
import { useAppStore, useAuthStore } from '../../store';
import { useSupportStore } from '../../store/support';

const EASE = [0.22, 1, 0.36, 1] as const;

type Branch = 'buyer' | 'leader' | 'supplier';

/** The texts by default; the admin panel can rewrite each title and text. */
const BRANCHES: Record<Branch, { tab: string; icon: typeof ShoppingBag; title: string; text: string; stepsTitle: string; steps: { title: string; text: string }[] }> = {
  buyer: {
    tab: 'Покупатель',
    icon: ShoppingBag,
    title: 'Честная цена на оригинал — без переплаты за витрину',
    text: 'Мы работаем напрямую с поставщиками оригинальной парфюмерии, уходовой косметики, продуктов и товаров из Китая, поэтому цены ниже, чем в крупных сетях. Нас рекомендуют лидеры мнений (например, блогеры), которым доверяет их аудитория: у каждого свой промокод.\n\nВсё прозрачно: лидер мнений видит заказы по своему промокоду и то, как мы общаемся с его аудиторией.',
    stepsTitle: 'Как проходит заказ',
    steps: [
      { title: 'Оформляете заказ', text: 'Сразу открывается чат с менеджером: подтвердим наличие и сроки, ответим на вопросы.' },
      { title: 'Предоплата', text: 'После согласования присылаем реквизиты. Как только оплата пришла — заказ подтверждён.' },
      { title: 'Доставка', text: 'Статусы заказа видны на сайте в разделе «Сообщения и заказы» и приходят на почту.' },
      { title: 'Получаете', text: 'Оригинальная продукция — проверяйте и оставляйте отзыв с фото.' },
    ],
  },
  leader: {
    tab: 'Лидер мнений',
    icon: Crown,
    title: 'Ваш промокод — скидка для аудитории и доход для вас',
    text: 'Вы рекомендуете оригинальные товары, ваша аудитория покупает дешевле сетевых магазинов, а вы получаете вознаграждение за каждый выданный заказ по вашему промокоду.\n\nЗаказы, статусы и переписка с покупателями — в вашем кабинете.',
    stepsTitle: 'Как это работает',
    steps: [
      { title: 'Получаете промокод', text: 'Создаём для вас один или несколько кодов: на весь каталог или на отдельную категорию.' },
      { title: 'Делитесь ссылкой', text: 'Ссылка с кодом сразу включает скидку у покупателя — вводить ничего не нужно.' },
      { title: 'Видите заказы', text: 'В кабинете — каждый заказ по вашему коду, его статус и переписка с покупателем.' },
      { title: 'Получаете вознаграждение', text: 'Начисляется за каждый выданный заказ, сумма видна в кабинете.' },
    ],
  },
  supplier: {
    tab: 'Поставщик',
    icon: Truck,
    title: 'Оригинальный товар — к покупателю через лидеров мнений',
    text: 'Мы берём на себя витрину, общение с покупателями и доставку, а ваш товар рекомендуют лидеры мнений с живой аудиторией.\n\nУсловия, ассортимент и поставки обсуждаем в чате с площадкой.',
    stepsTitle: 'Как мы работаем',
    steps: [
      { title: 'Согласуем ассортимент', text: 'Позиции, цены и условия поставки — в чате с площадкой.' },
      { title: 'Размещаем на витрине', text: 'Товары появляются в каталоге с фото, ценами и сравнением с сетевыми магазинами.' },
      { title: 'Продаём через лидеров мнений', text: 'Промокоды лидеров приводят покупателей к вашим позициям.' },
      { title: 'Прозрачные заказы', text: 'Заказы, оплата и выдача — под контролем площадки.' },
    ],
  },
};

/**
 * "О нас" on the main page: who we are, the way into each category, and the
 * project told three ways — to a buyer, an opinion leader and a supplier. The
 * last two show to those with that cabinet (set in the admin panel).
 */
export default function About() {
  const user = useAuthStore((s) => s.user);
  const { categories, settings } = useAppStore();
  const navigate = useNavigate();
  const openSupport = useSupportStore((s) => s.open);
  const available: Branch[] = ['buyer', ...(user?.is_leader ? ['leader' as const] : []), ...(user?.is_supplier ? ['supplier' as const] : [])];
  const [picked, setPicked] = useState<Branch>('buyer');
  const branch = available.includes(picked) ? picked : 'buyer';
  const b = BRANCHES[branch];
  const title = settings[`about_${branch}_title`]?.trim() || b.title;
  const text = settings[`about_${branch}_text`]?.trim() || b.text;

  return (
    <section id="about" className="border-t border-line">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 py-24 max-md:py-14">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <div className="label">О нас</div>
          {available.length > 1 ? (
            <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Для кого">
              {available.map((id) => {
                const Icon = BRANCHES[id].icon;
                const on = id === branch;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setPicked(id)}
                    className={`h-10 px-4 rounded-ctl-sm border-2 text-[13px] font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${on ? 'bg-ink border-ink text-sun' : 'bg-card border-ink/15 text-ink hover:border-ink'}`}
                  >
                    <Icon size={15} strokeWidth={2.2} /> {BRANCHES[id].tab}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="h-9 px-3.5 rounded-ctl-sm bg-card border-2 border-ink text-[12px] font-bold inline-flex items-center gap-2"><ShoppingBag size={14} strokeWidth={2.2} /> Для покупателей</span>
          )}
        </div>

        <div className="grid grid-cols-12 gap-x-8 gap-y-12">
          <m.div
            key={`text-${branch}`}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
            className="col-span-5 max-lg:col-span-12"
          >
            <h2 className="font-display text-[clamp(32px,3.4vw,50px)] leading-[1.08] text-text">{title}</h2>
            {text.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className={`${i ? 'mt-5' : 'mt-8'} text-[15px] text-muted leading-[1.8] max-w-[480px] whitespace-pre-line`}>{para}</p>
            ))}

            {branch === 'buyer' && categories.length > 0 && (
              <div className="mt-8">
                <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink/60 mb-3">Что у нас есть</div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <a
                      key={c.id}
                      href={`/catalog?c=${c.id}`}
                      data-own-nav
                      onClick={(e) => { e.preventDefault(); navigate(`/catalog?c=${c.id}`); }}
                      className="group h-10 pl-2 pr-3.5 rounded-ctl-sm border-2 border-ink bg-card text-[13px] font-bold text-ink inline-flex items-center gap-2 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_3px_0_#111] transition-[translate,box-shadow]"
                    >
                      <span className="w-6 h-6 rounded-[8px] border border-ink/20" style={{ background: c.accent_color || '#FFE45C' }} aria-hidden="true" />
                      {c.name}
                      <ArrowRight size={14} strokeWidth={2.4} className="opacity-50 group-hover:opacity-100" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {branch === 'leader' && (
              <button onClick={() => navigate('/cabinet')} className="btn-primary mt-8"><Crown size={16} strokeWidth={2.2} /> Открыть кабинет</button>
            )}
            {branch === 'supplier' && (
              <button onClick={() => openSupport({ startInNew: true, prefillSubject: 'Поставка товаров' })} className="btn-primary mt-8"><MessageCircle size={16} strokeWidth={2.2} /> Написать площадке</button>
            )}
          </m.div>

          <div className="col-span-6 col-start-7 max-lg:col-span-12 max-lg:col-start-1">
            <div className="label mb-5">{b.stepsTitle}</div>
            <ol key={`steps-${branch}`} className="border-t border-line">
              {b.steps.map((s, i) => (
                <m.li
                  key={s.title}
                  initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.8, delay: i * 0.07, ease: EASE }}
                  className="grid grid-cols-[64px_1fr] max-sm:grid-cols-[44px_1fr] gap-4 py-8 max-sm:py-6 border-b border-line"
                >
                  <span className="font-display text-[22px] text-light leading-none pt-1">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="font-display text-[26px] max-sm:text-[22px] leading-tight text-text">{s.title}</div>
                    <p className="text-[14px] text-muted leading-relaxed mt-2 max-w-[460px]">{s.text}</p>
                  </div>
                </m.li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
