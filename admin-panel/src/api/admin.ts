import api from './client';
import { mergeLocalizedText } from '../utils/localizedContent';

function normalizeBattleStartsAt(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toISOString();
}

export const fetchUsers = async (params: any) => {
    const res = await api.get('/admin/users', { params });
    return res.data;
};

export const updateUser = async (id: string, data: any) => {
    const res = await api.patch(`/admin/users/${id}`, data);
    return res.data;
};

export const deleteUser = async (id: string) => {
    const res = await api.delete(`/admin/users/${id}`);
    return res.data;
};

export const fetchAdmins = async () => {
    const res = await api.get('/admin/admins');
    return res.data;
};

export const createAdminAccount = async (data: { email: string; seedPhrase: string }) => {
    const res = await api.post('/admin/admins', data);
    return res.data;
};

export const updateAdminEmail = async (id: string, data: { email: string }) => {
    const res = await api.patch(`/admin/admins/${id}/email`, data);
    return res.data;
};

export const resetUserPassword = async (id: string, data: any) => {
    const res = await api.post(`/admin/users/${id}/reset-password`, data);
    return res.data;
};

export const fetchUserChats = async (id: string) => {
    const res = await api.get(`/admin/users/${id}/chats`);
    return res.data;
};

export const fetchAppeals = async (status?: string) => {
    const res = await api.get('/admin/appeals', { params: { status } });
    return res.data;
};

export const handleAppeal = async (id: string, action: 'confirm' | 'decline') => {
    const res = await api.post(`/admin/appeals/${id}/handle`, { action });
    return res.data;
};

export const fetchStats = async () => {
    const res = await api.get('/admin/stats');
    return res.data;
};

export const fetchLogs = async (params?: any) => {
    const res = await api.get('/admin/logs', { params });
    return res.data;
};

export const fetchBattles = async () => {
    const res = await api.get('/admin/battles');
    return res.data;
};

export const fetchBattleControl = async () => {
    const res = await api.get('/admin/battles/control');
    return res.data;
};

export const fetchBattleMoodForecast = async () => {
    const res = await api.get('/admin/battles/mood');
    return res.data;
};

export const fetchSuspiciousBattleUsers = async (params?: any) => {
    const res = await api.get('/admin/battles/suspicious', { params });
    return res.data;
};

export const startBattleNow = async (data?: {
    durationSeconds?: number;
}) => {
    const res = await api.post('/admin/battles/start', data || {});
    return res.data;
};

export const scheduleBattle = async (data: {
    battleId?: string;
    startsAt: string;
    durationSeconds?: number;
}) => {
    const payload = {
        ...data,
        startsAt: normalizeBattleStartsAt(data.startsAt),
    };
    const res = await api.post('/admin/battles/schedule', payload);
    return res.data;
};

export const cancelScheduledBattle = async (id: string) => {
    const res = await api.post('/admin/battles/schedule', {
        battleId: id,
        cancelScheduled: true,
    });
    return res.data;
};

export const finishBattleNow = async () => {
    const res = await api.post('/admin/battles/finish');
    return res.data;
};

export const fetchChats = async (params?: any) => {
    const res = await api.get('/admin/chats', { params });
    return res.data;
};

export const fetchSettings = async () => {
    const res = await api.get('/admin/settings');
    return res.data;
};

export const updateSettings = async (data: any) => {
    const res = await api.patch('/admin/settings', data);
    return res.data;
};

export const fetchRules = async () => {
    const res = await api.get('/admin/settings/rules');
    return res.data;
};

export const updateRules = async (rules: string) => {
    const res = await api.patch('/admin/settings/rules', { rules });
    return res.data;
};

export const fetchPagesContent = async () => {
    const res = await api.get('/admin/settings/pages');
    return res.data;
};

export const updatePagesContent = async (data: any) => {
    const currentRes = await api.get('/admin/settings/pages');
    const current = currentRes.data || {};

    const merged = {
        about: mergeLocalizedText(data?.about, current?.about),
        roadmapHtml: mergeLocalizedText(data?.roadmapHtml, current?.roadmapHtml),
        rules: {
            battle: mergeLocalizedText(data?.rules?.battle, current?.rules?.battle),
            site: mergeLocalizedText(data?.rules?.site, current?.rules?.site),
            communication: mergeLocalizedText(data?.rules?.communication, current?.rules?.communication),
        },
    };

    const res = await api.patch('/admin/settings/pages', merged);
    return res.data;
};

export const fetchAdSettings = async () => {
    const res = await api.get('/admin/settings/ads');
    return res.data;
};

export const updateAdSettings = async (data: any) => {
    const res = await api.patch('/admin/settings/ads', data);
    return res.data;
};

export const fetchMeditationSettings = async () => {
    const res = await api.get('/admin/settings/meditation');
    return res.data;
};

export const updateMeditationSettings = async (schedule: any[]) => {
    const res = await api.patch('/admin/settings/meditation', { schedule });
    return res.data;
};

export const createBackup = async (data?: {
    reason?: string;
    impactPreview?: string;
    confirmationPhrase?: string;
}) => {
    const res = await api.post('/admin/settings/backup', data || {});
    return res.data;
};

export const fetchWishes = async (params: any) => {
    const res = await api.get('/admin/wishes', { params });
    return res.data;
};

