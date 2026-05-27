import { useState } from 'react';
import { createBridge } from './createBridge';
import { layBridgeStone } from './layBridgeStone';
import type { BridgeMutationContext } from './bridgeMutationTypes';

export function useBridgeMutations(context: BridgeMutationContext) {
  const [pendingBridgeIds, setPendingBridgeIds] = useState<Record<string, boolean>>({});
  const [isCreatingBridge, setIsCreatingBridge] = useState(false);

  const handleLayStone = async (bridgeId: string) => {
    await layBridgeStone({
      ...context,
      bridgeId,
      pendingBridgeIds,
      setPendingBridgeIds,
    });
  };

  const handleCreateBridge = async () => {
    await createBridge({
      ...context,
      isCreatingBridge,
      setIsCreatingBridge,
    });
  };

  return {
    pendingBridgeIds,
    isCreatingBridge,
    handleLayStone,
    handleCreateBridge,
  };
}
