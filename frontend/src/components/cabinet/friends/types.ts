export interface Friend {
    _id: string;
    nickname: string;
    gender: string;
    avatar?: string;
    isOnline?: boolean;
}

export interface FriendRequest {
    _id: string;
    from: Friend;
    createdAt: string;
}

export type FriendRequestsApiResponse = FriendRequest[] | { requests?: FriendRequest[] };
export type FriendsTab = 'friends' | 'requests' | 'blocked';
export type FriendsTranslate = (key: string) => string;
