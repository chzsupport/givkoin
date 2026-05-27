export type ChatMessage = {
  _id: string;
  text: string;
  translatedText?: string;
  isMine: boolean;
  createdAt: string;
  status?: 'sent' | 'delivered' | 'read';
};

export type Relationship = {
  isFriend: boolean;
  hasOutgoingFriendRequest: boolean;
  hasIncomingFriendRequest: boolean;
  canSendFriendRequest: boolean;
};

export type ChatParticipant = {
  id: string;
  nickname: string;
};
