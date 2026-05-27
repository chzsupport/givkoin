const {
  recomputeRiskCases,
} = require('../../services/securityService');
const { applyRiskPenalty } = require('../../services/automationPenaltyService');
const {
  writeAuthEvent,
} = require('../../services/authTrackingService');
const {
  applyRiskCaseGroupDecision,
  getSignalHistoryForUsers,
  repairPendingMultiAccountRiskCases,
  sanitizeRewardRollbackEntries,
} = require('../../services/multiAccountService');
const emailService = require('../../services/emailService');
const {
  buildOperationId,
  deleteModelDocs,
  escapeHtml,
  getModelDocById,
  getUsersByIds,
  isMultiAccountRiskCase,
  listModelDocs,
  logCmsAudit,
  mutationResponse,
  normalizeText,
  parsePagination,
  toId,
  toNumber,
  updateModelDoc,
} = require('./shared');

async function listRiskCases(req, res) {
  try {
    await repairPendingMultiAccountRiskCases();

    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20 });
    const requestedStatus = req.query.status ? String(req.query.status) : '';

    const allRows = await listModelDocs('RiskCase');
    const filtered = allRows.filter((row) => {
      if (!row) return false;
      if (!isMultiAccountRiskCase(row)) return false;
      // Скрываем закрытые кейсы из списка (если не запрошен конкретный статус)
      const hiddenStatuses = ['resolved', 'false_positive', 'ignored'];
      if (!requestedStatus && hiddenStatuses.includes(String(row.status))) return false;
      if (requestedStatus && String(row.status) !== requestedStatus) return false;
      if (req.query.riskLevel && String(row.riskLevel) !== String(req.query.riskLevel)) return false;

      const riskScore = Number(row.riskScore || 0);
      if (String(req.query.includeZero || '').toLowerCase() !== 'true') {
        if (!(riskScore > 0 || String(row.freezeStatus || '') === 'banned')) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const left = Number(b?.riskScore || 0) - Number(a?.riskScore || 0);
      if (left !== 0) return left;
      return new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime();
    });

    const total = filtered.length;
    const rows = filtered.slice(skip, skip + limit);

    const safeRows = Array.isArray(rows) ? rows : [];

    const userIds = Array.from(new Set(safeRows
      .flatMap((row) => [toId(row?.user), ...(Array.isArray(row?.relatedUsers) ? row.relatedUsers.map((u) => toId(u)) : [])])
      .filter(Boolean)));
    const userMap = await getUsersByIds(userIds);

    const orphanIds = safeRows
      .filter((row) => {
        const uid = toId(row?.user);
        return !uid || !userMap.has(uid);
      })
      .map((row) => row?._id)
      .filter(Boolean);

    if (orphanIds.length) {
      await deleteModelDocs('RiskCase', orphanIds);
    }

    const visibleRows = safeRows
      .filter((row) => {
        const uid = toId(row?.user);
        return uid && userMap.has(uid);
      })
      .map((row) => {
        const uid = toId(row?.user);
        const user = uid ? userMap.get(uid) : null;
        const relatedUsers = Array.isArray(row?.relatedUsers)
          ? row.relatedUsers
            .map((rid) => {
              const id = toId(rid);
              const u = id ? userMap.get(id) : null;
              if (!u) return null;
              return { _id: u.id, email: u.email, nickname: u.nickname, status: u.status };
            })
            .filter(Boolean)
          : [];
        return {
          ...row,
          user: user ? { _id: user.id, email: user.email, nickname: user.nickname, status: user.status } : null,
          relatedUsers,
        };
      });

    const adjustedTotal = Math.max(0, Number(total || 0) - orphanIds.length);

    return res.json({
      riskCases: visibleRows,
      pagination: {
        page,
        limit,
        total: adjustedTotal,
        totalPages: Math.ceil(adjustedTotal / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getRiskCase(req, res) {
  try {
    await repairPendingMultiAccountRiskCases();

    const row = await getModelDocById('RiskCase', req.params.id);
    if (!row || !isMultiAccountRiskCase(row)) {
      return res.status(404).json({ message: 'Случай мультиаккаунта не найден' });
    }

    const uid = toId(row.user);
    const relatedIds = Array.isArray(row.relatedUsers) ? row.relatedUsers.map((u) => toId(u)).filter(Boolean) : [];
    const appliedById = toId(row?.penalty?.appliedBy);
    const usersMap = await getUsersByIds([uid, ...relatedIds, appliedById].filter(Boolean));
    const mainUser = uid ? usersMap.get(uid) : null;
    if (!mainUser) {
      await deleteModelDocs('RiskCase', [row._id]);
      return res.status(404).json({ message: 'Риск-кейс удалён вместе с пользователем' });
    }

    const penaltyLedger = row?.penalty?.ledgerId
      ? await getModelDocById('AutomationPenalty', row.penalty.ledgerId)
      : null;

    if (penaltyLedger) {
      const ledgerAppliedById = toId(penaltyLedger?.appliedBy);
      if (ledgerAppliedById && !usersMap.has(ledgerAppliedById)) {
        const extra = await getUsersByIds([ledgerAppliedById]);
        extra.forEach((v, k) => usersMap.set(k, v));
      }
    }

    const relatedUsers = relatedIds
      .map((id) => {
        const u = usersMap.get(String(id));
        if (!u) return null;
        return { _id: u.id, email: u.email, nickname: u.nickname, status: u.status };
      })
      .filter(Boolean);

    const penaltyAppliedBy = appliedById ? usersMap.get(appliedById) : null;
    const enrichedPenalty = row?.penalty && typeof row.penalty === 'object'
      ? {
        ...row.penalty,
        appliedBy: penaltyAppliedBy ? { _id: penaltyAppliedBy.id, email: penaltyAppliedBy.email, nickname: penaltyAppliedBy.nickname } : row.penalty.appliedBy,
      }
      : row.penalty;

    const enrichedLedger = penaltyLedger && typeof penaltyLedger === 'object'
      ? {
        ...penaltyLedger,
        appliedBy: (() => {
          const id = toId(penaltyLedger.appliedBy);
          const u = id ? usersMap.get(id) : null;
          return u ? { _id: u.id, email: u.email, nickname: u.nickname } : penaltyLedger.appliedBy;
        })(),
      }
      : penaltyLedger;

    const groupUserIds = Array.from(new Set([uid, ...relatedIds].filter(Boolean)));
    const signalHistory = await getSignalHistoryForUsers(groupUserIds, { limit: 120 });
    const groupedHistory = signalHistory.map((entry) => {
      const historyUser = entry?.userId ? usersMap.get(String(entry.userId)) : null;
      return {
        ...entry,
        user: historyUser ? { _id: historyUser.id, email: historyUser.email, nickname: historyUser.nickname, status: historyUser.status } : null,
      };
    });

    return res.json({
      riskCase: {
        ...row,
        rewardRollback: sanitizeRewardRollbackEntries(
          Array.isArray(row?.rewardRollback) ? row.rewardRollback : [],
          Array.isArray(row?.evidence) ? row.evidence : (Array.isArray(row?.riskScoreDetailed) ? row.riskScoreDetailed : []),
          usersMap
        ),
        user: { _id: mainUser.id, email: mainUser.email, nickname: mainUser.nickname, status: mainUser.status },
        relatedUsers: relatedIds,
        relatedUsersData: relatedUsers,
        penalty: enrichedPenalty,
      },
      penaltyLedger: enrichedLedger,
      signalHistory: groupedHistory,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function applyRiskCasePenalty(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const force = Boolean(req.body?.force);
    const reason = normalizeText(req.body?.reason || '', 1000);
    const penaltyPercent = toNumber(req.body?.penaltyPercent, 80);

    const before = await getModelDocById('RiskCase', riskCaseId);
    const result = await applyRiskPenalty({
      riskCaseId,
      actorId: req.user?._id || null,
      reason,
      force,
      penaltyPercent,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.penalize',
      'RiskCase',
      riskCaseId,
      before,
      after,
      {
        operationId,
        force,
        penaltyPercent,
        result: result.result,
      },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Штраф по риск-кейсу применён',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function resolveRiskCase(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const resolution = String(req.body?.resolution || 'resolved');
    const note = normalizeText(req.body?.note || '', 1000);

    if (!['resolved', 'false_positive', 'ignored'].includes(resolution)) {
      return res.status(400).json({ message: 'Неверный тип решения' });
    }

    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    if (before.status === 'penalized') {
      return res.status(400).json({ message: 'Нельзя изменить оштрафованный кейс' });
    }

    const nowIso = new Date().toISOString();
    const prevNotes = String(before.notes || '').trim();
    const newNote = `[${nowIso}] admin_resolved:${resolution}${note ? ` note:${note}` : ''}`;

    const after = await updateModelDoc('RiskCase', riskCaseId, {
      status: resolution,
      notes: prevNotes ? `${prevNotes}\n${newNote}` : newNote,
      resolvedBy: req.user?._id || null,
      resolvedAt: nowIso,
      resolutionNote: note,
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.resolve',
      'RiskCase',
      riskCaseId,
      before,
      after,
      {
        operationId,
        resolution,
        note,
      },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: resolution === 'false_positive' ? 'Риск-кейс отмечен как ложное срабатывание' : 'Риск-кейс снят',
      data: { riskCase: after },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function deleteRiskCase(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;

    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    if (before.status === 'penalized') {
      return res.status(400).json({ message: 'Нельзя удалить оштрафованный кейс' });
    }

    await deleteModelDocs('RiskCase', [riskCaseId]);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.delete',
      'RiskCase',
      riskCaseId,
      before,
      null,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Риск-кейс удалён',
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function recomputeRisk(req, res) {
  try {
    const operationId = buildOperationId();
    const result = await recomputeRiskCases();

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.recompute',
      'RiskCase',
      null,
      null,
      result,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Риск-кейсы пересчитаны',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function removeRelatedUserFromRiskCase(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const userIdToRemove = req.params?.userId;

    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    if (before.status === 'penalized') {
      return res.status(400).json({ message: 'Нельзя изменять оштрафованный кейс' });
    }

    const relatedUsers = Array.isArray(before.relatedUsers) ? before.relatedUsers : [];
    const newRelatedUsers = relatedUsers.filter((id) => String(id) !== String(userIdToRemove));

    if (newRelatedUsers.length === relatedUsers.length) {
      return res.status(400).json({ message: 'Пользователь не найден в списке связанных' });
    }

    const nowIso = new Date().toISOString();
    const prevNotes = String(before.notes || '').trim();
    const newNote = `[${nowIso}] admin_removed_user:${userIdToRemove}`;

    const after = await updateModelDoc('RiskCase', riskCaseId, {
      relatedUsers: newRelatedUsers,
      notes: prevNotes ? `${prevNotes}\n${newNote}` : newNote,
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.remove_user',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, removedUserId: userIdToRemove },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Пользователь удалён из кейса',
      data: { riskCase: after },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function unfreezeRiskCaseGroup(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const note = normalizeText(req.body?.note || '', 1000);
    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) return res.status(404).json({ message: 'Риск-кейс не найден' });
    if (!isMultiAccountRiskCase(before)) {
      return res.status(400).json({ message: 'Эта карточка не относится к мультиаккаунтам' });
    }

    const result = await applyRiskCaseGroupDecision({
      riskCaseId,
      actorId: req.user?._id || null,
      decision: 'unfreeze',
      note,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.group_unfreeze',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, note, result },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Группа разморожена',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function watchRiskCaseGroup(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const note = normalizeText(req.body?.note || '', 1000);
    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) return res.status(404).json({ message: 'Риск-кейс не найден' });
    if (!isMultiAccountRiskCase(before)) {
      return res.status(400).json({ message: 'Эта карточка не относится к мультиаккаунтам' });
    }

    const result = await applyRiskCaseGroupDecision({
      riskCaseId,
      actorId: req.user?._id || null,
      decision: 'watch',
      note,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.group_watch',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, note, result },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Группа переведена под наблюдение',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function banRiskCaseGroup(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const note = normalizeText(req.body?.note || '', 1000);
    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) return res.status(404).json({ message: 'Риск-кейс не найден' });
    if (!isMultiAccountRiskCase(before)) {
      return res.status(400).json({ message: 'Эта карточка не относится к мультиаккаунтам' });
    }

    const result = await applyRiskCaseGroupDecision({
      riskCaseId,
      actorId: req.user?._id || null,
      decision: 'ban',
      note,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.group_ban',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, note, result },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Группа заблокирована',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function sendRiskCaseContactEmail(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const riskCase = await getModelDocById('RiskCase', riskCaseId);

    if (!riskCase) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    const uid = toId(riskCase.user);
    const relatedIds = Array.isArray(riskCase.relatedUsers) ? riskCase.relatedUsers.map((u) => toId(u)).filter(Boolean) : [];
    const usersMap = await getUsersByIds([uid, ...relatedIds].filter(Boolean));
    const user = uid ? usersMap.get(uid) : null;
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'У пользователя нет email для отправки письма' });
    }

    const subject = normalizeText(
      req.body?.subject || 'Пожалуйста, выберите основной аккаунт в GIVKOIN',
      200
    );
    const customMessage = normalizeText(req.body?.message || '', 5000);
    const relatedRows = relatedIds
      .map((id) => usersMap.get(String(id)))
      .filter(Boolean);
    const relatedHtml = relatedRows.length
      ? `<ul>${relatedRows
        .map((row) => {
          const nickname = escapeHtml(row?.nickname || 'Без ника');
          const mail = escapeHtml(row?.email || 'без email');
          return `<li>${nickname} (${mail})</li>`;
        })
        .join('')}</ul>`
      : '<p>Связанные аккаунты не найдены.</p>';

    const messageHtml = customMessage
      ? `<p>${escapeHtml(customMessage).replace(/\n/g, '<br/>')}</p>`
      : `<p>Система безопасности обнаружила несколько аккаунтов, связанных с вашим устройством/сигнатурой.</p>
         <p>Пожалуйста, ответьте на это письмо и укажите, какой аккаунт нужно оставить основным. Второй аккаунт будет удален только после вашего подтверждения.</p>`;

    const html = `
      <h2>Здравствуйте, ${escapeHtml(user?.nickname || 'пользователь')}!</h2>
      ${messageHtml}
      <p><strong>Связанные аккаунты:</strong></p>
      ${relatedHtml}
      <p>Пока идет проверка, действия по удалению аккаунтов не выполняются автоматически.</p>
    `;

    await emailService.sendGenericEventEmail(email, subject, html);

    const before = { ...riskCase };
    const nextUpdate = {};
    if (['open', 'resolved'].includes(String(riskCase.status))) {
      nextUpdate.status = isMultiAccountRiskCase(riskCase) ? 'watch' : 'review';
    }
    const note = `[${new Date().toISOString()}] admin_contact_sent:${subject}`;
    const prevNotes = String(riskCase.notes || '').trim();
    nextUpdate.notes = prevNotes ? `${prevNotes}\n${note}` : note;
    nextUpdate.meta = {
      ...(riskCase.meta && typeof riskCase.meta === 'object' ? riskCase.meta : {}),
      lastContactAt: new Date(),
      lastContactBy: req.user?._id || null,
      lastContactSubject: subject,
    };
    await updateModelDoc('RiskCase', riskCase._id, nextUpdate);
    const after = await getModelDocById('RiskCase', riskCase._id);

    await writeAuthEvent({
      user: uid || null,
      email,
      eventType: 'multi_account_contacted',
      result: 'success',
      reason: 'admin_requested_account_choice',
      req,
      meta: {
        riskCaseId: riskCase._id,
        operationId,
      },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.contact_user',
      'RiskCase',
      riskCase._id,
      before,
      after || nextUpdate,
      { operationId, subject },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Письмо пользователю отправлено',
      data: { riskCaseId: riskCase._id, email, subject },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function sendRiskGroupContactEmail(req, res) {
  try {
    const operationId = buildOperationId();
    const rawEmails = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const emails = Array.from(
      new Set(
        rawEmails
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (!emails.length) {
      return res.status(400).json({ message: 'Список получателей пустой' });
    }

    const subject = normalizeText(
      req.body?.subject || 'Пожалуйста, выберите основной аккаунт в GIVKOIN',
      200
    );
    const customMessage = normalizeText(req.body?.message || '', 5000);
    const riskCaseIds = Array.isArray(req.body?.riskCaseIds)
      ? req.body.riskCaseIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];

    const messageHtml = customMessage
      ? `<p>${escapeHtml(customMessage).replace(/\n/g, '<br/>')}</p>`
      : `<p>Система безопасности обнаружила группу аккаунтов с общими сигналами (IP/устройство/fingerprint).</p>
         <p>Пожалуйста, ответьте на это письмо и укажите, какой аккаунт нужно оставить основным. Остальные аккаунты будут обработаны только после вашего выбора.</p>`;

    const html = `
      <h2>Здравствуйте!</h2>
      ${messageHtml}
      <p>Пока идет проверка, автоматическое удаление аккаунтов не выполняется.</p>
    `;

    let sent = 0;
    const failed = [];
    for (const email of emails) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await emailService.sendGenericEventEmail(email, subject, html);
        sent += 1;
      } catch (error) {
        failed.push({
          email,
          error: normalizeText(error?.message || 'send_failed', 300),
        });
      }
    }

    if (riskCaseIds.length) {
      const nowIso = new Date().toISOString();
      for (const id of riskCaseIds) {
        // eslint-disable-next-line no-await-in-loop
        const row = await getModelDocById('RiskCase', id);
        if (!row) continue;
        const patch = {};
        if (['open', 'resolved'].includes(String(row.status))) {
          patch.status = isMultiAccountRiskCase(row) ? 'watch' : 'review';
        }
        const note = `[${nowIso}] admin_group_contact_sent:${subject}`;
        const prev = String(row.notes || '').trim();
        patch.notes = prev ? `${prev}\n${note}` : note;
        patch.meta = {
          ...(row.meta && typeof row.meta === 'object' ? row.meta : {}),
          lastGroupContactAt: new Date(),
          lastGroupContactBy: req.user?._id || null,
          lastGroupContactSubject: subject,
        };
        // eslint-disable-next-line no-await-in-loop
        await updateModelDoc('RiskCase', row._id, patch);
      }
    }

    await writeAuthEvent({
      user: null,
      email: '',
      eventType: 'multi_account_contacted',
      result: failed.length ? 'failed' : 'success',
      reason: 'admin_group_contact',
      req,
      meta: {
        operationId,
        sent,
        failed: failed.length,
        emails,
        riskCaseIds,
      },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.contact_group',
      'RiskCase',
      riskCaseIds[0] || null,
      null,
      { sent, failed, emails, riskCaseIds },
      { operationId, subject },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: failed.length ? 'partial' : 'executed',
      auditId,
      message: failed.length
        ? `Письма отправлены частично: ${sent}/${emails.length}`
        : `Письма отправлены: ${sent}/${emails.length}`,
      data: {
        sent,
        total: emails.length,
        failed,
      },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  applyRiskCasePenalty,
  banRiskCaseGroup,
  deleteRiskCase,
  getRiskCase,
  listRiskCases,
  recomputeRisk,
  removeRelatedUserFromRiskCase,
  resolveRiskCase,
  sendRiskCaseContactEmail,
  sendRiskGroupContactEmail,
  unfreezeRiskCaseGroup,
  watchRiskCaseGroup,
};
