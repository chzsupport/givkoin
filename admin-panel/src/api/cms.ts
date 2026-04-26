import api from './client';

export const cmsFetchRiskCases = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/security/risk-cases', { params });
  return res.data;
};

export const cmsFetchRiskCase = async (id: string) => {
  const res = await api.get(`/admin/v2/cms/security/risk-cases/${id}`);
  return res.data;
};

export const cmsApplyRiskPenalty = async (id: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/security/risk-cases/${id}/penalize`, payload || {});
  return res.data;
};

export const cmsResolveRiskCase = async (id: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/security/risk-cases/${id}/resolve`, payload || {});
  return res.data;
};

export const cmsUnfreezeRiskGroup = async (id: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/security/risk-cases/${id}/unfreeze-group`, payload || {});
  return res.data;
};

export const cmsWatchRiskGroup = async (id: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/security/risk-cases/${id}/watch-group`, payload || {});
  return res.data;
};

export const cmsBanRiskGroup = async (id: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/security/risk-cases/${id}/ban-group`, payload || {});
  return res.data;
};

export const cmsDeleteRiskCase = async (id: string) => {
  const res = await api.delete(`/admin/v2/cms/security/risk-cases/${id}`);
  return res.data;
};

export const cmsRemoveRelatedUser = async (riskCaseId: string, userId: string) => {
  const res = await api.delete(`/admin/v2/cms/security/risk-cases/${riskCaseId}/users/${userId}`);
  return res.data;
};

export const cmsRecomputeRiskCases = async () => {
  const res = await api.post('/admin/v2/cms/security/risk-cases/recompute');
  return res.data;
};

export const cmsSendRiskCaseChoiceEmail = async (riskCaseId: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/security/risk-cases/${riskCaseId}/contact`, payload || {});
  return res.data;
};

export const cmsSendRiskGroupChoiceEmail = async (payload?: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/security/risk-groups/contact', payload || {});
  return res.data;
};

export const cmsFetchIpRules = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/security/ip-rules', { params });
  return res.data;
};

export const cmsBlockIpRule = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/security/ip-rules/block', payload);
  return res.data;
};

export const cmsUnblockIpRule = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/security/ip-rules/unblock', payload);
  return res.data;
};

export const cmsFetchAuthEvents = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/auth/events', { params });
  return res.data;
};

export const cmsFetchUserSessions = async (userId: string) => {
  const res = await api.get(`/admin/v2/cms/users/${userId}/sessions`);
  return res.data;
};

export const cmsRevokeSession = async (sessionId: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/sessions/${sessionId}/revoke`, payload || {});
  return res.data;
};

export const cmsRevokeAllSessions = async (userId: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/users/${userId}/sessions/revoke-all`, payload || {});
  return res.data;
};

export const cmsFetchModerationRules = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/moderation/rules', { params });
  return res.data;
};

export const cmsCreateModerationRule = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/moderation/rules', payload);
  return res.data;
};

export const cmsPatchModerationRule = async (id: string, payload: Record<string, any>) => {
  const res = await api.patch(`/admin/v2/cms/moderation/rules/${id}`, payload);
  return res.data;
};

export const cmsDeleteModerationRule = async (id: string) => {
  const res = await api.delete(`/admin/v2/cms/moderation/rules/${id}`);
  return res.data;
};

export const cmsFetchModerationHits = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/moderation/hits', { params });
  return res.data;
};

