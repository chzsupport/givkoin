'use client';

import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatPageDialogs } from '@/components/chat-page/ChatPageDialogs';
import { ChatPageFrame } from '@/components/chat-page/ChatPageFrame';
import { useChatPageRuntime } from '@/components/chat-page/useChatPageRuntime';

export default function ChatPage() {
  const {
    activeDurationSeconds,
    canSendFriendRequest,
    disconnectCount,
    handleAddFriend,
    handleCancelLeave,
    handleCancelLeaveWaiting,
    handleComplaint,
    handleConfirmLeave,
    handleConfirmLeaveWaiting,
    handleLeave,
    handleRate,
    handleSendMessage,
    handleStopTyping,
    handleTyping,
    isConnecting,
    isDesktop,
    isPartnerTyping,
    isSmallHeight,
    isWaitingForPartner,
    maxDisconnects,
    messages,
    partnerName,
    handleCloseComplaint,
    showComplaint,
    showLeaveConfirm,
    showLeaveWarning,
    showRating,
    sideAdSlot,
    startedAt,
    submitComplaint,
    t,
    user,
    waitingMessage,
    waitingTimeLeft,
    leaveConfirmIsEarly,
  } = useChatPageRuntime();

  if (!user || isConnecting) {
    return <div className="flex items-center justify-center h-screen bg-black text-white">{t('common.connecting')}</div>;
  }

  return (
    <>
      <ChatPageFrame
        sideAdSlot={sideAdSlot}
        isDesktop={isDesktop}
        isSmallHeight={isSmallHeight}
      >
        <ChatWindow
          messages={messages}
          startedAt={startedAt}
          activeDurationSeconds={activeDurationSeconds}
          onSendMessage={handleSendMessage}
          onLeave={handleLeave}
          onComplaint={handleComplaint}
          onAddFriend={canSendFriendRequest ? handleAddFriend : undefined}
          canAddFriend={canSendFriendRequest}
          onTyping={handleTyping}
          onStopTyping={handleStopTyping}
          partnerName={partnerName}
          isPartnerTyping={isPartnerTyping}
          isCompact={isSmallHeight}
          isWaitingForPartner={isWaitingForPartner}
          waitingTimeLeft={waitingTimeLeft}
          waitingMessage={waitingMessage}
          disconnectCount={disconnectCount}
          maxDisconnects={maxDisconnects}
        />
      </ChatPageFrame>

      <ChatPageDialogs
        showRating={showRating}
        onRate={handleRate}
        showComplaint={showComplaint}
        onCloseComplaint={handleCloseComplaint}
        onSubmitComplaint={submitComplaint}
        complaintChips={user?.complaintChips ?? 0}
        showLeaveConfirm={showLeaveConfirm}
        leaveConfirmIsEarly={leaveConfirmIsEarly}
        onCancelLeave={handleCancelLeave}
        onConfirmLeave={handleConfirmLeave}
        showLeaveWarning={showLeaveWarning}
        onCancelLeaveWaiting={handleCancelLeaveWaiting}
        onConfirmLeaveWaiting={handleConfirmLeaveWaiting}
        t={t}
      />
    </>
  );
}
