import { useEffect, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';

type TreeTranslate = (key: string) => string;

type TreeToast = {
  error: (title: string, message?: string) => void;
};

type UseTreePartnerSearchOptions = {
  localePath: (path: string) => string;
  router: { push: (path: string) => void };
  t: TreeTranslate;
  toast: TreeToast;
  userId?: string;
};

export function useTreePartnerSearch({
  localePath,
  router,
  t,
  toast,
  userId,
}: UseTreePartnerSearchOptions) {
  const socket = useSocket(userId);
  const [isSearching, setIsSearching] = useState(false);
  const [isFoundNotice, setIsFoundNotice] = useState(false);

  const handleFindPartner = () => {
    if (isSearching) return;
    if (!socket?.connected) {
      toast.error(t('chat.no_connection'), t('chat.connection_not_established'));
      return;
    }
    setIsFoundNotice(false);
    socket.emit('find_partner');
    setIsSearching(true);
  };

  const cancelSearch = () => {
    if (socket) socket.emit('cancel_search');
    setIsSearching(false);
    setIsFoundNotice(false);
  };

  useEffect(() => {
    if (!socket) return;

    const handleChatPreparing = () => {
      setIsSearching(false);
      setIsFoundNotice(false);
    };

    const handlePartnerFound = ({ chatId }: { chatId: string }) => {
      setIsSearching(false);
      setIsFoundNotice(true);
      router.push(localePath(`/chat/${chatId}`));
    };

    const handleNoPartner = () => {
      setIsSearching(false);
      setIsFoundNotice(false);
      toast.error(t('chat.not_found'), t('chat.no_partner_found'));
    };

    socket.on('chat_preparing', handleChatPreparing);
    socket.on('partner_found', handlePartnerFound);
    socket.on('no_partner', handleNoPartner);

    return () => {
      socket.off('chat_preparing', handleChatPreparing);
      socket.off('partner_found', handlePartnerFound);
      socket.off('no_partner', handleNoPartner);
    };
  }, [socket, router, localePath, toast, t]);

  return {
    cancelSearch,
    handleFindPartner,
    isFoundNotice,
    isSearching,
  };
}
