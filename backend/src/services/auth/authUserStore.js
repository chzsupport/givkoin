const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const {
  getMoodDiagnosticsForUser: defaultGetMoodDiagnosticsForUser,
} = require('../entityMoodService');
const {
  buildSafeUserFromRow,
  mapEntityRowToAuthUser,
} = require('./authUserPayload');

function createAuthUserStore({
  getSupabaseClient = defaultGetSupabaseClient,
  getMoodDiagnosticsForUser = defaultGetMoodDiagnosticsForUser,
} = {}) {
  async function getAuthUserEntity(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return null;

    const supabase = getSupabaseClient();
    const { data: entityRow, error } = await supabase
      .from('entities')
      .select('id,name,avatar_url,stage,mood,satiety_until,created_at')
      .eq('user_id', safeUserId)
      .maybeSingle();

    if (error || !entityRow) return null;

    const entity = mapEntityRowToAuthUser(entityRow);
    const diag = await getMoodDiagnosticsForUser(safeUserId).catch(() => null);

    if (diag?.mood) {
      entity.mood = diag.mood;
    }

    return entity;
  }

  async function buildSafeUserWithEntity(row) {
    const user = buildSafeUserFromRow(row);
    if (!user) return null;

    const entity = await getAuthUserEntity(user._id || user.id);

    if (entity) {
      user.entity = entity;
    } else {
      delete user.entity;
    }

    return user;
  }

  async function getUserRowById(userId) {
    if (!userId) return null;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', String(userId))
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  return {
    buildSafeUserWithEntity,
    getAuthUserEntity,
    getUserRowById,
  };
}

module.exports = {
  ...createAuthUserStore(),
  createAuthUserStore,
};
