'use client';

import { RatingModal } from '@/components/chat/RatingModal';
import { ComplaintModal } from '@/components/chat/ComplaintModal';
import { ChatLeaveConfirmDialog } from './ChatLeaveConfirmDialog';
import { ChatLeaveWaitingDialog } from './ChatLeaveWaitingDialog';

type ChatPageDialogsProps = {
  showRating: boolean;
  onRate: (liked: boolean) => void;
  showComplaint: boolean;
  onCloseComplaint: () => void;
  onSubmitComplaint: (reason: string) => void;
  complaintChips: number;
  showLeaveConfirm: boolean;
  leaveConfirmIsEarly: boolean;
  onCancelLeave: () => void;
  onConfirmLeave: () => void;
  showLeaveWarning: boolean;
  onCancelLeaveWaiting: () => void;
  onConfirmLeaveWaiting: () => void;
  t: (key: string) => string;
};

export function ChatPageDialogs({
  showRating,
  onRate,
  showComplaint,
  onCloseComplaint,
  onSubmitComplaint,
  complaintChips,
  showLeaveConfirm,
  leaveConfirmIsEarly,
  onCancelLeave,
  onConfirmLeave,
  showLeaveWarning,
  onCancelLeaveWaiting,
  onConfirmLeaveWaiting,
  t,
}: ChatPageDialogsProps) {
  return (
    <>
      <RatingModal isOpen={showRating} onRate={onRate} />
      <ComplaintModal
        isOpen={showComplaint}
        onClose={onCloseComplaint}
        onSubmit={onSubmitComplaint}
        chipsRemaining={complaintChips}
        chipsMax={15}
      />

      {showLeaveConfirm && (
        <ChatLeaveConfirmDialog
          isEarly={leaveConfirmIsEarly}
          t={t}
          onCancel={onCancelLeave}
          onConfirm={onConfirmLeave}
        />
      )}

      {showLeaveWarning && (
        <ChatLeaveWaitingDialog
          t={t}
          onCancel={onCancelLeaveWaiting}
          onConfirm={onConfirmLeaveWaiting}
        />
      )}
    </>
  );
}
