import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useAuthStore, useNotificationStore } from '../../store';
import { setAvatar, uploadFile } from '../../api/client';
import Avatar from '../ui/Avatar';
import { squareAvatar } from '../../utils/avatar';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The profile's picture: upload, replace, remove. It is shown to other people
 * next to reviews and forum posts, so it goes up only with the tick that
 * allows that (a consent of its own, logged on the server).
 */
export default function AvatarPicker() {
  const { user, setUser } = useAuthStore();
  const show = useNotificationStore((s) => s.show);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  if (!user) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { show('Картинка больше 5 МБ', 'error'); return; }
    setBusy(true);
    try {
      const url = await uploadFile(await squareAvatar(file), 'avatar', user.id);
      if (!url) { show('Не удалось загрузить', 'error'); return; }
      const err = await setAvatar(url, true);
      if (err) { show(err, 'error'); return; }
      setUser({ ...user, avatar_url: url });
      show('Аватар обновлён');
    } catch { show('Не удалось обработать картинку', 'error'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  const remove = async () => {
    setBusy(true);
    const err = await setAvatar('', false);
    setBusy(false);
    if (err) { show(err, 'error'); return; }
    setUser({ ...user, avatar_url: '' });
    show('Аватар убран');
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => (consent || user.avatar_url ? input.current?.click() : show('Отметьте, что аватар можно показывать', 'error'))}
        className="relative shrink-0 rounded-full cursor-pointer group"
        aria-label="Сменить аватар"
      >
        <Avatar name={user.full_name} url={user.avatar_url} colorKey={`u${user.id}`} size={64} />
        <span className="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-sun border-2 border-ink grid place-items-center group-hover:bg-ink group-hover:text-sun transition-colors">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} strokeWidth={2.4} />}
        </span>
      </button>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="min-w-0">
        <div className="font-display text-[24px] leading-none text-text truncate">{user.full_name}</div>
        <div className="text-[13px] text-muted truncate mt-1">{user.email}</div>
        {user.avatar_url ? (
          <button type="button" onClick={remove} disabled={busy} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-danger cursor-pointer">
            <Trash2 size={12} /> Убрать аватар
          </button>
        ) : (
          <label className="mt-1.5 flex items-start gap-2 text-[12px] leading-snug text-muted cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[#111]" />
            Аватар по желанию. Разрешаю показывать его другим — в отзывах и на форуме
          </label>
        )}
      </div>
    </div>
  );
}
