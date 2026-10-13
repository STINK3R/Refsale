import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { uploadFile } from '../../api/client';

/**
 * Attach-photos control shared by reviews and chats.
 *
 * Uploads go through /api/upload, which needs a signed-in member — so this is
 * only rendered where the user is already authenticated.
 */
interface ImageUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  userId: number;
  prefix: string;
  max?: number;
  compact?: boolean;
  disabled?: boolean;
}

// Mirrors the extensions the backend accepts for images.
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const MAX_BYTES = 10 * 1024 * 1024;

export default function ImageUploader({
  value, onChange, userId, prefix, max = 4, compact = false, disabled = false,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError('');
    const room = max - value.length;
    if (room <= 0) { setError(`Максимум ${max} фото`); return; }

    const chosen = Array.from(files).slice(0, room);
    const tooBig = chosen.find(f => f.size > MAX_BYTES);
    if (tooBig) { setError('Фото больше 10 МБ — выберите файл поменьше'); return; }

    setBusy(true);
    const uploaded: string[] = [];
    for (const file of chosen) {
      const url = await uploadFile(file, prefix, userId);
      if (url) uploaded.push(url);
    }
    setBusy(false);
    if (!uploaded.length) { setError('Не удалось загрузить фото'); return; }
    if (uploaded.length < chosen.length) setError('Часть фото не загрузилась');
    onChange([...value, ...uploaded]);
  };

  const remove = (url: string) => onChange(value.filter(u => u !== url));

  const thumb = compact ? 'w-12 h-12' : 'w-16 h-16';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {value.map(url => (
          <div key={url} className={`${thumb} relative rounded-lg overflow-hidden border border-border bg-bg group`}>
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => remove(url)}
              aria-label="Удалить фото"
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer border-none hover:bg-black/80 transition-colors"
            >
              <X size={11} />
            </button>
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
            title="Добавить фото"
            className={`${thumb} rounded-lg border-[1.5px] border-dashed border-border bg-bg text-muted flex items-center justify-center cursor-pointer hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-wait`}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple={max > 1}
          className="hidden"
          onChange={e => { pick(e.target.files); e.target.value = ''; }}
        />
      </div>

      {error && <span className="text-[11px] text-danger">{error}</span>}
      {!error && !compact && value.length === 0 && (
        <span className="text-[11px] text-muted">Можно приложить до {max} фото, до 10 МБ каждое</span>
      )}
    </div>
  );
}
