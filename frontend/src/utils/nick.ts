// Name colours that stay legible on white, picked by a hash of the author, so
// one person keeps one colour and neighbours rarely match.
const NICK_COLORS = ['#C2410C', '#1B5BB0', '#13723A', '#6326C9', '#B4232A', '#0E7490', '#A16207', '#BE185D'];

export function nickColor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return NICK_COLORS[Math.abs(h) % NICK_COLORS.length];
}

/** Up to two letters for an avatar circle: «Анна Петрова» → «АП». */
export function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
