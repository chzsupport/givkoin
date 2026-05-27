import Image from 'next/image';
import type { EntityCreateTranslate } from './types';

type EntityPreviewModalProps = {
    previewAvatar: string;
    t: EntityCreateTranslate;
    onChoose: (avatar: string) => void;
    onClose: () => void;
};

export function EntityPreviewModal({
    previewAvatar,
    t,
    onChoose,
    onClose,
}: EntityPreviewModalProps) {
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 px-4 py-6 backdrop-blur-md">
            <div className="relative flex h-full max-h-[92vh] w-full max-w-6xl flex-col rounded-3xl border border-white/10 bg-neutral-950/95 p-4 shadow-2xl">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                        <div className="text-xs uppercase tracking-[0.3em] text-white/40">{t('entity_create.preview_title')}</div>
                        <div className="text-sm text-white/70">{t('entity_create.preview_desc')}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/80 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
                    >
                        {t('common.close')}
                    </button>
                </div>

                <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <Image
                        src={previewAvatar}
                        alt={t('entity_create.preview_alt')}
                        fill
                        sizes="100vw"
                        className="object-contain p-4"
                        priority
                    />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => onChoose(previewAvatar)}
                        className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {t('entity_create.select')}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/80 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
                    >
                        {t('entity_create.back_to_list')}
                    </button>
                </div>
            </div>
        </div>
    );
}
