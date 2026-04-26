const express = require('express');
const controller = require('../controllers/adminV2Controller');
const cmsRoutes = require('./adminCmsV2');

const router = express.Router();

// Operation approvals
router.get('/approvals', controller.listApprovals);
router.post('/approvals', controller.createApproval);
router.post('/approvals/:id/approve', controller.approveApproval);
router.post('/approvals/:id/reject', controller.rejectApproval);

// Extended audit
router.get('/audit', controller.getAudit);
router.get('/audit/:id', controller.getAuditById);

// Settings registry
router.get('/settings/definitions', controller.getSettingsDefinitions);
router.get('/settings/values', controller.getSettingsValues);
router.patch('/settings/values', controller.patchSettingsValues);

// System jobs + operational center
router.get('/system/overview', controller.getSystemOverview);
router.get('/system/jobs', controller.listSystemJobs);
router.post('/system/jobs/:job/run', controller.runSystemJob);
router.get('/system/jobs/:runId', controller.getSystemJobRun);

// CMS namespace
router.use('/cms', cmsRoutes);

module.exports = router;
