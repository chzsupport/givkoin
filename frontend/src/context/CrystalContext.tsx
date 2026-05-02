'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { usePathname } from 'next/navigation';
import { API_URL } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';
import { normalizeSitePath } from '@/utils/sitePath';

interface CrystalLocation {
    shardId: string;
    pageName: string;
    url: string;
    shardIndex: number;
    side?: 'left' | 'right';
}

interface LocalCrystalEntry {
    shardId: string;
    shardIndex: number;
    pagePath: string;
    collectedAt: string;
}

interface LocalCrystalProgress {
    collectedShards: number[];
    collectedShardIds: string[];
    collectedEntries: LocalCrystalEntry[];
    rewardGranted: boolean;
    pendingServerSync: boolean;
}

interface CrystalContextType {
    collectedShards: number[];
    collectedShardIds: string[];
    currentPageShard: CrystalLocation | null;
    collectShard: (location: CrystalLocation) => Promise<void>;
    isHeartComplete: boolean;
    refreshStatus: () => Promise<void>;
    collectionDisabled: boolean;
    collectionDisabledMessage: string;
    rewardGranted: boolean;
}

const CrystalContext = createContext<CrystalContextType | undefined>(undefined);

function emptyProgress(): LocalCrystalProgress {
    return {
        collectedShards: [],
        collectedShardIds: [],
        collectedEntries: [],
        rewardGranted: false,
        pendingServerSync: false,
    };
}

function buildStorageKey(userId: string, sessionKey: string) {
    return `crystal-progress:${userId}:${sessionKey}`;
}

function readLocalProgress(userId: string, sessionKey: string): LocalCrystalProgress {
    if (typeof window === 'undefined' || !userId || !sessionKey) {
        return emptyProgress();
    }

    try {
        const raw = window.localStorage.getItem(buildStorageKey(userId, sessionKey));
        if (!raw) return emptyProgress();
        const parsed = JSON.parse(raw);
        const collectedEntries = Array.isArray(parsed?.collectedEntries)
            ? parsed.collectedEntries
                .map((entry: unknown) => {
                    if (!entry || typeof entry !== 'object') return null;
                    const row = entry as Record<string, unknown>;
                    const shardId = String(row.shardId || '').trim();
                    const shardIndex = Number(row.shardIndex);
                    const rawPagePath = String(row.pagePath || '').trim();
                    if (!shardId || !Number.isFinite(shardIndex)) return null;
                    return {
                        shardId,
                        shardIndex,
                        pagePath: rawPagePath ? normalizeSitePath(rawPagePath) : '',
                        collectedAt: String(row.collectedAt || ''),
                    };
                })
                .filter(Boolean) as LocalCrystalEntry[]
            : [];

        const collectedShardIds = Array.from(new Set(collectedEntries.map((entry) => entry.shardId)));
        const collectedShards = Array.from(new Set(collectedEntries.map((entry) => entry.shardIndex))).sort((a, b) => a - b);

        return {
            collectedShards,
            collectedShardIds,
            collectedEntries,
            rewardGranted: Boolean(parsed?.rewardGranted),
            pendingServerSync: Boolean(parsed?.pendingServerSync),
        };
    } catch {
        return emptyProgress();
    }
}

function writeLocalProgress(userId: string, sessionKey: string, progress: LocalCrystalProgress) {
    if (typeof window === 'undefined' || !userId || !sessionKey) return;
    window.localStorage.setItem(buildStorageKey(userId, sessionKey), JSON.stringify(progress));
}

