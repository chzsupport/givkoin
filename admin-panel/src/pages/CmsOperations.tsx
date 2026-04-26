import React, { useEffect, useMemo, useState } from 'react';
import { runSystemJobV2 } from '../api/admin';
import {
  cmsApplyRiskPenalty,
  cmsBlockIpRule,
  cmsClearCache,
  cmsContentSearch,
  cmsCreateArticle,
  cmsCreateBackup,
  cmsCreateMailCampaign,
  cmsCreateModerationRule,
  cmsDeleteModerationRule,
  cmsCreatePage,
  cmsFetchArticles,
  cmsFetchAuthEvents,
  cmsFetchBackups,
  cmsFetchIpRules,
  cmsFetchMailCampaigns,
  cmsFetchMailDeliveries,
  cmsFetchEmailTemplates,
  cmsCreateEmailTemplate,
  cmsImportEmailTemplateDefaults,
  cmsPatchEmailTemplate,
  cmsPublishEmailTemplate,
  cmsFetchEmailTemplateVersions,
  cmsRollbackEmailTemplate,
  cmsFetchModerationHits,
  cmsFetchModerationRules,
  cmsFetchPages,
  cmsFetchPageVersions,
  cmsFetchRiskCase,
  cmsFetchRiskCases,
  cmsFetchSystemErrors,
  cmsFetchUserSessions,
  cmsPatchModerationRule,
  cmsPublishArticle,
  cmsPublishPage,
  cmsSendRiskGroupChoiceEmail,
  cmsSendRiskCaseChoiceEmail,
  cmsResolveModerationHit,
  cmsResolveRiskCase,
  cmsUnfreezeRiskGroup,
  cmsWatchRiskGroup,
  cmsBanRiskGroup,
  cmsDeleteRiskCase,
  cmsRemoveRelatedUser,
  cmsRestoreBackup,
  cmsRevokeAllSessions,
  cmsRevokeSession,
  cmsRollbackArticle,
  cmsRollbackPage,
  cmsRunMailCampaign,
  cmsUnblockIpRule,
  cmsUpdateArticle,
  cmsUpdatePage,
  cmsFetchArticleVersions,
} from '../api/cms';
import {
  getLocalizedTextValue,
  getTranslatedField,
  type ContentLanguage,
  updateLocalizedTextValue,
  normalizeLocalizedText,
} from '../utils/localizedContent';

type TabKey = 'security' | 'filters' | 'system' | 'mail';

