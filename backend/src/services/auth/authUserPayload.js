function buildSafeUserFromRow(row) {
  if (!row) return null;

  const extra = row.data && typeof row.data === 'object' ? row.data : {};

  return {
    ...extra,
    _id: row.id,
    id: row.id,
    email: row.email,
    role: row.role,
    nickname: row.nickname,
    status: row.status,
    emailConfirmed: Boolean(row.email_confirmed),
    emailConfirmedAt: row.email_confirmed_at,
    accessRestrictedUntil: row.access_restricted_until,
    accessRestrictionReason: row.access_restriction_reason,
    language: row.language,
    lastSeenAt: row.last_seen_at,
    lastOnlineAt: row.last_online_at,
    lastIp: row.last_ip,
    lastDeviceId: row.last_device_id,
    lastFingerprint: row.last_fingerprint,
    lastProfileKey: extra.lastProfileKey || '',
    lastClientProfile: extra.lastClientProfile || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntityRowToAuthUser(entityRow) {
  if (!entityRow) return null;

  return {
    _id: entityRow.id,
    id: entityRow.id,
    name: entityRow.name,
    avatarUrl: entityRow.avatar_url,
    stage: entityRow.stage,
    mood: entityRow.mood,
    satietyUntil: entityRow.satiety_until,
    createdAt: entityRow.created_at,
  };
}

module.exports = {
  buildSafeUserFromRow,
  mapEntityRowToAuthUser,
};
