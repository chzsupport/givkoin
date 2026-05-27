const crypto = require('crypto');
const { getSupabaseClient } = require('../../lib/supabaseClient');
const emailService = require('../../services/emailService');
const {
  countDocsByModel,
  getDocByModelAndId,
  insertDoc,
  listDocsByModel,
  updateDocByModel,
} = require('../../services/documentStore');
const {
  buildOperationId,
  getUsersByIds,
  listModelDocs,
  logCmsAudit,
  mutationResponse,
  normalizeText,
  parsePagination,
  stripStoredDocFields,
  toDate,
  toId,
} = require('./shared');

function matchesCampaignSegment(user, riskLevel, segment) {
  const safeSegment = segment && typeof segment === 'object' ? segment : {};

  if (safeSegment.status) {
    const statuses = Array.isArray(safeSegment.status) ? safeSegment.status : [safeSegment.status];
    if (!statuses.includes(user?.status)) return false;
  }

  if (safeSegment.language) {
    const langs = Array.isArray(safeSegment.language) ? safeSegment.language : [safeSegment.language];
    if (!langs.includes(user?.language)) return false;
  }

  if (safeSegment.registeredFrom) {
    const from = toDate(safeSegment.registeredFrom);
    if (from && new Date(user?.createdAt || 0).getTime() < from.getTime()) return false;
  }

  if (safeSegment.registeredTo) {
    const to = toDate(safeSegment.registeredTo);
    if (to && new Date(user?.createdAt || 0).getTime() > to.getTime()) return false;
  }

  if (safeSegment.activeDays !== undefined) {
    const days = Math.max(0, Number(safeSegment.activeDays) || 0);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (!(user?.lastOnlineAt && new Date(user.lastOnlineAt).getTime() >= from.getTime())) return false;
  }

  if (safeSegment.riskLevels) {
    const allowed = new Set(Array.isArray(safeSegment.riskLevels) ? safeSegment.riskLevels : [safeSegment.riskLevels]);
    if (!allowed.has(riskLevel || 'low')) return false;
  }

  return true;
}

function applyCampaignSegment(users, riskLevelsByUser, segment) {
  const caseMap = riskLevelsByUser instanceof Map
    ? riskLevelsByUser
    : new Map((Array.isArray(riskLevelsByUser) ? riskLevelsByUser : []).map((r) => [String(r.user), r.riskLevel]));
  return (Array.isArray(users) ? users : []).filter((user) => {
    const userId = String(user?._id || '');
    return matchesCampaignSegment(user, caseMap.get(userId) || 'low', segment);
  });
}

