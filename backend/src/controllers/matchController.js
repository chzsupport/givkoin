const matchingService = require('../services/matchingService');
const { recordActivity } = require('../services/activityService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const friendService = require('../services/friendService');
const { getSupabaseClient } = require('../lib/supabaseClient');

function normalizeLang(value) {
  return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'object') {
    if (value._id !== undefined) return toId(value._id, depth + 1);
    if (value.id !== undefined) return toId(value.id, depth + 1);
    if (value.value !== undefined) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const asString = value.toString();
      if (asString && asString !== '[object Object]') return asString;
    }
  }
  return String(value);
}

async function getUserRowById(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,status,language,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
  const row = await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getUsersByIds(ids) {
  const safe = (Array.isArray(ids) ? ids : []).map((v) => String(v || '').trim()).filter(Boolean);
  if (!safe.length) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,nickname,data')
    .in('id', safe);
  if (error || !Array.isArray(data)) return [];
  return data;
}

async function incrementAchievementCounter(userId, field, delta = 1) {
  const row = await getUserRowById(userId);
  if (!row) return null;
  const data = getUserData(row);
  const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};
  const current = Number(stats[field]) || 0;
  const nextStats = { ...stats, [field]: current + (Number(delta) || 0) };
  await updateUserDataById(userId, { achievementStats: nextStats });
  return nextStats;
}

function emitFriendsUpdated(io, userIds = []) {
  if (!io || !Array.isArray(userIds)) return;
  userIds
    .filter(Boolean)
    .forEach((id) => {
      const userId = id.toString();
      io.to(`user-${userId}`).emit('friends_updated', { userId });
    });
}

async function processLongChatFriendAchievement({ userId, partnerId }) {
  try {
    const currentUserRow = await getUserRowById(userId);
    const data = getUserData(currentUserRow);
    const chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    const histEntry = chatHistory.find((h) => String(h?.partnerId) === String(partnerId));
    if (!histEntry || Number(histEntry.totalTimeMinutes || 0) < 30) return;

    const { grantAchievement } = require('../services/achievementService');
    const nextStats = await incrementAchievementCounter(userId, 'totalFriendsFromLongChat', 1);

    if ((nextStats?.totalFriendsFromLongChat || 0) >= 10) {
      await grantAchievement({ userId, achievementId: 45 });
    }
  } catch (e) {
    console.error('Achievement #45 process error:', e);
  }
}

async function awardFriendRadiancePair(userAId, userBId) {
  await Promise.all([
    awardRadianceForActivity({
      userId: userAId,
      amount: 5,
      activityType: 'friend_add',
      meta: { friendId: userBId },
      dedupeKey: `friend_add:${userAId}:${userBId}`,
    }).catch(() => { }),
    awardRadianceForActivity({
      userId: userBId,
      amount: 5,
      activityType: 'friend_add',
      meta: { friendId: userAId },
      dedupeKey: `friend_add:${userBId}:${userAId}`,
    }).catch(() => { }),
  ]);
}

