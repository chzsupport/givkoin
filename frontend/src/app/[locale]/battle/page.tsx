'use client';

import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useSocketContext } from '@/context/SocketContext';
import { useToast } from '@/context/ToastContext';
import { BattlePageView } from './BattlePageView';
import { useActiveBattleLock } from './useActiveBattleLock';
import { useBattleDomeBlink } from './useBattleDomeBlink';
import { useBattleEnvironment } from './useBattleEnvironment';
import { useBattlePageRuntime } from './useBattlePageRuntime';
import { useBattlePageState } from './useBattlePageState';
import { useBattleRefs } from './useBattleRefs';
import { useBattleRulesModal } from './useBattleRulesModal';
import { useBattleSceneLayout } from './useBattleSceneLayout';
import { useLockPageScroll } from './useLockPageScroll';

export default function BattlePage() {
    const { user, updateUser } = useAuth();
    const socket = useSocketContext();
    const toast = useToast();
    const { language, t, localePath } = useI18n();

    useLockPageScroll();

    const state = useBattlePageState();
    const refs = useBattleRefs();
    const { clearDomeBlink, domeBlinkAt, triggerDomeBlink } = useBattleDomeBlink();
    const {
        performanceTier,
        useMobileBattleVideos,
        isTabVisible,
        isBrowserOnline,
        viewportSize,
    } = useBattleEnvironment();
    const userId = String(user?._id || user?.id || '').trim();

    const { battleLayout, battleVideoSources } = useBattleSceneLayout({
        performanceTier,
        viewportSize,
        domeBlinkAt,
        useMobileBattleVideos,
    });
    const { rulesModalVisible, closeRulesModal } = useBattleRulesModal(state.isBattleActive, user?._id);
    const { clearCurrentBattleLock } = useActiveBattleLock({
        battleId: state.battleId,
        battleEndsAtMs: state.battleEndsAtMs,
        isBattleActive: state.isBattleActive,
        summaryVisible: state.summaryVisible,
        userId,
    });

    const viewProps = useBattlePageRuntime({
        battleLayout,
        battleVideoSources,
        clearCurrentBattleLock,
        clearDomeBlink,
        closeRulesModal,
        isBrowserOnline,
        isTabVisible,
        language,
        localePath,
        performanceTier,
        refs,
        rulesModalVisible,
        socket,
        state,
        t,
        toast,
        triggerDomeBlink,
        updateUser,
        user,
        userId,
    });

    return <BattlePageView {...viewProps} />;
}
