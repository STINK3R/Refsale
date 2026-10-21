import { useRef, useState } from 'react';
import { ImagePlus, Paperclip, Play, X, Loader2 } from 'lucide-react';
import { uploadFile } from '../../api/client';
import { isVideoUrl } from '../../utils/media';

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
  /** Short videos too (chats): mp4, webm, mov up to 50 MB. */
  video?: boolean;
}

// Mirrors the extensions the backend accepts.
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export default function ImageUploader({
  value, onChange, userId, prefix, max = 4, compact = false, disabled = false, video = false,
}: ImageUploaderProps) {
  const noun = video ? 'файлов' : 'фото';
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError('');
    const room = max - value.length;
    if (room <= 0) { setError(`Максимум ${max} ${noun}`); return; }

    const chosen = Array.from(files).slice(0, room);
    const isVid = (f: File) => f.type.startsWith('video/');
    if (!video && chosen.some(isVid)) { setError('Здесь можно приложить только фото'); return; }
    if (chosen.some(f => isVid(f) && f.size > MAX_VIDEO_BYTES)) { setError('Видео больше 50 МБ — обрежьте его или выберите покороче'); return; }
    if (chosen.some(f => !isVid(f) && f.size > MAX_IMAGE_BYTES)) { setError('Фото больше 10 МБ — выберите файл поменьше'); return; }

    setBusy(true);
    const uploaded: string[] = [];
    for (const file of chosen) {
      const url = await uploadFile(file, prefix, userId);
      if (url) uploaded.push(url);
    }
    setBusy(false);
    if (!uploaded.length) { setError(video ? 'Не удалось загрузить файл' : 'Не удалось загрузить фото'); return; }
    if (uploaded.length < chosen.length) setError(video ? 'Часть файлов не загрузилась' : 'Часть фото не загрузилась');
    onChange([...value, ...uploaded]);
  };

  const remove = (url: string) => onChange(value.filter(u => u !== url));

  const thumb = compact ? 'w-12 h-12' : 'w-16 h-16';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {value.map(url => (
          <div key={url} className={`${thumb} relative overflow-hidden rounded-ctl-xs border border-border bg-bg group`}>
            {isVideoUrl(url) ? (
              <>
                <video src={url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center pointer-events-none"><Play size={16} className="text-white drop-shadow" fill="currentColor" /></span>
              </>
            ) : (
              <img src={url} alt="" className="w-full h-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => remove(url)}
              aria-label={isVideoUrl(url) ? 'Удалить видео' : 'Удалить фото'}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-ink/45 text-white flex items-center justify-center cursor-pointer border-none hover:bg-ink/45 transition-colors"
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
            title={video ? 'Прикрепить фото или видео' : 'Добавить фото'}
            aria-label={video ? 'Прикрепить фото или видео' : 'Добавить фото'}
            className={`${thumb} rounded-ctl-xs border-[1.5px] border-dashed border-border bg-bg text-muted flex items-center justify-center cursor-pointer hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-wait`}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : video ? <Paperclip size={18} /> : <ImagePlus size={18} />}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={video ? `${IMAGE_ACCEPT},${VIDEO_ACCEPT}` : IMAGE_ACCEPT}
          multiple={max > 1}
          className="hidden"
          onChange={e => { pick(e.target.files); e.target.value = ''; }}
        />
      </div>

      {error && <span className="text-[11px] text-danger">{error}</span>}
      {!error && !compact && value.length === 0 && (
        <span className="text-[11px] text-muted">{video ? `До ${max} файлов: фото до 10 МБ, видео до 50 МБ` : `Можно приложить до ${max} фото, до 10 МБ каждое`}</span>
      )}
    </div>
  );
}
