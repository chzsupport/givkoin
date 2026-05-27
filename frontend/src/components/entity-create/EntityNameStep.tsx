import Image from 'next/image';
import { ENTITY_NAME_MAX_LENGTH } from './constants';
import { getEntityNameLength, limitEntityName } from './entityCreateUtils';
import type { EntityCreateTranslate } from './types';

type EntityNameStepProps = {
    changeMode: boolean;
    error: string | null;
    isSubmitting: boolean;
    name: string;
    selectedAvatar: string;
    t: EntityCreateTranslate;
    onNameChange: (value: string) => void;
    onSaveName: () => void;
};

export function EntityNameStep({
    changeMode,
    error,
    isSubmitting,
    name,
    selectedAvatar,
    t,
    onNameChange,
    onSaveName,
}: EntityNameStepProps) {
    const canSave = Boolean(name.trim()) && !isSubmitting;

    return (
        <div className="flex flex-col items-center justify-center flex-1 py-10">
            <div className="relative w-56 aspect-square rounded-2xl overflow-hidden border-4 border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.4)] mb-10">
                <Image
                    src={selectedAvatar}
                    alt="Selected avatar"
                    fill
                    sizes="224px"
                    className="object-contain"
                />
            </div>

            <h2 className="text-h2 font-bold uppercase tracking-[0.3em] mb-8 text-blue-400">
                {changeMode ? t('entity_create.name_title_change') : t('entity_create.name_title_create')}
            </h2>

            <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => onNameChange(limitEntityName(e.target.value))}
                maxLength={ENTITY_NAME_MAX_LENGTH}
                placeholder={t('entity_create.name_placeholder')}
                className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl px-8 py-5 text-center text-h2 focus:outline-none focus:border-blue-500/50 transition-all mb-6"
                disabled={isSubmitting}
            />
            <div className="mb-4 text-caption text-neutral-500">
                {getEntityNameLength(name)} / {ENTITY_NAME_MAX_LENGTH}
            </div>

            {error && (
                <div className="mb-4 text-red-400 text-body text-center">{error}</div>
            )}

            <button
                onClick={onSaveName}
                disabled={!canSave}
                className={`px-16 py-5 rounded-2xl font-bold uppercase tracking-[0.2em] text-secondary transition-all ${canSave
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl hover:scale-105 active:scale-95'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    }`}
            >
                {isSubmitting
                    ? (changeMode ? t('entity_create.changing') : t('entity_create.creating'))
                    : (changeMode ? t('entity_create.change_action') : t('entity_create.start_journey'))}
            </button>
        </div>
    );
}
