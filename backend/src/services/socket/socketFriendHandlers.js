const friendService = require('../friendService');

const {
    getUserData,
    getUserRowById,
} = require('./socketDataStore');
const {
    buildSocketMessage,
    buildSocketMessageKey,
} = require('./socketMessages');

function emitFriendsUpdated(io, userIds = []) {
    if (!io || !Array.isArray(userIds)) return;
    userIds
        .filter(Boolean)
        .forEach((id) => {
            const uid = id.toString();
            io.to(`user-${uid}`).emit('friends_updated', { userId: uid });
        });
}

function resolveFriendTargetId(payload = {}) {
    return (payload.friendId || payload.otherId || payload.oderId || '').toString();
}

function getUserLanguage(userRow) {
    return (userRow?.language || userRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
}

function getUserNickname(userRow, fallback = '') {
    return String(userRow?.nickname || getUserData(userRow).nickname || '').trim() || fallback;
}

function getUserChatStatus(userRow) {
    return getUserData(userRow).chatStatus || 'available';
}

function isUserRoomOnline(io, userId) {
    const room = io?.sockets?.adapter?.rooms?.get(`user-${userId}`);
    return Boolean(room && room.size > 0);
}

function buildIncomingFriendInvitePayload(currentUserId, inviterName) {
    return {
        callerId: currentUserId,
        source: 'friend',
        callerName: inviterName,
    };
}

async function notifyFriendRequest(io, fromUserId, targetId) {
    try {
        const { createNotification } = require('../../controllers/notificationController');
        const senderRow = await getUserRowById(fromUserId);
        const targetRow = await getUserRowById(targetId);
        const senderNick = getUserNickname(senderRow);
        const targetLang = getUserLanguage(targetRow);
        await createNotification({
            userId: targetId,
            type: 'friend_request',
            title: targetLang === 'en' ? 'New friend request' : 'Новая заявка в друзья',
            message: targetLang === 'en'
                ? `${senderNick || 'User'} wants to add you as a friend`
                : `${senderNick || 'Пользователь'} хочет добавить вас в друзья`,
            link: '/cabinet/friends',
            io,
        });
    } catch (_e) {
        // Уведомление не должно ломать саму заявку в друзья.
    }
}

async function handleAddFriend(io, socket, currentUserId, payload = {}) {
    try {
        const targetId = resolveFriendTargetId(payload);
        if (!currentUserId || !targetId || targetId === currentUserId.toString()) return;

        const result = await friendService.sendFriendRequestOrAutoAccept({
            fromUserId: currentUserId,
            toUserId: targetId,
        });

        if (result.status === 'request_sent') {
            await notifyFriendRequest(io, currentUserId, targetId);
            socket.emit('friend_request_sent', { friendId: targetId });
            emitFriendsUpdated(io, [currentUserId, targetId]);
            return;
        }

        if (result.status === 'already_requested') {
            socket.emit('friend_request_pending', { friendId: targetId });
            return;
        }

        if (result.status === 'pending_acceptance') {
            socket.emit('friend_request_pending', buildSocketMessage(
                socket,
                'chat.friend_request_pending_hint',
                'Заявка уже ждёт принятия в ЛК',
                'The request is already waiting in Profile',
                { friendId: targetId }
            ));
            return;
        }

        if (result.status === 'chat_too_short') {
            socket.emit('friend_request_error', buildSocketMessage(
                socket,
                'chat.friend_request_chat_too_short',
                'Добавить в друзья можно только после общения не меньше 5 минут',
                'You can add a friend only after at least 5 minutes of chat',
                { friendId: targetId }
            ));
            return;
        }

        if (result.status === 'rate_limited') {
            socket.emit('friend_request_error', buildSocketMessage(
                socket,
                'chat.friend_request_rate_limited',
                'Можно отправить не больше 12 заявок в друзья за час',
                'You can send no more than 12 friend requests per hour',
                { friendId: targetId }
            ));
            return;
        }

        if (result.status === 'already_friends') {
            socket.emit('friend_added', { friendId: targetId });
            io.to(`user-${targetId}`).emit('friend_added', { friendId: currentUserId });
            emitFriendsUpdated(io, [currentUserId, targetId]);
        }
    } catch (error) {
        console.error('Error adding friend:', error);
    }
}

async function handleInviteFriend(io, socket, currentUserId, { friendId } = {}) {
    try {
        if (!currentUserId || !friendId) return;
        const isFriends = await friendService.areUsersFriends(currentUserId, friendId);
        if (!isFriends) {
            socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_only_for_friends', 'Пользователь не находится у вас в друзьях', 'This user is not in your friends list'));
            return;
        }

        if (!isUserRoomOnline(io, friendId)) {
            socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_friend_offline', 'Пользователь не в сети', 'The user is offline'));
            return;
        }

        const friendRow = await getUserRowById(friendId);
        if (getUserChatStatus(friendRow) !== 'available') {
            socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_friend_busy', 'Пользователь сейчас занят', 'The user is busy right now'));
            return;
        }

        const inviterRow = await getUserRowById(currentUserId);
        const inviterName = getUserNickname(inviterRow, 'Друг');
        io.to(`user-${friendId}`).emit('incoming_call', buildIncomingFriendInvitePayload(currentUserId, inviterName));
        io.to(`user-${friendId}`).emit('friend_invite', {
            inviterId: currentUserId,
            inviterName,
        });

        socket.emit('invite_sent', buildSocketMessage(socket, 'friends.invite_sent', 'Приглашение отправлено', 'Invite sent'));
    } catch (error) {
        console.error('Error inviting friend:', error);
        socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_error', 'Ошибка при приглашении', 'Failed to send invite'));
    }
}

async function handleFriendInviteResponse(io, currentUserId, { inviterId, accepted } = {}, { startChatWithLock } = {}) {
    try {
        if (!currentUserId) return;

        if (accepted) {
            const isFriends = await friendService.areUsersFriends(inviterId, currentUserId);
            if (!isFriends) {
                io.to(`user-${currentUserId}`).emit('invite_error', buildSocketMessageKey('friends.invite_outdated'));
                return;
            }
            const inviterRow = await getUserRowById(inviterId);
            if (!inviterRow || getUserChatStatus(inviterRow) !== 'available') {
                io.to(`user-${currentUserId}`).emit('invite_error', buildSocketMessageKey('friends.inviter_unavailable'));
                return;
            }
            const started = await startChatWithLock(io, inviterId, currentUserId, { isFriendSnapshot: true });
            if (!started) {
                io.to(`user-${currentUserId}`).emit('invite_error', buildSocketMessageKey('friends.inviter_unavailable'));
            }
        } else {
            io.to(`user-${inviterId}`).emit('invite_declined', buildSocketMessageKey('chat.invite_declined'));
        }
    } catch (error) {
        console.error('Error handling invite response:', error);
    }
}

module.exports = {
    buildIncomingFriendInvitePayload,
    emitFriendsUpdated,
    getUserChatStatus,
    getUserLanguage,
    getUserNickname,
    handleAddFriend,
    handleFriendInviteResponse,
    handleInviteFriend,
    isUserRoomOnline,
    resolveFriendTargetId,
};