export const cmsResolveModerationHit = async (id: string, payload: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/moderation/hits/${id}/resolve`, payload);
  return res.data;
};

export const cmsFetchPages = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/content/pages', { params });
  return res.data;
};

export const cmsCreatePage = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/content/pages', payload);
  return res.data;
};

export const cmsUpdatePage = async (id: string, payload: Record<string, any>) => {
  const res = await api.patch(`/admin/v2/cms/content/pages/${id}`, payload);
  return res.data;
};

export const cmsPublishPage = async (id: string) => {
  const res = await api.post(`/admin/v2/cms/content/pages/${id}/publish`);
  return res.data;
};

export const cmsFetchPageVersions = async (id: string) => {
  const res = await api.get(`/admin/v2/cms/content/pages/${id}/versions`);
  return res.data;
};

export const cmsRollbackPage = async (id: string, version: number) => {
  const res = await api.post(`/admin/v2/cms/content/pages/${id}/rollback/${version}`);
  return res.data;
};

export const cmsFetchArticles = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/content/articles', { params });
  return res.data;
};

export const cmsCreateArticle = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/content/articles', payload);
  return res.data;
};

export const cmsUpdateArticle = async (id: string, payload: Record<string, any>) => {
  const res = await api.patch(`/admin/v2/cms/content/articles/${id}`, payload);
  return res.data;
};

export const cmsPublishArticle = async (id: string) => {
  const res = await api.post(`/admin/v2/cms/content/articles/${id}/publish`);
  return res.data;
};

export const cmsFetchArticleVersions = async (id: string) => {
  const res = await api.get(`/admin/v2/cms/content/articles/${id}/versions`);
  return res.data;
};

export const cmsRollbackArticle = async (id: string, version: number) => {
  const res = await api.post(`/admin/v2/cms/content/articles/${id}/rollback/${version}`);
  return res.data;
};

export const cmsContentSearch = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/content/search', { params });
  return res.data;
};

export const cmsAnalyticsOverview = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/analytics/overview', { params });
  return res.data;
};

export const cmsAnalyticsTopPages = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/analytics/top-pages', { params });
  return res.data;
};

export const cmsAnalyticsTrafficSources = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/analytics/traffic-sources', { params });
  return res.data;
};

export const cmsAnalyticsExportUrl = (table: string) => {
  return `/admin/v2/cms/analytics/export?table=${encodeURIComponent(table)}`;
};

export const cmsFetchBackups = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/system/backups', { params });
  return res.data;
};

export const cmsCreateBackup = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/system/backups/create', payload);
  return res.data;
};

export const cmsRestoreBackup = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/system/backups/restore', payload);
  return res.data;
};

export const cmsClearCache = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/system/cache/clear', payload);
  return res.data;
};

export const cmsFetchSystemErrors = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/system/errors', { params });
  return res.data;
};

export const cmsFetchMailCampaigns = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/mail/campaigns', { params });
  return res.data;
};

export const cmsCreateMailCampaign = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/mail/campaigns', payload);
  return res.data;
};

export const cmsRunMailCampaign = async (id: string, payload?: Record<string, any>) => {
  const res = await api.post(`/admin/v2/cms/mail/campaigns/${id}/run`, payload || {});
  return res.data;
};

export const cmsFetchMailDeliveries = async (id: string, params?: Record<string, any>) => {
  const res = await api.get(`/admin/v2/cms/mail/campaigns/${id}/deliveries`, { params });
  return res.data;
};

export const cmsFetchEmailTemplates = async (params?: Record<string, any>) => {
  const res = await api.get('/admin/v2/cms/mail/templates', { params });
  return res.data;
};

export const cmsCreateEmailTemplate = async (payload: Record<string, any>) => {
  const res = await api.post('/admin/v2/cms/mail/templates', payload);
  return res.data;
};

export const cmsImportEmailTemplateDefaults = async () => {
  const res = await api.post('/admin/v2/cms/mail/templates/import-defaults', {});
  return res.data;
};

export const cmsPatchEmailTemplate = async (id: string, payload: Record<string, any>) => {
  const res = await api.patch(`/admin/v2/cms/mail/templates/${id}`, payload);
  return res.data;
};

export const cmsPublishEmailTemplate = async (id: string) => {
  const res = await api.post(`/admin/v2/cms/mail/templates/${id}/publish`);
  return res.data;
};

export const cmsFetchEmailTemplateVersions = async (id: string) => {
  const res = await api.get(`/admin/v2/cms/mail/templates/${id}/versions`);
  return res.data;
};

export const cmsRollbackEmailTemplate = async (id: string, version: number) => {
  const res = await api.post(`/admin/v2/cms/mail/templates/${id}/rollback/${version}`);
  return res.data;
};
