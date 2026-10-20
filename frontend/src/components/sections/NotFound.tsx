import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Meerkat from '../mascot/Meerkat';

export default function NotFound() {
  return (
    <div className="min-h-screen pt-[calc(var(--header-h,68px)+24px)] flex items-center justify-center">
      <div className="text-center px-6 py-16 max-w-md">
        <Meerkat pose="thinking" width={170} className="mx-auto" />
        <div className="font-display text-[64px] leading-none text-ink mt-4">404</div>
        <h2 className="font-display text-[22px] text-ink mt-3 mb-2">Страница не найдена</h2>
        <p className="text-muted text-[15px] mb-8 leading-relaxed">
          Такой страницы нет или её удалили. Вернитесь на главную — там всё самое выгодное.
        </p>
        <Link to="/" className="btn-primary"><ArrowLeft size={16} strokeWidth={2.2} /> На главную</Link>
      </div>
    </div>
  );
}
