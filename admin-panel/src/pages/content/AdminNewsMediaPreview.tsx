import { describeNewsMedia } from '../../utils/newsMedia';

export function AdminNewsMediaPreview({
  mediaUrl,
  title,
  compact = false,
}: {
  mediaUrl?: string | null;
  title?: string;
  compact?: boolean;
}) {
  const media = describeNewsMedia(mediaUrl);
  if (!media) return null;

  if (media.kind === 'image') {
    return (
      <img
        src={media.url}
        alt={title || ''}
        className={compact ? 'h-full w-full object-contain bg-slate-950' : 'h-auto w-full rounded bg-slate-950 object-contain'}
      />
    );
  }

  if (media.kind === 'video') {
    return (
      <video
        src={media.url}
        className={compact ? 'h-full w-full object-contain bg-slate-950' : 'h-auto w-full rounded bg-slate-950 object-contain'}
        controls={!compact}
        muted={compact}
        playsInline
        preload="metadata"
      />
    );
  }

  if (media.kind === 'audio') {
    if (compact) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 px-2 text-center">
          <div className="text-label text-slate-500">Аудио</div>
          <div className="mt-1 break-all text-xs font-semibold text-slate-200">{media.hostLabel}</div>
        </div>
      );
    }

    return (
      <div className="rounded bg-slate-950/70 p-4">
        <audio src={media.url} className="w-full" controls preload="metadata" />
      </div>
    );
  }

  if (media.kind === 'embed' && media.embedUrl) {
    if (compact && media.thumbnailUrl) {
      return <img src={media.thumbnailUrl} alt={title || media.providerLabel} className="h-full w-full object-cover" />;
    }

    if (compact) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 px-2 text-center">
          <div className="text-label text-slate-500">Видео</div>
          <div className="mt-1 text-xs font-semibold text-slate-200">{media.providerLabel}</div>
        </div>
      );
    }

    return (
      <div className="aspect-video w-full overflow-hidden rounded">
        <iframe
          src={media.embedUrl}
          title={title || media.providerLabel}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <div className={compact ? 'flex h-full w-full flex-col items-center justify-center bg-slate-900 px-2 text-center' : 'rounded bg-slate-950/70 p-4'}>
      <div className="text-label text-slate-500">{media.providerLabel}</div>
      <div className="mt-1 break-all text-xs font-semibold text-slate-200">{media.hostLabel}</div>
      {!compact && (
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-white/5"
        >
          Открыть ссылку
        </a>
      )}
    </div>
  );
}