async function findMatch(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Требуется авторизация' });
    }
    // Лог активности: поиск собеседника
    recordActivity({ userId, type: 'match_search', minutes: 1 }).catch(() => { });
    const partner = await matchingService.findMatchForUser(userId);
    if (!partner) {
      return res.status(404).json({ message: 'Подходящий собеседник не найден' });
    }
    const chat = await matchingService.createChat(userId, partner._id);
    return res.json({
      chatId: chat._id,
      partner: {
        id: partner._id,
        nickname: partner.nickname,
        gender: partner.gender,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  findMatch,
  sendFriendRequest: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const friendId = req.body?.friendId?.toString?.() || String(req.body?.friendId || '');
      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');

      const result = await friendService.sendFriendRequestOrAutoAccept({
        fromUserId: userId,
        toUserId: friendId,
      });

      if (result.status === 'self_request') {
        return res.status(400).json({ message: pickLang(requesterLang, 'Нельзя добавить самого себя', 'You cannot add yourself') });
      }
      if (result.status === 'user_not_found' || result.status === 'invalid_ids') {
        return res.status(404).json({ message: pickLang(requesterLang, 'Пользователь не найден', 'User not found') });
      }
      if (result.status === 'already_friends') {
        return res.status(400).json({ message: pickLang(requesterLang, 'Пользователь уже в друзьях', 'User is already in your friends') });
      }
      if (result.status === 'already_requested') {
        return res.status(400).json({ message: pickLang(requesterLang, 'Заявка уже отправлена', 'Request has already been sent') });
      }
      if (result.status === 'pending_acceptance') {
        return res.json({
          message: pickLang(requesterLang, 'Заявка уже ждёт принятия в ЛК', 'The request is already waiting for acceptance'),
          status: 'pending_acceptance',
        });
      }

      const { createNotification } = require('./notificationController');
      const io = req.app.get('io');

      if (result.status === 'request_sent') {
        const friendRow = await getUserRowById(friendId);
        const friendLang = normalizeLang(friendRow?.language || friendRow?.data?.language || 'ru');
        const receivedStats = await incrementAchievementCounter(friendId, 'totalFriendRequestsReceived', 1);
        const received = Number(receivedStats?.totalFriendRequestsReceived || 0);

        if (received >= 20) {
          try {
            const { grantAchievement } = require('../services/achievementService');
            await grantAchievement({ userId: friendId, achievementId: 42 });
          } catch (e) {
            console.error('Achievement #42 grant error:', e);
          }
        }

        await createNotification({
          userId: friendId,
          type: 'friend_request',
          title: pickLang(friendLang, 'Новая заявка в друзья', 'New friend request'),
          message: pickLang(
            friendLang,
            `${req.user.nickname} хочет добавить вас в друзья`,
            `${req.user.nickname} wants to add you as a friend`
          ),
          link: '/cabinet/friends',
          io,
        });

        emitFriendsUpdated(io, [userId, friendId]);
        return res.json({ message: pickLang(requesterLang, 'Заявка отправлена', 'Request sent'), status: 'request_sent' });
      }

      return res.status(400).json({ message: pickLang(requesterLang, 'Не удалось отправить заявку', 'Failed to send request') });
    } catch (error) {
      next(error);
    }
  },

  acceptFriendRequest: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { requesterId } = req.body;
      const result = await friendService.acceptFriendRequest({ userId, requesterId });

      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');

      if (result.status === 'user_not_found' || result.status === 'invalid_ids') {
        return res.status(404).json({ message: pickLang(requesterLang, 'Пользователь не найден', 'User not found') });
      }

      await Promise.all([
        processLongChatFriendAchievement({ userId, partnerId: requesterId }),
        processLongChatFriendAchievement({ userId: requesterId, partnerId: userId }),
        awardFriendRadiancePair(userId, requesterId),
      ]);

      const io = req.app.get('io');
      emitFriendsUpdated(io, [userId, requesterId]);
      io?.to?.(`user-${userId.toString()}`).emit('friend_added', { friendId: requesterId.toString() });
      io?.to?.(`user-${requesterId.toString()}`).emit('friend_added', { friendId: userId.toString() });

      res.json({ message: pickLang(requesterLang, 'Заявка принята', 'Request accepted'), status: 'accepted' });
    } catch (error) {
      next(error);
    }
  },

  rejectFriendRequest: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { requesterId } = req.body;

      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');

      const row = await getUserRowById(userId);
      const data = getUserData(row);
      const friendRequests = Array.isArray(data.friendRequests) ? data.friendRequests : [];
      const nextRequests = friendRequests.filter((r) => String(r?.from) !== String(requesterId));
      await updateUserDataById(userId, { friendRequests: nextRequests });

      res.json({ message: pickLang(requesterLang, 'Заявка отклонена', 'Request rejected') });
    } catch (error) {
      next(error);
    }
  },

  removeFriend: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { friendId } = req.body;

      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');

      const [userRow, friendRow] = await Promise.all([
        getUserRowById(userId),
        getUserRowById(friendId),
      ]);
      if (!userRow || !friendRow) {
        return res.status(404).json({ message: pickLang(requesterLang, 'Пользователь не найден', 'User not found') });
      }

      const userData = getUserData(userRow);
      const friendData = getUserData(friendRow);

      const userFriends = Array.isArray(userData.friends) ? userData.friends : [];
      const friendFriends = Array.isArray(friendData.friends) ? friendData.friends : [];

      await Promise.all([
        updateUserDataById(userId, { friends: userFriends.filter((id) => String(id) !== String(friendId)) }),
        updateUserDataById(friendId, { friends: friendFriends.filter((id) => String(id) !== String(userId)) }),
      ]);

      res.json({ message: pickLang(requesterLang, 'Пользователь удален из друзей', 'User removed from friends') });
    } catch (error) {
      next(error);
    }
  },

  getFriends: async (req, res, next) => {
    try {
      const userId = req.user._id;

      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
      const { isUserOnline } = require('../services/socketService');

      const userRow = await getUserRowById(userId);
      if (!userRow) return res.json([]);
      const userData = getUserData(userRow);
      const friendIds = (Array.isArray(userData.friends) ? userData.friends : []).map(String).filter(Boolean);
      if (!friendIds.length) return res.json([]);

      const friendRows = await getUsersByIds(friendIds);
      const response = (Array.isArray(friendRows) ? friendRows : [])
        .map((friend) => {
          const fid = String(friend?.id || '').trim();
          if (!fid) return null;
          const fData = friend?.data && typeof friend.data === 'object' ? friend.data : {};
          return {
            _id: fid,
            nickname: String(friend?.nickname || '').trim() || pickLang(requesterLang, 'Пользователь', 'User'),
            gender: fData?.gender || 'other',
            avatar: fData?.avatar || fData?.avatarUrl || undefined,
            isOnline: isUserOnline(fid),
          };
        })
        .filter(Boolean);

      return res.json(response);
    } catch (error) {
      next(error);
    }
  },

  getFriendRequests: async (req, res, next) => {
    try {
      const userId = req.user._id;

      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
      const userRow = await getUserRowById(userId);
      if (!userRow) return res.json([]);
      const userData = getUserData(userRow);
      const rawRequests = Array.isArray(userData.friendRequests) ? userData.friendRequests : [];
      const normalizedRequests = rawRequests
        .map((row) => {
          const fromId = toId(row?.from);
          if (!fromId || fromId === userId.toString()) return null;
          const createdAt = row?.createdAt ? new Date(row.createdAt) : new Date(0);
          const fallbackId = `${fromId}:${createdAt.getTime()}`;
          return {
            _id: row?._id?.toString?.() || fallbackId,
            fromId,
            createdAt,
          };
        })
        .filter(Boolean);

      if (!normalizedRequests.length) {
        return res.json([]);
      }

      const senderIds = Array.from(new Set(normalizedRequests.map((row) => row.fromId)));
      const senders = await getUsersByIds(senderIds);
      const senderMap = new Map((Array.isArray(senders) ? senders : []).map((sender) => [String(sender?.id || ''), sender]));

      const response = normalizedRequests
        .map((row) => {
          const sender = senderMap.get(row.fromId);
          if (!sender) return null;
          const nickname = String(sender.nickname || '').trim() || pickLang(requesterLang, 'Пользователь', 'User');
          const senderData = sender?.data && typeof sender.data === 'object' ? sender.data : {};
          return {
            _id: row._id,
            from: {
              _id: row.fromId,
              nickname,
              gender: senderData?.gender || 'other',
              avatar: senderData?.avatar || senderData?.avatarUrl || undefined,
            },
            createdAt: row.createdAt,
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json(response);
    } catch (error) {
      return next(error);
    }
  },

  getBlockedUsers: async (req, res, next) => {
    try {
      const userId = req.user._id;

      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
      const now = new Date();

      const userRow = await getUserRowById(userId);
      if (!userRow) return res.json([]);
      const userData = getUserData(userRow);
      const blocked = Array.isArray(userData.blockedUsers) ? userData.blockedUsers : [];
      const activeBlocked = blocked
        .filter((entry) => {
          if (!entry?.userId) return false;
          if (!entry?.until) return true;
          return new Date(entry.until).getTime() > now.getTime();
        });

      const blockedIds = Array.from(new Set(activeBlocked.map((b) => String(b.userId)).filter(Boolean)));
      const blockedRows = await getUsersByIds(blockedIds);
      const blockedMap = new Map((Array.isArray(blockedRows) ? blockedRows : []).map((u) => [String(u.id), u]));

      const response = activeBlocked
        .map((entry) => {
          const id = String(entry?.userId || '').trim();
          if (!id) return null;
          const blockedUser = blockedMap.get(id);
          const bData = blockedUser?.data && typeof blockedUser.data === 'object' ? blockedUser.data : {};
          return {
            _id: id,
            nickname: String(blockedUser?.nickname || '').trim() || pickLang(requesterLang, 'Пользователь', 'User'),
            gender: bData?.gender || 'other',
            avatar: bData?.avatar || bData?.avatarUrl || undefined,
            blockedUntil: entry?.until || null,
            reason: entry?.reason || '',
          };
        })
        .filter(Boolean);

      return res.json(response);
    } catch (error) {
      return next(error);
    }
  },

  unblockUser: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { targetUserId } = req.body;

      const requesterLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');

      if (!targetUserId) {
        return res.status(400).json({ message: pickLang(requesterLang, 'userId обязательный', 'userId is required') });
      }

      const [userRow, targetRow] = await Promise.all([
        getUserRowById(userId),
        getUserRowById(targetUserId),
      ]);
      const userData = getUserData(userRow);
      const targetData = getUserData(targetRow);
      const blockedUsers = Array.isArray(userData.blockedUsers) ? userData.blockedUsers : [];
      const targetBlockedUsers = Array.isArray(targetData.blockedUsers) ? targetData.blockedUsers : [];

      await Promise.all([
        updateUserDataById(userId, { blockedUsers: blockedUsers.filter((b) => String(b?.userId) !== String(targetUserId)) }),
        updateUserDataById(targetUserId, { blockedUsers: targetBlockedUsers.filter((b) => String(b?.userId) !== String(userId)) }),
      ]);

      return res.json({ ok: true, message: pickLang(requesterLang, 'Пользователь разблокирован', 'User unblocked') });
    } catch (error) {
      return next(error);
    }
  },
};
