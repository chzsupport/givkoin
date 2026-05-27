import {
  AUTH_EVENT_LABELS,
  CONTENT_TYPE_LABELS,
  FILTER_ACTION_LABELS,
  FILTER_TYPE_LABELS,
  JSON_KEY_LABELS,
  REASON_LABELS,
  RISK_LEVEL_LABELS,
  RULE_TYPE_LABELS,
  SCOPE_LABELS,
  SIGNAL_LABELS,
  STATUS_LABELS,
  formatAuthEventLabel,
  formatContentTypeLabel,
  formatFilterActionLabel,
  formatFilterTypeLabel,
  formatReasonLabel,
  formatRiskLevel,
  formatRuleTypeLabel,
  formatScopeLabel,
  formatStatusLabel,
  getUserDisplayName,
  humanizeCode,
} from './cmsLabels';

export function getRiskDecisionLabel(riskCase: any) {
  const freezeStatus = String(riskCase?.freezeStatus || '').trim();
  const status = String(riskCase?.status || '').trim();
  if (freezeStatus === 'frozen') return 'Группа заморожена и ждёт решения модератора';
  if (status === 'high_risk' || freezeStatus === 'high_risk') return 'Доказательств уже много, но до заморозки не добран обязательный набор';
  if (freezeStatus === 'watch') return 'Группа оставлена под наблюдением';
  if (freezeStatus === 'banned' || status === 'penalized') return 'Группа заблокирована навсегда';
  if (freezeStatus === 'unfrozen' || status === 'resolved') return 'Группа разморожена и может работать дальше';
  if (status === 'watch') return 'Группа под наблюдением, система продолжает собирать доказательства';
  return 'Группа требует проверки модератора';
}

export function summarizeModeratorSignal(signal: string) {
  const safe = String(signal || '').trim();
  if (!safe) return '';
  if (safe === 'shared_fingerprint' || safe.startsWith('shared_fingerprint:')) return 'Совпал устойчивый отпечаток устройства';
  if (safe === 'shared_device_id' || safe.startsWith('shared_device:')) return 'Совпала метка браузера на одном устройстве';
  if (safe === 'shared_profile_key') return 'Совпал устойчивый профиль браузера';
  if (safe === 'shared_weak_fingerprint' || safe.startsWith('shared_weak_fingerprint:')) return 'Совпали общие признаки одного устройства';
  if (safe === 'shared_ip') return 'Совпал IP-адрес';
  if (safe === 'network_risk') return 'Есть входы через VPN, TOR, прокси или серверную сеть';
  if (safe === 'emulator') return 'Есть признаки эмулятора';
  if (safe === 'webdriver') return 'Есть признаки автоматизированного браузера';
  if (safe === 'emulator_network_combo') return 'Эмулятор совмещён с анонимной сетью';
  if (safe === 'anonymized_bridge') return 'Один и тот же след появился и через анонимную, и через обычную сеть';
  if (safe === 'network_tor') return 'Один из входов был через TOR';
  if (safe === 'network_vpn') return 'Один из входов был через VPN';
  if (safe === 'network_proxy') return 'Один из входов был через прокси';
  if (safe === 'network_hosting') return 'Один из входов был из серверной сети';
  if (safe === 'email_normalized_collision') return 'Совпала нормализованная почта';
  if (safe === 'session_switch') return 'Аккаунты быстро менялись на одном и том же следе устройства';
  if (safe === 'session_sync') return 'Входы и выходы шли слишком синхронно';
  if (safe === 'shared_schedule') return 'Повторяется почти одинаковый график входов';
  if (safe === 'parallel_session_overlap') return 'Были параллельные сессии';
  if (safe === 'ip_device_crowding') return 'На одном IP слишком много разных устройств';
  if (safe === 'parallel_battle') return 'Связанные аккаунты участвовали в боях параллельно';
  if (safe === 'battle_pattern') return 'Есть боевой шаблон, похожий на кликер';
  if (safe === 'battle_signature_cluster') return 'Боевая сигнатура аккаунтов слишком похожа';
  if (safe === 'economy_funneling') return 'Награды и выгода стекаются на один связанный аккаунт';
  if (safe === 'serial_battle_farming') return 'Группа серийно фармила боевые награды';
  if (safe === 'linked_banned_account') return 'Есть связь с уже заблокированным аккаунтом';
  if (safe === 'linked_penalized_account') return 'Есть связь с ранее наказанным аккаунтом';
  if (safe.startsWith('referral_cluster:')) return 'Аккаунты связаны через реферальную цепочку';
  return '';
}

