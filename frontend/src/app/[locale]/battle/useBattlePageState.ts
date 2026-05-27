'use client';

import { useState } from 'react';
import type { BattleSummary } from '@/lib/battleSummary';
import type {
    BattleActiveVoiceCommand,
    BattleBaddieState,
    BattleInjury,
    BattleScenario,
    BattleSparkState,
    BattleWeakZone,
} from './battleTypes';

export function useBattlePageState() {
    const [userDamage, setUserDamage] = useState(0);
    const [battleId, setBattleId] = useState<string | null>(null);
    const [battleScenario, setBattleScenario] = useState<BattleScenario | null>(null);
    const [isBattleActive, setIsBattleActive] = useState(false);
    const [battleStartsAtMs, setBattleStartsAtMs] = useState<number | null>(null);
    const [battleEndsAtMs, setBattleEndsAtMs] = useState<number | null>(null);
    const [battleTimeLeftMs, setBattleTimeLeftMs] = useState<number>(0);
    const [weakZone, setWeakZone] = useState<BattleWeakZone | null>(null);
    const [, setBattleInjuries] = useState<BattleInjury[]>([]);
    const [baddies, setBaddies] = useState<BattleBaddieState[]>([]);
    const [spark, setSpark] = useState<BattleSparkState | null>(null);
    const [voiceCommand, setVoiceCommand] = useState<BattleActiveVoiceCommand | null>(null);
    const [voiceProgress, setVoiceProgress] = useState(0);
    const [comboCount, setComboCount] = useState(0);
    const [attendanceCount, setAttendanceCount] = useState(0);
    const [battleSummary, setBattleSummary] = useState<BattleSummary | null>(null);
    const [summaryVisible, setSummaryVisible] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [displayedLumens, setDisplayedLumens] = useState(0);
    const [sparkRewardLumens, setSparkRewardLumens] = useState(100);
    const [battleJoinedAtMs, setBattleJoinedAtMs] = useState<number | null>(null);
    const [summaryLoadAtMs, setSummaryLoadAtMs] = useState<number | null>(null);
    const [connectionLost, setConnectionLost] = useState(false);

    return {
        attendanceCount,
        baddies,
        battleEndsAtMs,
        battleId,
        battleJoinedAtMs,
        battleScenario,
        battleStartsAtMs,
        battleSummary,
        battleTimeLeftMs,
        comboCount,
        connectionLost,
        displayedLumens,
        isBattleActive,
        setAttendanceCount,
        setBaddies,
        setBattleEndsAtMs,
        setBattleId,
        setBattleInjuries,
        setBattleJoinedAtMs,
        setBattleScenario,
        setBattleStartsAtMs,
        setBattleSummary,
        setBattleTimeLeftMs,
        setComboCount,
        setConnectionLost,
        setDisplayedLumens,
        setIsBattleActive,
        setSpark,
        setSparkRewardLumens,
        setSummaryLoadAtMs,
        setSummaryLoading,
        setSummaryVisible,
        setUserDamage,
        setVoiceCommand,
        setVoiceProgress,
        setWeakZone,
        spark,
        sparkRewardLumens,
        summaryLoadAtMs,
        summaryLoading,
        summaryVisible,
        userDamage,
        voiceCommand,
        voiceProgress,
        weakZone,
    };
}
