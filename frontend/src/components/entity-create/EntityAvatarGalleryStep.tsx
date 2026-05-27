import Image from 'next/image';
import type { EntityCreateTranslate } from './types';

type EntityAvatarGalleryStepProps = {
    avatars: string[];
    avatarsLoading: boolean;
    canChange: boolean;
    changeMode: boolean;
    daysLeft: number;
    focusedAvatar: string | null;
    selectedAvatar: string | null;
    t: EntityCreateTranslate;
    onAvatarChoose: (avatar: string) => void;
    onAvatarFocus: (avatar: string) => void;
    onConfirm: () => void;
    onPreview: (avatar: string) => void;
};

export function EntityAvatarGalleryStep({
    avatars,
    avatarsLoading,
    canChange,
    changeMode,
    daysLeft,
    focusedAvatar,
    selectedAvatar,
    t,
    onAvatarChoose,
    onAvatarFocus,
    onConfirm,
    onPreview,
}: EntityAvatarGalleryStepProps) {
    const canContinue = Boolean(selectedAvatar) && (!changeMode || canChange) && !avatarsLoading && avatars.length > 0;

    return (
        <>
            <div className="text-center mb-10">
                <h1 className="text-h1 font-bold uppercase tracking-[0.2em] mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                    {changeMode ? t('entity_create.change_title') : t('entity_create.pick_appearance_title')}
                </h1>
                <p className="text-neutral-400 text-body">
                    {changeMode
                        ? t('entity_create.change_desc')
                        : t('entity_create.pick_appearance_desc')}
                </p>
                {changeMode && (
                    <div className="mt-4 text-tiny uppercase tracking-widest text-amber-300/80">
                        {canChange
                            ? t('entity_create.change_available')
                            : `${t('entity_create.change_available_in_prefix')} ${daysLeft} ${t('entity_create.change_available_in_suffix')}`}
                    </div>
                )}
            </div>

            {avatarsLoading ? (
                <div className="flex flex-1 items-center justify-center py-20 text-neutral-400">
                    {t('common.loading')}
                </div>
            ) : avatars.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-20 text-center text-neutral-500">
                    {t('entity_create.no_images')}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 flex-1">
                    {avatars.map((avatar, index) => (
                        <div key={index} className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => onAvatarFocus(avatar)}
                                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${selectedAvatar === avatar
                                    ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                                    : focusedAvatar === avatar
                                        ? 'border-white/40 shadow-[0_0_16px_rgba(255,255,255,0.12)]'
                                        : 'border-white/5 grayscale hover:grayscale-0'
                                    }`}
                            >
                                <Image
                                    src={avatar}
                                    alt={`Avatar ${index + 1}`}
                                    fill
                                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                                    className="object-contain"
                                />
                                {selectedAvatar === avatar && (
                                    <div className="absolute left-2 top-2 rounded-full bg-blue-500/90 px-2 py-1 text-caption font-bold uppercase tracking-widest text-white">
                                        {t('entity_create.selected')}
                                    </div>
                                )}
                            </button>

                            {focusedAvatar === avatar && (
                                <div className="flex flex-col gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onAvatarChoose(avatar)}
                                        className={`rounded-xl px-3 py-2 text-caption font-bold uppercase tracking-[0.18em] transition-all ${selectedAvatar === avatar
                                            ? 'border border-blue-400/40 bg-blue-500/20 text-blue-200'
                                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98]'
                                            }`}
                                    >
                                        {selectedAvatar === avatar ? t('entity_create.selected') : t('entity_create.select')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onPreview(avatar)}
                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-caption font-bold uppercase tracking-[0.18em] text-white/80 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
                                    >
                                        {t('entity_create.preview')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex justify-center pt-10">
                <button
                    onClick={onConfirm}
                    disabled={!canContinue}
                    className={`px-12 py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-secondary transition-all ${canContinue
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:scale-105 active:scale-95'
                        : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        }`}
                >
                    {changeMode ? t('common.next') : t('entity_create.select')}
                </button>
            </div>
        </>
    );
}
