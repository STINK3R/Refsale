import { motion } from 'framer-motion';
import { ArrowDown, ShieldCheck, TrendingDown, BadgePercent } from 'lucide-react';
import PromoForm from '../promo/PromoForm';

const PERKS = [
  { icon: ShieldCheck, title: 'Только оригинал', text: 'Каждая позиция — от проверенных поставщиков, без подделок и распива' },
  { icon: TrendingDown, title: 'Дешевле сетей', text: 'Даже без промокода цены ниже, чем в крупных парфюмерных магазинах' },
  { icon: BadgePercent, title: 'Промокод — ещё ниже', text: 'Введите слово от вашего блогера — скидка применится ко всему каталогу' },
];

export default function StoreHero() {
  return (
    <section className="relative pt-32 pb-16 max-sm:pt-24 max-sm:pb-10 overflow-hidden">
      {/* soft gold spotlight */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-[radial-gradient(circle,rgba(212,175,90,0.14),transparent_60%)]" />

      <div className="relative max-w-[1240px] mx-auto px-5 grid grid-cols-[1.15fr_0.85fr] gap-10 items-center max-lg:grid-cols-1">
        <div>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="eyebrow mb-5">
            Оригинальная парфюмерия · Уход
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, delay: 0.05 }}
            className="font-display text-[64px] leading-[1.02] font-medium text-text max-xl:text-[54px] max-sm:text-[40px]"
          >
            Любимые ароматы<br />
            <span className="shine-text italic">дешевле, чем в сетях</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-6 text-[17px] text-muted leading-relaxed max-w-[540px] max-sm:text-[15px]"
          >
            Оригинальные духи и уходовая косметика по ценам ниже крупных магазинов. А с промокодом от вашего блогера — ещё дешевле: цена со скидкой появится сразу на всех товарах.
          </motion.p>

          <motion.div
            id="hero-promo"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-8 max-w-[540px] glass rounded-[32px] p-3"
          >
            <div className="px-3 pt-1 pb-3 text-[12px] uppercase tracking-[0.22em] text-primary font-semibold">
              Введите промокод — цены обновятся
            </div>
            <PromoForm size="lg" />
          </motion.div>

          <motion.a
            href="#catalog"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="mt-7 inline-flex items-center gap-2 text-[14px] text-muted hover:text-primary-light transition-colors"
          >
            <ArrowDown size={16} className="text-primary" /> Перейти в каталог
          </motion.a>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.1 }}
          className="relative h-[520px] max-lg:h-[380px] max-sm:h-[300px] flex items-center justify-center max-lg:order-first max-sm:hidden"
        >
          <div className="absolute w-[420px] h-[420px] max-lg:w-[320px] max-lg:h-[320px] rounded-full border border-primary/15" />
          <div className="absolute w-[300px] h-[300px] max-lg:w-[230px] max-lg:h-[230px] rounded-full border border-primary/10" />
          <PerfumeBottle className="relative w-[300px] max-lg:w-[220px] animate-float-slow drop-shadow-[0_40px_60px_rgba(0,0,0,0.6)]" />
        </motion.div>
      </div>

      <div className="relative max-w-[1240px] mx-auto px-5 mt-14 max-sm:mt-10 grid grid-cols-3 gap-4 max-md:grid-cols-1">
        {PERKS.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.08 }}
            className="card-luxe rounded-3xl p-6 flex gap-4 items-start"
          >
            <span className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <p.icon size={20} />
            </span>
            <div>
              <div className="font-display text-[22px] leading-tight text-text">{p.title}</div>
              <p className="text-[13px] text-muted leading-relaxed mt-1">{p.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/** Stylised glass flacon drawn in SVG — no heavy hero photo needed. */
function PerfumeBottle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 360" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cap" x1="0" x2="1">
          <stop offset="0" stopColor="#6b5427" />
          <stop offset="0.35" stopColor="#F6E3A8" />
          <stop offset="0.6" stopColor="#D4AF5A" />
          <stop offset="1" stopColor="#5a4520" />
        </linearGradient>
        <linearGradient id="glassBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.20)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.12)" />
        </linearGradient>
        <linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3D98E" stopOpacity="0.85" />
          <stop offset="1" stopColor="#A9853A" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="shine" x1="0" x2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {/* cap */}
      <rect x="92" y="18" width="56" height="62" rx="6" fill="url(#cap)" />
      <rect x="100" y="80" width="40" height="16" rx="3" fill="#2a2418" />
      {/* bottle */}
      <rect x="34" y="96" width="172" height="236" rx="34" fill="url(#glassBody)" stroke="rgba(246,227,168,0.45)" strokeWidth="1.5" />
      <rect x="44" y="160" width="152" height="162" rx="26" fill="url(#liquid)" />
      <rect x="44" y="160" width="152" height="10" rx="5" fill="rgba(255,255,255,0.25)" />
      {/* label */}
      <rect x="62" y="200" width="116" height="64" rx="6" fill="rgba(11,12,16,0.78)" stroke="rgba(246,227,168,0.6)" strokeWidth="1" />
      <text x="120" y="230" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="19" letterSpacing="3" fill="#EDCF85">REFSALE</text>
      <text x="120" y="250" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="6.5" letterSpacing="2" fill="#A39D91">EAU DE PARFUM</text>
      {/* reflections */}
      <rect x="54" y="110" width="14" height="200" rx="7" fill="url(#shine)" opacity="0.7" />
      <rect x="180" y="120" width="6" height="150" rx="3" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}
