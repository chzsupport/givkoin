const {
    listActiveChats,
} = require('./socket/socketDataStore');
const {
    acquireChatStartLock,
    releaseChatStartLock,
} = require('./socket/socketSearchState');
const {
    getOnlineUserCount,
    getOnlineUserIds,
    isUserOnline,
} = require('./socket/socketOnlineUsers');
const {
    hasUserActiveChat,
} = require('./socket/socketActiveChats');
const {
    setUsersChatStatus,
} = require('./socket/socketUserStatus');
const {
    getParticipantLanguagesForChat,
} = require('./socket/socketChatLifecycle');
const {
    addToQueue,
    clearPendingCallsForUser,
    getQueuedUser,
    removeFromQueue,
    resetRuntimeState,
} = require('./socket/socketRuntimeLifecycle');
const {
    startPartnerSearch,
} = require('./socket/socketPartnerSearch');
const {
    closeIdleChatIfNeeded,
} = require('./socket/socketChatSessionLifecycle');
const { startChat } = require('./socket/socketChatStart');
const {
    handleComplaint,
    notifyChatClosed,
} = require('./socket/socketComplaintHandler');
const {
    handleChatHeartbeat,
    handleSendMessage,
    handleTyping,
} = require('./socket/socketChatMessaging');
const {
    handleConfirmLeaveWaiting,
    handleLeaveChat,
} = require('./socket/socketChatLeaving');
const { handleRatePartner } = require('./socket/socketChatRating');
const {
    handleAddFriend,
    handleFriendInviteResponse,
    handleInviteFriend,
} = require('./socket/socketFriendHandlers');
const {
    handleCallResponse,
    handleCancelSearch,
} = require('./socket/socketCallResponse');
const {
    handleChatJoin,
    handleSocketAuth,
    handleSocketDisconnect,
    setSocketSiteLanguage,
} = require('./socket/socketConnectionHandlers');

const CHAT_IDLE_SWEEP_INTERVAL_MS = 60 * 1000;

async function startChatWithLock(io, user1Id, user2Id, options = {}) {
    const lockIds = acquireChatStartLock([user1Id, user2Id], {
        isActiveUser: hasUserActiveChat,
    });
    if (!lockIds) return false;
    try {
        await startChat(io, user1Id, user2Id, options);
        return true;
    } finally {
        releaseChatStartLock(lockIds);
    }
}

function initSocketService(io) {
    io.on('connection', (socket) => {
        // Identify user (simplified, in real app use middleware)
        // Client should emit 'auth' or similar, or we use handshake query
        let currentUserId = null;

        socket.on('auth', async (payload = {}) => {
            await handleSocketAuth(io, socket, payload, {
                setCurrentUserId: (userId) => {
                    currentUserId = userId;
                },
            });
        });

        socket.on('site_language', ({ language } = {}) => {
            setSocketSiteLanguage(socket, language);
        });

        socket.on('disconnect', () => {
            void handleSocketDisconnect(io, currentUserId);
        });

        // Update User Status (available/busy)
        socket.on('update_status', async ({ status } = {}) => {
            if (!currentUserId) return;
            await setUsersChatStatus(currentUserId, status);
        });

        // Join Chat Room only for the authenticated chat participant
        socket.on('chat:join', async ({ chatId } = {}) => {
            await handleChatJoin(io, socket, currentUserId, { chatId });
        });

        // Find Partner
        socket.on('find_partner', async () => {
            if (!currentUserId) return;

            try {
                await startPartnerSearch(io, currentUserId, socket.id);
            } catch (error) {
                console.error('Error finding partner:', error);
                socket.emit('error', { message: 'Error finding partner' });
            }
        });

        // Call Response
        socket.on('call_response', async ({ accepted, callerId }) => {
            await handleCallResponse(io, currentUserId, { accepted, callerId }, { startChatWithLock });
        });

        // Cancel Search
        socket.on('cancel_search', async () => {
            await handleCancelSearch(currentUserId);
        });

        // Send Message
        socket.on('send_message', async ({ chatId, text }) => {
            try {
                await handleSendMessage(io, socket, currentUserId, { chatId, text });
            } catch (error) {
                console.error('Error sending message:', error);
            }
        });

        // Typing indicator
        socket.on('typing', ({ chatId }) => {
            handleTyping(socket, chatId, 'partner_typing');
        });

        socket.on('stop_typing', ({ chatId }) => {
            handleTyping(socket, chatId, 'partner_stop_typing');
        });

        socket.on('chat_heartbeat', async ({ chatId }) => {
            try {
                await handleChatHeartbeat(currentUserId, { chatId });
            } catch (error) {
                console.error('Error handling chat heartbeat:', error);
            }
        });

        // Leave Chat
        socket.on('leave_chat', async ({ chatId, reportedTotalDurationSeconds }) => {
            try {
                await handleLeaveChat(io, socket, currentUserId, { chatId, reportedTotalDurationSeconds });
            } catch (error) {
                console.error('Error leaving chat:', error);
            }
        });

        // Подтверждение выхода из чата во время ожидания
        socket.on('confirm_leave_waiting', async ({ chatId }) => {
            try {
                await handleConfirmLeaveWaiting(io, currentUserId, { chatId });
            } catch (error) {
                console.error('Error confirming leave waiting:', error);
            }
        });

        // Add Friend (request only; acceptance happens in cabinet)
        socket.on('add_friend', async ({ oderId, otherId, friendId }) => {
            await handleAddFriend(io, socket, currentUserId, { oderId, otherId, friendId });
        });

        // Rate Partner
        socket.on('rate_partner', async ({ chatId, rating }) => {
            try {
                await handleRatePartner(socket, currentUserId, { chatId, rating });
            } catch (error) {
                console.error('Error rating partner:', error);
            }
        });

        // Friend Direct Invite
        socket.on('invite_friend', async ({ friendId }) => {
            await handleInviteFriend(io, socket, currentUserId, { friendId });
        });

        // Friend Invite Response
        socket.on('friend_invite_response', async ({ inviterId, accepted }) => {
            await handleFriendInviteResponse(io, currentUserId, { inviterId, accepted }, { startChatWithLock });
        });

        // Complaint
        socket.on('complaint', async ({ chatId, reason, reportedTotalDurationSeconds }) => {
            try {
                await handleComplaint(io, currentUserId, { chatId, reason, reportedTotalDurationSeconds });
            } catch (error) {
                console.error('Error handling complaint:', error);
            }
        });

    });

    setInterval(async () => {
        try {
            const activeChats = await listActiveChats(1000);
            for (const chat of activeChats) {
                await closeIdleChatIfNeeded(io, chat);
            }
        } catch (error) {
            console.error('Error sweeping idle chats:', error);
        }
    }, CHAT_IDLE_SWEEP_INTERVAL_MS);
}

module.exports = {
    initSocketService,
    notifyChatClosed,
    startPartnerSearch,
    getOnlineUserCount,
    isUserOnline,
    getOnlineUserIds,
    __testUtils: {
        addToQueue,
        removeFromQueue,
        getQueuedUser,
        setUsersChatStatus,
        clearPendingCallsForUser,
        resetRuntimeState,
    },
};

