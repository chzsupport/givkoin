import { AnimatePresence, motion } from 'framer-motion';
import { BlockedFriendsPanel } from './BlockedFriendsPanel';
import { FriendRequestsPanel } from './FriendRequestsPanel';
import { FriendsPanel } from './FriendsPanel';
import type { Friend, FriendRequest, FriendsTab, FriendsTranslate } from './types';

type FriendsListContentProps = {
    activeTab: FriendsTab;
    blocked: Friend[];
    friends: Friend[];
    loading: boolean;
    requests: FriendRequest[];
    t: FriendsTranslate;
    onAccept: (requesterId: string) => void;
    onInvite: (friendId: string) => void;
    onReject: (requesterId: string) => void;
    onRemove: (friendId: string, nickname: string) => void;
    onUnblock: (userId: string, nickname: string) => void;
};

export function FriendsListContent({
    activeTab,
    blocked,
    friends,
    loading,
    requests,
    t,
    onAccept,
    onInvite,
    onReject,
    onRemove,
    onUnblock,
}: FriendsListContentProps) {
    if (loading) {
        return <div className="flex justify-center items-center h-40 text-white/40">{t('common.loading')}</div>;
    }

    return (
        <AnimatePresence mode="wait">
            {activeTab === 'friends' ? (
                <motion.div key="friends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <FriendsPanel friends={friends} t={t} onInvite={onInvite} onRemove={onRemove} />
                </motion.div>
            ) : activeTab === 'requests' ? (
                <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <FriendRequestsPanel requests={requests} t={t} onAccept={onAccept} onReject={onReject} />
                </motion.div>
            ) : (
                <motion.div key="blocked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <BlockedFriendsPanel blocked={blocked} t={t} onUnblock={onUnblock} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
