'use client';

import { useAuth } from '@/context/AuthContext';
import { PageBackground } from '@/components/PageBackground';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EntityAskModal } from '@/components/entity/EntityAskModal';
import { apiPost } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';
import { EntityChangeConfirmModal } from '@/components/entity-profile/EntityChangeConfirmModal';
import { EntityProfileAdPanel } from '@/components/entity-profile/EntityProfileAdPanel';
import { EntityProfileDiagnosticsPanel } from '@/components/entity-profile/EntityProfileDiagnosticsPanel';
import { EntityProfileHistoryPanel } from '@/components/entity-profile/EntityProfileHistoryPanel';
import { EntityProfileSidebar } from '@/components/entity-profile/EntityProfileSidebar';
import { EntityProfileStatusPanel } from '@/components/entity-profile/EntityProfileStatusPanel';
import { getEntityProfileViewData } from '@/components/entity-profile/entityProfileViewData';
import { useEntityMoodDiagnostics, useEntityProfileData } from '@/components/entity-profile/useEntityProfileData';
import { useEntityProfileLayout } from '@/components/entity-profile/useEntityProfileLayout';

export default function EntityProfilePage() {
    const { user, refreshUser, updateUser } = useAuth();
    const router = useRouter();
    const { localePath, t } = useI18n();
    const { isDesktop } = useEntityProfileLayout();

    const [isFaqOpen, setIsFaqOpen] = useState(false);
    const [showChangeConfirm, setShowChangeConfirm] = useState(false);

    const { entityData, entityLoading } = useEntityProfileData({ user, updateUser });

    useEffect(() => {
        if (user && !entityLoading && !entityData) {
            router.replace(localePath('/entity/create'));
        }
    }, [user, entityLoading, entityData, router, localePath]);
    const entity = entityData;
    const entityId = entity?._id;
    const moodDiag = useEntityMoodDiagnostics(entityId);

    if (!entity) return null;

    const {
        canChangeEntity,
        daysUntilChange,
        isSated,
        moodEffectText,
        moodLabel,
        satietyRemainingText,
    } = getEntityProfileViewData({ entity, moodDiag, t });

    return (
        <div className="relative min-h-full lg:h-full w-full text-white flex flex-col overflow-y-auto lg:overflow-hidden pb-6 lg:pb-0">
            <PageBackground />

            {/* Content Wrapper - Fills available space */}
            <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:h-full px-4 sm:px-6 lg:px-10 py-3">

                {/* Back Button */}
                <div className="mb-3 shrink-0">
                    <Link
                        href={localePath('/tree')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('entity_profile.to_tree')}
                    </Link>
                </div>

                {/* Main Layout */}
                <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 flex-1 min-h-0">

                    <EntityProfileSidebar
                        canChangeEntity={canChangeEntity}
                        daysUntilChange={daysUntilChange}
                        entity={entity}
                        onAsk={() => setIsFaqOpen(true)}
                        onRequestChange={() => setShowChangeConfirm(true)}
                        t={t}
                    />

                    {/* Right Column: Name, Stats, Ad, Events */}
                    <div className="w-full flex-1 flex flex-col gap-3 xl:min-h-0 xl:overflow-hidden">
                        <EntityProfileAdPanel isDesktop={isDesktop} t={t} />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 xl:gap-4 flex-1 min-h-0">
                            <div className="flex flex-col gap-3">
                                <EntityProfileStatusPanel
                                    entity={entity}
                                    isSated={isSated}
                                    localePath={localePath}
                                    moodEffectText={moodEffectText}
                                    moodLabel={moodLabel}
                                    satietyRemainingText={satietyRemainingText}
                                    t={t}
                                />
                                <EntityProfileDiagnosticsPanel moodDiag={moodDiag} t={t} />
                            </div>

                            <EntityProfileHistoryPanel entity={entity} t={t} />
                        </div>
                    </div>
                </div>
            </div>

            <EntityAskModal
                isOpen={isFaqOpen}
                onClose={() => setIsFaqOpen(false)}
                entityName={entity.name}
            />

            <EntityChangeConfirmModal
                isOpen={showChangeConfirm}
                onCancel={() => setShowChangeConfirm(false)}
                onConfirm={async () => {
                    try {
                        await apiPost('/entity/reset', {});
                        await refreshUser();
                        setShowChangeConfirm(false);
                        router.push(localePath('/entity/create'));
                    } catch (error) {
                        console.error('Failed to reset entity:', error);
                    }
                }}
                t={t}
            />
        </div>
    );
}

