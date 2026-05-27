import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { useAuth } from '@/context/AuthContext';
import {
  COST_PER_WISH,
  DAILY_FULFILL_LIMIT,
  DAILY_WISH_LIMIT,
  MAX_CHARS,
  MONTHLY_FULFILL_LIMIT,
} from './constants';
import type { Wish } from './types';
import {
  createWishRequest,
  fulfillWishRequest,
  markWishFulfilledRequest,
  supportWishRequest,
  updateWishTextRequest,
} from './galaxyWishApi';
import {
  parseSupportAmount,
  replaceWishInList,
} from './galaxyWishActionHelpers';
import { mapDtoToWish } from './wishUtils';

type AuthState = ReturnType<typeof useAuth>;

type GalaxyToast = {
  error: (title: string, message?: string) => void;
};

type UseGalaxyWishActionsParams = {
  user: AuthState['user'];
  userId: string;
  userK: number;
  refreshUser: AuthState['refreshUser'];
  toast: GalaxyToast;
  t: (key: string) => string;
  createdToday: number;
  setCreatedToday: Dispatch<SetStateAction<number>>;
  fulfilledToday: number;
  setFulfilledToday: Dispatch<SetStateAction<number>>;
  fulfilledThisMonth: number;
  setFulfilledThisMonth: Dispatch<SetStateAction<number>>;
  setWishes: Dispatch<SetStateAction<Wish[]>>;
};

