import type { NewsShareNetwork } from './newsShare';

type RepostOption = {
    network: NewsShareNetwork;
    icon: string;
    label: string;
    labelKey?: string;
    iconKey?: string;
    buttonClassName: string;
    labelClassName: string;
};

const REPOST_OPTIONS: RepostOption[] = [
    { network: 'twitter', icon: '𝕏', label: 'Twitter', buttonClassName: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20', labelClassName: 'text-blue-300' },
    { network: 'facebook', icon: 'f', label: 'Facebook', buttonClassName: 'bg-blue-600/10 border-blue-600/20 hover:bg-blue-600/20', labelClassName: 'text-blue-300' },
    { network: 'vk', icon: '', iconKey: 'news.social_vk_short', label: '', labelKey: 'news.social_vk', buttonClassName: 'bg-blue-700/10 border-blue-700/20 hover:bg-blue-700/20', labelClassName: 'text-blue-300' },
    { network: 'ok', icon: '', iconKey: 'news.social_ok_short', label: '', labelKey: 'news.social_ok', buttonClassName: 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20', labelClassName: 'text-orange-300' },
    { network: 'telegram', icon: '✈️', label: 'Telegram', buttonClassName: 'bg-sky-500/10 border-sky-500/20 hover:bg-sky-500/20', labelClassName: 'text-sky-300' },
    { network: 'whatsapp', icon: '💬', label: 'WhatsApp', buttonClassName: 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20', labelClassName: 'text-green-300' },
    { network: 'wechat', icon: 'W', label: 'WeChat', buttonClassName: 'bg-green-600/10 border-green-600/20 hover:bg-green-600/20', labelClassName: 'text-green-300' },
    { network: 'reddit', icon: 'R', label: 'Reddit', buttonClassName: 'bg-orange-600/10 border-orange-600/20 hover:bg-orange-600/20', labelClassName: 'text-orange-300' },
    { network: 'threads', icon: '@', label: 'Threads', buttonClassName: 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20', labelClassName: 'text-purple-300' },
    { network: 'mastodon', icon: '🐘', label: 'Mastodon', buttonClassName: 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20', labelClassName: 'text-indigo-300' },
    { network: 'bastyon', icon: 'B', label: 'Bastyon', buttonClassName: 'bg-yellow-600/10 border-yellow-600/20 hover:bg-yellow-600/20', labelClassName: 'text-yellow-300' },
    { network: 'line', icon: 'L', label: 'LINE', buttonClassName: 'bg-green-700/10 border-green-700/20 hover:bg-green-700/20', labelClassName: 'text-green-300' },
    { network: 'viber', icon: 'V', label: 'Viber', buttonClassName: 'bg-purple-600/10 border-purple-600/20 hover:bg-purple-600/20', labelClassName: 'text-purple-300' },
    { network: 'discord', icon: '💎', label: 'Discord', buttonClassName: 'bg-indigo-600/10 border-indigo-600/20 hover:bg-indigo-600/20', labelClassName: 'text-indigo-300' },
    { network: 'ameba', icon: 'A', label: 'Ameba', buttonClassName: 'bg-pink-500/10 border-pink-500/20 hover:bg-pink-500/20', labelClassName: 'text-pink-300' },
    { network: 'bluesky', icon: '🔵', label: 'Bluesky', buttonClassName: 'bg-sky-600/10 border-sky-600/20 hover:bg-sky-600/20', labelClassName: 'text-sky-300' },
    { network: 'gab', icon: 'G', label: 'Gab', buttonClassName: 'bg-green-800/10 border-green-800/20 hover:bg-green-800/20', labelClassName: 'text-green-300' },
    { network: 'weibo', icon: '微', label: 'Weibo', buttonClassName: 'bg-red-600/10 border-red-600/20 hover:bg-red-600/20', labelClassName: 'text-red-300' },
    { network: 'band', icon: '🎵', label: 'Band', buttonClassName: 'bg-blue-800/10 border-blue-800/20 hover:bg-blue-800/20', labelClassName: 'text-blue-300' },
    { network: 'taringa', icon: 'T', label: 'Taringa', buttonClassName: 'bg-blue-900/10 border-blue-900/20 hover:bg-blue-900/20', labelClassName: 'text-blue-300' },
];

export function NewsRepostModal({
    postId,
    onClose,
    onSelect,
    t,
}: {
    postId: string;
    onClose: () => void;
    onSelect: (postId: string, network: NewsShareNetwork) => void;
    t: (key: string) => string;
}) {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-bold text-white mb-4">{t('news.select_social_repost')}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
                    {REPOST_OPTIONS.map((option) => (
                        <button
                            key={option.network}
                            onClick={() => onSelect(postId, option.network)}
                            className={`flex flex-col items-center gap-2 p-3 border rounded-xl transition-all ${option.buttonClassName}`}
                        >
                            <span className="text-xl">{option.iconKey ? t(option.iconKey) : option.icon}</span>
                            <span className={`text-xs ${option.labelClassName}`}>
                                {option.labelKey ? t(option.labelKey) : option.label}
                            </span>
                        </button>
                    ))}
                </div>
                <button
                    onClick={onClose}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-neutral-300 hover:bg-white/10 transition-all"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );
}