export function hasEvidenceType(evidence: any, type: string) {
  return (Array.isArray(evidence) ? evidence : []).some((entry) => String(entry?.type || '').trim() === type);
}

export function isConfirmedModeratorSignal(signal: string, evidence: any) {
  const safe = String(signal || '').trim();
  const safeEvidence = Array.isArray(evidence) ? evidence : [];
  if (!safeEvidence.length) return true;
  if (safe === 'email_normalized_collision') return hasEvidenceType(safeEvidence, 'email');
  if (safe === 'shared_ip') return hasEvidenceType(safeEvidence, 'ip');
  if (safe === 'shared_device_id' || safe.startsWith('shared_device:')) return hasEvidenceType(safeEvidence, 'device');
  if (safe === 'shared_fingerprint' || safe.startsWith('shared_fingerprint:')) return hasEvidenceType(safeEvidence, 'fingerprint');
  if (safe === 'shared_profile_key') return hasEvidenceType(safeEvidence, 'profile_key');
  if (safe === 'shared_weak_fingerprint' || safe.startsWith('shared_weak_fingerprint:')) return hasEvidenceType(safeEvidence, 'weak_fingerprint');
  return true;
}

export function getModeratorReasons(signals: any, evidence: any[] = []) {
  const out: string[] = [];
  for (const signal of Array.isArray(signals) ? signals : []) {
    if (!isConfirmedModeratorSignal(signal, evidence)) continue;
    const summary = summarizeModeratorSignal(signal);
    if (summary && !out.includes(summary)) out.push(summary);
  }
  return out;
}

export function getRiskHeadline(users: any[]) {
  const names = (Array.isArray(users) ? users : []).map((user) => getUserDisplayName(user)).filter(Boolean);
  if (!names.length) return 'Система нашла подозрительную связь между аккаунтами.';
  if (names.length === 1) return `Аккаунт ${names[0]} требует ручной проверки.`;
  if (names.length === 2) return `Аккаунты ${names[0]} и ${names[1]}, скорее всего, принадлежат одному человеку.`;
  return `Группа из ${names.length} аккаунтов, скорее всего, принадлежит одному человеку.`;
}

export function formatTechnicalValue(value: any) {
  const text = String(value || '').trim();
  return text || '—';
}

export function formatEvidenceForModerator(entry: any) {
  const type = String(entry?.type || '').trim();
  const count = Number(entry?.count || 0);
  if (type === 'fingerprint') return `Совпал устойчивый отпечаток устройства: ${formatTechnicalValue(entry?.value)}${count > 1 ? ` (${count} совпадений)` : ''}.`;
  if (type === 'device') return `Совпала метка браузера: ${formatTechnicalValue(entry?.value)}${count > 1 ? ` (${count} совпадений)` : ''}.`;
  if (type === 'profile_key') return `Совпал устойчивый профиль браузера: ${formatTechnicalValue(entry?.value)}${count > 1 ? ` (${count} совпадений)` : ''}.`;
  if (type === 'weak_fingerprint') return `Совпали общие признаки устройства: ${formatTechnicalValue(entry?.value)}${count > 1 ? ` (${count} совпадений)` : ''}.`;
  if (type === 'ip') return entry?.anonymousNetwork
    ? `Совпал IP в анонимной сети: ${formatTechnicalValue(entry?.value)}${count > 1 ? ` (${count} совпадений)` : ''}.`
    : `Совпал IP-адрес: ${formatTechnicalValue(entry?.value)}${count > 1 ? ` (${count} совпадений)` : ''}.`;
  if (type === 'email') {
    const currentEmail = formatTechnicalValue(entry?.currentEmail);
    const matchedEmail = formatTechnicalValue(entry?.matchedEmail);
    const normalizedValue = formatTechnicalValue(entry?.normalizedValue);
    return `Совпала нормализованная почта: ${normalizedValue}. Проверены адреса ${currentEmail} и ${matchedEmail}.`;
  }
  if (entry?.summary) return `${String(entry.summary)}${entry?.count > 1 ? ` (${entry.count})` : ''}.`;
  return '';
}

