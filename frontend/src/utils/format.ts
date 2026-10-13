export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return 'По запросу';
  return Number(price).toLocaleString('ru-RU') + '\u00A0₽';
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return '—';
  }
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function getFirstName(fullName: string): string {
  const parts = fullName.split(' ');
  return parts[1] || parts[0] || '';
}

export function getBadgePriority(badge?: string | null): number {
  const map: Record<string, number> = { vip: 1, hit: 2, sale: 3, new: 4 };
  return badge ? (map[badge] || 99) : 99;
}

/** The API stores user text HTML-escaped; React escapes on render anyway. */
export function unescapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
