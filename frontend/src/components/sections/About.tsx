import { motion } from 'framer-motion';
import { MessageCircle, CreditCard, Truck, PackageCheck } from 'lucide-react';

const STEPS = [
  { icon: MessageCircle, title: 'Оформляете заказ', text: 'Сразу открывается чат с менеджером: подтвердим наличие, сроки и ответим на вопросы.' },
  { icon: CreditCard, title: 'Предоплата', text: 'После согласования присылаем реквизиты. Как только оплата пришла — заказ подтверждён.' },
  { icon: Truck, title: 'Доставка', text: 'Статусы заказа видны на сайте в «Статусах заказов» и приходят на почту.' },
  { icon: PackageCheck, title: 'Получаете', text: 'Оригинальная продукция — проверяйте и оставляйте отзыв с фото.' },
];

export default function About() {
  return (
    <section id="about" className="py-20 max-sm:py-12">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="grid grid-cols-[0.9fr_1.1fr] gap-12 items-start max-lg:grid-cols-1">
          <div>
            <div className="eyebrow mb-3">О нас</div>
            <h2 className="font-display text-[46px] leading-[1.05] text-text max-sm:text-[34px]">
              Честная цена на оригинал — <span className="text-gold-gradient italic">без переплаты за витрину</span>
            </h2>
            <p className="mt-6 text-[15px] text-muted leading-relaxed">
              Мы работаем напрямую с поставщиками оригинальной парфюмерии и уходовой косметики, поэтому цены ниже, чем в крупных сетях. Нас рекомендуют блогеры и эксперты, которым доверяет их аудитория: у каждого свой промокод, по которому цена становится ещё ниже.
            </p>
            <p className="mt-4 text-[15px] text-muted leading-relaxed">
              Всё прозрачно: блогер видит заказы по своему промокоду и то, как мы общаемся с его аудиторией, — площадка не присваивает его покупателей.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.07 }}
                className="card-luxe rounded-3xl p-6"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary"><s.icon size={18} /></span>
                  <span className="font-display text-[15px] text-primary/70">0{i + 1}</span>
                </div>
                <div className="font-display text-[22px] text-text leading-tight">{s.title}</div>
                <p className="text-[13px] text-muted leading-relaxed mt-1.5">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
