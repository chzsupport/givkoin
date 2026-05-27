import type { Friend, FriendsTranslate } from './types';

type BlockedFriendsPanelProps = {
    blocked: Friend[];
    t: FriendsTranslate;
    onUnblock: (userId: string, nickname: string) => void;
};

export function BlockedFriendsPanel({ blocked, t, onUnblock }: BlockedFriendsPanelProps) {
    if (blocked.length === 0) {
        return (
            <div className="text-center py-6 text-white/40">
                {t('friends.blocked_empty')}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {blocked.map((user) => (
                <div key={user._id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                    <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-lg">
                            {user.nickname[0].toUpperCase()}
                        </div>
                        <div>
                            <div className="text-body font-bold text-white text-gray-400">{user.nickname}</div>
                            <div className="text-tiny text-white/40">{t('friends.blocked_status')}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => onUnblock(user._id, user.nickname)}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-tiny font-medium transition-colors"
                    >
                        {t('friends.unblock')}
                    </button>
                </div>
            ))}
        </div>
    );
}
