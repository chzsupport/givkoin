import { FriendRow } from './FriendRow';
import type { Friend, FriendsTranslate } from './types';

type FriendsPanelProps = {
    friends: Friend[];
    t: FriendsTranslate;
    onInvite: (friendId: string) => void;
    onRemove: (friendId: string, nickname: string) => void;
};

export function FriendsPanel({ friends, t, onInvite, onRemove }: FriendsPanelProps) {
    const onlineFriends = friends.filter((friend) => Boolean(friend.isOnline));
    const offlineFriends = friends.filter((friend) => !friend.isOnline);

    if (friends.length === 0) {
        return (
            <div className="text-center py-6 text-white/40">
                {t('friends.empty_friends')}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <FriendGroup
                emptyLabel={t('friends.no_one_online')}
                friends={onlineFriends}
                isOnline
                label={`${t('friends.online')} (${onlineFriends.length})`}
                t={t}
                onInvite={onInvite}
                onRemove={onRemove}
            />

            <FriendGroup
                emptyLabel={t('friends.all_online')}
                friends={offlineFriends}
                isOnline={false}
                label={`${t('friends.offline')} (${offlineFriends.length})`}
                t={t}
                onInvite={onInvite}
                onRemove={onRemove}
            />
        </div>
    );
}

type FriendGroupProps = {
    emptyLabel: string;
    friends: Friend[];
    isOnline: boolean;
    label: string;
    t: FriendsTranslate;
    onInvite: (friendId: string) => void;
    onRemove: (friendId: string, nickname: string) => void;
};

function FriendGroup({ emptyLabel, friends, isOnline, label, t, onInvite, onRemove }: FriendGroupProps) {
    return (
        <div>
            <div className="mb-3 flex items-center gap-3">
                <span className={`text-tiny uppercase tracking-widest ${isOnline ? 'text-emerald-300' : 'text-white/60'}`}>
                    {label}
                </span>
                <div className={`h-px flex-1 ${isOnline ? 'bg-emerald-400/20' : 'bg-white/10'}`} />
            </div>
            {friends.length === 0 ? (
                <div className={`rounded-xl border p-4 text-tiny text-white/50 ${isOnline ? 'border-emerald-400/10 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}>
                    {emptyLabel}
                </div>
            ) : (
                <div className="space-y-3">
                    {friends.map((friend) => (
                        <FriendRow
                            key={friend._id}
                            friend={friend}
                            isOnline={isOnline}
                            t={t}
                            onInvite={onInvite}
                            onRemove={onRemove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