export function formatTechnicalSignalForModerator(signal: string) {
  const safe = String(signal || '').trim();
  if (!safe) return '';
  if (safe.startsWith('shared_device:')) return `Совпала метка браузера: ${formatTechnicalValue(safe.slice('shared_device:'.length))}.`;
  if (safe.startsWith('shared_fingerprint:')) return `Совпал устойчивый отпечаток устройства: ${formatTechnicalValue(safe.slice('shared_fingerprint:'.length))}.`;
  if (safe.startsWith('shared_weak_fingerprint:')) return `Совпали общие признаки устройства: ${formatTechnicalValue(safe.slice('shared_weak_fingerprint:'.length))}.`;
  if (safe === 'shared_profile_key') return 'Совпал устойчивый профиль браузера.';
  return '';
}

export function getRiskStatusTone(status: string, freezeStatus: string) {
  const safeStatus = String(status || '').trim();
  const safeFreezeStatus = String(freezeStatus || '').trim();
  if (safeFreezeStatus === 'banned') return 'border-rose-500/30 bg-rose-500/10';
  if (safeFreezeStatus === 'frozen' || safeStatus === 'frozen') return 'border-amber-400/20 bg-amber-500/10';
  if (safeStatus === 'high_risk' || safeFreezeStatus === 'high_risk') return 'border-orange-400/20 bg-orange-500/10';
  if (safeFreezeStatus === 'watch' || safeStatus === 'watch') return 'border-cyan-400/20 bg-cyan-500/10';
  if (safeFreezeStatus === 'unfrozen' || safeStatus === 'resolved') return 'border-emerald-400/20 bg-emerald-500/10';
  return 'border-white/10 bg-white/5';
}

export function formatRiskCategoryLabel(category: string) {
  const safe = String(category || '').trim();
  if (safe === 'technical') return 'Техника';
  if (safe === 'network') return 'Сеть';
  if (safe === 'sessions') return 'Время и сессии';
  if (safe === 'battle') return 'Бой';
  if (safe === 'economy') return 'Экономика';
  return humanizeCode(safe);
}

export function translateKnownScalar(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (typeof value !== 'string') return value;
  const raw = String(value || '').trim();
  if (!raw) return value;
  if (RISK_LEVEL_LABELS[raw]) return formatRiskLevel(raw);
  if (STATUS_LABELS[raw]) return formatStatusLabel(raw);
  if (RULE_TYPE_LABELS[raw]) return formatRuleTypeLabel(raw);
  if (FILTER_TYPE_LABELS[raw]) return formatFilterTypeLabel(raw);
  if (FILTER_ACTION_LABELS[raw]) return formatFilterActionLabel(raw);
  if (CONTENT_TYPE_LABELS[raw]) return formatContentTypeLabel(raw);
  if (AUTH_EVENT_LABELS[raw]) return formatAuthEventLabel(raw);
  if (REASON_LABELS[raw]) return formatReasonLabel(raw);
  if (SCOPE_LABELS[raw]) return formatScopeLabel(raw);
  if (SIGNAL_LABELS[raw] || raw.startsWith('shared_device:') || raw.startsWith('shared_fingerprint:') || raw.startsWith('referral_cluster:')) {
    return formatRiskSignal(raw);
  }
  if (raw === 'force') return 'Досрочно';
  if (raw === 'scheduled') return 'По графику';
  return value;
}

export function localizeJsonForDisplay(value: any): any {
  if (Array.isArray(value)) return value.map((item) => localizeJsonForDisplay(item));
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    return Object.entries(value).reduce<Record<string, any>>((acc, [key, nested]) => {
      const translatedKey = JSON_KEY_LABELS[key] || humanizeCode(String(key || ''));
      acc[translatedKey] = localizeJsonForDisplay(nested);
      return acc;
    }, {});
  }
  return translateKnownScalar(value);
}

export function stringifyLocalizedJson(value: any) {
  return JSON.stringify(localizeJsonForDisplay(value), null, 2);
}

export function formatRiskSignal(signal: string) {
  if (!signal) return '-';
  if (signal.startsWith('shared_device:')) return `Общее устройство: ${signal.slice('shared_device:'.length)}`;
  if (signal.startsWith('shared_fingerprint:')) return `Общий отпечаток: ${signal.slice('shared_fingerprint:'.length)}`;
  if (signal.startsWith('shared_weak_fingerprint:')) return `Общий слабый отпечаток: ${signal.slice('shared_weak_fingerprint:'.length)}`;
  if (signal.startsWith('referral_cluster:')) return `Реферальный кластер: ${signal.slice('referral_cluster:'.length)}`;
  return SIGNAL_LABELS[signal] || humanizeCode(signal);
}
