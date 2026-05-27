import type { BattleSummary } from '@/lib/battleSummary';

export type BattleSummaryOverlayProps = {
  isOpen: boolean;
  summary: BattleSummary | null;
  loading?: boolean;
  playAnimation?: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  onSecondaryAction?: (() => void) | null;
  secondaryActionLabel?: string | null;
};
