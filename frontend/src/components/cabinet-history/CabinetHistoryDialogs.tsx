'use client';

import { DisputeModal } from '@/components/chat/DisputeModal';
import { BattleSummaryOverlay } from '@/components/battle/BattleSummaryOverlay';
import type { BattleSummary } from '@/lib/battleSummary';
import { ChatViewModal } from './ChatViewModal';
import type { ChatMessage } from './types';

type CabinetHistoryDialogsProps = {
  showDispute: boolean;
  onCloseDispute: () => void;
  onSubmitDispute: (text: string) => Promise<void>;
  showChatView: boolean;
  onCloseChatView: () => void;
  viewMessages: ChatMessage[];
  viewPartnerName: string;
  language: string;
  summaryVisible: boolean;
  battleSummary: BattleSummary | null;
  summaryLoading: boolean;
  onCloseSummary: () => void;
  t: (key: string) => string;
};

export function CabinetHistoryDialogs({
  showDispute,
  onCloseDispute,
  onSubmitDispute,
  showChatView,
  onCloseChatView,
  viewMessages,
  viewPartnerName,
  language,
  summaryVisible,
  battleSummary,
  summaryLoading,
  onCloseSummary,
  t,
}: CabinetHistoryDialogsProps) {
  return (
    <>
      <DisputeModal
        isOpen={showDispute}
        onClose={onCloseDispute}
        onSubmit={onSubmitDispute}
      />

      <ChatViewModal
        isOpen={showChatView}
        onClose={onCloseChatView}
        messages={viewMessages}
        partnerName={viewPartnerName}
        t={t}
        language={language}
      />

      <BattleSummaryOverlay
        isOpen={summaryVisible}
        summary={battleSummary}
        loading={summaryLoading}
        playAnimation={false}
        onClose={onCloseSummary}
        onPrimaryAction={onCloseSummary}
        primaryActionLabel={t('common.close')}
      />
    </>
  );
}
