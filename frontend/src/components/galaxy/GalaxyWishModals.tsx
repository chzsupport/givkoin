import { GalaxyEditWishModal } from './GalaxyEditWishModal';
import { GalaxyFullWishModal } from './GalaxyFullWishModal';
import { GalaxyFulfillWishModal } from './GalaxyFulfillWishModal';
import { GalaxyMarkFulfilledModal } from './GalaxyMarkFulfilledModal';
import { GalaxySupportConfirmModal } from './GalaxySupportConfirmModal';
import { GalaxySupportWishModal } from './GalaxySupportWishModal';
import type { Wish } from './types';

export function GalaxyWishModals({
  contactInfo,
  editWish,
  editWishText,
  fulfillModalWish,
  isSavingWishEdit,
  isWishEditable,
  markFulfilledWish,
  onCloseEditWish,
  onCloseFulfillModal,
  onCloseMarkFulfilled,
  onCloseSelectedWish,
  onCloseSupportConfirm,
  onCloseSupportModal,
  onContactInfoChange,
  onEditWishTextChange,
  onFulfill,
  onMarkFulfilled,
  onOpenWishEdit,
  onSaveWishEdit,
  onSupport,
  onSupportAmountChange,
  onSupportCancelAll,
  onSupportConfirm,
  selectedWish,
  showSupportConfirm,
  supportAmount,
  supportModalWish,
  t,
  userK,
}: {
  contactInfo: string;
  editWish: Wish | null;
  editWishText: string;
  fulfillModalWish: Wish | null;
  isSavingWishEdit: boolean;
  isWishEditable: (wish: Wish) => boolean;
  markFulfilledWish: Wish | null;
  onCloseEditWish: () => void;
  onCloseFulfillModal: () => void;
  onCloseMarkFulfilled: () => void;
  onCloseSelectedWish: () => void;
  onCloseSupportConfirm: () => void;
  onCloseSupportModal: () => void;
  onContactInfoChange: (value: string) => void;
  onEditWishTextChange: (value: string) => void;
  onFulfill: () => void;
  onMarkFulfilled: () => void;
  onOpenWishEdit: (wish: Wish) => void;
  onSaveWishEdit: () => void;
  onSupport: () => void;
  onSupportAmountChange: (value: string) => void;
  onSupportCancelAll: () => void;
  onSupportConfirm: () => void;
  selectedWish: Wish | null;
  showSupportConfirm: boolean;
  supportAmount: string;
  supportModalWish: Wish | null;
  t: (key: string) => string;
  userK: number;
}) {
  return (
    <>
      <GalaxyFullWishModal
        isWishEditable={isWishEditable}
        onClose={onCloseSelectedWish}
        onOpenWishEdit={onOpenWishEdit}
        t={t}
        wish={selectedWish}
      />

      <GalaxyEditWishModal
        editWishText={editWishText}
        isSavingWishEdit={isSavingWishEdit}
        onClose={onCloseEditWish}
        onEditWishTextChange={onEditWishTextChange}
        onSaveWishEdit={onSaveWishEdit}
        t={t}
        wish={editWish}
      />

      <GalaxySupportWishModal
        onClose={onCloseSupportModal}
        onSupportAmountChange={onSupportAmountChange}
        onSupportConfirm={onSupportConfirm}
        supportAmount={supportAmount}
        t={t}
        userK={userK}
        wish={supportModalWish}
      />

      <GalaxyFulfillWishModal
        contactInfo={contactInfo}
        onClose={onCloseFulfillModal}
        onContactInfoChange={onContactInfoChange}
        onFulfill={onFulfill}
        t={t}
        wish={fulfillModalWish}
      />

      <GalaxySupportConfirmModal
        isOpen={showSupportConfirm && Boolean(supportModalWish)}
        onClose={onCloseSupportConfirm}
        onSupport={onSupport}
        onSupportCancelAll={onSupportCancelAll}
        supportAmount={supportAmount}
        t={t}
      />

      <GalaxyMarkFulfilledModal
        onClose={onCloseMarkFulfilled}
        onMarkFulfilled={onMarkFulfilled}
        t={t}
        wish={markFulfilledWish}
      />
    </>
  );
}
