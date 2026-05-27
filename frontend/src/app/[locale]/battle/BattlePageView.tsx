'use client';

import type { ComponentProps } from 'react';
import { BattleSummaryOverlay } from '@/components/battle/BattleSummaryOverlay';
import { VOICE_COMMAND_STOP } from './battleConstants';
import type { BattleActiveVoiceCommand } from './battleTypes';
import { formatBattleTimeLeft } from './battleClientState';
import {
    BattleConnectionLostOverlay,
    BattleHud,
    BattleRulesModal,
    BattleVoiceCommandBanner,
} from './BattlePageOverlays';
import {
    BattleActiveScene,
    BattleBackButton,
    BattleSceneFallback,
    BattleSparkPickup,
} from './BattlePageScene';

export type BattlePageViewProps = {
    activeSceneProps: Omit<ComponentProps<typeof BattleActiveScene>, 'timeLeftLabel'>;
    battleSummary: ComponentProps<typeof BattleSummaryOverlay>['summary'];
    battleTimeLeftMs: number;
    closeRulesModal: () => void;
    comboHudProps: Omit<
        ComponentProps<typeof BattleHud>,
        'visible' | 'damageLabel' | 'participantsLabel' | 'lumensLabel' | 'comboLabel'
    >;
    connectionLost: boolean;
    handleSummaryModalPointer: ComponentProps<'div'>['onPointerDownCapture'];
    localePath: (path: string) => string;
    redirectToTree: () => void;
    rulesModalVisible: boolean;
    showActiveBattleScene: boolean;
    showSummaryBackdrop: boolean;
    sparkPickupProps: Omit<ComponentProps<typeof BattleSparkPickup>, 'visible'>;
    summaryLoading: boolean;
    summaryVisible: boolean;
    t: (key: string, fallback?: string) => string;
    voiceCommand: BattleActiveVoiceCommand | null;
    voiceProgress: number;
};

export function BattlePageView({
    activeSceneProps,
    battleSummary,
    battleTimeLeftMs,
    closeRulesModal,
    comboHudProps,
    connectionLost,
    handleSummaryModalPointer,
    localePath,
    redirectToTree,
    rulesModalVisible,
    showActiveBattleScene,
    showSummaryBackdrop,
    sparkPickupProps,
    summaryLoading,
    summaryVisible,
    t,
    voiceCommand,
    voiceProgress,
}: BattlePageViewProps) {
    const voiceLabel = voiceCommand
        ? `${t('battle.darkness_speaks')}: ${voiceCommand.text === VOICE_COMMAND_STOP ? t('battle.stop') : t('battle.shoot')}!`
        : '';
    const canHealBranch = Boolean(battleSummary?.injury && battleSummary.result === 'dark');

    return (
        <div className="relative w-full h-[100dvh] min-h-[100dvh] bg-black overflow-hidden overscroll-none z-[9999] lg:fixed lg:inset-0">
            {showActiveBattleScene ? (
                <BattleActiveScene
                    timeLeftLabel={formatBattleTimeLeft(battleTimeLeftMs)}
                    {...activeSceneProps}
                />
            ) : (
                <BattleSceneFallback showSummaryBackdrop={showSummaryBackdrop} />
            )}

            <BattleSparkPickup
                visible={showActiveBattleScene}
                {...sparkPickupProps}
            />

            <BattleVoiceCommandBanner
                visible={Boolean(showActiveBattleScene && voiceCommand)}
                label={voiceLabel}
                progress={voiceProgress}
            />

            <BattleConnectionLostOverlay
                visible={Boolean(showActiveBattleScene && connectionLost)}
                title={t('battle.connection_lost_title')}
                description={t('battle.connection_lost_desc')}
                actionLabel={t('battle.refresh_page')}
                onRefresh={() => window.location.reload()}
            />

            <BattleBackButton
                visible={showActiveBattleScene}
                label={t('battle.to_tree')}
                onClick={redirectToTree}
            />

            <BattleHud
                visible={showActiveBattleScene}
                damageLabel={t('battle.your_damage_hud')}
                participantsLabel={t('battle.participants_hud')}
                lumensLabel={t('battle.lumens_hud')}
                comboLabel={t('battle.combo_hud')}
                {...comboHudProps}
            />

            <BattleRulesModal
                visible={Boolean(showActiveBattleScene && rulesModalVisible)}
                title={t('battle.rules_modal_title')}
                paragraphs={[
                    t('battle.rules_modal_p1'),
                    t('battle.rules_modal_p2'),
                    t('battle.rules_modal_p3'),
                ]}
                rulesHref={localePath('/rules')}
                openRulesLabel={t('battle.open_rules')}
                okLabel={t('common.ok')}
                onClose={closeRulesModal}
            />

            <div onPointerDownCapture={handleSummaryModalPointer}>
                <BattleSummaryOverlay
                    isOpen={summaryVisible}
                    summary={battleSummary}
                    loading={summaryLoading}
                    onClose={redirectToTree}
                    onPrimaryAction={redirectToTree}
                    primaryActionLabel={t('battle.back_to_tree')}
                    onSecondaryAction={canHealBranch ? redirectToTree : null}
                    secondaryActionLabel={canHealBranch ? t('battle.heal_branch') : null}
                />
            </div>
        </div>
    );
}
