export function formatDateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function shortenText(value: unknown, max = 180) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

export const RISK_LEVEL_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

export const STATUS_LABELS: Record<string, string> = {
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

export const RULE_TYPE_LABELS: Record<string, string> = {
  ip: 'IP',
  device: 'Устройство',
  fingerprint: 'Отпечаток',
};

export const FILTER_TYPE_LABELS: Record<string, string> = {
  bad_word: 'Запрещенное слово',
  blocked_domain: 'Заблокированный домен',
  spam_pattern: 'Спам-шаблон',
};

export const FILTER_ACTION_LABELS: Record<string, string> = {
  flag: 'Пометить',
  hide: 'Скрыть',
  mute: 'Заглушить',
  block: 'Блокировать',
};

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  page: 'Страница',
  article: 'Статья',
};

export const AUTH_EVENT_LABELS: Record<string, string> = {
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

export const REASON_LABELS: Record<string, string> = {
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

export const SCOPE_LABELS: Record<string, string> = {
  all: 'Все области',
  chat: 'Чат',
  news_comment: 'Комментарии к новостям',
};

export const SIGNAL_LABELS: Record<string, string> = {
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

export const JSON_KEY_LABELS: Record<string, string> = {
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
  totalK: 'Всего K',
  totalLumens: 'Всего Люменов',
  directCount: 'Прямых переходов',
  targetCount: 'Целевых переходов',
  uniquePaths: 'Уникальных страниц',
  activeDays: 'Активных дней',
  overlapCount: 'Перекрывающихся сессий',
  kFromTransactions: 'K из транзакций',
  kFromActivities: 'K из активностей',
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

export function humanizeCode(value: string) {
  if (!value) return '-';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatRiskLevel(level: string) {
  return RISK_LEVEL_LABELS[String(level || '').trim()] || humanizeCode(String(level || ''));
}

export function formatStatusLabel(status: string) {
  return STATUS_LABELS[String(status || '').trim()] || humanizeCode(String(status || ''));
}

export function formatRuleTypeLabel(type: string) {
  return RULE_TYPE_LABELS[String(type || '').trim()] || humanizeCode(String(type || ''));
}

export function formatFilterTypeLabel(type: string) {
  return FILTER_TYPE_LABELS[String(type || '').trim()] || humanizeCode(String(type || ''));
}

export function formatFilterActionLabel(action: string) {
  return FILTER_ACTION_LABELS[String(action || '').trim()] || humanizeCode(String(action || ''));
}

export function formatContentTypeLabel(type: string) {
  return CONTENT_TYPE_LABELS[String(type || '').trim()] || humanizeCode(String(type || ''));
}

export function formatAuthEventLabel(eventType: string) {
  return AUTH_EVENT_LABELS[String(eventType || '').trim()] || humanizeCode(String(eventType || ''));
}

export function formatReasonLabel(reason: string) {
  if (!reason) return '-';
  return REASON_LABELS[String(reason || '').trim()] || reason;
}

export function formatScopeLabel(scope: string) {
  return SCOPE_LABELS[String(scope || '').trim()] || humanizeCode(String(scope || ''));
}

export function formatAuthResult(result: string) {
  const safe = String(result || '').trim().toLowerCase();
  if (!safe) return '—';
  if (safe === 'success') return 'Успех';
  if (safe === 'failed') return 'Ошибка';
  if (safe === 'blocked') return 'Заблокировано';
  return humanizeCode(safe);
}

export function summarizeNetworkFlags(ipIntel: any) {
  const parts = [
    ipIntel?.isTor ? 'TOR' : '',
    ipIntel?.isVpn ? 'VPN' : '',
    ipIntel?.isProxy ? 'Прокси' : '',
    ipIntel?.isHosting ? 'Серверная сеть' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Обычная сеть';
}

export function getUserDisplayName(user: any) {
  return String(user?.nickname || user?.email || 'Пользователь').trim() || 'Пользователь';
}
