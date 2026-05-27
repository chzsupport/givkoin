const {
  repairDamagedUserData: defaultRepairDamagedUserData,
} = require('./authUserRecovery');
const {
  buildSafeUserWithEntity: defaultBuildSafeUserWithEntity,
  getUserRowById: defaultGetUserRowById,
} = require('./authUserStore');

function createAuthCurrentUser({
  buildSafeUserWithEntity = defaultBuildSafeUserWithEntity,
  getUserRowById = defaultGetUserRowById,
  repairDamagedUserData = defaultRepairDamagedUserData,
} = {}) {
  async function getCurrentAuthUser({ userId } = {}) {
    const baseRow = await getUserRowById(userId);
    const row = await repairDamagedUserData(baseRow);

    if (!row) {
      return { ok: false, reason: 'not_found' };
    }

    return {
      ok: true,
      row,
      user: await buildSafeUserWithEntity(row),
    };
  }

  return {
    getCurrentAuthUser,
  };
}

module.exports = {
  ...createAuthCurrentUser(),
  createAuthCurrentUser,
};
