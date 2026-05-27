import Image from 'next/image';
import type { EntityCreateTranslate } from './types';

type EntityConfirmStepProps = {
    agreed: boolean;
    changeMode: boolean;
    selectedAvatar: string;
    t: EntityCreateTranslate;
    onAgreeChange: (value: boolean) => void;
    onBack: () => void;
    onFinalCreate: () => void;
};

export function EntityConfirmStep({
    agreed,
    changeMode,
    selectedAvatar,
    t,
    onAgreeChange,
    onBack,
    onFinalCreate,
}: EntityConfirmStepProps) {
    return (
        <div className="flex flex-col items-center max-w-2xl mx-auto py-10">
            <div className="relative w-40 aspect-square rounded-xl overflow-hidden border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] mb-8">
                <Image
                    src={selectedAvatar}
                    alt="Selected avatar"
                    fill
                    sizes="160px"
                    className="object-contain"
                />
            </div>

            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-8 mb-8 space-y-4">
                <h2 className="text-red-400 font-bold uppercase tracking-widest text-center">{t('entity_create.warning_title')}</h2>
                <p className="text-body text-neutral-300 leading-relaxed text-justify">
                    {changeMode ? (
                        <>
                            {t('entity_create.change_warning_p1')}
                            <br /><br />
                            {t('entity_create.change_warning_p2')}
                        </>
                    ) : (
                        <>
                            {t('entity_create.create_warning_p1')}
                            <br /><br />
                            {t('entity_create.create_warning_p2')}
                            <br /><br />
                            {t('entity_create.create_warning_p3')}
                        </>
                    )}
                </p>
            </div>

            <label className="flex items-center gap-4 cursor-pointer group mb-10">
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${agreed ? 'bg-blue-600 border-blue-600' : 'border-white/20 group-hover:border-white/40'}`}>
                    {agreed && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
                <input type="checkbox" className="hidden" checked={agreed} onChange={(e) => onAgreeChange(e.target.checked)} />
                <span className="text-body text-neutral-400 group-hover:text-neutral-200 transition-colors">
                    {changeMode ? t('entity_create.confirm_reset') : t('entity_create.read_and_agree')}
                </span>
            </label>

            <div className="flex gap-4">
                <button onClick={onBack} className="px-8 py-4 rounded-xl border border-white/10 text-neutral-500 hover:text-white transition-all uppercase tracking-widest text-tiny">{t('common.back')}</button>
                <button
                    onClick={onFinalCreate}
                    disabled={!agreed}
                    className={`px-12 py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-secondary transition-all ${agreed
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:scale-105 active:scale-95'
                        : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        }`}
                >
                    {changeMode ? t('common.confirm') : t('common.create')}
                </button>
            </div>
        </div>
    );
}