export const updateWish = async (id: string, data: any) => {
    const res = await api.patch(`/admin/wishes/${id}`, data);
    return res.data;
};

export const deleteWish = async (id: string) => {
    const res = await api.delete(`/admin/wishes/${id}`);
    return res.data;
};

export const fetchReferrals = async (params?: any) => {
    const res = await api.get('/admin/referrals', { params });
    return res.data;
};

// Ads API
export const fetchAdStats = async (params?: any) => {
    const res = await api.get('/ads/stats', { params });
    return res.data;
};

export const fetchCreatives = async () => {
    const res = await api.get('/ads/creatives');
    return res.data;
};

export const createCreative = async (data: any) => {
    const res = await api.post('/ads/creatives', data);
    return res.data;
};

export const updateCreative = async (id: string, data: any) => {
    const res = await api.patch(`/ads/creatives/${id}`, data);
    return res.data;
};

export const deleteCreative = async (id: string) => {
    const res = await api.delete(`/ads/creatives/${id}`);
    return res.data;
};

// Bridges API
export const fetchBridges = async () => {
    const res = await api.get('/bridges');
    return res.data;
};

// Battles API (reusing existing)
export const fetchBattlesAdmin = async () => {
    const res = await api.get('/admin/battles');
    return res.data;
};

// Quotes API
export const fetchQuotes = async () => {
    const res = await api.get('/admin/quotes');
    return res.data;
};

export const createQuote = async (data: {
    text: string;
    author?: string;
    dayOfWeek: number;
    translations?: {
        en?: {
            text?: string;
            author?: string;
        };
    };
}) => {
    const res = await api.post('/admin/quotes', data);
    return res.data;
};

export const updateQuote = async (id: string, data: {
    text: string;
    author?: string;
    translations?: {
        en?: {
            text?: string;
            author?: string;
        };
    };
}) => {
    const res = await api.patch(`/admin/quotes/${id}`, data);
    return res.data;
};

export const deleteQuote = async (id: string) => {
    const res = await api.delete(`/admin/quotes/${id}`);
    return res.data;
};

export const fetchFeedbackMessages = async (params?: any) => {
    const res = await api.get('/admin/feedback', { params });
    return res.data;
};

export const archiveFeedbackMessage = async (id: string) => {
    const res = await api.post(`/admin/feedback/${id}/archive`);
    return res.data;
};

export const replyFeedbackMessage = async (id: string, data: { subject?: string; message: string }) => {
    const res = await api.post(`/admin/feedback/${id}/reply`, data);
    return res.data;
};

export const deleteFeedbackMessage = async (id: string) => {
    const res = await api.delete(`/admin/feedback/${id}`);
    return res.data;
};

export const fetchPracticeGratitudeAudit = async (params?: any) => {
    const res = await api.get('/admin/practice/gratitude', { params });
    return res.data;
};

export const fetchPracticeAttendanceAudit = async (params?: any) => {
    const res = await api.get('/admin/practice/attendance', { params });
    return res.data;
};

// Crystal API
export const fetchCrystalStats = async () => {
    const res = await api.get('/admin/crystal/stats');
    return res.data;
};

export const fetchCrystalLocations = async () => {
    const res = await api.get('/admin/crystal/locations');
    return res.data;
};

export const generateCrystals = async () => {
    const res = await api.post('/admin/crystal/generate');
    return res.data;
};

// Admin v2 API
export const fetchSystemOverviewV2 = async () => {
    const res = await api.get('/admin/v2/system/overview');
    return res.data;
};

export const fetchApprovalsV2 = async (params?: {
    status?: string;
    domain?: string;
    actionType?: string;
    page?: number;
    limit?: number;
}) => {
    const res = await api.get('/admin/v2/approvals', { params });
    return res.data;
};

export const createApprovalV2 = async (data: {
    actionType: string;
    reason: string;
    impactPreview: string;
    confirmationPhrase: string;
    payload?: Record<string, any>;
}) => {
    const res = await api.post('/admin/v2/approvals', data);
    return res.data;
};

export const approveApprovalV2 = async (id: string, note?: string) => {
    const res = await api.post(`/admin/v2/approvals/${id}/approve`, { note });
    return res.data;
};

export const rejectApprovalV2 = async (id: string, reason?: string) => {
    const res = await api.post(`/admin/v2/approvals/${id}/reject`, { reason });
    return res.data;
};

export const fetchSystemJobsV2 = async (params?: { limit?: number }) => {
    const res = await api.get('/admin/v2/system/jobs', { params });
    return res.data;
};

export const runSystemJobV2 = async (jobName: string, data?: {
    reason?: string;
    impactPreview?: string;
    confirmationPhrase?: string;
    params?: Record<string, any>;
}) => {
    const res = await api.post(`/admin/v2/system/jobs/${jobName}/run`, data || {});
    return res.data;
};

export const fetchSystemJobRunV2 = async (runId: string) => {
    const res = await api.get(`/admin/v2/system/jobs/${runId}`);
    return res.data;
};

export const fetchAuditLogsV2 = async (params?: {
    actionType?: string;
    entityType?: string;
    actor?: string;
    requestId?: string;
    page?: number;
    limit?: number;
}) => {
    const res = await api.get('/admin/v2/audit', { params });
    return res.data;
};

export const fetchAuditLogByIdV2 = async (id: string) => {
    const res = await api.get(`/admin/v2/audit/${id}`);
    return res.data;
};
