import type { Friend, FriendRequest, FriendRequestsApiResponse, FriendsTranslate } from './types';

export function normalizeFriendList(source: unknown, t: FriendsTranslate): Friend[] {
    if (!Array.isArray(source)) return [];
    return source
        .map((friend) => normalizeFriend(friend, t))
        .filter((friend) => friend._id);
}

export function normalizeFriendRequests(source: FriendRequestsApiResponse, t: FriendsTranslate): FriendRequest[] {
    const raw = Array.isArray(source)
        ? source
        : Array.isArray(source?.requests)
            ? source.requests
            : [];

    return raw
        .map((request) => ({
            _id: String(request?._id || ''),
            from: normalizeFriend(request?.from, t),
            createdAt: String(request?.createdAt || ''),
        }))
        .filter((request) => request._id && request.from._id);
}

export function resolveFriendSocketMessage(data: unknown, fallbackKey: string, t: FriendsTranslate) {
    const row = typeof data === 'object' && data !== null ? data as { message?: unknown; messageKey?: unknown } : null;
    const translated = typeof row?.messageKey === 'string' ? t(row.messageKey) : '';
    const direct = typeof row?.message === 'string' ? row.message : '';
    return translated || direct || t(fallbackKey);
}

function normalizeFriend(source: unknown, t: FriendsTranslate): Friend {
    const friend = typeof source === 'object' && source !== null ? source as Partial<Friend> : {};
    return {
        _id: String(friend?._id || ''),
        nickname: String(friend?.nickname || '').trim() || t('common.user'),
        gender: String(friend?.gender || 'other'),
        avatar: friend?.avatar,
        isOnline: Boolean(friend?.isOnline),
    };
}