export const CrystalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { t } = useI18n();
    const pathname = usePathname();
    const cleanPathname = normalizeSitePath(pathname || '/');

    const [collectedShards, setCollectedShards] = useState<number[]>([]);
    const [collectedShardIds, setCollectedShardIds] = useState<string[]>([]);
    const [collectedEntries, setCollectedEntries] = useState<LocalCrystalEntry[]>([]);
    const [locations, setLocations] = useState<CrystalLocation[]>([]);
    const [currentPageShard, setCurrentPageShard] = useState<CrystalLocation | null>(null);
    const [collectionDisabled, setCollectionDisabled] = useState(false);
    const [collectionDisabledMessage, setCollectionDisabledMessage] = useState('');
    const [rewardGranted, setRewardGranted] = useState(false);
    const [pendingServerSync, setPendingServerSync] = useState(false);
    const [sessionKey, setSessionKey] = useState('');
    const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);

    const refreshStatus = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`${API_URL}/crystal/status`, {
                credentials: 'include',
            });
            if (!res.ok) return;

            const data = await res.json();
            const nextSessionKey = String(data.sessionKey || '');
            const nextLocations = Array.isArray(data.locations)
                ? data.locations.map((location: CrystalLocation) => ({
                    ...location,
                    url: normalizeSitePath(location.url),
                }))
                : [];
            const userId = String(user.id);

            setSessionKey(nextSessionKey);
            setLocations(nextLocations);
            setCollectionDisabled(Boolean(data.collectionDisabled));
            setCollectionDisabledMessage(String(data.collectionDisabledMessage || ''));

            if (Boolean(data.rewardGranted)) {
                const doneShards = Array.isArray(data.collectedShards) ? data.collectedShards : nextLocations.map((location: CrystalLocation) => location.shardIndex);
                const doneShardIds = Array.isArray(data.collectedShardIds) ? data.collectedShardIds : nextLocations.map((location: CrystalLocation) => location.shardId);
                setCollectedShards(doneShards);
                setCollectedShardIds(doneShardIds);
                setCollectedEntries([]);
                setRewardGranted(true);
                setPendingServerSync(false);
                writeLocalProgress(userId, nextSessionKey, {
                    collectedShards: doneShards,
                    collectedShardIds: doneShardIds,
                    collectedEntries: [],
                    rewardGranted: true,
                    pendingServerSync: false,
                });
                return;
            }

            const local = readLocalProgress(userId, nextSessionKey);
            setCollectedShards(local.collectedShards);
            setCollectedShardIds(local.collectedShardIds);
            setCollectedEntries(local.collectedEntries);
            setRewardGranted(Boolean(local.rewardGranted));
            setPendingServerSync(Boolean(local.pendingServerSync));
        } catch (error) {
            console.error('[Crystal] Failed to fetch user status:', error);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            void refreshStatus();
            return;
        }

        setCollectedShards([]);
        setCollectedShardIds([]);
        setCollectedEntries([]);
        setLocations([]);
        setCurrentPageShard(null);
        setCollectionDisabled(false);
        setCollectionDisabledMessage('');
        setRewardGranted(false);
        setPendingServerSync(false);
        setSessionKey('');
        setIsSubmittingCompletion(false);
    }, [user, refreshStatus]);

    useEffect(() => {
        if (!user || collectionDisabled || rewardGranted) {
            setCurrentPageShard(null);
            return;
        }

        const shard = locations.find((location) => (
            normalizeSitePath(location.url) === cleanPathname && !collectedShardIds.includes(location.shardId)
        ));
        setCurrentPageShard(shard || null);
    }, [cleanPathname, locations, collectedShardIds, user, collectionDisabled, rewardGranted]);

    const submitCompletion = useCallback(async (entries: LocalCrystalEntry[]) => {
        if (!user || !sessionKey || isSubmittingCompletion || entries.length < 12 || !pendingServerSync) return;
        setIsSubmittingCompletion(true);
        try {
            const res = await fetch(`${API_URL}/crystal/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    collectedCount: entries.length,
                    collectedEntries: entries,
                }),
                credentials: 'include',
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(String(data?.message || t('activity_collect.complete_failed')));
                return;
            }

            const doneShards = Array.isArray(data?.collectedShards) ? data.collectedShards : entries.map((entry) => entry.shardIndex);
            const doneShardIds = Array.isArray(data?.collectedShardIds) ? data.collectedShardIds : entries.map((entry) => entry.shardId);

            setCollectedShards(doneShards);
            setCollectedShardIds(doneShardIds);
            setCollectedEntries([]);
            setRewardGranted(Boolean(data?.rewardGranted));
            setPendingServerSync(false);

            writeLocalProgress(String(user.id), sessionKey, {
                collectedShards: doneShards,
                collectedShardIds: doneShardIds,
                collectedEntries: [],
                rewardGranted: Boolean(data?.rewardGranted),
                pendingServerSync: false,
            });
        } catch (error) {
            console.error('[Crystal] Failed to finish collection:', error);
        } finally {
            setIsSubmittingCompletion(false);
        }
    }, [pendingServerSync, sessionKey, t, user, isSubmittingCompletion]);

    useEffect(() => {
        if (isSubmittingCompletion || !pendingServerSync) return;
        if (collectedShardIds.length < 12) return;
        void submitCompletion(collectedEntries);
    }, [collectedShardIds.length, collectedEntries, isSubmittingCompletion, pendingServerSync, submitCompletion]);

    const collectShard = async (location: CrystalLocation) => {
        if (!user) {
            alert(t('activity_collect.login_required'));
            return;
        }
        if (collectionDisabled) {
            alert(collectionDisabledMessage || t('activity_collect.disabled_banner_default'));
            return;
        }
        if (rewardGranted || collectedShardIds.includes(location.shardId)) {
            return;
        }

        setCurrentPageShard(null);

        const nextEntries = [
            ...collectedEntries,
            {
                shardId: location.shardId,
                shardIndex: location.shardIndex,
                pagePath: cleanPathname,
                collectedAt: new Date().toISOString(),
            },
        ];
        const nextShardIds = Array.from(new Set(nextEntries.map((entry) => entry.shardId)));
        const nextShards = Array.from(new Set(nextEntries.map((entry) => entry.shardIndex))).sort((a, b) => a - b);

        setCollectedEntries(nextEntries);
        setCollectedShardIds(nextShardIds);
        setCollectedShards(nextShards);

        if (sessionKey) {
            writeLocalProgress(String(user.id), sessionKey, {
                collectedShards: nextShards,
                collectedShardIds: nextShardIds,
                collectedEntries: nextEntries,
                rewardGranted: nextShardIds.length >= 12,
                pendingServerSync: nextShardIds.length >= 12,
            });
        }

        if (nextShardIds.length >= 12) {
            setRewardGranted(true);
            setPendingServerSync(true);
        }
    };

    const isHeartComplete = collectedShards.length === 12;

    return (
        <CrystalContext.Provider value={{
            collectedShards,
            collectedShardIds,
            currentPageShard,
            collectShard,
            isHeartComplete,
            refreshStatus,
            collectionDisabled,
            collectionDisabledMessage,
            rewardGranted,
        }}>
            {children}
        </CrystalContext.Provider>
    );
};

export const useCrystal = () => {
    const context = useContext(CrystalContext);
    if (context === undefined) {
        throw new Error('useCrystal must be used within a CrystalProvider');
    }
    return context;
};
