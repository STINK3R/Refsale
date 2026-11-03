import { useState } from 'react';
import { m } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MessageCircle, ShoppingBag, Crown, Truck, LogIn, Lock, Check } from 'lucide-react';
import { useAppStore, useAuthStore } from '../../store';
import { useSupportStore } from '../../store/support';
import { Eyebrow, SubHead } from '../ui/SectionHead';

const EASE = [0.22, 1, 0.36, 1] as const;

type Branch = 'buyer' | 'leader' | 'supplier';

/** The texts by default; the admin panel can rewrite each title and text. */
const BRANCHES: Record<Branch, {
  tab: string; icon: typeof ShoppingBag; title: string; text: string; stepsTitle: string; steps: { title: string; text: string }[];
  /** What everyone sees before signing in to that cabinet */
  short?: string; teaser?: string[];
}> = {
  buyer: {
    tab: 'Покупатель',
    icon: ShoppingBag,
    title: 'Честная цена на оригинал — без переплаты за витрину',
    text: 'RefSale — сайт реферальных ссылок и промокодов. По промокоду лидера мнений (например, блогера) вы получаете оригинальную парфюмерию, косметику, подписки на программы, фрукты, продукты, товары из Китая и многое другое. Без промокода цены не такие приятные, но часто всё равно ниже основных сетевых магазинов.\n\nВсё прозрачно: лидер мнений видит заказы по своему промокоду и то, как мы общаемся с его аудиторией.',
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
    short: 'Рекомендуйте оригинальные товары своей аудитории: у каждого лидера мнений свой промокод и реферальная ссылка. Условия сотрудничества — в личном кабинете.',
    teaser: ['Заказы по вашим промокодам', 'Условия сотрудничества', 'Переписка с покупателями'],
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
    short: 'Размещайте оригинальные товары на RefSale: витрину, общение с покупателями и доставку берём на себя, а рекомендуют ваш товар лидеры мнений.',
    teaser: ['Как попасть на витрину', 'Условия поставки', 'Как проходят заказы'],
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
 * project told three ways — to a buyer, an opinion leader and a supplier.
 * Everyone sees all three tabs; a leader's and a supplier's full story opens
 * in their cabinet (the flags are set in the admin panel), the rest see a
 * short note and the way in.
 */
export default function About() {
  const user = useAuthStore((s) => s.user);
  const openAuth = useAuthStore((s) => s.openAuth);
  const { categories, settings } = useAppStore();
  const navigate = useNavigate();
  const openSupport = useSupportStore((s) => s.open);
  const [branch, setBranch] = useState<Branch>('buyer');
  const [askAccess, setAskAccess] = useState(false);
  const b = BRANCHES[branch];
  const open = branch === 'buyer' || (branch === 'leader' && !!user?.is_leader) || (branch === 'supplier' && !!user?.is_supplier);
  const title = settings[`about_${branch}_title`]?.trim() || b.title;
  const text = settings[`about_${branch}_text`]?.trim() || b.text;
  const short = settings[`about_${branch}_short`]?.trim() || b.short || '';

  const pick = (id: Branch) => { setBranch(id); setAskAccess(false); };
  const enterCabinet = () => {
    if (!user) {
      openAuth('login', branch === 'leader'
        ? 'Войдите — и откроется кабинет лидера мнений с вашими промокодами и заказами.'
        : 'Войдите — и откроется кабинет поставщика с подробным описанием работы.');
      return;
    }
    setAskAccess(true);
  };

  return (
    <section id="about" className="border-t border-line">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 py-24 max-md:py-14">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <Eyebrow>О нас</Eyebrow>
          <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Для кого">
            {(['buyer', 'leader', 'supplier'] as Branch[]).map((id) => {
              const Icon = BRANCHES[id].icon;
              const on = id === branch;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => pick(id)}
                  className={`h-10 px-4 max-sm:px-3 rounded-ctl-sm border-2 text-[13px] max-sm:text-[12px] font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${on ? 'bg-ink border-ink text-sun' : 'bg-card border-ink/15 text-ink hover:border-ink'}`}
                >
                  <Icon size={15} strokeWidth={2.2} /> {BRANCHES[id].tab}
                </button>
              );
            })}
          </div>
        </div>

        {open ? (
          <div className="grid grid-cols-12 gap-x-8 gap-y-12">
            <m.div
              key={`text-${branch}`}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
              className="col-span-5 max-lg:col-span-12"
            >
              <h2 className="font-display text-[clamp(32px,3.4vw,50px)] leading-[1.08] text-text"><span className="marker">{title}</span></h2>
              {text.split(/\n\s*\n/).map((para, i) => (
                <p key={i} className={`${i ? 'mt-5' : 'mt-8'} text-[15px] text-muted leading-[1.8] max-w-[480px] whitespace-pre-line`}>{para}</p>
              ))}

              {branch === 'buyer' && categories.length > 0 && (
                <div className="mt-9">
                  <SubHead className="mb-4">Что у нас есть</SubHead>
                  <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-2.5">
                    {categories.map((c) => (
                      <a
                        key={c.id}
                        href={`/catalog?c=${c.id}`}
                        data-own-nav
                        onClick={(e) => { e.preventDefault(); navigate(`/catalog?c=${c.id}`); }}
                        className="group h-16 pl-1.5 pr-3.5 rounded-ctl-md border-2 border-ink bg-card text-[14px] font-bold text-ink flex items-center gap-3 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_3px_0_#111] transition-[translate,box-shadow]"
                      >
                        <span className="w-[50px] h-[50px] shrink-0 rounded-[11px] overflow-hidden grid place-items-center" style={{ background: c.accent_color || '#FFE45C' }} aria-hidden="true">
                          <img src={c.hero_image || '/img/hero-640.webp'} alt="" loading="lazy" className="w-[115%] h-[115%] max-w-none object-contain" />
                        </span>
                        <span className="flex-1 min-w-0 leading-tight line-clamp-2">{c.name}</span>
                        <ArrowRight size={16} strokeWidth={2.4} className="shrink-0 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
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
              <SubHead className="mb-5">{b.stepsTitle}</SubHead>
              <ol key={`steps-${branch}`} className="border-t border-line">
                {b.steps.map((st, i) => (
                  <m.li
                    key={st.title}
                    initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }}
                    transition={{ duration: 0.8, delay: i * 0.07, ease: EASE }}
                    className="grid grid-cols-[64px_1fr] max-sm:grid-cols-[44px_1fr] gap-4 py-8 max-sm:py-6 border-b border-line"
                  >
                    <span className="w-11 h-11 max-sm:w-9 max-sm:h-9 rounded-ctl-sm bg-ink text-sun font-display text-[18px] max-sm:text-[15px] grid place-items-center">{i + 1}</span>
                    <div>
                      <div className="font-display text-[26px] max-sm:text-[22px] leading-tight text-text">{st.title}</div>
                      <p className="text-[14px] text-muted leading-relaxed mt-2 max-w-[460px]">{st.text}</p>
                    </div>
                  </m.li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          // A leader's or a supplier's tab before their cabinet: the short
          // version and the way in
          <m.div
            key={`locked-${branch}`}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
            className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-5"
          >
            <div className="bg-card border-2 border-ink rounded-[24px] max-sm:rounded-[20px] shadow-[0_6px_0_#111] p-8 max-sm:p-5">
              <SubHead>{branch === 'leader' ? 'Для лидеров мнений' : 'Для поставщиков'}</SubHead>
              <p className="mt-4 text-[16px] max-sm:text-[15px] leading-[1.7] text-ink/80">{short}</p>
              <button onClick={enterCabinet} className="btn-primary mt-7 max-sm:w-full"><LogIn size={16} strokeWidth={2.2} /> Войти в личный кабинет</button>
              <p className="mt-3 text-[13px] text-muted leading-snug">В кабинете — подробное описание и работа сайта изнутри.</p>
              {askAccess && (
                <div className="mt-5 rounded-ctl-md bg-surface border-2 border-ink/10 p-4">
                  <p className="text-[14px] text-ink leading-snug">
                    {branch === 'leader' ? 'Кабинет лидера мнений подключает площадка.' : 'Кабинет поставщика подключает площадка.'} Напишите нам — расскажем об условиях и откроем доступ.
                  </p>
                  <button
                    onClick={() => openSupport({ startInNew: true, prefillSubject: branch === 'leader' ? 'Хочу стать лидером мнений' : 'Хочу стать поставщиком' })}
                    className="btn-outline btn-sm mt-3"
                  >
                    <MessageCircle size={14} strokeWidth={2.2} /> Написать площадке
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-[24px] max-sm:rounded-[20px] border-2 border-ink accent-card p-8 max-sm:p-5 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink/70"><Lock size={14} strokeWidth={2.4} /> В личном кабинете</div>
              <ul className="mt-4 space-y-2.5">
                {(b.teaser || []).map((t) => (
                  <li key={t} className="flex items-center gap-3 text-[16px] max-sm:text-[15px] font-bold text-ink">
                    <span className="w-7 h-7 shrink-0 rounded-ctl-xs bg-card border-2 border-ink grid place-items-center"><Check size={14} strokeWidth={3} /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </m.div>
        )}
      </div>
    </section>
  );
}
