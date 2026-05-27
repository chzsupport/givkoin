const { getSupabaseClient } = require('../../lib/supabaseClient');
const { listActivities } = require('../../services/activityService');
const {
  countDocsByModel,
  listDocsByModel,
} = require('../../services/documentStore');
const {
  getPeriodWindow,
  getUsersByIds,
  listModelDocs,
  sendCsvResponse,
  toId,
} = require('./shared');

async function analyticsOverview(req, res) {
  try {
    const period = String(req.query.period || 'day');
    const current = getPeriodWindow(period, 0);
    const previous = getPeriodWindow(period, 1);

    const supabase = getSupabaseClient();
    const currentStartIso = current.start.toISOString();
    const currentEndIso = current.end.toISOString();
    const prevStartIso = previous.start.toISOString();
    const prevEndIso = previous.end.toISOString();

    const [
      usersCurrent,
      usersPrevious,
      activeCurrent,
      activePrevious,
      pagesCurrent,
      pagesPrevious,
      articlesCurrent,
      articlesPrevious,
      hitsCurrent,
      hitsPrevious,
      errorsCurrent,
      errorsPrevious,
      adsCurrent,
      adsPrevious,
      battlesCurrent,
      battlesPrevious,
      referralsCurrent,
      referralsPrevious,
    ] = await Promise.all([
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', currentStartIso)
          .lt('created_at', currentEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', prevStartIso)
          .lt('created_at', prevEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('last_online_at', currentStartIso)
          .lt('last_online_at', currentEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('last_online_at', prevStartIso)
          .lt('last_online_at', prevEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const pages = await listModelDocs('ContentPage', { pageSize: 2000 });
        return (Array.isArray(pages) ? pages : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= current.start.getTime() && ts < current.end.getTime();
        }).length;
      })(),
      (async () => {
        const pages = await listModelDocs('ContentPage', { pageSize: 2000 });
        return (Array.isArray(pages) ? pages : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= previous.start.getTime() && ts < previous.end.getTime();
        }).length;
      })(),
      (async () => {
        const articles = await listModelDocs('ContentArticle', { pageSize: 2000 });
        return (Array.isArray(articles) ? articles : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= current.start.getTime() && ts < current.end.getTime();
        }).length;
      })(),
      (async () => {
        const articles = await listModelDocs('ContentArticle', { pageSize: 2000 });
        return (Array.isArray(articles) ? articles : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= previous.start.getTime() && ts < previous.end.getTime();
        }).length;
      })(),
      (async () => {
        const hits = await listModelDocs('ModerationHit', { pageSize: 2000 });
        return (Array.isArray(hits) ? hits : []).filter((row) => {
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= current.start.getTime() && ts < current.end.getTime();
        }).length;
      })(),
      (async () => {
        const hits = await listModelDocs('ModerationHit', { pageSize: 2000 });
        return (Array.isArray(hits) ? hits : []).filter((row) => {
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= previous.start.getTime() && ts < previous.end.getTime();
        }).length;
      })(),
      (async () => {
        return countDocsByModel('SystemErrorEvent', {
          columnGte: { created_at: current.start.toISOString() },
          columnLt: { created_at: current.end.toISOString() },
        });
      })(),
      (async () => {
        return countDocsByModel('SystemErrorEvent', {
          columnGte: { created_at: previous.start.toISOString() },
          columnLt: { created_at: previous.end.toISOString() },
        });
      })(),
      (async () => {
        return countDocsByModel('AdImpression', {
          dataEq: { eventType: 'impression' },
          columnGte: { created_at: current.start.toISOString() },
          columnLt: { created_at: current.end.toISOString() },
        });
      })(),
      (async () => {
        return countDocsByModel('AdImpression', {
          dataEq: { eventType: 'impression' },
          columnGte: { created_at: previous.start.toISOString() },
          columnLt: { created_at: previous.end.toISOString() },
        });
      })(),
      (async () => {
        return countDocsByModel('Battle', {
          columnGte: { created_at: current.start.toISOString() },
          columnLt: { created_at: current.end.toISOString() },
        });
      })(),
      (async () => {
        return countDocsByModel('Battle', {
          columnGte: { created_at: previous.start.toISOString() },
          columnLt: { created_at: previous.end.toISOString() },
        });
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('referrals')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', currentStartIso)
          .lt('created_at', currentEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('referrals')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', prevStartIso)
          .lt('created_at', prevEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
    ]);

    const metrics = {
      usersNew: { current: usersCurrent, previous: usersPrevious },
      usersActive: { current: activeCurrent, previous: activePrevious },
      pagesPublished: { current: pagesCurrent, previous: pagesPrevious },
      articlesPublished: { current: articlesCurrent, previous: articlesPrevious },
      moderationHits: { current: hitsCurrent, previous: hitsPrevious },
      errors: { current: errorsCurrent, previous: errorsPrevious },
      adImpressions: { current: adsCurrent, previous: adsPrevious },
      battles: { current: battlesCurrent, previous: battlesPrevious },
      referrals: { current: referralsCurrent, previous: referralsPrevious },
    };

    const withDelta = Object.fromEntries(
      Object.entries(metrics).map(([key, value]) => {
        const delta = value.current - value.previous;
        return [key, { ...value, delta }];
      })
    );

    return res.json({
      period: current.period,
      current: { from: current.start, to: current.end },
      previous: { from: previous.start, to: previous.end },
      metrics: withDelta,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function analyticsTopPages(req, res) {
  try {
    const period = String(req.query.period || 'day');
    const range = getPeriodWindow(period, 0);

    const logs = await listActivities({
      userIds: ['*'],
      types: ['page_view'],
      since: range.start,
      until: range.end,
      limit: 10000,
    });

    const byPath = new Map();
    for (const row of logs) {
      const path = String(row?.meta?.path || '').trim();
      if (!path) continue;
      if (!byPath.has(path)) {
        byPath.set(path, { path, views: 0, users: new Set(), totalMinutes: 0 });
      }
      const item = byPath.get(path);
      item.views += 1;
      if (row.user_id) item.users.add(String(row.user_id));
      const minutes = Number(row.minutes) || 0;
      item.totalMinutes += minutes;
    }

    const rows = Array.from(byPath.values())
      .map((item) => ({
        path: item.path,
        views: item.views,
        uniqueUsers: item.users.size,
        totalMinutes: Math.round(item.totalMinutes * 100) / 100,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 200);

    return res.json({
      period: range.period,
      from: range.start,
      to: range.end,
      rows,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function analyticsTrafficSources(req, res) {
  try {
    const period = String(req.query.period || 'day');
    const range = getPeriodWindow(period, 0);

    const logs = await listActivities({
      userIds: ['*'],
      types: ['page_view'],
      since: range.start,
      until: range.end,
      limit: 10000,
    });

    const byReferrer = new Map();
    const byUtm = new Map();

    for (const row of logs) {
      const ref = String(row?.meta?.referrer || '').trim() || '(direct)';
      byReferrer.set(ref, (byReferrer.get(ref) || 0) + 1);

      const source = String(row?.meta?.utm_source || '').trim();
      const medium = String(row?.meta?.utm_medium || '').trim();
      const campaign = String(row?.meta?.utm_campaign || '').trim();
      const key = [source || '(none)', medium || '(none)', campaign || '(none)'].join('|');
      byUtm.set(key, (byUtm.get(key) || 0) + 1);
    }

    const referrerRows = Array.from(byReferrer.entries())
      .map(([referrer, views]) => ({ referrer, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 200);

    const utmRows = Array.from(byUtm.entries())
      .map(([key, views]) => {
        const [utm_source, utm_medium, utm_campaign] = key.split('|');
        return { utm_source, utm_medium, utm_campaign, views };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 200);

    return res.json({
      period: range.period,
      from: range.start,
      to: range.end,
      referrers: referrerRows,
      utm: utmRows,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function analyticsExport(req, res) {
  try {
    const table = String(req.query.table || req.query.report || 'users').trim();
    const fileName = `cms_export_${table}_${Date.now()}.csv`;

    let headers = [];
    let rows = [];
    let mapRow = null;

    if (table === 'users') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,status,created_at')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
      headers = [
        { key: 'id', label: 'ID' },
        { key: 'email', label: 'Email' },
        { key: 'nickname', label: 'Nickname' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'CreatedAt' },
      ];
      mapRow = (u) => ({
        id: u.id,
        email: u.email,
        nickname: u.nickname,
        status: u.status,
        createdAt: u.created_at,
      });
    } else if (table === 'auth-events') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('auth_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10000);
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
      headers = [
        { key: 'createdAt', label: 'CreatedAt' },
        { key: 'eventType', label: 'EventType' },
        { key: 'result', label: 'Result' },
        { key: 'email', label: 'Email' },
        { key: 'ip', label: 'IP' },
        { key: 'reason', label: 'Reason' },
      ];
      mapRow = (e) => ({
        createdAt: e.created_at,
        eventType: e.event_type,
        result: e.result,
        email: e.email,
        ip: e.ip,
        reason: e.reason,
      });
    } else if (table === 'risk-cases') {
      const allCases = await listModelDocs('RiskCase', { pageSize: 5000 });
      rows = (Array.isArray(allCases) ? allCases : [])
        .sort((a, b) => (Number(b?.riskScore) || 0) - (Number(a?.riskScore) || 0))
        .slice(0, 5000);
      const ids = Array.from(new Set((Array.isArray(rows) ? rows : []).map((c) => toId(c?.user)).filter(Boolean)));
      const userMap = await getUsersByIds(ids);
      headers = [
        { key: 'user', label: 'User' },
        { key: 'riskScore', label: 'RiskScore' },
        { key: 'riskLevel', label: 'RiskLevel' },
        { key: 'status', label: 'Status' },
        { key: 'signals', label: 'Signals' },
      ];
      mapRow = (c) => ({
        user: (() => {
          const id = toId(c?.user);
          const u = id ? userMap.get(id) : null;
          return u?.email || u?.nickname || id || c.user;
        })(),
        riskScore: c.riskScore,
        riskLevel: c.riskLevel,
        status: c.status,
        signals: Array.isArray(c.signals) ? c.signals.join('; ') : '',
      });
    } else if (table === 'errors') {
      rows = await listDocsByModel('SystemErrorEvent', {
        orderBy: 'created_at',
        ascending: false,
        limit: 10000,
      });
      headers = [
        { key: 'createdAt', label: 'CreatedAt' },
        { key: 'eventType', label: 'EventType' },
        { key: 'statusCode', label: 'StatusCode' },
        { key: 'method', label: 'Method' },
        { key: 'path', label: 'Path' },
        { key: 'message', label: 'Message' },
      ];
      mapRow = (e) => ({
        createdAt: e.createdAt,
        eventType: e.eventType,
        statusCode: e.statusCode,
        method: e.method,
        path: e.path,
        message: e.message,
      });
    } else if (table === 'content-pages') {
      const allPages = await listModelDocs('ContentPage', { pageSize: 5000 });
      rows = (Array.isArray(allPages) ? allPages : [])
        .sort((a, b) => {
          const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 5000);
      headers = [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'slug', label: 'Slug' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'UpdatedAt' },
      ];
      mapRow = (p) => ({
        id: p._id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        updatedAt: p.updatedAt,
      });
    } else if (table === 'content-articles') {
      const allArticles = await listModelDocs('ContentArticle', { pageSize: 5000 });
      rows = (Array.isArray(allArticles) ? allArticles : [])
        .sort((a, b) => {
          const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 5000);
      headers = [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'slug', label: 'Slug' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'UpdatedAt' },
      ];
      mapRow = (p) => ({
        id: p._id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        updatedAt: p.updatedAt,
      });
    } else {
      return res.status(400).json({ message: 'Неподдерживаемый тип экспорта' });
    }

    await sendCsvResponse(res, { headers, rows, mapRow, fileName });
    return null;
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  analyticsExport,
  analyticsOverview,
  analyticsTopPages,
  analyticsTrafficSources,
};