export function useGalaxyWishActions({
  user,
  userId,
  userK,
  refreshUser,
  toast,
  t,
  createdToday,
  setCreatedToday,
  fulfilledToday,
  setFulfilledToday,
  fulfilledThisMonth,
  setFulfilledThisMonth,
  setWishes,
}: UseGalaxyWishActionsParams) {
  const [selectedWish, setSelectedWish] = useState<Wish | null>(null);
  const [editWish, setEditWish] = useState<Wish | null>(null);
  const [editWishText, setEditWishText] = useState('');
  const [isSavingWishEdit, setIsSavingWishEdit] = useState(false);
  const [wishText, setWishText] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [launchId, setLaunchId] = useState<number | null>(null);
  const [supportModalWish, setSupportModalWish] = useState<Wish | null>(null);
  const [supportAmount, setSupportAmount] = useState('');
  const [fulfillModalWish, setFulfillModalWish] = useState<Wish | null>(null);
  const [contactInfo, setContactInfo] = useState('');
  const [markFulfilledWish, setMarkFulfilledWish] = useState<Wish | null>(null);
  const [showSupportConfirm, setShowSupportConfirm] = useState(false);

  const canCreate = useMemo(
    () => wishText.trim().length > 0 && wishText.trim().length <= MAX_CHARS && createdToday < DAILY_WISH_LIMIT && userK >= COST_PER_WISH,
    [wishText, createdToday, userK],
  );

  const handleCreate = async () => {
    if (!canCreate || sending || !user) return;
    setSending(true);
    try {
      const res = await createWishRequest(wishText.trim());

      const newWish = mapDtoToWish(res.wish, userId);
      setWishes((prev) => [newWish, ...prev]);
      setCreatedToday(res.stats?.createdToday ?? createdToday + 1);
      setWishText('');
      setShowSuccess(true);
      const launchKey = Date.now();
      setLaunchId(launchKey);
      setTimeout(() => setShowSuccess(false), 3000);
      setTimeout(() => setLaunchId(null), 1600);
      refreshUser();
    } catch (error) {
      console.error('create wish failed', error);
    } finally {
      setSending(false);
    }
  };

  const handleSupportConfirm = () => {
    if (!supportModalWish || !supportAmount) return;
    const amount = parseSupportAmount(supportAmount, userK);
    if (amount === null) return;
    setShowSupportConfirm(true);
  };

  const handleSupport = async () => {
    if (!supportModalWish || !supportAmount || !user) return;
    const amount = parseSupportAmount(supportAmount, userK);
    if (amount === null) return;

    try {
      const res = await supportWishRequest(supportModalWish.id, amount);

      const updatedWish = mapDtoToWish(res.wish, userId);
      setWishes((prev) => replaceWishInList(prev, updatedWish));
      refreshUser();
    } catch (error) {
      console.error('support wish failed', error);
    } finally {
      setShowSupportConfirm(false);
      setSupportModalWish(null);
      setSupportAmount('');
    }
  };

  const handleFulfill = async () => {
    if (!fulfillModalWish || !contactInfo || !user) return;

    if (fulfilledToday >= DAILY_FULFILL_LIMIT) {
      toast.error(t('galaxy.limit_title'), `${t('galaxy.limit_fulfill_today_prefix')} ${DAILY_FULFILL_LIMIT}). ${t('galaxy.try_tomorrow')}`);
      return;
    }
    if (fulfilledThisMonth >= MONTHLY_FULFILL_LIMIT) {
      toast.error(t('galaxy.limit_title'), `${t('galaxy.limit_fulfill_month_prefix')} ${MONTHLY_FULFILL_LIMIT}). ${t('galaxy.try_next_month')}`);
      return;
    }

    try {
      const res = await fulfillWishRequest(fulfillModalWish.id, contactInfo.trim());
      const updatedWish = mapDtoToWish(res.wish, userId);
      setWishes((prev) => replaceWishInList(prev, updatedWish));
      setFulfilledToday(res.stats?.executedToday ?? fulfilledToday);
      setFulfilledThisMonth(res.stats?.executedLast30 ?? fulfilledThisMonth);
      refreshUser();
    } catch (error) {
      console.error('take for fulfillment failed', error);
    } finally {
      setFulfillModalWish(null);
      setContactInfo('');
    }
  };

  const handleMarkFulfilled = async () => {
    if (!markFulfilledWish || !user) return;
    try {
      const res = await markWishFulfilledRequest(markFulfilledWish.id);
      const updatedWish = mapDtoToWish(res.wish, userId);
      setWishes((prev) => replaceWishInList(prev, updatedWish));
      refreshUser();
    } catch (error) {
      console.error('mark fulfilled failed', error);
    } finally {
      setMarkFulfilledWish(null);
    }
  };

  const openWishEdit = (wish: Wish) => {
    setSelectedWish(null);
    setEditWish(wish);
    setEditWishText(wish.text);
  };

  const handleSaveWishEdit = async () => {
    if (!editWish || !user || isSavingWishEdit) return;
    const nextText = editWishText.trim();
    if (!nextText || nextText.length > MAX_CHARS) return;
    setIsSavingWishEdit(true);
    try {
      const res = await updateWishTextRequest(editWish.id, nextText);
      const updatedWish = mapDtoToWish(res.wish, userId);
      setWishes((prev) => replaceWishInList(prev, updatedWish));
      setEditWish(null);
      setEditWishText('');
    } catch (error) {
      console.error('update wish failed', error);
    } finally {
      setIsSavingWishEdit(false);
    }
  };

  const cancelSupport = () => {
    setShowSupportConfirm(false);
    setSupportModalWish(null);
    setSupportAmount('');
  };

  return {
    canCreate,
    contactInfo,
    editWish,
    editWishText,
    fulfillModalWish,
    isSavingWishEdit,
    launchId,
    markFulfilledWish,
    selectedWish,
    sending,
    showSuccess,
    showSupportConfirm,
    supportAmount,
    supportModalWish,
    wishText,
    handleCreate,
    handleFulfill,
    handleMarkFulfilled,
    handleSaveWishEdit,
    handleSupport,
    handleSupportConfirm,
    openWishEdit,
    cancelSupport,
    setContactInfo,
    setEditWish,
    setEditWishText,
    setFulfillModalWish,
    setMarkFulfilledWish,
    setSelectedWish,
    setShowSupportConfirm,
    setSupportAmount,
    setSupportModalWish,
    setWishText,
  };
}
