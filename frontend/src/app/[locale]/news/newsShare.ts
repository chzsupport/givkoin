export type NewsShareNetwork =
    | 'twitter'
    | 'facebook'
    | 'vk'
    | 'ok'
    | 'telegram'
    | 'whatsapp'
    | 'wechat'
    | 'reddit'
    | 'threads'
    | 'mastodon'
    | 'bastyon'
    | 'line'
    | 'viber'
    | 'discord'
    | 'ameba'
    | 'bluesky'
    | 'gab'
    | 'weibo'
    | 'band'
    | 'taringa';

export function buildNewsShareUrl({
    title,
    content,
    origin,
    network,
}: {
    title: string;
    content: string;
    origin: string;
    network: string;
}) {
    const text = encodeURIComponent(`${title}\n\n${content.slice(0, 200)}...`);
    const url = encodeURIComponent(`${origin}/news`);
    const encodedTitle = encodeURIComponent(title);

    switch (network as NewsShareNetwork) {
        case 'twitter':
            return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        case 'facebook':
            return `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
        case 'vk':
            return `https://vk.com/share.php?url=${url}&title=${encodedTitle}&description=${text}`;
        case 'ok':
            return `https://connect.ok.ru/offer?url=${url}&title=${encodedTitle}&description=${text}`;
        case 'telegram':
            return `https://t.me/share/url?url=${url}&text=${text}`;
        case 'whatsapp':
            return `https://wa.me/?text=${text}%20${url}`;
        case 'wechat':
            return `https://api.wechat.com/cgi-bin/mass/send?text=${text}%20${url}`;
        case 'reddit':
            return `https://reddit.com/submit?url=${url}&title=${encodedTitle}`;
        case 'threads':
            return `https://threads.net/intent/post?text=${text}%20${url}`;
        case 'mastodon':
            return `https://mastodon.social/share?text=${text}%20${url}`;
        case 'bastyon':
            return `https://bastyon.com/share?text=${text}%20${url}`;
        case 'line':
            return `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
        case 'viber':
            return `viber://forward?text=${text}%20${url}`;
        case 'discord':
            return `https://discord.com/channels/@me?text=${text}%20${url}`;
        case 'ameba':
            return `https://blog.ameba.jp/entry/new?text=${text}%20${url}`;
        case 'bluesky':
            return `https://bsky.app/intent/compose?text=${text}%20${url}`;
        case 'gab':
            return `https://gab.com/compose?url=${url}&text=${text}`;
        case 'weibo':
            return `https://service.weibo.com/share/share.php?url=${url}&title=${encodedTitle}&content=${text}`;
        case 'band':
            return `https://band.us/plugin/share?url=${url}&text=${text}`;
        case 'taringa':
            return `https://taringa.net/share?url=${url}&title=${encodedTitle}&text=${text}`;
        default:
            return '';
    }
}
