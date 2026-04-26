'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { PageBackground } from '@/components/PageBackground';
import { apiPost } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';

export default function CreateEntityPage() {
    const [step, setStep] = useState<'gallery' | 'confirm' | 'name'>('gallery');
    const [avatars, setAvatars] = useState<string[]>([]);
    const [avatarsLoading, setAvatarsLoading] = useState(true);
    const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
    const [focusedAvatar, setFocusedAvatar] = useState<string | null>(null);
    const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
    const [agreed, setAgreed] = useState(false);
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { refreshUser, user, isAuthLoading } = useAuth();
    const router = useRouter();
    const { t, localePath } = useI18n();
    const searchParams = useSearchParams();
    const changeMode = Boolean(searchParams?.get('change') === '1' && user?.entity);
    const now = Date.now();
    const changeCooldownMs = 7 * 24 * 60 * 60 * 1000;
    const changeAvailableAt = useMemo(() => {
        if (!changeMode || !user?.entity?.createdAt) return null;
        return new Date(new Date(user.entity.createdAt).getTime() + changeCooldownMs);
    }, [changeMode, user?.entity?.createdAt, changeCooldownMs]);
    const msLeft = changeAvailableAt ? changeAvailableAt.getTime() - now : 0;
    const daysLeft = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;
    const canChange = !changeMode || msLeft <= 0;

    useEffect(() => {
        if (isAuthLoading) return;
        if (user?.entity) {
            router.replace(localePath('/entity/profile'));
        }
    }, [isAuthLoading, localePath, router, user?.entity]);

    useEffect(() => {
        let cancelled = false;

        const loadAvatars = async () => {
            setAvatarsLoading(true);
            try {
                const res = await fetch('/api/entity-avatars', { cache: 'no-store' });
                const data = await res.json().catch(() => ({ items: [] }));
                const items = Array.isArray(data?.items)
                    ? (data.items as unknown[]).filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
                    : [];

                if (!cancelled) {
                    setAvatars(items);
                    setFocusedAvatar((prev) => prev && items.includes(prev) ? prev : null);
                    setSelectedAvatar((prev) => prev && items.includes(prev) ? prev : null);
                }
            } catch (e) {
                console.error('Failed to load entity avatars:', e);
                if (!cancelled) {
                    setAvatars([]);
                }
            } finally {
                if (!cancelled) {
                    setAvatarsLoading(false);
                }
            }
        };

        loadAvatars();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleConfirm = () => {
        setStep('confirm');
    };

    const handleFinalCreate = () => {
        setStep('name');
    };

    const handleAvatarFocus = (avatar: string) => {
        setFocusedAvatar(avatar);
    };

    const handleAvatarChoose = (avatar: string) => {
        setSelectedAvatar(avatar);
        setFocusedAvatar(avatar);
    };

    const handleSaveName = async () => {
        if (!selectedAvatar || !name.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            await apiPost(changeMode ? '/entity/change' : '/entity', {
                name: name.trim(),
                avatarUrl: selectedAvatar,
                confirmReset: changeMode ? agreed : undefined,
            });

            // Refresh user data to include new entity
            await refreshUser();

            router.push(localePath('/tree'));
        } catch (err: unknown) {
            console.error('Create entity error:', err);
            const message = err instanceof Error ? err.message : '';
            setError(message || t('entity_create.create_error'));
            setIsSubmitting(false);
        }
    };

    return (
        <main className="relative min-h-screen w-full overflow-x-hidden bg-neutral-950 text-white">
            <PageBackground />

            <div className="relative z-10 container mx-auto px-4 py-20 flex flex-col items-center">
                <div className="max-w-4xl w-full bg-neutral-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl min-h-[600px] flex flex-col">

                    {step === 'gallery' && (
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
                                            onClick={() => handleAvatarFocus(avatar)}
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
                                                    onClick={() => handleAvatarChoose(avatar)}
                                                    className={`rounded-xl px-3 py-2 text-caption font-bold uppercase tracking-[0.18em] transition-all ${selectedAvatar === avatar
                                                        ? 'border border-blue-400/40 bg-blue-500/20 text-blue-200'
                                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98]'
                                                        }`}
                                                >
                                                    {selectedAvatar === avatar ? t('entity_create.selected') : t('entity_create.select')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewAvatar(avatar)}
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
                                    onClick={handleConfirm}
                                    disabled={!selectedAvatar || avatarsLoading || avatars.length === 0 || (changeMode && !canChange)}
                                    className={`px-12 py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-secondary transition-all ${selectedAvatar
                                        && (!changeMode || canChange)
                                        && !avatarsLoading
                                        && avatars.length > 0
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:scale-105 active:scale-95'
                                        : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                        }`}
                                >
                                    {changeMode ? t('common.next') : t('entity_create.select')}
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'confirm' && (
                        <div className="flex flex-col items-center max-w-2xl mx-auto py-10">
                            <div className="relative w-40 aspect-square rounded-xl overflow-hidden border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] mb-8">
                                <Image
                                    src={selectedAvatar!}
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
                                <input type="checkbox" className="hidden" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                                <span className="text-body text-neutral-400 group-hover:text-neutral-200 transition-colors">
                                    {changeMode ? t('entity_create.confirm_reset') : t('entity_create.read_and_agree')}
                                </span>
                            </label>

                            <div className="flex gap-4">
                                <button onClick={() => setStep('gallery')} className="px-8 py-4 rounded-xl border border-white/10 text-neutral-500 hover:text-white transition-all uppercase tracking-widest text-tiny">{t('common.back')}</button>
                                <button
                                    onClick={handleFinalCreate}
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
                    )}

                    {step === 'name' && (
                        <div className="flex flex-col items-center justify-center flex-1 py-10">
                            <div className="relative w-56 aspect-square rounded-2xl overflow-hidden border-4 border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.4)] mb-10">
                                <Image
                                    src={selectedAvatar!}
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
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('entity_create.name_placeholder')}
                                className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl px-8 py-5 text-center text-h2 focus:outline-none focus:border-blue-500/50 transition-all mb-6"
                                disabled={isSubmitting}
                            />

                            {error && (
                                <div className="mb-4 text-red-400 text-body text-center">{error}</div>
                            )}

                            <button
                                onClick={handleSaveName}
                                disabled={!name.trim() || isSubmitting}
                                className={`px-16 py-5 rounded-2xl font-bold uppercase tracking-[0.2em] text-secondary transition-all ${name.trim() && !isSubmitting
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl hover:scale-105 active:scale-95'
                                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                    }`}
                            >
                                {isSubmitting
                                    ? (changeMode ? t('entity_create.changing') : t('entity_create.creating'))
                                    : (changeMode ? t('entity_create.change_action') : t('entity_create.start_journey'))}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {previewAvatar && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 px-4 py-6 backdrop-blur-md">
                    <div className="relative flex h-full max-h-[92vh] w-full max-w-6xl flex-col rounded-3xl border border-white/10 bg-neutral-950/95 p-4 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                                <div className="text-xs uppercase tracking-[0.3em] text-white/40">{t('entity_create.preview_title')}</div>
                                <div className="text-sm text-white/70">{t('entity_create.preview_desc')}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewAvatar(null)}
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
                                onClick={() => {
                                    handleAvatarChoose(previewAvatar);
                                    setPreviewAvatar(null);
                                }}
                                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {t('entity_create.select')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewAvatar(null)}
                                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/80 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
                            >
                                {t('entity_create.back_to_list')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

