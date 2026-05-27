const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { buildSafeUserFromRow: defaultBuildSafeUserFromRow } = require('./authUserPayload');
const { getUserRowById: defaultGetUserRowById } = require('./authUserStore');

function createAuthProfileUpdate({
  buildSafeUserFromRow = defaultBuildSafeUserFromRow,
  getSupabaseClient = defaultGetSupabaseClient,
  getUserRowById = defaultGetUserRowById,
  now = () => new Date(),
} = {}) {
  async function updateAuthProfile({
    userId,
    gender,
    birthDate,
    preferredGender,
    preferredAgeFrom,
    preferredAgeTo,
    language,
  } = {}) {
    const row = await getUserRowById(userId);

    if (!row) {
      return { ok: false, reason: 'not_found' };
    }

    const existingData = row.data && typeof row.data === 'object' ? row.data : {};
    const nextData = { ...existingData };

    if (gender) nextData.gender = gender;
    if (birthDate) nextData.birthDate = birthDate;
    if (preferredGender) nextData.preferredGender = preferredGender;
    if (preferredAgeFrom !== undefined) nextData.preferredAgeFrom = preferredAgeFrom;
    if (preferredAgeTo !== undefined) nextData.preferredAgeTo = preferredAgeTo;

    const payload = {
      updated_at: new Date(now()).toISOString(),
      data: nextData,
    };

    if (language) payload.language = language;

    await getSupabaseClient()
      .from('users')
      .update(payload)
      .eq('id', String(row.id));

    const updatedRow = await getUserRowById(row.id);

    return {
      ok: true,
      row,
      updatedRow: updatedRow || row,
      user: buildSafeUserFromRow(updatedRow || row),
    };
  }

  return {
    updateAuthProfile,
  };
}

module.exports = {
  ...createAuthProfileUpdate(),
  createAuthProfileUpdate,
};
