import type { Bridge } from './types';

export const hydrateContributorNicknames = (serverBridge: Bridge, optimisticBridge: Bridge) => {
  const hydratedContributors = serverBridge.contributors.map((contributor) => {
    const existing = optimisticBridge.contributors.find((optimisticContributor) =>
      (optimisticContributor.user?._id || optimisticContributor.user) === (contributor.user?._id || contributor.user)
    );
    return { ...contributor, user: existing?.user || contributor.user };
  });

  return { ...serverBridge, contributors: hydratedContributors };
};
