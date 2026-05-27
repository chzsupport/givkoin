import type { Friend, FriendsTranslate } from './types';

type FriendRowProps = {
    friend: Friend;
    isOnline: boolean;
    t: FriendsTranslate;
    onInvite: (friendId: string) => void;
    onRemove: (friendId: string, nickname: string) => void;
};

export function FriendRow({ friend, isOnline, t, onInvite, onRemove }: FriendRowProps) {
    return (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${isOnline ? 'bg-emerald-500/5 border-emerald-400/20' : 'bg-white/5 border-white/10'}`}>
            <div className="flex items-center space-x-4">
                <div className={`relative w-10 h-10 rounded-full bg-linear-to-br ${isOnline ? 'from-amber-400 to-orange-600' : 'from-slate-500 to-slate-700'} flex items-center justify-center text-white font-bold text-lg`}>
                    {friend.nickname[0].toUpperCase()}
                    <span className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                </div>
                <div>
                    <div className="text-body font-bold text-white">{friend.nickname}</div>
                    <div className={isOnline ? 'text-tiny text-emerald-300' : 'text-tiny text-white/50'}>
                        {isOnline ? t('friends.status_online') : t('friends.status_offline')}
                    </div>
                </div>
            </div>
            <div className="flex items-center">
                {isOnline ? (
                    <button
                        onClick={() => onInvite(friend._id)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white rounded-xl text-tiny font-medium transition-all shadow-lg hover:shadow-purple-500/20 mr-2"
                    >
                        {t('friends.invite')}
                    </button>
                ) : (
                    <button
                        disabled
                        className="px-4 py-2 bg-white/10 text-white/50 rounded-xl text-tiny font-medium cursor-not-allowed mr-2"
                    >
                        {t('friends.status_offline')}
                    </button>
                )}
                <button
                    onClick={() => onRemove(friend._id, friend.nickname)}
                    className="text-tiny text-rose-400 hover:text-rose-300 transition-colors"
                >
                    {t('friends.remove')}
                </button>
            </div>
        </div>
    );
}
