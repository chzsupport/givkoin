import type { Bridge, BridgeImageType } from './types';

export const getBridgePairKey = (from: string, to: string) => [from, to].sort().join('::');

export const mergeBridgeItems = (current: Bridge[], nextItems: Bridge[], append: boolean) => {
  if (!append) return nextItems;
  return [...current, ...nextItems.filter((bridge) => !current.some((row) => row._id === bridge._id))];
};

export const upsertBridge = (items: Bridge[], bridge: Bridge, { prepend = false } = {}) => {
  const next = items.filter((row) => row._id !== bridge._id);
  return prepend ? [bridge, ...next] : [...next, bridge];
};

export const applyContributionToBridge = (bridge: Bridge, userId: string, nickname: string, stones: number) => {
  const contributors = Array.isArray(bridge.contributors)
    ? bridge.contributors.map((row) => ({
      user: row.user ? { ...row.user } : null,
      stones: row.stones,
    }))
    : [];
  const contributorIndex = contributors.findIndex((row) => row.user?._id === userId);

  if (contributorIndex >= 0) {
    contributors[contributorIndex] = {
      ...contributors[contributorIndex],
      stones: contributors[contributorIndex].stones + stones,
    };
  } else {
    contributors.push({
      user: { _id: userId, nickname },
      stones,
    });
  }

  const currentStones = Math.min(bridge.requiredStones, bridge.currentStones + stones);
  return {
    ...bridge,
    currentStones,
    status: currentStones >= bridge.requiredStones ? 'completed' : bridge.status,
    contributors,
    lastContributionAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const getBridgeImagePath = (from: string, to: string, type: BridgeImageType = 'preview') => {
  const baseDir = type === 'preview' ? '/bridgepreview' : '/bridgecollect';
  const extension = type === 'preview' ? 'webp' : 'jpeg';
  return `${baseDir}/${from} - ${to}.${extension}`;
};