async function listMailCampaigns(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20 });
    const dataEq = {};

    if (req.query.status) {
      dataEq.status = String(req.query.status);
    }

    const [campaigns, total] = await Promise.all([
      listDocsByModel('MailCampaign', {
        dataEq,
        orderBy: 'created_at',
        ascending: false,
        limit,
        offset: skip,
      }),
      countDocsByModel('MailCampaign', { dataEq }),
    ]);

    const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
    const actorIds = Array.from(new Set(safeCampaigns
      .flatMap((row) => [toId(row?.createdBy), toId(row?.updatedBy)])
      .filter(Boolean)));
    const actorMap = await getUsersByIds(actorIds);
    const enrichedCampaigns = safeCampaigns.map((row) => {
      const created = (() => {
        const id = toId(row?.createdBy);
        const u = id ? actorMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.createdBy;
      })();
      const updated = (() => {
        const id = toId(row?.updatedBy);
        const u = id ? actorMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.updatedBy;
      })();
      return { ...row, createdBy: created, updatedBy: updated };
    });

    return res.json({
      campaigns: enrichedCampaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createMailCampaign(req, res) {
  try {
    const operationId = buildOperationId();
    const payload = req.body || {};
    const nowIso = new Date().toISOString();
    const id = `mc_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

    const campaignData = {
      name: normalizeText(payload.name, 200),
      subject: normalizeText(payload.subject, 300),
      html: normalizeText(payload.html, 100000),
      text: normalizeText(payload.text, 100000),
      status: ['draft', 'scheduled'].includes(payload.status) ? payload.status : 'draft',
      segment: payload.segment && typeof payload.segment === 'object' ? payload.segment : {},
      scheduledAt: payload.scheduledAt ? toDate(payload.scheduledAt) : null,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    };

    await insertDoc({ id, model: 'MailCampaign', data: campaignData, createdAt: nowIso, updatedAt: nowIso });

    const campaign = { _id: id, ...campaignData, createdAt: nowIso, updatedAt: nowIso };

    const auditId = await logCmsAudit(
      req,
      'cms.mail.campaign.create',
      'MailCampaign',
      campaign._id,
      null,
      campaign,
      { operationId },
      'high'
    );

    return res.status(201).json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Кампания создана',
      data: { campaign },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function runMailCampaign(req, res) {
  try {
    const operationId = buildOperationId();
    const supabase = getSupabaseClient();

    const campaignRow = await getDocByModelAndId('MailCampaign', req.params.id);

    if (!campaignRow) return res.status(404).json({ message: 'Кампания не найдена' });

    const campaignData = stripStoredDocFields(campaignRow);
    const campaign = { _id: campaignRow._id, ...campaignData };

    const limit = Math.max(1, Math.min(10000, Number(req.body?.limit || req.query?.limit || 2000)));

    await updateDocByModel('MailCampaign', campaignRow._id, {
      ...campaignData,
      status: 'running',
      updatedBy: req.user?._id || null,
      lastRunAt: new Date().toISOString(),
    });

    const riskLevelsByUser = new Map();
    const riskRows = await listModelDocs('RiskCase', { pageSize: 5000 });
    (Array.isArray(riskRows) ? riskRows : []).forEach((row) => {
      const userId = toId(row?.user);
      if (!userId) return;
      const prev = riskLevelsByUser.get(String(userId));
      const prevScore = Number(prev?.riskScore || 0);
      const nextScore = Number(row?.riskScore || 0);
      if (!prev || nextScore >= prevScore) {
        riskLevelsByUser.set(String(userId), {
          riskLevel: row?.riskLevel || 'low',
          riskScore: nextScore,
        });
      }
    });

    const selected = [];
    const pageSize = 1000;
    let from = 0;
    while (selected.length < limit) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,status,language,created_at,last_online_at,email_confirmed')
        .eq('email_confirmed', true)
        .neq('status', 'banned')
        .range(from, from + pageSize - 1);
      if (error || !Array.isArray(data) || !data.length) break;

      for (const row of data) {
        const user = {
          _id: row?.id,
          email: row?.email,
          nickname: row?.nickname,
          status: row?.status,
          language: row?.language,
          createdAt: row?.created_at ? new Date(row.created_at) : null,
          lastOnlineAt: row?.last_online_at ? new Date(row.last_online_at) : null,
        };
        const email = String(user.email || '').trim();
        if (!email) continue;
        const riskLevel = riskLevelsByUser.get(String(user._id || ''))?.riskLevel || 'low';
        if (!matchesCampaignSegment(user, riskLevel, campaign.segment)) continue;
        selected.push(user);
        if (selected.length >= limit) break;
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    let sent = 0;
    let failed = 0;

    for (const user of selected) {
      const email = String(user.email || '').trim().toLowerCase();
      if (!email) continue;
      const dedupeKey = `${campaign._id}:${email}`;

      // eslint-disable-next-line no-await-in-loop
      const existingDelivery = await listDocsByModel('MailDelivery', {
        dataEq: { dedupeKey },
        limit: 1,
      });
      if (existingDelivery.length) continue;

      // eslint-disable-next-line no-await-in-loop
      const deliveryId = `md_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const deliveryData = {
        campaign: campaign._id,
        user: user._id,
        email,
        status: 'pending',
        dedupeKey,
      };

      await insertDoc({ id: deliveryId, model: 'MailDelivery', data: deliveryData });

      try {
        // eslint-disable-next-line no-await-in-loop
        await emailService.sendGenericEventEmail(email, campaign.subject, campaign.html);

        await updateDocByModel('MailDelivery', deliveryId, { ...deliveryData, status: 'sent', sentAt: new Date().toISOString() });
        sent += 1;
      } catch (error) {
        await updateDocByModel('MailDelivery', deliveryId, { ...deliveryData, status: 'failed', error: normalizeText(error?.message || 'Email send failed', 500) });
        failed += 1;
      }
    }

    const finalStatus = failed > 0 && sent === 0 ? 'failed' : 'completed';

    await updateDocByModel('MailCampaign', campaignRow._id, {
      ...campaignData,
      status: finalStatus,
      stats: {
        total: selected.length,
        sent,
        failed,
      },
      updatedBy: req.user?._id || null,
    });

    const auditId = await logCmsAudit(
      req,
      'cms.mail.campaign.run',
      'MailCampaign',
      campaign._id,
      null,
      campaign,
      { operationId, selected: selected.length, sent, failed },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: campaign.status,
      auditId,
      message: 'Рассылка выполнена',
      data: {
        campaign,
        summary: {
          selected: selected.length,
          sent,
          failed,
        },
      },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function campaignDeliveries(req, res) {
  try {
    const campaignId = req.params.id;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const dataEq = { campaign: campaignId };

    if (req.query.status) {
      dataEq.status = String(req.query.status);
    }

    const [deliveries, total] = await Promise.all([
      listDocsByModel('MailDelivery', {
        dataEq,
        orderBy: 'created_at',
        ascending: false,
        limit,
        offset: skip,
      }),
      countDocsByModel('MailDelivery', { dataEq }),
    ]);

    const safeDeliveries = Array.isArray(deliveries) ? deliveries : [];
    const userIds = Array.from(new Set(safeDeliveries.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedDeliveries = safeDeliveries.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return { ...row, user: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.user };
    });

    return res.json({
      deliveries: enrichedDeliveries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  applyCampaignSegment,
  campaignDeliveries,
  createMailCampaign,
  listMailCampaigns,
  runMailCampaign,
};
