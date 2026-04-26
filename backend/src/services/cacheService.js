const { invalidateSettingsCache } = require('./settingsRegistryService');

function clearSystemCache() {
  return {
    zone: 'system',
    cleared: true,
    details: ['settings_registry_cache'],
  };
}

function clearLimitsCache() {
  return {
    zone: 'limits',
    cleared: true,
    details: ['request_limits_runtime'],
  };
}

function clearTemporaryCache() {
  return {
    zone: 'temporary',
    cleared: true,
    details: ['temporary_runtime_data'],
  };
}

function clearSettingsCache() {
  invalidateSettingsCache();
  return {
    zone: 'settings',
    cleared: true,
    details: ['settings_registry_cache'],
  };
}

function clearCacheByZone(zone = 'system') {
  const safeZone = String(zone || 'system').trim().toLowerCase();
  if (safeZone === 'system') return clearSystemCache();
  if (safeZone === 'limits') return clearLimitsCache();
  if (safeZone === 'temporary') return clearTemporaryCache();
  if (safeZone === 'settings') return clearSettingsCache();

  const err = new Error('Unknown cache zone');
  err.status = 400;
  throw err;
}

module.exports = {
  clearCacheByZone,
};
