import type { FriendRequest, FriendsTranslate } from './types';

type FriendRequestsPanelProps = {
    requests: FriendRequest[];
    t: FriendsTranslate;
    onAccept: (requesterId: string) => void;
    onReject: (requesterId: string) => void;
};

export function FriendRequestsPanel({ requests, t, onAccept, onReject }: FriendRequestsPanelProps) {
    if (requests.length === 0) {
        return (
            <div className="text-center py-6 text-white/40">
                {t('friends.no_requests')}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {requests.map((req) => (
                <div key={req._id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                    <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                            {(req.from.nickname[0] || t('common.user')[0] || 'U').toUpperCase()}
                        </div>
                        <div>
                            <div className="text-body font-bold text-white">{req.from.nickname}</div>
                            <div className="text-tiny text-white/40">{t('friends.wants_add_you')}</div>
                        </div>
                    </div>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => onAccept(req.from._id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white text-tiny font-medium transition-colors"
                        >
                            {t('common.accept')}
                        </button>
                        <button
                            onClick={() => onReject(req.from._id)}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-tiny font-medium transition-colors"
                        >
                            {t('common.reject')}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
