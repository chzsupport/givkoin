const { listBackups } = require('../../services/backupService');
const { clearCacheByZone } = require('../../services/cacheService');
const {
  createOperationApproval,
  serializeApproval,
} = require('../../services/operationApprovalService');
const {
  buildOperationId,
  logCmsAudit,
  mutationResponse,
  toNumber,
} = require('./shared');

async function getBackups(req, res) {
  try {
    const backups = listBackups({ limit: toNumber(req.query.limit, 100) });
    return res.json({ backups });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createBackup(req, res) {
  try {
    const { reason, impactPreview, confirmationPhrase } = req.body || {};
    const approval = await createOperationApproval({
      req,
      actionType: 'system.backup.create',
      reason,
      impactPreview,
      confirmationPhrase,
      payload: {
        source: 'cms_backups_create',
      },
    });

    return res.status(202).json(mutationResponse({
      operationId: approval.operationId,
      status: approval.approval.status,
      requiresApproval: true,
      auditId: approval.auditId,
      message: 'Операция отправлена на подтверждение',
      data: { approval: serializeApproval(approval.approval) },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function restoreBackup(req, res) {
  try {
    const { backupId, backupPath, reason, impactPreview, confirmationPhrase } = req.body || {};

    const approval = await createOperationApproval({
      req,
      actionType: 'system.job.run',
      reason: reason || 'Restore backup via CMS',
      impactPreview: impactPreview || 'Восстановление данных из резервной копии',
      confirmationPhrase,
      payload: {
        jobName: 'backup_restore',
        params: {
          backupId: backupId || null,
          backupPath: backupPath || null,
        },
      },
    });

    return res.status(202).json(mutationResponse({
      operationId: approval.operationId,
      status: approval.approval.status,
      requiresApproval: true,
      auditId: approval.auditId,
      message: 'Восстановление отправлено на подтверждение',
      data: { approval: serializeApproval(approval.approval) },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function clearCache(req, res) {
  try {
    const operationId = buildOperationId();
    const zone = String(req.body?.zone || 'system').trim().toLowerCase();

    const result = clearCacheByZone(zone);

    const auditId = await logCmsAudit(
      req,
      'cms.system.cache.clear',
      'cache',
      null,
      null,
      result,
      { operationId, zone },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Кэш очищен',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  clearCache,
  createBackup,
  getBackups,
  restoreBackup,
};
