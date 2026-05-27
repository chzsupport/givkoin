import type { FriendsTab, FriendsTranslate } from './types';

type FriendsTabsProps = {
    activeTab: FriendsTab;
    requestsCount: number;
    t: FriendsTranslate;
    onTabChange: (tab: FriendsTab) => void;
};

export function FriendsTabs({ activeTab, requestsCount, t, onTabChange }: FriendsTabsProps) {
    return (
        <div className="mb-6 flex flex-wrap justify-center gap-x-4 gap-y-2 border-b border-white/10 pb-2">
            <button
                onClick={() => onTabChange('friends')}
                className={`pb-2 text-body transition-colors ${activeTab === 'friends' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white'}`}
            >
                {t('friends.my_friends')}
            </button>
            <button
                onClick={() => onTabChange('requests')}
                className={`pb-2 text-body transition-colors ${activeTab === 'requests' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white'}`}
            >
                {t('friends.requests')}
                {requestsCount > 0 && activeTab !== 'requests' && (
                    <span className="ml-2 bg-rose-500 text-white text-xs rounded-full px-2 py-0.5">!</span>
                )}
            </button>
            <button
                onClick={() => onTabChange('blocked')}
                className={`pb-2 text-body transition-colors ${activeTab === 'blocked' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white'}`}
            >
                {t('friends.blocked')}
            </button>
        </div>
    );
}
