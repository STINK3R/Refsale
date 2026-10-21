import { m } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  { title: 'Оформляете заказ', text: 'Сразу открывается чат с менеджером: подтвердим наличие и сроки, ответим на вопросы.' },
  { title: 'Предоплата', text: 'После согласования присылаем реквизиты. Как только оплата пришла — заказ подтверждён.' },
  { title: 'Доставка', text: 'Статусы заказа видны на сайте в разделе «Сообщения и заказы» и приходят на почту.' },
  { title: 'Получаете', text: 'Оригинальная продукция — проверяйте и оставляйте отзыв с фото.' },
];

export default function About() {
  return (
    <section id="about" className="border-t border-line">
      <div className="max-w-[1440px] mx-auto px-8 max-sm:px-5 py-28 max-md:py-16 grid grid-cols-12 gap-x-8 gap-y-14">
        <div className="col-span-5 max-lg:col-span-12">
          <div className="label mb-5">О нас</div>
          <m.h2
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE }}
            className="font-display text-[clamp(34px,3.6vw,54px)] leading-[1.08] text-text"
          >
            Честная цена на&nbsp;оригинал — без переплаты <span className="italic text-primary-light">за&nbsp;витрину</span>
          </m.h2>
          <p className="mt-8 text-[15px] text-muted leading-[1.8] max-w-[460px]">
            Мы работаем напрямую с поставщиками оригинальной парфюмерии и уходовой косметики, поэтому цены ниже, чем в крупных сетях. Нас рекомендуют блогеры, которым доверяет их аудитория: у каждого свой промокод.
          </p>
          <p className="mt-5 text-[15px] text-muted leading-[1.8] max-w-[460px]">
            Всё прозрачно: блогер видит заказы по своему промокоду и то, как мы общаемся с его аудиторией.
          </p>
        </div>

        <div className="col-span-6 col-start-7 max-lg:col-span-12 max-lg:col-start-1">
          <div className="label mb-5">Как проходит заказ</div>
          <ol className="border-t border-line">
            {STEPS.map((s, i) => (
              <m.li
                key={s.title}
                initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.8, delay: i * 0.07, ease: EASE }}
                className="grid grid-cols-[64px_1fr] max-sm:grid-cols-[44px_1fr] gap-4 py-8 border-b border-line"
              >
                <span className="font-display text-[22px] text-light leading-none pt-1">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <div className="font-display text-[26px] leading-tight text-text">{s.title}</div>
                  <p className="text-[14px] text-muted leading-relaxed mt-2 max-w-[460px]">{s.text}</p>
                </div>
              </m.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