type EmailTemplate = {
  _id: string;
  key: string;
  name: string;
  status: string;
  subject?: any;
  html?: any;
  text?: any;
  note?: string;
  publishedAt?: any;
  updatedAt?: any;
  createdAt?: any;
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="text-sm font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}

function StateMessage({ error, ok }: { error: string; ok: string }) {
  if (error) return <div className="rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{error}</div>;
  if (ok) return <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-300">{ok}</div>;
  return null;
}

function LanguageToggle({
  value,
  onChange,
}: {
  value: ContentLanguage;
  onChange: (next: ContentLanguage) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
      {([
        { id: 'ru', label: 'RU' },
        { id: 'en', label: 'EN' },
      ] as Array<{ id: ContentLanguage; label: string }>).map((language) => (
        <button
          key={language.id}
          type="button"
          onClick={() => onChange(language.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${value === language.id
            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
            : 'text-slate-400 hover:text-white'
            }`}
        >
          {language.label}
        </button>
      ))}
    </div>
  );
}

function requestDangerousJobPayload(options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) {
  const reason = prompt(`Причина операции: ${options.title}`);
  if (!reason || !reason.trim()) {
    alert('Причина обязательна');
    return null;
  }

  const impactPreview = prompt('Что изменится после выполнения?', options.impactPreviewDefault);
  if (!impactPreview || !impactPreview.trim()) {
    alert('Описание последствий обязательно');
    return null;
  }

  const typedPhrase = prompt(`Для подтверждения введите фразу:\n${options.confirmationPhrase}`);
  if (String(typedPhrase || '').trim() !== options.confirmationPhrase) {
    alert('Фраза подтверждения неверна');
    return null;
  }

  return {
    reason: reason.trim(),
    impactPreview: impactPreview.trim(),
    confirmationPhrase: options.confirmationPhrase,
  };
}

const GROUP_SIGNAL_PREFIXES = ['shared_device:', 'shared_fingerprint:', 'shared_weak_fingerprint:', 'referral_cluster:'];
const RISK_LEVEL_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};
const STATUS_LABELS: Record<string, string> = {
  watch: 'Под наблюдением',
  high_risk: 'Сильное подозрение',
  frozen: 'Заморожен системой',
  resolved: 'Решение принято',
  open: 'Открыт',
  review: 'На проверке',
  ignored: 'Игнорируется',
  penalized: 'Оштрафован',
  false_positive: 'Ложное срабатывание',
  active: 'Активен',
  cleaned: 'Очищен',
  off: 'Отключен',
  draft: 'Черновик',
  scheduled: 'Запланирован',
  published: 'Опубликован',
  archived: 'В архиве',
  completed: 'Завершен',
  failed: 'Ошибка',
  running: 'Выполняется',
  pending: 'Ожидает',
  sent: 'Отправлено',
  rolled_back: 'Откат сделан',
  partial_rollback: 'Частично откатили',
  missing_user: 'Пользователь не найден',
  unfrozen: 'Разморожен',
  banned: 'Заблокирован',
};
const RULE_TYPE_LABELS: Record<string, string> = {
  ip: 'IP',
  device: 'Устройство',
  fingerprint: 'Отпечаток',
};
const FILTER_TYPE_LABELS: Record<string, string> = {
  bad_word: 'Запрещенное слово',
  blocked_domain: 'Заблокированный домен',
  spam_pattern: 'Спам-шаблон',
};
const FILTER_ACTION_LABELS: Record<string, string> = {
  flag: 'Пометить',
  hide: 'Скрыть',
  mute: 'Заглушить',
  block: 'Блокировать',
};
const CONTENT_TYPE_LABELS: Record<string, string> = {
  page: 'Страница',
  article: 'Статья',
};
const AUTH_EVENT_LABELS: Record<string, string> = {
  login_success: 'Успешный вход',
  login_failed: 'Неудачный вход',
  logout: 'Выход',
  session_revoked: 'Сессия отозвана',
  token_expired: 'Токен истек',
  multi_account_detected: 'Обнаружен мультиаккаунт',
  multi_account_blocked: 'Мультиаккаунт заблокирован',
  multi_account_contacted: 'Отправлено уведомление по мультиаккаунту',
  multi_account_group_frozen: 'Группа аккаунтов заморожена',
  request_error: 'Ошибка запроса',
  request_action: 'Системное действие',
  not_found: 'Маршрут не найден',
};
const REASON_LABELS: Record<string, string> = {
  manual_admin_revoke: 'Ручное завершение администратором',
  manual_admin_revoke_all: 'Ручное завершение всех сессий администратором',
  multi_account_restriction: 'Ограничение из-за мультиаккаунта',
  multi_account_review: 'Проверка на мультиаккаунт',
  session_not_active: 'Сессия уже неактивна',
  session_id_reused: 'Повторное использование идентификатора сессии',
  revoke_all: 'Принудительное завершение всех сессий',
  logout: 'Выход пользователя',
  admin_requested_account_choice: 'Администратор запросил выбор основного аккаунта',
  admin_group_contact: 'Администратор связался с группой аккаунтов',
  registration_limit_exceeded: 'Превышен лимит регистрации',
  temporary_restriction_active: 'Временное ограничение активно',
  multi_account_group_frozen: 'Группа аккаунтов временно заморожена',
  bad_credentials: 'Неверные учетные данные',
  user_not_found: 'Пользователь не найден',
  email_not_confirmed: 'Почта не подтверждена',
  user_banned: 'Пользователь заблокирован',
};
const SCOPE_LABELS: Record<string, string> = {
  all: 'Все области',
  chat: 'Чат',
  news_comment: 'Комментарии к новостям',
};
const SIGNAL_LABELS: Record<string, string> = {
  direct_navigation_bias: 'Системные прямые переходы по URL',
  skipped_navigation_chain: 'Пропуск обязательной цепочки экранов',
  narrow_page_exploration: 'Слишком узкое изучение страниц',
  profit_without_exploration: 'Фарм без изучения проекта',
  low_interval_variation: 'Слишком ровные интервалы действий',
  precise_daily_timing: 'Слишком точное время действий по дням',
  immediate_profit_actions: 'Почти мгновенные прибыльные действия',
  short_session_uniformity: 'Слишком одинаковые короткие сессии',
  overlapping_sessions: 'Перекрывающиеся сессии',
  request_action_cadence: 'Ровный ритм action-запросов',
  request_error_rhythm: 'Аномальный ритм HTTP-ошибок',
  activity_after_session_revoke: 'Активность после отзыва сессии',
  battle_static_cursor: 'Статичный курсор в бою',
  battle_stable_click_rhythm: 'Слишком ровный ритм кликов в бою',
  battle_hidden_tab_shots: 'Выстрелы из скрытой вкладки',
  battle_result_modal_same_spot_burst: 'Клики по окну результата после боя',
  battle_voice_ignore_pattern: 'Игнор механики Голоса Мрака',
  benefit_funneling_sender: 'Слив выгоды на связанный аккаунт',
  benefit_funneling_receiver: 'Сбор выгоды со связанных аккаунтов',
  progress_structure_cluster: 'Похожая структура прогресса у связки',
  achievement_structure_cluster: 'Похожие достижения у связки',
  battle_signature_cluster: 'Похожая боевая сигнатура у связки',
  navigation_pattern_cluster: 'Одинаковый навигационный паттерн у связки',
  profit_schedule_cluster: 'Одинаковый график фарма у связки',
  shared_fingerprint: 'Совпадение сильного отпечатка',
  shared_device_id: 'Совпадение метки браузера',
  shared_profile_key: 'Совпадение устойчивого профиля браузера',
  shared_weak_fingerprint: 'Совпадение слабого отпечатка',
  shared_ip: 'Совпадение IP',
  network_tor: 'TOR-сеть',
  network_vpn: 'VPN-сеть',
  network_proxy: 'Прокси-сеть',
  network_hosting: 'Серверная сеть',
  network_risk: 'Рискованная сеть',
  emulator: 'Признаки эмулятора',
  webdriver: 'Признаки автоматизированного браузера',
  emulator_network_combo: 'Эмулятор вместе с анонимной сетью',
  anonymized_bridge: 'Связка между анонимной и обычной сетью',
  linked_banned_account: 'Связь с уже заблокированными аккаунтами',
  linked_penalized_account: 'Связь с ранее оштрафованными аккаунтами',
  email_normalized_collision: 'Совпадение нормализованной почты',
  nickname_normalized_collision: 'Совпадение шаблона ника',
  referral_cluster: 'Реферальный кластер',
  parallel_session_overlap: 'Перекрывающиеся параллельные сессии',
  session_switch: 'Быстрое переключение между аккаунтами',
  session_sync: 'Синхронные входы и выходы',
  shared_schedule: 'Похожий график входов',
  ip_device_crowding: 'Слишком много устройств на одном IP',
  parallel_battle: 'Параллельные бои',
  battle_pattern: 'Подозрительный боевой шаблон',
  serial_battle_farming: 'Серийный фарм боевых наград',
  email_not_confirmed: 'Почта не подтверждена',
  already_banned: 'Аккаунт уже заблокирован',
  automation_penalty_applied: 'Штраф за автоматизацию применен',
};
const JSON_KEY_LABELS: Record<string, string> = {
  _id: 'ID',
  id: 'ID',
  user: 'Пользователь',
  users: 'Пользователи',
  actor: 'Исполнитель',
  sessions: 'Сессии',
  path: 'Путь',
  method: 'Метод',
  statusCode: 'HTTP-код',
  durationMs: 'Длительность, мс',
  probe: 'Проверка',
  battleId: 'ID боя',
  requestPath: 'Путь запроса',
  previousPath: 'Предыдущая страница',
  skippedPaths: 'Пропущенные страницы',
  navigationSource: 'Источник перехода',
  navigationLatencyMs: 'Задержка перехода, мс',
  chainExpected: 'Ожидалась цепочка',
  chainSatisfied: 'Цепочка соблюдена',
  modalBurstEvents: 'Повторов по модальному окну',
  hiddenTabShotCount: 'Выстрелов в скрытой вкладке',
  staticCursorShots: 'Выстрелов без движения курсора',
  shotCount: 'Число выстрелов',
  shots: 'Выстрелов',
  intervalCount: 'Число интервалов',
  intervalMeanMs: 'Средний интервал, мс',
  intervalStdDevMs: 'Разброс интервалов, мс',
  varianceRatio: 'Коэффициент разброса',
  matchedCount: 'Совпавших событий',
  recipientId: 'Получатель',
  totalLm: 'Всего Люменов',
  totalSc: 'Всего K',
  totalLumens: 'Всего Люменов',
  directCount: 'Прямых переходов',
  targetCount: 'Целевых переходов',
  uniquePaths: 'Уникальных страниц',
  activeDays: 'Активных дней',
  overlapCount: 'Перекрывающихся сессий',
  scFromTransactions: 'K из транзакций',
  scFromActivities: 'K из активностей',
  lumensFromTransactions: 'Люмены из транзакций',
  lumensFromActivities: 'Люмены из активностей',
  lumensFromRelatedTransfers: 'Люмены от связанных аккаунтов',
  profitBase: 'База прибыли',
  targetConfiscation: 'План изъятия',
  confiscated: 'Изъято',
  shortfall: 'Недостача',
  currentBalancesBefore: 'Баланс до штрафа',
  currentBalancesAfter: 'Баланс после штрафа',
  balancesBefore: 'Баланс до штрафа',
  balancesAfter: 'Баланс после штрафа',
  penaltyPercent: 'Процент штрафа',
  forceApplied: 'Досрочное применение',
  appliedAt: 'Применен',
  appliedBy: 'Кем применен',
  reviewEligibleAt: 'Дата стандартного штрафа',
  relatedUsers: 'Связанные аккаунты',
  relatedUsersData: 'Данные связанных аккаунтов',
  riskLevel: 'Уровень риска',
  riskScore: 'Баллы риска',
  signals: 'Сигналы',
  signalHistory: 'История сигналов',
  evidence: 'Доказательства',
  riskScoreDetailed: 'Подробные баллы',
  categoryScores: 'Баллы по категориям',
  rewardRollback: 'Спорные награды боя',
  groupId: 'Группа',
  freezeStatus: 'Заморозка',
  weakFingerprint: 'Слабый отпечаток',
  profileKey: 'Профиль браузера',
  clientProfile: 'Профиль клиента',
  ipIntel: 'Сетевые признаки',
  score: 'Баллы',
  signalCount: 'Число сигналов',
  evidenceCount: 'Число доказательств',
  dateKey: 'Дата',
  happenedAt: 'Время',
  summary: 'Описание',
  category: 'Категория',
  meta: 'Детали',
  directNavigationSignature: 'Сигнатура прямой навигации',
  profitRoutineSignature: 'Сигнатура графика фарма',
  countsByType: 'Количество по типам',
  types: 'Типы',
  force: 'Досрочно',
  scheduled: 'По графику',
};

function humanizeCode(value: string) {
  if (!value) return '-';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRiskLevel(level: string) {
  return RISK_LEVEL_LABELS[String(level || '').trim()] || humanizeCode(String(level || ''));
}

function formatStatusLabel(status: string) {
  return STATUS_LABELS[String(status || '').trim()] || humanizeCode(String(status || ''));
}

function formatRuleTypeLabel(type: string) {
  return RULE_TYPE_LABELS[String(type || '').trim()] || humanizeCode(String(type || ''));
}

function formatFilterTypeLabel(type: string) {
  return FILTER_TYPE_LABELS[String(type || '').trim()] || humanizeCode(String(type || ''));
}

function formatFilterActionLabel(action: string) {
  return FILTER_ACTION_LABELS[String(action || '').trim()] || humanizeCode(String(action || ''));
}

function formatContentTypeLabel(type: string) {
  return CONTENT_TYPE_LABELS[String(type || '').trim()] || humanizeCode(String(type || ''));
}

function formatAuthEventLabel(eventType: string) {
  return AUTH_EVENT_LABELS[String(eventType || '').trim()] || humanizeCode(String(eventType || ''));
}

function formatReasonLabel(reason: string) {
  if (!reason) return '-';
  return REASON_LABELS[String(reason || '').trim()] || reason;
}

function formatScopeLabel(scope: string) {
  return SCOPE_LABELS[String(scope || '').trim()] || humanizeCode(String(scope || ''));
}

function formatDateTime(value: any) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatAuthResult(result: string) {
  const safe = String(result || '').trim().toLowerCase();
  if (!safe) return '—';
  if (safe === 'success') return 'Успех';
  if (safe === 'failed') return 'Ошибка';
  if (safe === 'blocked') return 'Заблокировано';
  return humanizeCode(safe);
}

function summarizeNetworkFlags(ipIntel: any) {
  const parts = [
    ipIntel?.isTor ? 'TOR' : '',
    ipIntel?.isVpn ? 'VPN' : '',
    ipIntel?.isProxy ? 'Прокси' : '',
    ipIntel?.isHosting ? 'Серверная сеть' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Обычная сеть';
}

function shortenText(value: any, max = 180) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

function getUserDisplayName(user: any) {
  return String(user?.nickname || user?.email || 'Пользователь').trim() || 'Пользователь';
}

function getRiskDecisionLabel(riskCase: any) {
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

function summarizeModeratorSignal(signal: string) {
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

function hasEvidenceType(evidence: any, type: string) {
  return (Array.isArray(evidence) ? evidence : []).some((entry) => String(entry?.type || '').trim() === type);
}

function isConfirmedModeratorSignal(signal: string, evidence: any) {
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

function getModeratorReasons(signals: any, evidence: any[] = []) {
  const out: string[] = [];
  for (const signal of Array.isArray(signals) ? signals : []) {
    if (!isConfirmedModeratorSignal(signal, evidence)) continue;
    const summary = summarizeModeratorSignal(signal);
    if (summary && !out.includes(summary)) out.push(summary);
  }
  return out;
}

function getRiskHeadline(users: any[]) {
  const names = (Array.isArray(users) ? users : []).map((user) => getUserDisplayName(user)).filter(Boolean);
  if (!names.length) return 'Система нашла подозрительную связь между аккаунтами.';
  if (names.length === 1) return `Аккаунт ${names[0]} требует ручной проверки.`;
  if (names.length === 2) return `Аккаунты ${names[0]} и ${names[1]}, скорее всего, принадлежат одному человеку.`;
  return `Группа из ${names.length} аккаунтов, скорее всего, принадлежит одному человеку.`;
}

function formatTechnicalValue(value: any) {
  const text = String(value || '').trim();
  return text || '—';
}

function formatEvidenceForModerator(entry: any) {
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

function formatTechnicalSignalForModerator(signal: string) {
  const safe = String(signal || '').trim();
  if (!safe) return '';
  if (safe.startsWith('shared_device:')) return `Совпала метка браузера: ${formatTechnicalValue(safe.slice('shared_device:'.length))}.`;
  if (safe.startsWith('shared_fingerprint:')) return `Совпал устойчивый отпечаток устройства: ${formatTechnicalValue(safe.slice('shared_fingerprint:'.length))}.`;
  if (safe.startsWith('shared_weak_fingerprint:')) return `Совпали общие признаки устройства: ${formatTechnicalValue(safe.slice('shared_weak_fingerprint:'.length))}.`;
  if (safe === 'shared_profile_key') return 'Совпал устойчивый профиль браузера.';
  return '';
}

function getRiskStatusTone(status: string, freezeStatus: string) {
  const safeStatus = String(status || '').trim();
  const safeFreezeStatus = String(freezeStatus || '').trim();
  if (safeFreezeStatus === 'banned') return 'border-rose-500/30 bg-rose-500/10';
  if (safeFreezeStatus === 'frozen' || safeStatus === 'frozen') return 'border-amber-400/20 bg-amber-500/10';
  if (safeStatus === 'high_risk' || safeFreezeStatus === 'high_risk') return 'border-orange-400/20 bg-orange-500/10';
  if (safeFreezeStatus === 'watch' || safeStatus === 'watch') return 'border-cyan-400/20 bg-cyan-500/10';
  if (safeFreezeStatus === 'unfrozen' || safeStatus === 'resolved') return 'border-emerald-400/20 bg-emerald-500/10';
  return 'border-white/10 bg-white/5';
}

function formatRiskCategoryLabel(category: string) {
  const safe = String(category || '').trim();
  if (safe === 'technical') return 'Техника';
  if (safe === 'network') return 'Сеть';
  if (safe === 'sessions') return 'Время и сессии';
  if (safe === 'battle') return 'Бой';
  if (safe === 'economy') return 'Экономика';
  return humanizeCode(safe);
}

function translateKnownScalar(value: unknown) {
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

function localizeJsonForDisplay(value: any): any {
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

function stringifyLocalizedJson(value: any) {
  return JSON.stringify(localizeJsonForDisplay(value), null, 2);
}

function getGroupSignals(signals: any): string[] {
  if (!Array.isArray(signals)) return [];
  return signals
    .map((s) => String(s || '').trim())
    .filter((s) => GROUP_SIGNAL_PREFIXES.some((prefix) => s.startsWith(prefix)));
}

function formatGroupSignal(signal: string) {
  if (signal.startsWith('shared_device:')) return `Общее устройство: ${signal.slice('shared_device:'.length)}`;
  if (signal.startsWith('shared_fingerprint:')) return `Общий отпечаток: ${signal.slice('shared_fingerprint:'.length)}`;
  if (signal.startsWith('shared_weak_fingerprint:')) return `Общий слабый отпечаток: ${signal.slice('shared_weak_fingerprint:'.length)}`;
  if (signal.startsWith('referral_cluster:')) return `Реферальный кластер: ${signal.slice('referral_cluster:'.length)}`;
  return signal;
}

function formatRiskSignal(signal: string) {
  if (!signal) return '-';
  if (signal.startsWith('shared_device:')) return `Общее устройство: ${signal.slice('shared_device:'.length)}`;
  if (signal.startsWith('shared_fingerprint:')) return `Общий отпечаток: ${signal.slice('shared_fingerprint:'.length)}`;
  if (signal.startsWith('shared_weak_fingerprint:')) return `Общий слабый отпечаток: ${signal.slice('shared_weak_fingerprint:'.length)}`;
  if (signal.startsWith('referral_cluster:')) return `Реферальный кластер: ${signal.slice('referral_cluster:'.length)}`;
  return SIGNAL_LABELS[signal] || humanizeCode(signal);
}

function buildRiskGroups(rows: any[]) {
  const byUserId = new Map<string, any>();
  const parents = new Map<string, string>();
  const signalOwners = new Map<string, Set<string>>();
  const groupIdOwners = new Map<string, Set<string>>();

  const ensure = (id: string) => {
    if (!id) return;
    if (!parents.has(id)) parents.set(id, id);
  };
  const find = (id: string): string => {
    const own = parents.get(id) || id;
    if (own === id) return own;
    const root = find(own);
    parents.set(id, root);
    return root;
  };
  const unite = (a: string, b: string) => {
    if (!a || !b) return;
    ensure(a);
    ensure(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parents.set(rb, ra);
  };

  for (const row of rows) {
    const userId = String(row?.user?._id || '').trim();
    if (!userId) continue;
    byUserId.set(userId, row);
    ensure(userId);
    const explicitGroupId = String(row?.groupId || '').trim();
    if (explicitGroupId) {
      if (!groupIdOwners.has(explicitGroupId)) groupIdOwners.set(explicitGroupId, new Set());
      groupIdOwners.get(explicitGroupId)?.add(userId);
    }
    for (const token of getGroupSignals(row?.signals)) {
      if (!signalOwners.has(token)) signalOwners.set(token, new Set());
      signalOwners.get(token)?.add(userId);
    }
  }

  for (const set of groupIdOwners.values()) {
    const ids = Array.from(set);
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i += 1) {
      unite(ids[0], ids[i]);
    }
  }

  for (const set of signalOwners.values()) {
    const ids = Array.from(set);
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i += 1) {
      unite(ids[0], ids[i]);
    }
  }

  for (const row of rows) {
    const userId = String(row?.user?._id || '').trim();
    if (!userId) continue;
    const related = Array.isArray(row?.relatedUsers) ? row.relatedUsers : [];
    for (const relatedUser of related) {
      const relatedId = String(relatedUser?._id || '').trim();
      if (relatedId && byUserId.has(relatedId)) {
        unite(userId, relatedId);
      }
    }
  }

  const clusters = new Map<string, Set<string>>();
  for (const id of byUserId.keys()) {
    const root = find(id);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root)?.add(id);
  }

  const groups: any[] = [];
  for (const membersSet of clusters.values()) {
    const ids = Array.from(membersSet);
    const usersMap = new Map<string, any>();
    const emails = new Set<string>();
    const signals = new Set<string>();
    const evidence: any[] = [];
    const riskCaseIds: string[] = [];
    let latestTs = 0;
    let topRiskScore = 0;
    let topStatus = '';
    let topFreezeStatus = '';

    for (const userId of ids) {
      const row = byUserId.get(userId);
      if (!row) continue;
      const rowUser = row.user || {};
      usersMap.set(userId, {
        userId,
        nickname: String(rowUser.nickname || '').trim() || 'Пользователь',
        email: String(rowUser.email || '').trim().toLowerCase(),
        riskCaseId: String(row._id || ''),
      });
      const ownEmail = String(rowUser.email || '').trim().toLowerCase();
      if (ownEmail) emails.add(ownEmail);
      riskCaseIds.push(String(row._id || ''));
      for (const token of getGroupSignals(row.signals)) signals.add(token);
      for (const entry of Array.isArray(row?.evidence) ? row.evidence : []) evidence.push(entry);

      const related = Array.isArray(row.relatedUsers) ? row.relatedUsers : [];
      for (const rel of related) {
        const relId = String(rel?._id || '').trim();
        const relEmail = String(rel?.email || '').trim().toLowerCase();
        const key = relId || relEmail;
        if (!key) continue;
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            userId: relId,
            nickname: String(rel?.nickname || '').trim() || 'Пользователь',
            email: relEmail,
            riskCaseId: '',
          });
        }
        if (relEmail) emails.add(relEmail);
      }

      const updatedAt = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
      if (updatedAt > latestTs) latestTs = updatedAt;
      if (Number(row?.riskScore || 0) >= topRiskScore) {
        topRiskScore = Number(row?.riskScore || 0);
        topStatus = String(row?.status || '');
        topFreezeStatus = String(row?.freezeStatus || '');
      }
    }

    const users = Array.from(usersMap.values());
    if (users.length < 2) continue;
    const groupId = users
      .map((u) => String(u.userId || u.email || u.nickname))
      .sort()
      .join('|');

    groups.push({
      id: groupId,
      users,
      emails: Array.from(emails),
      signals: Array.from(signals),
      evidence,
      riskCaseIds: Array.from(new Set(riskCaseIds.filter(Boolean))),
      latestTs,
      riskScore: topRiskScore,
      status: topStatus,
      freezeStatus: topFreezeStatus,
    });
  }

  return groups.sort((a, b) => {
    if ((b.riskScore || 0) !== (a.riskScore || 0)) return (b.riskScore || 0) - (a.riskScore || 0);
    if (b.users.length !== a.users.length) return b.users.length - a.users.length;
    return (b.latestTs || 0) - (a.latestTs || 0);
  });
}

function SecurityTab() {
  const [riskCases, setRiskCases] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedRiskCase, setSelectedRiskCase] = useState<any>(null);
  const [signalHistory, setSignalHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadRiskCases = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await cmsFetchRiskCases({
        limit: 200,
        source: 'multi_account',
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const rows: any[] = Array.isArray(data?.riskCases) ? data.riskCases : [];
      setRiskCases(rows);
      if (!rows.length) {
        setSelectedId('');
        setSelectedRiskCase(null);
        setSignalHistory([]);
        return;
      }

      const hasSelected = rows.some((row) => String(row?._id || '') === String(selectedId || ''));
      const nextSelectedId = hasSelected
        ? String(selectedId || '')
        : String(rows[0]?._id || '');

      setSelectedId(nextSelectedId);
      if (!hasSelected) {
        setSelectedRiskCase(null);
        setSignalHistory([]);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить риск-кейсы');
      setRiskCases([]);
      setSelectedId('');
      setSelectedRiskCase(null);
      setSignalHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRiskCase = async (id: string) => {
    if (!id) {
      setSelectedRiskCase(null);
      setSignalHistory([]);
      return;
    }
    setIsDetailLoading(true);
    setError('');
    try {
      const data = await cmsFetchRiskCase(id);
      setSelectedRiskCase(data?.riskCase || null);
      setSignalHistory(Array.isArray(data?.signalHistory) ? data.signalHistory : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить детали риск-кейса');
      setSelectedRiskCase(null);
      setSignalHistory([]);
      setSelectedId('');
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    loadRiskCases();
  }, [statusFilter]);

  useEffect(() => {
    if (selectedId) loadRiskCase(selectedId);
  }, [selectedId]);

  const groups = useMemo(() => buildRiskGroups(riskCases), [riskCases]);

  const selectedGroup = useMemo(() => {
    const caseId = String(selectedRiskCase?._id || selectedId || '');
    if (!caseId) return null;
    return groups.find((group) => Array.isArray(group?.riskCaseIds) && group.riskCaseIds.includes(caseId)) || null;
  }, [groups, selectedRiskCase?._id, selectedId]);

  const groupUsers = useMemo(() => {
    const main = selectedRiskCase?.user ? [selectedRiskCase.user] : [];
    const related = Array.isArray(selectedRiskCase?.relatedUsersData) ? selectedRiskCase.relatedUsersData : [];
    return [...main, ...related];
  }, [selectedRiskCase]);

  const moderatorReasons = useMemo(
    () => getModeratorReasons(selectedRiskCase?.signals, selectedRiskCase?.evidence),
    [selectedRiskCase?.signals, selectedRiskCase?.evidence],
  );

  const evidenceLines = useMemo(
    () => Array.from(new Set([
      ...(Array.isArray(selectedRiskCase?.evidence) ? selectedRiskCase.evidence : [])
        .map((entry: any) => formatEvidenceForModerator(entry)),
      ...(Array.isArray(selectedRiskCase?.signals) ? selectedRiskCase.signals : [])
        .map((signal: string) => formatTechnicalSignalForModerator(signal)),
    ]
      .filter(Boolean))),
    [selectedRiskCase?.evidence, selectedRiskCase?.signals],
  );

  const categoryScores = useMemo(() => {
    const raw = selectedRiskCase?.categoryScores && typeof selectedRiskCase.categoryScores === 'object'
      ? selectedRiskCase.categoryScores
      : {};
    return Object.entries(raw)
      .map(([category, score]) => ({
        category,
        score: Number(score || 0),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [selectedRiskCase?.categoryScores]);

  const riskScoreDetailed = useMemo(() => (
    Array.isArray(selectedRiskCase?.riskScoreDetailed) ? selectedRiskCase.riskScoreDetailed : []
  ), [selectedRiskCase?.riskScoreDetailed]);

  const rewardRollbackRows = useMemo(() => (
    Array.isArray(selectedRiskCase?.rewardRollback) ? selectedRiskCase.rewardRollback : []
  ), [selectedRiskCase?.rewardRollback]);

  const askNote = (title: string) => {
    const note = prompt(`Комментарий модератора: ${title}`);
    if (note == null) return null;
    return note.trim();
  };

  const hasReadyGroup = groupUsers.length >= 2;

  const runAction = async (action: 'watch' | 'unfreeze' | 'ban') => {
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      if (!selectedRiskCase?._id) return;
      if (!hasReadyGroup) {
        setError('Для этой карточки не собрана понятная группа аккаунтов. Действие остановлено.');
        return;
      }

      if (action === 'watch') {
        const note = askNote('Оставить группу под наблюдением');
        if (note == null) return;
        await cmsWatchRiskGroup(selectedRiskCase._id, { note });
        setOk('Группа оставлена под наблюдением');
      }

      if (action === 'unfreeze') {
        const note = askNote('Разморозить группу');
        if (note == null) return;
        await cmsUnfreezeRiskGroup(selectedRiskCase._id, { note });
        setOk('Группа разморожена');
      }

      if (action === 'ban') {
        if (!window.confirm('Заблокировать всю группу навсегда?')) return;
        const note = askNote('Заблокировать группу навсегда');
        if (note == null) return;
        await cmsBanRiskGroup(selectedRiskCase._id, { note });
        setOk('Группа заблокирована навсегда');
      }

      await loadRiskCases();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось выполнить действие');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">Связанные группы, заморозка и сигналы входа</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Все статусы</option>
            <option value="watch">Под наблюдением</option>
            <option value="high_risk">Сильное подозрение</option>
            <option value="frozen">Заморожены системой</option>
            <option value="resolved">Решение принято</option>
          </select>
          <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={() => loadRiskCases()}>Обновить</button>
        </div>
      </div>

      <StateMessage error={error} ok={ok} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Block title="Группы риска">
          <div className="space-y-2">
            {isLoading && <div className="text-xs text-slate-400">Загрузка...</div>}
            {!isLoading && !groups.length && <div className="text-sm text-slate-400">Группы не найдены</div>}
            {groups.map((group) => {
              const primaryCaseId = String(group?.riskCaseIds?.[0] || '');
              const isSelected = primaryCaseId && primaryCaseId === String(selectedId || '');
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedId(primaryCaseId)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${isSelected
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : `${getRiskStatusTone(group?.status, group?.freezeStatus)} hover:bg-white/10`
                    }`}
                >
                  <div className="text-sm font-semibold text-white">
                    {Array.isArray(group?.users) ? group.users.map((user: any) => getUserDisplayName(user)).join(' / ') : 'Группа'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {group?.users?.length === 2
                      ? 'Скорее всего это один человек'
                      : `Скорее всего это группа из ${group?.users?.length || 0} аккаунтов`}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {getModeratorReasons(group?.signals, group?.evidence)?.[0] || 'Нужно проверить вручную'}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {formatStatusLabel(group?.status || '')} · риск: {group?.riskScore || 0}
                  </div>
                </button>
              );
            })}
          </div>
        </Block>

        <div className="lg:col-span-2 space-y-4">
          <Block title="Карточка случая">
            {isDetailLoading && <div className="text-sm text-slate-400">Загрузка деталей...</div>}
            {!isDetailLoading && !selectedRiskCase && <div className="text-sm text-slate-400">Выберите группу слева</div>}
            {!isDetailLoading && selectedRiskCase && !hasReadyGroup && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-slate-100">
                Эта карточка не годится для проверки мультиаккаунта: в ней нет собранной группы минимум из двух аккаунтов.
              </div>
            )}
            {!isDetailLoading && selectedRiskCase && hasReadyGroup && (
              <div className="space-y-4">
                <div className={`rounded-2xl border p-4 ${getRiskStatusTone(selectedRiskCase?.status, selectedRiskCase?.freezeStatus)}`}>
                  <div className="text-lg font-semibold text-white">{getRiskHeadline(groupUsers)}</div>
                  <div className="mt-2 text-sm text-slate-200">{getRiskDecisionLabel(selectedRiskCase)}</div>
                  <div className="mt-2 text-xs text-slate-400">
                    Группа: {selectedRiskCase?.groupId || selectedGroup?.id || '—'} · статус: {formatStatusLabel(selectedRiskCase?.status || '')} · риск: {selectedRiskCase?.riskScore || 0}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-slate-400 mb-2">Какие аккаунты входят в группу</div>
                    <div className="space-y-2">
                      {groupUsers.map((user: any) => (
                        <div key={String(user?._id || user?.email || '')} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-sm text-white">{getUserDisplayName(user)}</div>
                          <div className="text-xs text-slate-400">{user?.email || 'Без email'} · статус: {formatStatusLabel(user?.status || '')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-slate-400 mb-2">Почему система их связала</div>
                    <div className="space-y-2">
                      {moderatorReasons.map((reason) => (
                        <div key={reason} className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                          {reason}
                        </div>
                      ))}
                      {!moderatorReasons.length && <div className="text-xs text-slate-400">Пока есть только общая служебная пометка, без понятного описания</div>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button className="btn-secondary" disabled={isActionLoading} onClick={() => runAction('watch')}>Оставить под наблюдением</button>
                  <button className="btn-secondary" disabled={isActionLoading} onClick={() => runAction('unfreeze')}>Разморозить группу</button>
                  <button className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10" disabled={isActionLoading} onClick={() => runAction('ban')}>Заблокировать навсегда</button>
                </div>

                {!!categoryScores.length && (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-slate-400 mb-2">Из чего собран риск</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categoryScores.map((row) => (
                        <div key={row.category} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-xs text-slate-400">{formatRiskCategoryLabel(row.category)}</div>
                          <div className="text-sm text-white">{row.score.toFixed(1)} балла</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedRiskCase?.notes && (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-slate-400 mb-2">Заметки модераторов и системы</div>
                    <div className="whitespace-pre-wrap text-xs text-slate-200">{String(selectedRiskCase.notes)}</div>
                  </div>
                )}
              </div>
            )}
          </Block>

          <Block title="Подробно">
            <details className="rounded-xl border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-white">Показать доказательства и технические детали</summary>
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Понятные доказательства</div>
                  {evidenceLines.map((line: string) => (
                    <div key={line} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                      {line}
                    </div>
                  ))}
                  {!evidenceLines.length && <div className="text-xs text-slate-400">Отдельные доказательства пока не записаны</div>}
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Подробные баллы по каждому признаку</div>
                  {!riskScoreDetailed.length && <div className="text-xs text-slate-400">Подробный разбор пока не записан</div>}
                  {riskScoreDetailed.map((row: any, index: number) => (
                    <div key={`${row?.signal || 'row'}_${index}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                      <div className="text-white">{summarizeModeratorSignal(String(row?.signal || '')) || formatRiskSignal(String(row?.signal || ''))}</div>
                      <div className="mt-1 text-slate-400">
                        Категория: {formatRiskCategoryLabel(String(row?.category || ''))} · Баллы: {Number(row?.score || 0).toFixed(1)} · Повторов: {row?.count || 1}
                      </div>
                      {row?.summary && (
                        <div className="mt-1 text-slate-300">{String(row.summary)}</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Спорные боевые награды</div>
                  {!rewardRollbackRows.length && <div className="text-xs text-slate-400">Пока таких наград не найдено</div>}
                  {rewardRollbackRows.map((row: any) => (
                    <div key={String(row?.transactionId || `${row?.userId}_${row?.battleId}`)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                      <div className="text-white">
                        {row?.userNickname || row?.userEmail || row?.userId || 'Пользователь'} · {Number(row?.amount || 0).toFixed(3)} {row?.currency || 'K'}
                      </div>
                      <div className="mt-1 text-slate-400">
                        Бой: {row?.battleId || '—'} · Статус: {formatStatusLabel(String(row?.status || 'pending'))} · {row?.occurredAt ? new Date(row.occurredAt).toLocaleString() : '—'}
                      </div>
                      {Number(row?.transactionCount || 0) > 1 && (
                        <div className="mt-1 text-slate-400">
                          Начислений по этому бою: {Number(row?.transactionCount || 0)}
                        </div>
                      )}
                      {(Number(row?.rolledBackAmount || 0) > 0 || Number(row?.shortfall || 0) > 0) && (
                        <div className="mt-1 text-slate-300">
                          Откат: {Number(row?.rolledBackAmount || 0).toFixed(3)} · Остаток к удержанию: {Number(row?.shortfall || 0).toFixed(3)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Журнал входов и регистраций</div>
                  {!signalHistory.length && <div className="text-sm text-slate-400">История пока пуста</div>}
                  <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                    {signalHistory.map((entry) => (
                      <div key={String(entry?.id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                          <div>
                            <div className="text-sm text-white">
                              {entry?.user?.nickname || entry?.user?.email || 'Пользователь'} · {humanizeCode(String(entry?.eventType || ''))}
                            </div>
                            <div className="text-xs text-slate-400">
                              {entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400">{entry?.ip || 'без IP'}</div>
                        </div>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                          <div>Сеть: {summarizeNetworkFlags(entry?.ipIntel)}</div>
                          <div>Метка браузера: {entry?.deviceId || '—'}</div>
                          <div>Сильный отпечаток: {entry?.fingerprint || '—'}</div>
                          <div>Слабый отпечаток: {entry?.weakFingerprint || '—'}</div>
                          <div>Профиль браузера: {entry?.profileKey || '—'}</div>
                          <div>Автоматизация: {entry?.clientProfile?.webdriver || entry?.clientProfile?.headless ? 'Есть признаки' : 'Не замечена'}</div>
                          <div>Эмулятор: {entry?.clientProfile?.emulator ? 'Да' : 'Нет'}</div>
                          <div>Платформа: {entry?.clientProfile?.platform || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </Block>
        </div>
      </div>
    </div>
  );
}
function AuthTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadEvents = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await cmsFetchAuthEvents({
        limit: 120,
        ...(eventTypeFilter ? { eventType: eventTypeFilter } : {}),
        ...(resultFilter ? { result: resultFilter } : {}),
      });
      const rows: any[] = Array.isArray(data?.events) ? data.events : [];
      setEvents(rows);
      const hasSelected = rows.some((row) => String(row?.user?._id || '') === String(selectedUserId || ''));
      if (!hasSelected) {
        const firstUserId = String(rows.find((row) => row?.user?._id)?.user?._id || '').trim();
        setSelectedUserId(firstUserId);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить события авторизации');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSessions = async (userId: string) => {
    if (!userId) {
      setSessions([]);
      return;
    }
    setIsSessionsLoading(true);
    setError('');
    try {
      const data = await cmsFetchUserSessions(userId);
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить сессии');
      setSessions([]);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [eventTypeFilter, resultFilter]);

  useEffect(() => {
    if (selectedUserId) {
      loadSessions(selectedUserId);
    } else {
      setSessions([]);
    }
  }, [selectedUserId]);

  const selectedUser = useMemo(() => {
    return events.find((row) => String(row?.user?._id || '') === String(selectedUserId || ''))?.user || null;
  }, [events, selectedUserId]);

  const revokeOne = async (sessionId: string) => {
    const reason = prompt('Причина завершения сессии', 'manual_admin_revoke');
    if (reason == null) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsRevokeSession(sessionId, { reason: String(reason || '').trim() || 'manual_admin_revoke' });
      setOk('Сессия завершена');
      await loadSessions(selectedUserId);
      await loadEvents();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось завершить сессию');
    } finally {
      setIsActionLoading(false);
    }
  };

  const revokeAll = async () => {
    if (!selectedUserId) return;
    if (!window.confirm('Завершить все сессии выбранного пользователя?')) return;
    const reason = prompt('Причина завершения всех сессий', 'manual_admin_revoke_all');
    if (reason == null) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsRevokeAllSessions(selectedUserId, { reason: String(reason || '').trim() || 'manual_admin_revoke_all' });
      setOk('Все сессии пользователя завершены');
      await loadSessions(selectedUserId);
      await loadEvents();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось завершить все сессии');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">История входов, ошибок и текущие сессии пользователя</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
            <option value="">Все события</option>
            {Object.entries(AUTH_EVENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
            <option value="">Все результаты</option>
            <option value="success">Успех</option>
            <option value="failed">Ошибка</option>
            <option value="blocked">Заблокировано</option>
          </select>
          <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={() => loadEvents()}>Обновить</button>
        </div>
      </div>

      <StateMessage error={error} ok={ok} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="События авторизации">
          <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !events.length && <div className="text-sm text-slate-400">Событий пока нет</div>}
            {events.map((event) => {
              const eventUserId = String(event?.user?._id || '').trim();
              const isSelected = eventUserId && eventUserId === String(selectedUserId || '');
              return (
                <button
                  key={String(event?._id || `${eventUserId}_${event?.createdAt || ''}`)}
                  type="button"
                  onClick={() => eventUserId && setSelectedUserId(eventUserId)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${isSelected
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {event?.user?.nickname || event?.user?.email || event?.email || 'Неизвестный пользователь'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatAuthEventLabel(String(event?.eventType || ''))} · {formatAuthResult(String(event?.result || ''))}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{formatDateTime(event?.createdAt)}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                    <div>IP: {event?.ip || '—'}</div>
                    <div>Причина: {formatReasonLabel(String(event?.reason || ''))}</div>
                    <div>Метка браузера: {event?.deviceId || '—'}</div>
                    <div>Сессия: {event?.sessionId || '—'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Block>

        <Block title="Сессии пользователя">
          {!selectedUserId && <div className="text-sm text-slate-400">Выберите событие слева, чтобы открыть сессии этого пользователя</div>}
          {selectedUserId && (
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{selectedUser?.nickname || selectedUser?.email || selectedUserId}</div>
                  <div className="text-xs text-slate-400">{selectedUser?.email || 'Без email'} · {formatStatusLabel(String(selectedUser?.status || ''))}</div>
                </div>
                <button className="btn-secondary" disabled={isActionLoading || isSessionsLoading} onClick={revokeAll}>Завершить все сессии</button>
              </div>

              {isSessionsLoading && <div className="text-sm text-slate-400">Загрузка сессий...</div>}
              {!isSessionsLoading && !sessions.length && <div className="text-sm text-slate-400">У пользователя нет сохранённых сессий</div>}

              <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                {sessions.map((session) => (
                  <div key={String(session?._id || session?.sessionId || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {session?.isActive ? 'Активная сессия' : 'Завершённая сессия'}
                        </div>
                        <div className="text-xs text-slate-400">
                          Начало: {formatDateTime(session?.startedAt)} · Последняя активность: {formatDateTime(session?.lastSeenAt)}
                        </div>
                      </div>
                      {session?.isActive ? (
                        <button className="btn-secondary" disabled={isActionLoading} onClick={() => revokeOne(String(session.sessionId || session._id || ''))}>Завершить</button>
                      ) : (
                        <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-400">
                          {session?.revokedAt ? `Завершена: ${formatDateTime(session.revokedAt)}` : 'Неактивна'}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                      <div>IP: {session?.ip || '—'}</div>
                      <div>Метка браузера: {session?.deviceId || '—'}</div>
                      <div>Отпечаток: {session?.fingerprint || '—'}</div>
                      <div>Причина завершения: {formatReasonLabel(String(session?.revokeReason || ''))}</div>
                    </div>
                    {session?.userAgent && (
                      <div className="mt-2 text-xs text-slate-400 break-words">
                        Браузер: {session.userAgent}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Block>
      </div>
    </div>
  );
}

function FiltersTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [hits, setHits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPattern, setCreatePattern] = useState('');
  const [createType, setCreateType] = useState('bad_word');
  const [createAction, setCreateAction] = useState('flag');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [rulesData, hitsData] = await Promise.all([
        cmsFetchModerationRules(),
        cmsFetchModerationHits({ limit: 80 }),
      ]);
      setRules(Array.isArray(rulesData?.rules) ? rulesData.rules : []);
      setHits(Array.isArray(hitsData?.hits) ? hitsData.hits : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить фильтры');
      setRules([]);
      setHits([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createRule = async () => {
    if (!createName.trim() || !createPattern.trim()) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsCreateModerationRule({
        name: createName.trim(),
        pattern: createPattern.trim(),
        type: createType,
        action: createAction,
        scopes: ['all'],
        isEnabled: true,
      });
      setCreateName('');
      setCreatePattern('');
      setOk('Правило создано');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось создать правило');
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleRule = async (rule: any) => {
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsPatchModerationRule(String(rule?._id || ''), { isEnabled: !Boolean(rule?.isEnabled) });
      setOk(Boolean(rule?.isEnabled) ? 'Правило отключено' : 'Правило включено');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось обновить правило');
    } finally {
      setIsActionLoading(false);
    }
  };

  const removeRule = async (rule: any) => {
    if (!window.confirm(`Удалить правило "${rule?.name || 'без названия'}"?`)) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsDeleteModerationRule(String(rule?._id || ''));
      setOk('Правило удалено');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось удалить правило');
    } finally {
      setIsActionLoading(false);
    }
  };

  const resolveHit = async (hitId: string, status: 'resolved' | 'false_positive') => {
    const note = prompt(
      status === 'false_positive'
        ? 'Комментарий: почему это ложное срабатывание'
        : 'Комментарий: что было сделано по срабатыванию',
      ''
    );
    if (note == null) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsResolveModerationHit(hitId, { status, note: String(note || '').trim() });
      setOk(status === 'false_positive' ? 'Срабатывание отмечено как ложное' : 'Срабатывание закрыто');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось обновить срабатывание');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">Правила фильтрации и последние срабатывания</div>
        <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={() => loadData()}>Обновить</button>
      </div>

      <StateMessage error={error} ok={ok} />

      <Block title="Новое правило">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="input-field" placeholder="Название правила" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={createType} onChange={(e) => setCreateType(e.target.value)}>
            <option value="bad_word">Запрещённое слово</option>
            <option value="blocked_domain">Заблокированный домен</option>
            <option value="spam_pattern">Спам-шаблон</option>
          </select>
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={createAction} onChange={(e) => setCreateAction(e.target.value)}>
            <option value="flag">Пометить</option>
            <option value="hide">Скрыть</option>
            <option value="mute">Заглушить</option>
            <option value="block">Блокировать</option>
          </select>
          <button className="btn-primary" disabled={isActionLoading || !createName.trim() || !createPattern.trim()} onClick={createRule}>Создать правило</button>
        </div>
        <textarea
          className="input-field min-h-[90px]"
          placeholder="Что искать: слово, домен или шаблон"
          value={createPattern}
          onChange={(e) => setCreatePattern(e.target.value)}
        />
      </Block>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="Правила">
          <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !rules.length && <div className="text-sm text-slate-400">Правил пока нет</div>}
            {rules.map((rule) => (
              <div key={String(rule?._id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{rule?.name || 'Без названия'}</div>
                    <div className="text-xs text-slate-400">
                      {formatFilterTypeLabel(String(rule?.type || ''))} · {formatFilterActionLabel(String(rule?.action || ''))} · {rule?.isEnabled ? 'Включено' : 'Отключено'}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button className="btn-secondary" disabled={isActionLoading} onClick={() => toggleRule(rule)}>
                      {rule?.isEnabled ? 'Выключить' : 'Включить'}
                    </button>
                    <button className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10" disabled={isActionLoading} onClick={() => removeRule(rule)}>
                      Удалить
                    </button>
                  </div>
                </div>
                <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 break-words">
                  {rule?.pattern || '—'}
                </div>
                {rule?.description && <div className="mt-2 text-xs text-slate-400">{rule.description}</div>}
              </div>
            ))}
          </div>
        </Block>

        <Block title="Последние срабатывания">
          <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !hits.length && <div className="text-sm text-slate-400">Срабатываний пока нет</div>}
            {hits.map((hit) => (
              <div key={String(hit?._id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {hit?.rule?.name || 'Без правила'} · {formatStatusLabel(String(hit?.status || 'open'))}
                    </div>
                    <div className="text-xs text-slate-400">
                      {hit?.user?.nickname || hit?.user?.email || 'Без пользователя'} · {formatScopeLabel(String(hit?.scope || 'all'))}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">{formatDateTime(hit?.createdAt)}</div>
                </div>
                <div className="mt-2 text-xs text-slate-300">
                  Тип правила: {formatFilterTypeLabel(String(hit?.rule?.type || hit?.ruleType || ''))}
                </div>
                {shortenText(hit?.matchedText || hit?.excerpt || hit?.content || hit?.text || hit?.meta?.summary || '') && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words">
                    {shortenText(hit?.matchedText || hit?.excerpt || hit?.content || hit?.text || hit?.meta?.summary || '', 260)}
                  </div>
                )}
                {String(hit?.status || '') !== 'resolved' && String(hit?.status || '') !== 'false_positive' && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <button className="btn-secondary" disabled={isActionLoading} onClick={() => resolveHit(String(hit?._id || ''), 'resolved')}>Закрыть</button>
                    <button className="btn-secondary" disabled={isActionLoading} onClick={() => resolveHit(String(hit?._id || ''), 'false_positive')}>Ложное срабатывание</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Block>
      </div>
    </div>
  );
}
function ContentTab() { return <div />; }
function SystemTab() {
  const [backups, setBackups] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [topRoutes, setTopRoutes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [backupsData, errorsData] = await Promise.all([
        cmsFetchBackups({ limit: 50 }),
        cmsFetchSystemErrors({ limit: 50 }),
      ]);
      setBackups(Array.isArray(backupsData?.backups) ? backupsData.backups : []);
      setErrors(Array.isArray(errorsData?.events) ? errorsData.events : []);
      setTopRoutes(Array.isArray(errorsData?.topRoutes) ? errorsData.topRoutes : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить системные данные');
      setBackups([]);
      setErrors([]);
      setTopRoutes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createBackupNow = async () => {
    const payload = requestDangerousJobPayload({
      title: 'Создание резервной копии',
      impactPreviewDefault: 'Будет создана новая резервная копия данных проекта.',
      confirmationPhrase: 'CREATE BACKUP',
    });
    if (!payload) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsCreateBackup(payload);
      setOk(data?.message || 'Запрос на создание резервной копии отправлен');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось отправить создание резервной копии');
    } finally {
      setIsActionLoading(false);
    }
  };

  const restoreOneBackup = async (backup: any) => {
    const payload = requestDangerousJobPayload({
      title: `Восстановление копии ${backup?.backupId || backup?.fileName || ''}`,
      impactPreviewDefault: 'Текущие данные будут заменены содержимым выбранной резервной копии.',
      confirmationPhrase: 'RESTORE BACKUP',
    });
    if (!payload) return;
    if (!window.confirm('Подтвердите восстановление выбранной резервной копии.')) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsRestoreBackup({
        ...payload,
        backupId: backup?.backupId || null,
        backupPath: backup?.fullPath || null,
      });
      setOk(data?.message || 'Запрос на восстановление отправлен');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось отправить восстановление');
    } finally {
      setIsActionLoading(false);
    }
  };

  const clearSystemCache = async () => {
    if (!window.confirm('Очистить системный кэш?')) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsClearCache({ zone: 'system' });
      setOk(data?.message || 'Кэш очищен');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось очистить кэш');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">Резервные копии, системные ошибки и служебные действия</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={() => loadData()}>Обновить</button>
          <button className="btn-secondary" disabled={isActionLoading} onClick={clearSystemCache}>Очистить кэш</button>
          <button className="btn-primary" disabled={isActionLoading} onClick={createBackupNow}>Создать копию</button>
        </div>
      </div>

      <StateMessage error={error} ok={ok} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="Резервные копии">
          <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !backups.length && <div className="text-sm text-slate-400">Резервных копий пока нет</div>}
            {backups.map((backup) => (
              <div key={String(backup?.fullPath || backup?.backupId || backup?.fileName || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{backup?.fileName || backup?.backupId || 'Резервная копия'}</div>
                    <div className="text-xs text-slate-400">
                      ID: {backup?.backupId || '—'} · {backup?.compressed ? 'Сжата' : 'Без сжатия'}
                    </div>
                  </div>
                  <button className="btn-secondary" disabled={isActionLoading} onClick={() => restoreOneBackup(backup)}>Восстановить</button>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>Создана: {formatDateTime(backup?.createdAt)}</div>
                  <div>Размер: {Number(backup?.size || 0).toLocaleString()} байт</div>
                </div>
                <div className="mt-2 text-xs text-slate-400 break-all">{backup?.fullPath || '—'}</div>
              </div>
            ))}
          </div>
        </Block>

        <div className="space-y-4">
          <Block title="Частые маршруты с ошибками">
            {!topRoutes.length && <div className="text-sm text-slate-400">Статистика ошибок пока пуста</div>}
            <div className="space-y-2">
              {topRoutes.map((route) => (
                <div key={String(route?.route || '')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <div className="font-semibold text-white">{route?.route || '—'}</div>
                  <div className="text-xs text-slate-400">Срабатываний: {route?.count || 0}</div>
                </div>
              ))}
            </div>
          </Block>

          <Block title="Последние системные ошибки">
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
              {!isLoading && !errors.length && <div className="text-sm text-slate-400">Ошибок пока нет</div>}
              {errors.map((item) => (
                <div key={String(item?._id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {item?.method || '—'} {item?.path || '—'}
                      </div>
                      <div className="text-xs text-slate-400">
                        Код: {item?.statusCode || '—'} · {item?.eventType || 'system_error'}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{formatDateTime(item?.createdAt)}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    Пользователь: {item?.user?.nickname || item?.user?.email || '—'} · Длительность: {item?.durationMs || 0} мс
                  </div>
                  {shortenText(item?.summary || item?.message || item?.meta?.message || '', 260) && (
                    <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words">
                      {shortenText(item?.summary || item?.message || item?.meta?.message || '', 260)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Block>
        </div>
      </div>
    </div>
  );
}
function MailTab() {
  const [language, setLanguage] = useState<ContentLanguage>('ru');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [query, setQuery] = useState('');

  const [createKey, setCreateKey] = useState('');
  const [createName, setCreateName] = useState('');

  const [versions, setVersions] = useState<any[]>([]);
  const [isVersionsLoading, setIsVersionsLoading] = useState(false);
  const [openedVersion, setOpenedVersion] = useState<number | null>(null);
  const [autoImportAttempted, setAutoImportAttempted] = useState(false);

  const selected = useMemo(() => templates.find((t) => String(t._id) === String(selectedId || '')) || null, [templates, selectedId]);

  const filteredTemplates = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    const rows = Array.isArray(templates) ? templates : [];
    const out = q
      ? rows.filter((t) => {
        const key = String(t?.key || '').toLowerCase();
        const name = String(t?.name || '').toLowerCase();
        return key.includes(q) || name.includes(q);
      })
      : rows;
    return [...out].sort((a, b) => {
      const aTime = a?.updatedAt ? new Date(a.updatedAt as any).getTime() : 0;
      const bTime = b?.updatedAt ? new Date(b.updatedAt as any).getTime() : 0;
      return bTime - aTime;
    });
  }, [templates, query]);

  const isDirty = useMemo(() => {
    if (!draft || !selected) return false;
    const pick = (t: any) => ({
      key: String(t?.key || ''),
      name: String(t?.name || ''),
      status: String(t?.status || ''),
      subject: normalizeLocalizedText(t?.subject),
      html: normalizeLocalizedText(t?.html),
      text: normalizeLocalizedText(t?.text),
      note: String(t?.note || ''),
    });
    try {
      return JSON.stringify(pick(draft)) !== JSON.stringify(pick(selected));
    } catch (_e) {
      return true;
    }
  }, [draft, selected]);

  const loadTemplates = async (allowAutoImport = true) => {
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsFetchEmailTemplates({ limit: 200 });
      let rows = Array.isArray(data?.templates) ? data.templates : [];
      if (!rows.length && allowAutoImport && !autoImportAttempted) {
        setAutoImportAttempted(true);
        await cmsImportEmailTemplateDefaults();
        const retry = await cmsFetchEmailTemplates({ limit: 200 });
        rows = Array.isArray(retry?.templates) ? retry.templates : [];
        if (rows.length) {
          setOk('Стартовые шаблоны писем автоматически подгружены');
        }
      }
      setTemplates(rows);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить шаблоны');
    } finally {
      setIsLoading(false);
    }
  };

  const resetDraft = () => {
    if (!selected) return;
    if (isDirty && !window.confirm('Сбросить изменения и вернуть сохранённую версию?')) return;
    setDraft({ ...selected });
    setOk('Черновик сброшен');
  };

  const importDefaults = async () => {
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsImportEmailTemplateDefaults();
      setOk('Импорт выполнен');
      await loadTemplates();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось выполнить импорт');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setVersions([]);
      setOpenedVersion(null);
      return;
    }
    setDraft({ ...selected });
    setVersions([]);
    setOpenedVersion(null);
  }, [selected?._id]);

  const loadVersions = async () => {
    if (!selectedId) return;
    setIsVersionsLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsFetchEmailTemplateVersions(selectedId);
      setVersions(Array.isArray(data?.versions) ? data.versions : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить версии');
    } finally {
      setIsVersionsLoading(false);
    }
  };

  const createTemplate = async () => {
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      const res = await cmsCreateEmailTemplate({
        key: createKey.trim(),
        name: createName.trim(),
        status: 'draft',
        subject: { ru: '', en: '' },
        html: { ru: '', en: '' },
        text: { ru: '', en: '' },
      });
      const created = res?.data?.template || res?.template || res?.data?.data?.template || null;
      setOk('Шаблон создан');
      setCreateKey('');
      setCreateName('');
      await loadTemplates();
      if (created?._id) setSelectedId(String(created._id));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось создать шаблон');
    } finally {
      setIsLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!draft?._id) return;
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsPatchEmailTemplate(draft._id, {
        key: String(draft.key || '').trim(),
        name: String(draft.name || '').trim(),
        status: draft.status,
        subject: normalizeLocalizedText(draft.subject),
        html: normalizeLocalizedText(draft.html),
        text: normalizeLocalizedText(draft.text),
        note: String(draft.note || ''),
      });
      setOk('Сохранено');
      await loadTemplates();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить');
    } finally {
      setIsLoading(false);
    }
  };

  const publishTemplate = async () => {
    if (!draft?._id) return;
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsPublishEmailTemplate(draft._id);
      setOk('Опубликовано');
      await loadTemplates();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось опубликовать');
    } finally {
      setIsLoading(false);
    }
  };

  const rollback = async (version: number) => {
    if (!draft?._id) return;
    if (!window.confirm(`Откатить шаблон на версию ${version}?`)) return;
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsRollbackEmailTemplate(draft._id, version);
      setOk('Откат выполнен');
      await loadTemplates();
      await loadVersions();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось откатить');
    } finally {
      setIsLoading(false);
    }
  };

  const setLocalizedField = (field: 'subject' | 'html' | 'text', nextValue: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: updateLocalizedTextValue(prev[field], language, nextValue),
      };
    });
  };

  const selectTemplate = (id: string) => {
    if (String(id) === String(selectedId || '')) return;
    if (isDirty && !window.confirm('Есть несохранённые изменения. Переключиться и потерять их?')) return;
    setSelectedId(String(id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">Шаблоны писем (RU/EN)</div>
        <LanguageToggle value={language} onChange={setLanguage} />
      </div>

      <StateMessage error={error} ok={ok} />

      <Block title="Создать шаблон">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className="input-field" placeholder="key (например: registration_confirm)" value={createKey} onChange={(e) => setCreateKey(e.target.value)} />
          <input className="input-field" placeholder="Название" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          <button className="btn-primary" disabled={isLoading || !createKey.trim()} onClick={createTemplate}>Создать</button>
        </div>
        <div>
          <button className="btn-secondary" disabled={isLoading} onClick={importDefaults}>Импортировать стартовые шаблоны</button>
        </div>
      </Block>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Block title="Список">
          <div className="space-y-2">
            <button className="btn-secondary w-full" disabled={isLoading} onClick={() => loadTemplates()}>Обновить список</button>
            {isLoading && <div className="text-xs text-slate-400">Загрузка...</div>}
            <input
              className="input-field"
              placeholder="Поиск по key или названию"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="space-y-1">
              {filteredTemplates.map((t) => (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => selectTemplate(String(t._id))}
                  className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${String(t._id) === String(selectedId)
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="text-sm font-semibold text-white">{t.name || t.key}</div>
                  <div className="text-xs text-slate-400">
                    {t.key} · {t.status || 'draft'}
                    {t?.updatedAt ? ` · обновлено: ${new Date(t.updatedAt as any).toLocaleString()}` : ''}
                  </div>
                </button>
              ))}
              {!filteredTemplates.length && <div className="text-xs text-slate-400">Пока пусто</div>}
            </div>
          </div>
        </Block>

        <Block title="Редактор">
          {!draft && <div className="text-sm text-slate-400">Выберите шаблон слева</div>}
          {draft && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-slate-400">
                  {isDirty ? 'Есть несохранённые изменения' : 'Изменений нет'}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button className="btn-secondary" disabled={isLoading} onClick={resetDraft}>Сбросить изменения</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className="input-field" placeholder="key" value={draft.key || ''} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
                <input className="input-field" placeholder="Название" value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>

              <div className="text-xs text-slate-400">
                {draft?.status ? `Статус: ${draft.status}` : ''}
                {draft?.publishedAt ? ` · опубликовано: ${new Date(draft.publishedAt as any).toLocaleString()}` : ''}
                {draft?.updatedAt ? ` · обновлено: ${new Date(draft.updatedAt as any).toLocaleString()}` : ''}
              </div>

              <input
                className="input-field"
                placeholder={language === 'ru' ? 'Тема письма (RU)' : 'Тема письма (EN)'}
                value={getLocalizedTextValue(draft.subject, language)}
                onChange={(e) => setLocalizedField('subject', e.target.value)}
              />

              <textarea
                className="input-field min-h-[140px]"
                placeholder={language === 'ru' ? 'HTML (RU)' : 'HTML (EN)'}
                value={getLocalizedTextValue(draft.html, language)}
                onChange={(e) => setLocalizedField('html', e.target.value)}
              />

              <textarea
                className="input-field min-h-[120px]"
                placeholder={language === 'ru' ? 'Текстовая версия (RU)' : 'Текстовая версия (EN)'}
                value={getLocalizedTextValue(draft.text, language)}
                onChange={(e) => setLocalizedField('text', e.target.value)}
              />

              <textarea
                className="input-field min-h-[80px]"
                placeholder="Заметка (для себя)"
                value={draft.note || ''}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />

              <div className="flex flex-col sm:flex-row gap-2">
                <button className="btn-primary" disabled={isLoading || !isDirty} onClick={saveTemplate}>Сохранить</button>
                <button className="btn-secondary" disabled={isLoading || !isDirty} onClick={publishTemplate}>Опубликовать</button>
                <button className="btn-secondary" disabled={isLoading || !draft._id} onClick={loadVersions}>Показать версии</button>
              </div>
            </div>
          )}
        </Block>

        <Block title="Версии">
          {!draft && <div className="text-sm text-slate-400">Выберите шаблон</div>}
          {draft && (
            <div className="space-y-2">
              {isVersionsLoading && <div className="text-xs text-slate-400">Загрузка...</div>}
              {!isVersionsLoading && !versions.length && <div className="text-sm text-slate-400">Версии не загружены</div>}
              <div className="space-y-2">
                {versions.map((v) => (
                  <div key={`${v?._id || ''}_${v?.version || ''}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="text-sm text-white font-semibold">Версия {v?.version}</div>
                        <div className="text-xs text-slate-400">
                          {v?.createdAt ? `Дата: ${new Date(v.createdAt as any).toLocaleString()}` : ''}
                          {v?.changeNote ? ` · ${String(v.changeNote)}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => setOpenedVersion((prev) => (prev === Number(v?.version) ? null : Number(v?.version)))}
                        >
                          {openedVersion === Number(v?.version) ? 'Скрыть' : 'Показать'}
                        </button>
                        <button className="btn-secondary" disabled={isLoading} onClick={() => rollback(Number(v?.version))}>Откатить</button>
                      </div>
                    </div>

                    {openedVersion === Number(v?.version) && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-slate-400">Тема ({language.toUpperCase()})</div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200 break-words">
                          {getLocalizedTextValue(v?.snapshot?.subject, language) || '—'}
                        </div>

                        <div className="text-xs text-slate-400">HTML ({language.toUpperCase()})</div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200 whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
                          {getLocalizedTextValue(v?.snapshot?.html, language) || '—'}
                        </div>

                        <div className="text-xs text-slate-400">Текст ({language.toUpperCase()})</div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200 whitespace-pre-wrap break-words max-h-[160px] overflow-auto">
                          {getLocalizedTextValue(v?.snapshot?.text, language) || '—'}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Block>
      </div>
    </div>
  );
}

export default function CmsOperations() {
  const [tab, setTab] = useState<TabKey>('security');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button className={`btn-secondary ${tab === 'security' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('security')}>Безопасность</button>
        <button className={`btn-secondary ${tab === 'filters' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('filters')}>Фильтры</button>
        <button className={`btn-secondary ${tab === 'system' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('system')}>Система</button>
        <button className={`btn-secondary ${tab === 'mail' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setTab('mail')}>Рассылки</button>
      </div>

      {tab === 'security' && <SecurityTab />}
      {tab === 'filters' && <FiltersTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'mail' && <MailTab />}
    </div>
  );
}
