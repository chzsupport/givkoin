const { getSupabaseClient } = require('../lib/supabaseClient');

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (value && typeof value === 'object') {
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

function isValidId(value) {
  return Boolean(toId(value));
}

function includesId(list, id) {
  const target = toId(id);
  if (!Array.isArray(list) || !target) return false;
  return list.some((item) => toId(item?._id || item) === target);
}

function hasRequestFrom(list, fromUserId) {
  const target = toId(fromUserId);
  if (!Array.isArray(list) || !target) return false;
  return list.some((row) => toId(row?.from) === target);
}

function computeRelationshipFromUsers(viewer, target) {
  const viewerId = toId(viewer?._id);
  const targetId = toId(target?._id);

  if (!viewerId || !targetId || viewerId === targetId) {
    return {
      isFriend: false,
      hasOutgoingFriendRequest: false,
      hasIncomingFriendRequest: false,
      canSendFriendRequest: false,
    };
  }

  const viewerHasTarget = includesId(viewer?.friends, targetId);
  const targetHasViewer = includesId(target?.friends, viewerId);
  const isFriend = viewerHasTarget && targetHasViewer;

  const hasOutgoingFriendRequest = hasRequestFrom(target?.friendRequests, viewerId);
  const hasIncomingFriendRequest = hasRequestFrom(viewer?.friendRequests, targetId);

  return {
    isFriend,
    hasOutgoingFriendRequest: !isFriend && hasOutgoingFriendRequest,
    hasIncomingFriendRequest: !isFriend && hasIncomingFriendRequest,
    canSendFriendRequest: !isFriend && !hasOutgoingFriendRequest && !hasIncomingFriendRequest,
  };
}

async function getUserSocialDoc(userId) {
  const id = toId(userId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data')
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) return null;

  const json = data.data && typeof data.data === 'object' ? data.data : {};
  return {
    _id: data.id,
    data: json,
    friends: Array.isArray(json.friends) ? json.friends : [],
    friendRequests: Array.isArray(json.friendRequests) ? json.friendRequests : [],
  };
}

async function saveUserSocialDoc(userDoc) {
  const userId = toId(userDoc?._id);
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const base = userDoc?.data && typeof userDoc.data === 'object' ? userDoc.data : {};
  const next = {
    ...base,
    friends: Array.isArray(userDoc.friends) ? userDoc.friends.map((v) => toId(v?._id || v)).filter(Boolean) : [],
    friendRequests: Array.isArray(userDoc.friendRequests)
      ? userDoc.friendRequests
        .map((row) => ({
          ...row,
          from: toId(row?.from),
        }))
        .filter((row) => Boolean(row?.from))
      : [],
  };

  const { data, error } = await supabase
    .from('users')
    .update({
      data: next,
      updated_at: nowIso,
    })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getRelationship({ viewerId, targetId }) {
  if (!isValidId(viewerId) || !isValidId(targetId) || toId(viewerId) === toId(targetId)) {
    return {
      isFriend: false,
      hasOutgoingFriendRequest: false,
      hasIncomingFriendRequest: false,
      canSendFriendRequest: false,
    };
  }

  const [viewer, target] = await Promise.all([
    getUserSocialDoc(viewerId),
    getUserSocialDoc(targetId),
  ]);

  if (!viewer || !target) {
    return {
      isFriend: false,
      hasOutgoingFriendRequest: false,
      hasIncomingFriendRequest: false,
      canSendFriendRequest: false,
    };
  }

  return computeRelationshipFromUsers(viewer, target);
}

async function areUsersFriends(userAId, userBId) {
  const rel = await getRelationship({ viewerId: userAId, targetId: userBId });
  return rel.isFriend;
}

function removeRequestFrom(userDoc, requesterId) {
  const requester = toId(requesterId);
  if (!Array.isArray(userDoc.friendRequests)) {
    userDoc.friendRequests = [];
    return;
  }
  userDoc.friendRequests = userDoc.friendRequests.filter((row) => toId(row?.from) !== requester);
}

function addFriendBothSides(userA, userB) {
  const userAId = toId(userA._id);
  const userBId = toId(userB._id);

  if (!Array.isArray(userA.friends)) userA.friends = [];
  if (!Array.isArray(userB.friends)) userB.friends = [];

  if (!includesId(userA.friends, userBId)) {
    userA.friends.push(userB._id);
  }
  if (!includesId(userB.friends, userAId)) {
    userB.friends.push(userA._id);
  }
}

async function sendFriendRequestOrAutoAccept({ fromUserId, toUserId }) {
  const fromId = toId(fromUserId);
  const toIdValue = toId(toUserId);

  if (!fromId || !toIdValue) {
    return { status: 'invalid_ids' };
  }
  if (fromId === toIdValue) {
    return { status: 'self_request' };
  }

  const [fromUser, toUser] = await Promise.all([
    getUserSocialDoc(fromId),
    getUserSocialDoc(toIdValue),
  ]);

  if (!fromUser || !toUser) {
    return { status: 'user_not_found' };
  }

  const relationship = computeRelationshipFromUsers(fromUser, toUser);
  if (relationship.isFriend) {
    return { status: 'already_friends', fromUser, toUser };
  }

  // If there is already incoming request from target to sender, one action is enough.
  if (relationship.hasIncomingFriendRequest) {
    return { status: 'pending_acceptance', fromUser, toUser };
  }

  if (relationship.hasOutgoingFriendRequest) {
    return { status: 'already_requested', fromUser, toUser };
  }

  if (!Array.isArray(toUser.friendRequests)) {
    toUser.friendRequests = [];
  }
  toUser.friendRequests.push({ from: fromUser._id });
  await saveUserSocialDoc(toUser);

  return { status: 'request_sent', fromUser, toUser };
}

async function acceptFriendRequest({ userId, requesterId }) {
  const userIdValue = toId(userId);
  const requesterIdValue = toId(requesterId);
  if (!userIdValue || !requesterIdValue || userIdValue === requesterIdValue) {
    return { status: 'invalid_ids' };
  }

  const [user, requester] = await Promise.all([
    getUserSocialDoc(userIdValue),
    getUserSocialDoc(requesterIdValue),
  ]);

  if (!user || !requester) {
    return { status: 'user_not_found' };
  }

  removeRequestFrom(user, requesterIdValue);
  // Clean possible reverse request as well, to avoid stale opposite pending.
  removeRequestFrom(requester, userIdValue);
  addFriendBothSides(user, requester);

  await Promise.all([saveUserSocialDoc(user), saveUserSocialDoc(requester)]);
  return { status: 'accepted', user, requester };
}

module.exports = {
  computeRelationshipFromUsers,
  getRelationship,
  areUsersFriends,
  sendFriendRequestOrAutoAccept,
  acceptFriendRequest,
};
