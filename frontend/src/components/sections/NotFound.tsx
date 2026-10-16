import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen pt-[68px] max-sm:pt-14 flex items-center justify-center">
      <div className="text-center px-6 py-16 max-w-md">
        <div className="text-8xl font-extrabold text-primary/15 leading-none mb-4 select-none">404</div>
        <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 flex items-center justify-center">
          <Search size={28} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Страница не найдена</h2>
        <p className="text-muted text-[15px] mb-8 leading-relaxed">
          Такой страницы не существует или она была удалена.
          Вернитесь на главную и найдите то, что искали.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-primary to-primary-light text-ink text-sm font-semibold shadow-[0_4px_20px_rgba(212,175,90,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(212,175,90,0.35)] transition-all"
        >
          <ArrowLeft size={16} /> На главную
        </Link>
      </div>
    </div>
  );
}
