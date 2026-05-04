import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageSquare,
  Settings,
  BarChart3,
  Search,
  Plus,
  LogOut,
  Shield,
  Heart,
  Star,
  Coins,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Filter,
  Save,
  RefreshCw,
  Trash2,
  Edit3,
  Swords,
  Globe,
  DollarSign,
  Dices,
  Sparkles,
  Check,
  Gem,
  MonitorSmartphone
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import api from './api/client';
import { FRONTEND_BASE_URL } from './config/env';
import {
  fetchUsers,
  fetchAdmins,
  createAdminAccount,
  updateAdminEmail,
  fetchAppeals,
  handleAppeal,
  fetchStats,
  fetchSettings,
  updateSettings,
  fetchWishes,
  updateWish,
  deleteWish,
  deleteUser,
  resetUserPassword,
  fetchUserChats,
  fetchLogs,
  fetchBattleControl,
  fetchBattleMoodForecast,
  fetchSuspiciousBattleUsers,
  fetchChats,
  fetchPagesContent,
  updatePagesContent,
  fetchMeditationSettings,
  updateMeditationSettings,
  createBackup,
  fetchQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
  fetchFeedbackMessages,
  archiveFeedbackMessage,
  replyFeedbackMessage,
  deleteFeedbackMessage,
  fetchPracticeGratitudeAudit,
  fetchPracticeAttendanceAudit,
  createApprovalV2,
  fetchApprovalsV2,
  approveApprovalV2,
  rejectApprovalV2,
  fetchSystemOverviewV2,
  fetchSystemJobsV2,
  runSystemJobV2,
  fetchAuditLogsV2,
  fetchAuditLogByIdV2
} from './api/admin';
import { fetchPosts, createPost as apiCreatePost, publishPost, updatePost, deletePost } from './api/news';
import { describeNewsMedia } from './utils/newsMedia';
import {
  emptyLocalizedText,
  getLocalizedTextValue,
  getTranslatedField,
  normalizeLocalizedText,
  updateLocalizedTextValue,
  type ContentLanguage,
} from './utils/localizedContent';

// --- Types ---

type SectionKey = 'dashboard' | 'control' | 'cms' | 'users' | 'admins' | 'content' | 'rules' | 'about' | 'roadmap' | 'appeals' | 'wishes' | 'bridges' | 'battles' | 'referrals' | 'entities' | 'ads' | 'fortune' | 'night_guardians' | 'crystal' | 'practice' | 'feedback' | 'settings' | 'logs';

interface Section {
  key: SectionKey;
  label: string;
  icon: React.ElementType;
}

const NightGuardiansPage = lazy(() => import('./pages/NightGuardians'));
const CmsOperations = lazy(() => import('./pages/CmsOperations'));
const FortuneControl = lazy(() => import('./pages/FortuneControl'));

const formatAdminSc = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
};

const ADMIN_EMAIL_DOMAIN = 'givkoin.com';
const ADMIN_UI_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  executed: 'Выполнено',
  failed: 'Ошибка',
  completed: 'Завершен',
  running: 'Выполняется',
};

function isAdminEmail(value: string) {
  const email = String(value || '').trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (local.includes('.') || /[^a-zA-Z0-9]/.test(local)) return false;
  return domain === ADMIN_EMAIL_DOMAIN;
}

function formatAdminUiStatus(status: string) {
  return ADMIN_UI_STATUS_LABELS[String(status || '').trim()] || status || 'Неизвестно';
}

function requestApprovalPayload(options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) {
  const reason = prompt(`Причина операции: ${options.title}`);
  if (!reason || !reason.trim()) {
    alert('Причина обязательна');
    return null;
  }

  const impactPreview = prompt(
    'Что изменится после выполнения?',
    options.impactPreviewDefault
  );
  if (!impactPreview || !impactPreview.trim()) {
    alert('Описание последствий обязательно');
    return null;
  }

  const typedPhrase = prompt(
    `Для подтверждения введите фразу:\n${options.confirmationPhrase}`
  );
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

function normalizeBattleStartsAtForApproval(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}
const CrystalManagement = lazy(() => import('./pages/CrystalManagement'));

function SectionFallback() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
      Загрузка раздела...
    </div>
  );
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

function AdminsSection() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createEmail, setCreateEmail] = useState('');
  const [createSeedPhrase, setCreateSeedPhrase] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const validateSeedPhrase = (value: string) => {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return words.length === 24;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdmins();
      setAdmins(Array.isArray(data?.admins) ? data.admins : []);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (admin: any) => {
    setEditingId(admin?._id || null);
    setEditingEmail(admin?.email || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingEmail('');
  };

  const saveEmail = async () => {
    if (!editingId) return;
    if (!isAdminEmail(editingEmail)) {
      setError(`Используйте email вида local@${ADMIN_EMAIL_DOMAIN} без точек/символов до @`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateAdminEmail(editingId, { email: editingEmail });
      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const createAdmin = async () => {
    setError(null);
    const email = String(createEmail || '').trim();
    const seedPhrase = String(createSeedPhrase || '').trim();

    if (!email) {
      setError('Email обязателен');
      return;
    }
    if (!seedPhrase) {
      setError('Введите сид-фразу');
      return;
    }
    if (!isAdminEmail(email)) {
      setError(`Используйте email вида local@${ADMIN_EMAIL_DOMAIN} без точек/символов до @`);
      return;
    }
    if (!validateSeedPhrase(seedPhrase)) {
      setError('Сид-фраза должна содержать 24 слова');
      return;
    }

    setCreating(true);
    try {
      await createAdminAccount({ email, seedPhrase });
      setCreateEmail('');
      setCreateSeedPhrase('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Админы" subtitle={`Создание админов и изменение их почты. Разрешены только @${ADMIN_EMAIL_DOMAIN}.`}>
        {error && (
          <div className="rounded-xl bg-rose-500/20 border border-rose-500/30 p-3 text-sm text-rose-400 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-slate-500">Загрузка...</div>
        ) : (
          <div className="space-y-3">
            {admins.map((a) => (
              <div key={a._id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">{a.email}</div>
                    <div className="text-xs text-slate-400">Ник: {a.nickname}</div>
                  </div>

                  {editingId === a._id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        className="input-field"
                        value={editingEmail}
                        onChange={(e) => setEditingEmail(e.target.value)}
                        placeholder="Новый email"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEmail}
                          disabled={saving}
                          className="btn-primary px-4"
                        >
                          {saving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                        <button onClick={cancelEdit} className="btn-secondary px-4">Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(a)} className="btn-secondary px-4">
                      Изменить почту
                    </button>
                  )}
                </div>
              </div>
            ))}

            {admins.length === 0 && (
              <div className="text-center py-8 text-slate-500">Админы не найдены</div>
            )}
          </div>
        )}
      </Card>

      <Card title="Создать админа" subtitle={`Укажи почту @${ADMIN_EMAIL_DOMAIN} и сид-фразу (24 слова). Ник будет равен части почты до @.`}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300">Email</label>
            <input
              className="input-field mt-1"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder={`admin@${ADMIN_EMAIL_DOMAIN}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300">Сид-фраза</label>
            <textarea
              className="input-field mt-1 min-h-[90px]"
              value={createSeedPhrase}
              onChange={(e) => setCreateSeedPhrase(e.target.value)}
              placeholder="Введите 24 слова через пробел"
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={createAdmin}
              disabled={creating}
              className="btn-primary px-6"
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

type PracticeTab = 'meditation' | 'quotes' | 'gratitude' | 'attendance';

function PracticeSection() {
  const [activeTab, setActiveTab] = useState<PracticeTab>('meditation');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('meditation')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'meditation'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          🧘 Медитация
        </button>
        <button
          onClick={() => setActiveTab('quotes')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'quotes'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          📜 Цитаты дня
        </button>
        <button
          onClick={() => setActiveTab('gratitude')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'gratitude'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          💙 Благодарность
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'attendance'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
          📅 Посещаемость
        </button>
      </div>

      {activeTab === 'meditation' && <MeditationSettings />}
      {activeTab === 'quotes' && <QuotesManagement />}
      {activeTab === 'gratitude' && <GratitudeAudit />}
      {activeTab === 'attendance' && <AttendanceAudit />}
    </div>
  );
}

function MeditationSettings() {
  const [loading, setLoading] = useState(true);
  const [serverNow, setServerNow] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchMeditationSettings();
      setServerNow(res?.serverNow ?? null);
      setSchedule(Array.isArray(res?.schedule) ? res.schedule : []);
      setStats(res?.stats ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveSession = async (idx: number) => {
    const session = schedule[idx];
    if (!session) return;
    try {
      const persisted = schedule.filter((s, i) => Boolean(s?.id) && i !== idx);
      const payload = [...persisted, session];
      const res = await updateMeditationSettings(payload);
      alert(res?.message || 'Сохранено');
      setServerNow(res?.serverNow ?? null);
      const savedSchedule = Array.isArray(res?.schedule) ? res.schedule : payload;
      const drafts = schedule.filter((s, i) => !s?.id && i !== idx);
      const merged = [...savedSchedule, ...drafts].sort((a, b) => Number(a?.startsAt || 0) - Number(b?.startsAt || 0));
      setSchedule(merged);
    } catch (e) {
      alert('Ошибка сохранения');
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  const serverTimeStr = serverNow ? new Date(serverNow).toLocaleString() : '—';

  const toDatetimeLocal = (ms: number) => {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const upsert = (idx: number, patch: any) => {
    setSchedule((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const getSessionWeText = (session: any) => {
    return getTranslatedField(session?.weText, session?.translations, 'weText');
  };

  const setSessionWeText = (idx: number, nextValue: string) => {
    const session = schedule[idx];
    const localized = updateLocalizedTextValue(getSessionWeText(session), activeLanguage, nextValue);
    upsert(idx, {
      weText: localized.ru,
      translations: {
        ...(session?.translations && typeof session.translations === 'object' ? session.translations : {}),
        en: {
          ...(session?.translations?.en && typeof session.translations.en === 'object' ? session.translations.en : {}),
          weText: localized.en,
        },
      },
    });
  };

  const addSession = () => {
    const startsAt = Date.now() + 10 * 60 * 1000;
    setSchedule((prev) => [
      ...prev,
      {
        startsAt,
        phase1Min: 1,
        phase2Min: 1,
        rounds: 3,
        weText: '',
        translations: {
          en: {
            weText: '',
          },
        },
      },
    ]);
  };

  const removeSession = (idx: number) => {
    setSchedule((prev) => prev.filter((_, i) => i !== idx));
  };

  const summary = stats?.summary || {};
  const recentSessions = Array.isArray(stats?.recentSessions) ? stats.recentSessions : [];
  const topParticipants = Array.isArray(stats?.topParticipants) ? stats.topParticipants : [];

  return (
    <div className="space-y-6">
      <Card title="Коллективная медитация" subtitle="Расписание сессий (дата/время, длительность фаз, круги, текст)">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-sm text-slate-400">Время сервера</div>
              <div className="mt-1 text-white font-semibold">{serverTimeStr}</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-sm text-slate-400">Награда за одну медитацию</div>
              <div className="mt-1 text-white font-semibold">30 сияния</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">Завершённых медитаций</div>
              <div className="mt-2 text-2xl font-bold text-white">{summary.completedSessions || 0}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">Всего входов</div>
              <div className="mt-2 text-2xl font-bold text-white">{summary.totalParticipations || 0}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">Получили награду</div>
              <div className="mt-2 text-2xl font-bold text-white">{summary.rewardedParticipations || 0}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">Выдано сияния</div>
              <div className="mt-2 text-2xl font-bold text-white">{formatAdminSc(summary.totalRadianceGranted || 0)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">Среднее входов на медитацию</div>
              <div className="mt-2 text-2xl font-bold text-white">{summary.averageParticipantsPerSession || 0}</div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-4">
                <div className="text-lg font-semibold text-white">Последние медитации</div>
                <div className="text-sm text-slate-400">Короткий список последних завершённых сессий.</div>
              </div>
              {recentSessions.length === 0 ? (
                <div className="text-sm text-slate-500">Пока нет завершённых медитаций.</div>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map((session: any, idx: number) => (
                    <div key={session.sessionId || idx} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">
                          {session.startsAt ? new Date(session.startsAt).toLocaleString() : 'Без даты'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {session.durationMinutes || 0} мин
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
                        <div className="text-slate-300">Вошло: <span className="text-white font-semibold">{session.participantsCount || 0}</span></div>
                        <div className="text-slate-300">Награда: <span className="text-white font-semibold">{session.rewardedCount || 0}</span></div>
                        <div className="text-slate-300">Сияние: <span className="text-white font-semibold">{formatAdminSc(session.totalRadiance || 0)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-4">
                <div className="text-lg font-semibold text-white">Кто чаще участвует</div>
                <div className="text-sm text-slate-400">Люди с самым большим числом входов в коллективную медитацию.</div>
              </div>
              {topParticipants.length === 0 ? (
                <div className="text-sm text-slate-500">Пока нет данных по участникам.</div>
              ) : (
                <div className="space-y-3">
                  {topParticipants.map((participant: any, idx: number) => (
                    <div key={participant.userId || idx} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{participant.nickname || 'Без имени'}</div>
                          <div className="text-xs text-slate-500">{participant.email || 'Без почты'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-cyan-300">{participant.meditations || 0} медитаций</div>
                          <div className="text-xs text-slate-500">{formatAdminSc(participant.radiance || 0)} сияния</div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Последний вход: {participant.lastJoinedAt ? new Date(participant.lastJoinedAt).toLocaleString() : 'Нет данных'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={addSession} className="btn-secondary">
              <Plus size={18} />
              Добавить сессию
            </button>
          </div>

          <div className="space-y-4">
            {schedule.map((s, idx) => {
              const isPersisted = Boolean(s.id);
              const canEdit = !isPersisted;
              return (
                <div key={s.id || idx} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-white/80 text-sm font-semibold">Сессия {idx + 1}</div>
                    <button onClick={() => removeSession(idx)} className="btn-secondary">
                      <Trash2 size={18} />
                      Удалить
                    </button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-4">
                    <div className="space-y-2 lg:col-span-2">
                      <label className="text-sm text-slate-400">Дата и время начала</label>
                      <input
                        type="datetime-local"
                        className="input-field"
                        value={toDatetimeLocal(Number(s.startsAt) || 0)}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const ms = e.target.value ? new Date(e.target.value).getTime() : 0;
                          upsert(idx, { startsAt: ms });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Фаза 1 (мин)</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="input-field"
                        value={s.phase1Min ?? 1}
                        disabled={!canEdit}
                        onChange={(e) => upsert(idx, { phase1Min: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Фаза 2 (мин)</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="input-field"
                        value={s.phase2Min ?? 1}
                        disabled={!canEdit}
                        onChange={(e) => upsert(idx, { phase2Min: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-4">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Круги</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="input-field"
                        value={s.rounds ?? 3}
                        disabled={!canEdit}
                        onChange={(e) => upsert(idx, { rounds: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="text-sm text-slate-400">Текст (we)</label>
                      <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
                    </div>
                    <textarea
                      className="input-field min-h-[200px] font-mono text-sm leading-relaxed"
                      value={getLocalizedTextValue(getSessionWeText(s), activeLanguage)}
                      onChange={(e) => setSessionWeText(idx, e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => handleSaveSession(idx)} className="btn-primary">
                      <Save size={18} />
                      {isPersisted ? 'Пересохранить' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              );
            })}
            {schedule.length === 0 && (
              <div className="text-center text-slate-500 py-6">Сессий нет. Нажми «Добавить сессию».</div>
            )}
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={18} />
          Обновить
        </button>
      </div>
    </div>
  );
}

function QuotesManagement() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');
  const [form, setForm] = useState({ text: '', author: '', enText: '', enAuthor: '' });

  const weekDays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchQuotes();
      setQuotes(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getQuoteForDay = (dayIndex: number) => {
    return quotes.find(q => q.dayOfWeek === dayIndex);
  };

  const handleEdit = (dayIndex: number) => {
    const quote = getQuoteForDay(dayIndex);
    if (quote) {
      const text = getTranslatedField(quote.text, quote.translations, 'text');
      const author = getTranslatedField(quote.author || '', quote.translations, 'author');
      setForm({
        text: text.ru,
        author: author.ru,
        enText: text.en,
        enAuthor: author.en,
      });
    } else {
      setForm({ text: '', author: '', enText: '', enAuthor: '' });
    }
    setEditingDay(dayIndex);
  };

  const handleSave = async () => {
    if (!form.text.trim()) {
      alert('Введите текст цитаты');
      return;
    }

    if (editingDay === null) {
      return;
    }
    try {
      const existingQuote = getQuoteForDay(editingDay!);
      const payload = {
        text: form.text,
        author: form.author || '',
        translations: {
          en: {
            text: form.enText || '',
            author: form.enAuthor || '',
          },
        },
      };
      if (existingQuote) {
        await updateQuote(existingQuote._id, payload);
      } else {
        await createQuote({ ...payload, dayOfWeek: editingDay });
      }
      setEditingDay(null);
      setForm({ text: '', author: '', enText: '', enAuthor: '' });
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить цитату?')) return;
    try {
      await deleteQuote(id);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const getTodayIndex = () => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  };

  const todayIndex = getTodayIndex();

  return (
    <div className="space-y-6">
      <Card title="Цитаты дня" subtitle="Заполните цитаты на каждый день недели. Система автоматически покажет нужную.">
        <div className="mb-4 flex justify-end">
          <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
        </div>
        {loading ? (
          <div className="text-center py-10 text-slate-500">Загрузка...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {weekDays.map((dayName, index) => {
              const quote = getQuoteForDay(index);
              const isToday = index === todayIndex;
              const localizedText = quote ? getLocalizedTextValue(getTranslatedField(quote.text, quote.translations, 'text'), activeLanguage) : '';
              const localizedAuthor = quote ? getLocalizedTextValue(getTranslatedField(quote.author || '', quote.translations, 'author'), activeLanguage) : '';
              return (
                <div
                  key={index}
                  className={`p-4 rounded-xl border transition-all ${isToday
                    ? 'bg-cyan-500/10 border-cyan-500/30'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`font-medium ${isToday ? 'text-cyan-400' : 'text-white'}`}>
                      {dayName} {isToday && '🔥'}
                    </span>
                    <button
                      onClick={() => handleEdit(index)}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      {quote ? 'Изменить' : 'Добавить'}
                    </button>
                  </div>
                  {quote ? (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-200 line-clamp-3">{localizedText}</p>
                      {localizedAuthor && <p className="text-xs text-slate-500">— {localizedAuthor}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 italic">Цитата не добавлена</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AnimatePresence>
        {editingDay !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setEditingDay(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold text-white">
                {getQuoteForDay(editingDay) ? `Изменить цитату — ${weekDays[editingDay]}` : `Добавить цитату — ${weekDays[editingDay]}`}
              </h3>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Текст цитаты</label>
                  <textarea
                    className="input-field mt-1 min-h-[100px]"
                    value={activeLanguage === 'ru' ? form.text : form.enText}
                    onChange={(e) => setForm({
                      ...form,
                      ...(activeLanguage === 'ru' ? { text: e.target.value } : { enText: e.target.value }),
                    })}
                    placeholder="Введите цитату..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Автор (необязательно)</label>
                  <input
                    className="input-field mt-1"
                    value={activeLanguage === 'ru' ? form.author : form.enAuthor}
                    onChange={(e) => setForm({
                      ...form,
                      ...(activeLanguage === 'ru' ? { author: e.target.value } : { enAuthor: e.target.value }),
                    })}
                    placeholder="Автор цитаты"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setEditingDay(null)} className="btn-secondary flex-1">Отмена</button>
                  <button onClick={handleSave} className="btn-primary flex-1">Сохранить</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GratitudeAudit() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPracticeGratitudeAudit({ page: 1, limit: 50 });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card title="Аудит благодарности" subtitle="Только факт выполнения: пользователь, день и количество заполненных слотов. Текст благодарностей не хранится.">
      {loading ? (
        <div className="text-center py-10 text-slate-500">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500">Записей пока нет.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-400">
                <th className="py-3 pr-4">Пользователь</th>
                <th className="py-3 pr-4">День</th>
                <th className="py-3 pr-4">Слоты</th>
                <th className="py-3 pr-4">Индексы</th>
                <th className="py-3">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b border-white/5 text-slate-200">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.user?.nickname || row.user?._id || '—'}</div>
                    <div className="text-xs text-slate-500">{row.user?.email || ''}</div>
                  </td>
                  <td className="py-3 pr-4">{row.dayKey || '—'}</td>
                  <td className="py-3 pr-4">{row.completedCount || 0} / 3</td>
                  <td className="py-3 pr-4">{Array.isArray(row.completedIndexes) ? row.completedIndexes.join(', ') : '—'}</td>
                  <td className="py-3">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AttendanceAudit() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPracticeAttendanceAudit({ page: 1, limit: 50 });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card title="Аудит посещаемости" subtitle="Серверное состояние 30-дневного цикла, отмеченные дни, пропуски и мини-квесты.">
      {loading ? (
        <div className="text-center py-10 text-slate-500">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500">Записей пока нет.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-400">
                <th className="py-3 pr-4">Пользователь</th>
                <th className="py-3 pr-4">Старт цикла</th>
                <th className="py-3 pr-4">Текущий день</th>
                <th className="py-3 pr-4">Отмечено</th>
                <th className="py-3 pr-4">Пропущено</th>
                <th className="py-3 pr-4">Квест</th>
                <th className="py-3">Последний визит</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b border-white/5 text-slate-200 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.user?.nickname || row.user?._id || '—'}</div>
                    <div className="text-xs text-slate-500">{row.user?.email || ''}</div>
                  </td>
                  <td className="py-3 pr-4">{row.cycleStartDay || '—'}</td>
                  <td className="py-3 pr-4">День {row.currentDayIndex || 1}</td>
                  <td className="py-3 pr-4">{Array.isArray(row.claimedDays) && row.claimedDays.length ? row.claimedDays.join(', ') : '—'}</td>
                  <td className="py-3 pr-4">{Array.isArray(row.missedDays) && row.missedDays.length ? row.missedDays.join(', ') : '—'}</td>
                  <td className="py-3 pr-4">{Array.isArray(row.questDoneDays) && row.questDoneDays.length ? row.questDoneDays.join(', ') : '—'}</td>
                  <td className="py-3">{row.lastSeenServerDay || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const sections: Section[] = [
  { key: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { key: 'control', label: 'Центр контроля', icon: MonitorSmartphone },
  { key: 'cms', label: 'Системные операции', icon: BarChart3 },
  { key: 'users', label: 'Пользователи', icon: Users },
  { key: 'admins', label: 'Админы', icon: Shield },
  { key: 'content', label: 'Контент', icon: FileText },
  { key: 'rules', label: 'Правила', icon: FileText },
  { key: 'about', label: 'О нас', icon: Heart },
  { key: 'roadmap', label: 'Дорожная карта', icon: BarChart3 },
  { key: 'appeals', label: 'Апелляции', icon: MessageSquare },
  { key: 'wishes', label: 'Желания', icon: Star },
  { key: 'bridges', label: 'Мосты', icon: Globe },
  { key: 'battles', label: 'Бои', icon: Swords },
  { key: 'referrals', label: 'Рефералы', icon: Users },
  { key: 'entities', label: 'Сущности', icon: Coins },
  { key: 'ads', label: 'Реклама', icon: DollarSign },
  { key: 'night_guardians', label: 'Ночные Стражи', icon: Shield },
  { key: 'crystal', label: 'Кристалл', icon: Gem },
  { key: 'fortune', label: 'Фортуна', icon: Dices },
  { key: 'practice', label: 'Практика', icon: Sparkles },
  { key: 'feedback', label: 'Обратная связь', icon: MessageSquare },
  { key: 'settings', label: 'Настройки', icon: Settings },
  { key: 'logs', label: 'Логи', icon: Shield },
];

type RulesTab = 'battle' | 'site' | 'communication';

function RulesPagesSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<RulesTab>('battle');
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');

  const [rulesBattle, setRulesBattle] = useState(emptyLocalizedText());
  const [rulesSite, setRulesSite] = useState(emptyLocalizedText());
  const [rulesCommunication, setRulesCommunication] = useState(emptyLocalizedText());
  const rulesInputPlaceholder = [
    'Можно вставить обычный текст или HTML.',
    '',
    '<h2>Заголовок</h2>',
    '<p>Первый абзац или пункт правил.</p>',
  ].join('\n');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPagesContent();
      setRulesBattle(normalizeLocalizedText(data?.rules?.battle));
      setRulesSite(normalizeLocalizedText(data?.rules?.site));
      setRulesCommunication(normalizeLocalizedText(data?.rules?.communication));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updatePagesContent({
        rules: {
          battle: rulesBattle,
          site: rulesSite,
          communication: rulesCommunication,
        },
      });
      alert('Сохранено');
    } catch (e) {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  const activeValue = activeTab === 'battle'
    ? getLocalizedTextValue(rulesBattle, activeLanguage)
    : activeTab === 'site'
      ? getLocalizedTextValue(rulesSite, activeLanguage)
      : getLocalizedTextValue(rulesCommunication, activeLanguage);

  const handleActiveValueChange = (nextValue: string) => {
    if (activeTab === 'battle') {
      setRulesBattle((prev) => updateLocalizedTextValue(prev, activeLanguage, nextValue));
      return;
    }
    if (activeTab === 'site') {
      setRulesSite((prev) => updateLocalizedTextValue(prev, activeLanguage, nextValue));
      return;
    }
    setRulesCommunication((prev) => updateLocalizedTextValue(prev, activeLanguage, nextValue));
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-white/10 pb-4 flex-wrap">
        {[
          { id: 'battle', label: 'Правила боя', icon: Swords },
          { id: 'site', label: 'Правила сайта', icon: Globe },
          { id: 'communication', label: 'Правила общения', icon: MessageSquare },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as RulesTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-400">
              {activeTab === 'battle'
                ? 'Текст или HTML для страницы «Правила боя»'
                : activeTab === 'site'
                  ? 'Текст или HTML для страницы «Правила сайта»'
                  : 'Текст или HTML для страницы «Правила общения»'}
            </div>
            <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
          </div>
          <textarea
            className="input-field min-h-[400px] font-mono text-sm leading-relaxed"
            value={activeValue}
            onChange={(e) => handleActiveValueChange(e.target.value)}
            placeholder={rulesInputPlaceholder}
            spellCheck={false}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <button onClick={load} className="btn-secondary" disabled={saving}>
          <RefreshCw size={18} />
          Обновить
        </button>
        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save size={18} />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function AboutPageSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');
  const [about, setAbout] = useState(emptyLocalizedText());
  const aboutInputPlaceholder = [
    'Можно вставить обычный текст или HTML.',
    '',
    '<h2>О проекте</h2>',
    '<p>Первый абзац страницы.</p>',
  ].join('\n');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPagesContent();
      setAbout(normalizeLocalizedText(data?.about));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updatePagesContent({ about });
      alert('Сохранено');
    } catch (e) {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-2">
          <div className="text-sm text-slate-400">Текст или HTML для страницы «О нас»</div>
          <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
          <textarea
            className="input-field min-h-[500px] font-mono text-sm leading-relaxed"
            value={getLocalizedTextValue(about, activeLanguage)}
            onChange={(e) => setAbout((prev) => updateLocalizedTextValue(prev, activeLanguage, e.target.value))}
            placeholder={aboutInputPlaceholder}
            spellCheck={false}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <button onClick={load} className="btn-secondary" disabled={saving}>
          <RefreshCw size={18} />
          Обновить
        </button>
        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save size={18} />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function RoadmapPageSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');
  const [roadmapHtml, setRoadmapHtml] = useState(emptyLocalizedText());

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPagesContent();
      setRoadmapHtml(normalizeLocalizedText(data?.roadmapHtml));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updatePagesContent({ roadmapHtml });
      alert('Сохранено');
    } catch (e) {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-2">
          <div className="text-sm text-slate-400">HTML страницы «Дорожная карта»</div>
          <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
          <textarea
            className="input-field min-h-[500px] font-mono text-sm leading-relaxed"
            value={getLocalizedTextValue(roadmapHtml, activeLanguage)}
            onChange={(e) => setRoadmapHtml((prev) => updateLocalizedTextValue(prev, activeLanguage, e.target.value))}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <button onClick={load} className="btn-secondary" disabled={saving}>
          <RefreshCw size={18} />
          Обновить
        </button>
        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save size={18} />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function FeedbackSection() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState<'new' | 'archived'>('new');
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchFeedbackMessages({ status, limit: 200 });
      setItems(Array.isArray(data?.messages) ? data.messages : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status]);

  const archive = async (id: string) => {
    setArchivingId(id);
    try {
      await archiveFeedbackMessage(id);
      setItems((prev) => prev.filter((m) => String(m._id) !== String(id)));
      if (selected && String(selected._id) === String(id)) {
        setSelected((prev: any) => (prev ? { ...prev, status: 'archived' } : prev));
      }
    } catch (e) {
      alert('Ошибка архивации');
    } finally {
      setArchivingId(null);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteFeedbackMessage(id);
      setItems((prev) => prev.filter((m) => String(m._id) !== String(id)));
      if (selected && String(selected._id) === String(id)) {
        setSelected(null);
      }
    } catch (e) {
      alert('Ошибка удаления');
    } finally {
      setDeletingId(null);
    }
  };

  const sendReply = async () => {
    if (!selected?._id) return;
    if (!replyMessage.trim()) {
      alert('Введите текст ответа');
      return;
    }
    setReplyingId(String(selected._id));
    try {
      await replyFeedbackMessage(String(selected._id), {
        subject: replySubject.trim() || undefined,
        message: replyMessage.trim(),
      });
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((m) => (
        String(m._id) === String(selected._id) ? { ...m, repliedAt: nowIso } : m
      )));
      setSelected((prev: any) => (prev ? { ...prev, repliedAt: nowIso } : prev));
      setReplyMessage('');
      alert('Ответ отправлен');
    } catch (e) {
      alert('Ошибка отправки ответа');
    } finally {
      setReplyingId(null);
    }
  };

  const openMessage = (message: any) => {
    setSelected(message);
    setReplySubject('');
    setReplyMessage('');
  };

  const closeMessage = () => {
    setSelected(null);
    setReplySubject('');
    setReplyMessage('');
  };

  const getPreview = (message: string) => {
    const text = String(message || '').replace(/\s+/g, ' ').trim();
    if (text.length <= 160) return text;
    return `${text.slice(0, 160)}...`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-white">Обратная связь</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatus('new')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${status === 'new'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-white border border-white/10'
              }`}
          >
            Новые
          </button>
          <button
            onClick={() => setStatus('archived')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${status === 'archived'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-white border border-white/10'
              }`}
          >
            Архив
          </button>
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={18} />
            Обновить
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-slate-500">Загрузка...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-slate-500">Сообщений нет</div>
        ) : (
          items.map((m) => (
            <div key={m._id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="text-white font-semibold truncate">{m.name || '—'}</div>
                  <div className="text-sm text-slate-400 break-all">{m.email}</div>
                  <div className="text-xs text-slate-500">{m.createdAt ? new Date(m.createdAt).toLocaleString('ru-RU') : ''}</div>
                  {m.repliedAt && (
                    <div className="text-xs text-emerald-400">
                      Ответ отправлен: {new Date(m.repliedAt).toLocaleString('ru-RU')}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {status === 'new' && (
                    <button
                      onClick={() => archive(m._id)}
                      disabled={archivingId === m._id}
                      className="btn-secondary"
                    >
                      {archivingId === m._id ? '...' : 'В архив'}
                    </button>
                  )}
                  <button
                    onClick={() => openMessage(m)}
                    className="btn-primary"
                  >
                    Открыть
                  </button>
                  <button
                    onClick={() => remove(m._id)}
                    disabled={deletingId === m._id}
                    className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                  >
                    {deletingId === m._id ? 'Удаление...' : 'Удалить'}
                  </button>
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-300 leading-relaxed">
                {getPreview(m.message)}
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={closeMessage}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-white/10 p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-white">Письмо</h3>
                <button onClick={closeMessage} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-1 mb-4">
                <div className="text-white font-semibold">{selected.name || '—'}</div>
                <div className="text-sm text-slate-400 break-all">{selected.email}</div>
                <div className="text-xs text-slate-500">
                  {selected.createdAt ? new Date(selected.createdAt).toLocaleString('ru-RU') : ''}
                </div>
                {selected.repliedAt && (
                  <div className="text-xs text-emerald-400">
                    Ответ отправлен: {new Date(selected.repliedAt).toLocaleString('ru-RU')}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 whitespace-pre-wrap text-sm text-slate-100 leading-relaxed mb-5">
                {selected.message}
              </div>

              <div className="grid gap-3 mb-5">
                <input
                  className="input-field"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  placeholder="Тема ответа (необязательно)"
                />
                <textarea
                  className="input-field min-h-[120px]"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Текст ответа"
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                {status === 'new' && (
                  <button
                    onClick={() => archive(selected._id)}
                    disabled={archivingId === selected._id}
                    className="btn-secondary"
                  >
                    {archivingId === selected._id ? '...' : 'В архив'}
                  </button>
                )}
                <button
                  onClick={sendReply}
                  disabled={replyingId === selected._id}
                  className="btn-primary"
                >
                  {replyingId === selected._id ? 'Отправка...' : 'Ответить'}
                </button>
                <button
                  onClick={() => remove(selected._id)}
                  disabled={deletingId === selected._id}
                  className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                >
                  {deletingId === selected._id ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Components ---

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'error' | 'info' }) => {
  const variants = {
    default: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    error: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-bold uppercase tracking-wider ${variants[variant]}`}>
      {children}
    </span>
  );
};

const Card = ({ children, title, subtitle, className = "" }: { children: React.ReactNode, title?: string, subtitle?: string, className?: string }) => (
  <div className={`card-premium ${className}`}>
    {(title || subtitle) && (
      <div className="mb-6">
        {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>
    )}
    {children}
  </div>
);

function getDarknessColor(score: number) {
  if (score >= 85) return '#ef4444';
  if (score >= 65) return '#f97316';
  if (score >= 45) return '#f59e0b';
  if (score >= 25) return '#22c55e';
  return '#38bdf8';
}

function getScaleColor(score: number) {
  if (score >= 75) return '#22c55e';
  if (score >= 55) return '#84cc16';
  if (score >= 35) return '#f59e0b';
  return '#ef4444';
}

function DarknessMeter({ score, stage, horizon }: { score: number; stage: string; horizon: string }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const color = getDarknessColor(safeScore);
  const angle = `${safeScore * 3.6}deg`;

  return (
    <div className="relative mx-auto h-64 w-64">
      <div
        className="absolute inset-3 rounded-full blur-2xl opacity-70"
        style={{ background: `radial-gradient(circle, ${color}55 0%, transparent 70%)` }}
      />
      <div
        className="relative flex h-full w-full items-center justify-center rounded-full border border-white/10"
        style={{
          background: `conic-gradient(${color} ${angle}, rgba(255,255,255,0.07) ${angle}, rgba(255,255,255,0.07) 360deg)`,
        }}
      >
        <div className="flex h-[73%] w-[73%] flex-col items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-center shadow-2xl">
          <div className="text-label text-slate-500">Угроза</div>
          <div className="mt-2 text-5xl font-black text-white">{safeScore}</div>
          <div className="mt-1 text-sm font-semibold" style={{ color }}>{stage}</div>
          <div className="mt-2 text-xs text-slate-400">Окно</div>
          <div className="text-sm text-white">{horizon}</div>
        </div>
      </div>
    </div>
  );
}

function MoodScaleBar({ title, score, text }: { title: string; score: number; text: string }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const color = getScaleColor(safeScore);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-slate-400">{text}</div>
        </div>
        <div className="text-lg font-bold text-white">{safeScore}</div>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${safeScore}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
        />
      </div>
    </div>
  );
}

// --- Sections ---

function DashboardSection({ stats }: { stats: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [adStats, setAdStats] = useState({ revenue: 0, impressions: 0 });
  const [complaintsToday, setComplaintsToday] = useState(0);
  const [recentBattles, setRecentBattles] = useState<any[]>([]);

  useEffect(() => {
    fetchLogs({ limit: 5 }).then(data => setLogs(data.logs || []));
    // Fetch ad stats
    api.get('/ads/stats').then(res => {
      setAdStats({
        revenue: (res.data?.totals?.potentialRevenue ?? res.data?.totals?.revenue ?? 0),
        impressions: res.data?.totals?.impressions || 0
      });
    }).catch(() => { });
    // Fetch battles
    api.get('/admin/battles').then(res => {
      setRecentBattles((res.data?.battles || res.data || []).slice(0, 3));
    }).catch(() => { });
  }, []);

  const chartData = stats?.activityChart || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-blue-500/20 p-2 text-blue-400">
              <Users size={20} />
            </div>
            <Badge variant="success">+12%</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Всего пользователей</p>
            <h4 className="text-2xl font-bold text-white">{stats?.totalUsers || 0}</h4>
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-emerald-500/20 p-2 text-emerald-400">
              <DollarSign size={20} />
            </div>
            <Badge variant="success">30 дней</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Реклама (Потенциал / Показы)</p>
            <div className="flex items-baseline gap-2">
              <h4 className="text-2xl font-bold text-white">${adStats.revenue.toFixed(2)}</h4>
              <span className="text-sm text-slate-500">/ {adStats.impressions}</span>
            </div>
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-amber-500/20 p-2 text-amber-400">
              <MessageSquare size={20} />
            </div>
            <Badge variant="warning">{stats?.activeAppeals || 0} новых</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Активные апелляции</p>
            <h4 className="text-2xl font-bold text-white">{stats?.activeAppeals || 0}</h4>
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-rose-500/20 p-2 text-rose-400">
              <Zap size={20} />
            </div>
            <Badge variant="error">Мрак активен</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Новых юзеров сегодня</p>
            <h4 className="text-2xl font-bold text-white">{stats?.newUsersToday || 0}</h4>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Последние бои с Мраком" subtitle="История защиты Древа" className="lg:col-span-1">
          <div className="space-y-3">
            {recentBattles.length === 0 ? (
              <p className="text-center py-4 text-slate-500">Нет данных</p>
            ) : recentBattles.map((battle: any) => (
              <div key={battle._id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div>
                  <p className="text-sm font-medium text-white">{new Date(battle.createdAt).toLocaleDateString('ru')}</p>
                  <p className="text-xs text-slate-500">{battle.participants?.length || 0} участников</p>
                </div>
                <Badge variant={battle.result === 'victory' ? 'success' : 'error'}>
                  {battle.result === 'victory' ? 'Победа' : 'Поражение'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Активность сообщества" subtitle="Динамика регистраций и начисления K">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="users" stroke="#3b82f6" fillOpacity={1} fill="url(#colorUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Последние действия" subtitle="Лог модерации и системных событий">
          <div className="space-y-4">
            {logs.length === 0 ? (
              <p className="text-center py-10 text-slate-500">Нет записей</p>
            ) : logs.map((log) => (
              <div key={log._id} className="flex items-center gap-4 border-b border-white/5 pb-4 last:border-0 last:pb-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-slate-400">
                  <Shield size={18} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-white">
                    {log.user?.nickname || 'Система'}: {log.action}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ControlCenterSection() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [recentRuns, setRecentRuns] = useState<any[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [showAllApprovals, setShowAllApprovals] = useState(false);

  const loadData = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const [overviewData, approvalsData, jobsData] = await Promise.all([
        fetchSystemOverviewV2(),
        fetchApprovalsV2({
          status: showAllApprovals ? undefined : 'pending',
          limit: 30,
        }),
        fetchSystemJobsV2({ limit: 20 }),
      ]);
      setOverview(overviewData || null);
      setApprovals(Array.isArray(approvalsData?.approvals) ? approvalsData.approvals : []);
      setJobs(Array.isArray(jobsData?.jobs) ? jobsData.jobs : []);
      setRecentRuns(Array.isArray(jobsData?.recentRuns) ? jobsData.recentRuns : []);
    } catch (e) {
      console.error(e);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [showAllApprovals]);

  const handleApprove = async (id: string) => {
    const note = prompt('Комментарий к подтверждению (необязательно):', 'Подтверждено');
    setActionBusyId(`approve-${id}`);
    try {
      const res = await approveApprovalV2(id, String(note || '').trim());
      alert(`Операция ${res.operationId || id}: статус ${res.status}`);
      await loadData({ silent: true });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось подтвердить операцию');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Причина отклонения:');
    if (!reason || !reason.trim()) return;
    setActionBusyId(`reject-${id}`);
    try {
      const res = await rejectApprovalV2(id, reason.trim());
      alert(`Операция ${res.operationId || id}: отклонена`);
      await loadData({ silent: true });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось отклонить операцию');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleBackupRequest = async () => {
    const approvalPayload = requestApprovalPayload({
      title: 'Создание полной резервной копии',
      impactPreviewDefault: 'Будет создан архив со снимком данных проекта.',
      confirmationPhrase: 'CONFIRM system.backup.create',
    });
    if (!approvalPayload) return;

    setActionBusyId('job-backup_full');
    try {
      const res = await runSystemJobV2('backup_full', approvalPayload);
      if (res?.requiresApproval) {
        alert(`Заявка создана. Номер операции: ${res.operationId}`);
      } else {
        alert(`Задача запущена. Статус: ${res.status}`);
      }
      await loadData({ silent: true });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось создать задачу резервной копии');
    } finally {
      setActionBusyId(null);
    }
  };

  const incidents = overview?.incidents || {};
  const criticalActions = Array.isArray(overview?.criticalActions) ? overview.criticalActions : [];

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col justify-between">
          <div className="text-sm text-slate-400">Ожидают подтверждения</div>
          <div className="mt-3 text-3xl font-bold text-amber-400">{incidents.pendingApprovals || 0}</div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="text-sm text-slate-400">Проваленные операции</div>
          <div className="mt-3 text-3xl font-bold text-rose-400">{incidents.failedApprovals || 0}</div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="text-sm text-slate-400">Критичные действия (10)</div>
          <div className="mt-3 text-3xl font-bold text-white">{criticalActions.length}</div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="text-sm text-slate-400">Последнее обновление</div>
          <div className="mt-3 text-sm font-medium text-white">
            {overview?.generatedAt ? new Date(overview.generatedAt).toLocaleString('ru-RU') : '—'}
          </div>
        </Card>
      </div>

      <Card title="Срочно" subtitle="Очередь опасных действий, которые ждут решения">
        <div className="mb-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={showAllApprovals}
              onChange={(e) => setShowAllApprovals(e.target.checked)}
            />
            Показывать не только ожидающие
          </label>
          <button
            onClick={() => loadData({ silent: true })}
            className="btn-secondary"
          >
            <RefreshCw size={16} />
            Обновить
          </button>
        </div>

        <div className="space-y-3">
          {approvals.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              В очереди подтверждений нет операций.
            </div>
          ) : approvals.map((approval: any) => (
            <div key={approval.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={approval.status === 'pending' ? 'warning' : approval.status === 'executed' ? 'success' : approval.status === 'failed' ? 'error' : 'info'}>
                      {formatAdminUiStatus(String(approval.status || ''))}
                    </Badge>
                  </div>
                  <div className="text-sm text-white">{approval.actionType}</div>
                  <div className="text-xs text-slate-400">Причина: {approval.reason || '—'}</div>
                  <div className="text-xs text-slate-500">
                    {approval.createdAt ? new Date(approval.createdAt).toLocaleString('ru-RU') : '—'}
                  </div>
                  <div className="text-xs text-slate-500">
                    Подтверждений: {Array.isArray(approval.approvals) ? approval.approvals.length : 0}
                  </div>
                </div>

                {approval.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(approval.id)}
                      disabled={actionBusyId === `approve-${approval.id}` || actionBusyId === `reject-${approval.id}`}
                      className="btn-primary"
                    >
                      Подтвердить
                    </button>
                    <button
                      onClick={() => handleReject(approval.id)}
                      disabled={actionBusyId === `approve-${approval.id}` || actionBusyId === `reject-${approval.id}`}
                      className="btn-secondary text-rose-300"
                    >
                      Отклонить
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Системные задачи" subtitle="Запуск и контроль обслуживания проекта">
          <div className="space-y-3">
            {jobs.map((job: any) => (
              <div key={job.jobName} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{job.title || job.jobName}</div>
                    <div className="text-xs text-slate-500">{job.jobName}</div>
                  </div>
                  {job.jobName === 'backup_full' ? (
                    <button
                      onClick={handleBackupRequest}
                      disabled={actionBusyId === 'job-backup_full'}
                      className="btn-secondary"
                    >
                      Запросить запуск
                    </button>
                  ) : (
                    <Badge variant={job.dangerous ? 'warning' : 'info'}>
                      {job.dangerous ? 'Опасная' : 'Обычная'}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            {jobs.length === 0 && (
              <div className="text-sm text-slate-500">Системные задачи не найдены.</div>
            )}
          </div>
        </Card>

        <Card title="Последние запуски задач" subtitle="Состояние резервных копий и сервисных операций">
          <div className="space-y-3">
            {recentRuns.length === 0 ? (
              <div className="text-sm text-slate-500">Запусков пока нет.</div>
            ) : recentRuns.map((run: any) => (
              <div key={run.runId} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-white">{run.jobName}</div>
                    <div className="text-xs text-slate-500">
                      {run.createdAt ? new Date(run.createdAt).toLocaleString('ru-RU') : '—'}
                    </div>
                  </div>
                  <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'warning'}>
                    {formatAdminUiStatus(String(run.status || ''))}
                  </Badge>
                </div>
                {run.result?.backupId && (
                  <div className="mt-2 text-xs text-slate-400">
                    ID копии: {run.result.backupId}
                  </div>
                )}
                {run.error && (
                  <div className="mt-2 text-xs text-rose-400">
                    {run.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Последние критичные действия" subtitle="Кто и что менял в системе">
        <div className="space-y-3">
          {criticalActions.length === 0 ? (
            <div className="text-sm text-slate-500">Критичных действий пока нет.</div>
          ) : criticalActions.map((item: any) => (
            <div key={item._id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-white">{item.actionType}</div>
                <div className="text-xs text-slate-500">
                  {item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '—'}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {item.actor?.nickname || item.actor?.email || 'Система'}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function UsersSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const USERS_PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [filters, setFilters] = useState({
    status: '',
    minLives: '',
    minStars: '',
    showFilters: false
  });
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState<{
    sc: number;
    lives: number;
    stars: number;
    lumens: number;
    complaintChips: number;
    status: 'active' | 'banned' | 'pending';
  }>({ sc: 0, lives: 0, stars: 0, lumens: 0, complaintChips: 0, status: 'active' });
  const [showChats, setShowChats] = useState<any>(null);
  const [userChats, setUserChats] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const formatAdminSc = (value: any) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(n);
  };
  const [detailUser, setDetailUser] = useState<any>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params: any = { search, page, limit: USERS_PAGE_SIZE };
      if (filters.status) params.status = filters.status;
      if (filters.minLives) params.minLives = filters.minLives;
      if (filters.minStars) params.minStars = filters.minStars;
      const data = await fetchUsers(params);
      setUsers(data.users || []);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
      setTotalUsers(Number(data.totalUsers) || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [search, filters.status, filters.minLives, filters.minStars, page]);

  useEffect(() => {
    if (editingUser) {
      setEditForm({
        sc: editingUser.sc,
        lives: editingUser.lives,
        stars: editingUser.stars,
        lumens: editingUser.lumens,
        complaintChips: editingUser.complaintChips || 3,
        status: editingUser.status
      });
    }
  }, [editingUser]);

  const handleUpdate = async () => {
    if (!editingUser) return;
    try {
      const resourceFields = ['sc', 'lives', 'stars', 'lumens', 'complaintChips'];
      const resourceUpdates: Record<string, number> = {};
      for (const field of resourceFields) {
        const nextValue = Number((editForm as any)[field]);
        const prevValue = Number((editingUser as any)[field]);
        if (Number.isFinite(nextValue) && nextValue !== prevValue) {
          resourceUpdates[field] = nextValue;
        }
      }

      const hasStatusChange = String(editForm.status || '') !== String(editingUser.status || '');
      const hasResourceChange = Object.keys(resourceUpdates).length > 0;

      if (!hasStatusChange && !hasResourceChange) {
        setEditingUser(null);
        return;
      }

      const statusApproval = hasStatusChange ? requestApprovalPayload({
        title: `Смена статуса пользователя ${editingUser.nickname}`,
        impactPreviewDefault: `Статус пользователя изменится на "${editForm.status}".`,
        confirmationPhrase: 'CONFIRM users.status.update',
      }) : null;
      if (hasStatusChange && !statusApproval) return;

      const resourcesApproval = hasResourceChange ? requestApprovalPayload({
        title: `Корректировка ресурсов пользователя ${editingUser.nickname}`,
        impactPreviewDefault: `Будут изменены поля: ${Object.keys(resourceUpdates).join(', ')}`,
        confirmationPhrase: 'CONFIRM users.resources.adjust',
      }) : null;
      if (hasResourceChange && !resourcesApproval) return;

      const operationIds: string[] = [];

      if (hasStatusChange && statusApproval) {
        const res = await createApprovalV2({
          actionType: 'users.status.update',
          ...statusApproval,
          payload: {
            userId: editingUser._id,
            status: editForm.status,
          },
        });
        if (res?.operationId) operationIds.push(res.operationId);
      }

      if (hasResourceChange && resourcesApproval) {
        const res = await createApprovalV2({
          actionType: 'users.resources.adjust',
          ...resourcesApproval,
          payload: {
            userId: editingUser._id,
            updates: resourceUpdates,
          },
        });
        if (res?.operationId) operationIds.push(res.operationId);
      }

      alert(operationIds.length
        ? `Созданы заявки:\n${operationIds.join('\n')}`
        : 'Заявка создана');

      await loadUsers();
      setEditingUser(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Ошибка создания заявок');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    try {
      await deleteUser(id);
      loadUsers();
    } catch (e) {
      alert('Ошибка удаления');
    }
  };

  const handleResetPassword = async (id: string) => {
    const newPass = prompt('Введите новый пароль:');
    if (!newPass) return;
    try {
      await resetUserPassword(id, { newPassword: newPass });
      alert('Пароль успешно сброшен');
    } catch (e) {
      alert('Ошибка сброса пароля');
    }
  };

  const handleViewChats = async (user: any) => {
    setShowChats(user);
    setChatLoading(true);
    try {
      const data = await fetchUserChats(user._id);
      setUserChats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setChatLoading(false);
    }
  };

  const handleBanToggle = async (user: any) => {
    const newStatus = user.status === 'banned' ? 'active' : 'banned';
    const approval = requestApprovalPayload({
      title: `Смена статуса пользователя ${user.nickname}`,
      impactPreviewDefault: `Статус пользователя изменится на "${newStatus}".`,
      confirmationPhrase: 'CONFIRM users.status.update',
    });
    if (!approval) return;

    try {
      const res = await createApprovalV2({
        actionType: 'users.status.update',
        ...approval,
        payload: {
          userId: user._id,
          status: newStatus,
        },
      });
      alert(`Заявка создана. Номер операции: ${res.operationId}`);
      loadUsers();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Ошибка создания заявки');
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Никнейм', 'Email', 'Статус', 'K', 'Жизни', 'Звёзды', 'Люмены'];
    const rows = users.map(u => [u._id, u.nickname, u.email, u.status, u.sc, u.lives, u.stars, u.lumens]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users_export.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Поиск по нику или email..."
            className="input-field pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilters(f => ({ ...f, showFilters: !f.showFilters }))}
            className={`btn-secondary ${filters.showFilters ? 'ring-2 ring-blue-500' : ''}`}
          >
            <Filter size={18} />
            Фильтры
          </button>
          <button onClick={exportCSV} className="btn-secondary">
            <Save size={18} />
            CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {filters.showFilters && (
        <Card className="p-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="text-xs text-slate-400">Статус</label>
              <select
                className="input-field mt-1"
                value={filters.status}
                onChange={(e) => {
                  setFilters(f => ({ ...f, status: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="">Все</option>
                <option value="active">Активен</option>
                <option value="banned">Забанен</option>
                <option value="pending">Ожидание</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Мин. жизней</label>
              <input
                type="number"
                className="input-field mt-1"
                placeholder="0"
                value={filters.minLives}
                onChange={(e) => {
                  setFilters(f => ({ ...f, minLives: e.target.value }));
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Мин. звёзд</label>
              <input
                type="number"
                step="0.1"
                className="input-field mt-1"
                placeholder="0"
                value={filters.minStars}
                onChange={(e) => {
                  setFilters(f => ({ ...f, minStars: e.target.value }));
                  setPage(1);
                }}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({ status: '', minLives: '', minStars: '', showFilters: true });
                  setPage(1);
                }}
                className="btn-secondary w-full"
              >
                Сбросить
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div>
          {totalUsers > 0
            ? `Показаны ${(page - 1) * USERS_PAGE_SIZE + 1}–${Math.min(page * USERS_PAGE_SIZE, totalUsers)} из ${totalUsers}`
            : 'Нет пользователей'}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
          >
            Назад
          </button>
          <span>
            Страница {page} из {Math.max(1, totalPages)}
          </span>
          <button
            className="btn-secondary"
            onClick={() => setPage((prev) => Math.min(Math.max(1, totalPages), prev + 1))}
            disabled={page >= totalPages}
          >
            Вперёд
          </button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Пользователь</th>
                <th className="px-6 py-4 font-semibold">Статус</th>
                <th className="px-6 py-4 font-semibold">Ресурсы</th>
                <th className="px-6 py-4 font-semibold">Статистика</th>
                <th className="px-6 py-4 font-semibold text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Загрузка...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Пользователи не найдены</td>
                </tr>
              ) : users.filter(u => u).map((user) => (
                <tr key={user._id} className="group hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-bold">
                        {user.nickname?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-white">{user.nickname}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={user.status === 'active' ? 'success' : user.status === 'banned' ? 'error' : 'warning'}>
                      {user.status === 'active' ? 'Активен' : user.status === 'banned' ? 'Забанен' : 'Ожидание'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-1 text-amber-400">
                        <Coins size={14} />
                        <span className="font-medium">{formatAdminSc(user.sc)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-rose-400">
                        <Heart size={14} />
                        <span className="font-medium">{user.lives}</span>
                      </div>
                      <div className="flex items-center gap-1 text-blue-400">
                        <Zap size={14} />
                        <span className="font-medium">{user.lumens}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-yellow-400">
                      <Star size={14} />
                      <span className="font-medium">{user.stars}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleViewChats(user)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                        title="История чатов"
                      >
                        <MessageSquare size={18} />
                      </button>
                      <button
                        onClick={() => handleResetPassword(user._id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-amber-500/20 hover:text-amber-400 transition-colors"
                        title="Сбросить пароль"
                      >
                        <RefreshCw size={18} />
                      </button>
                      <button
                        onClick={() => setEditingUser(user)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                        title="Редактировать"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(user._id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                        title="Удалить"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingUser(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg glass-panel p-8"
            >
              <h3 className="text-xl font-bold text-white mb-6">Редактирование: {editingUser.nickname}</h3>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">K (Валюта)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editForm.sc}
                    onChange={(e) => setEditForm({ ...editForm, sc: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Жизни</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editForm.lives}
                    onChange={(e) => setEditForm({ ...editForm, lives: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Звезды</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={editForm.stars}
                    onChange={(e) => setEditForm({ ...editForm, stars: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Люмены</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editForm.lumens}
                    onChange={(e) => setEditForm({ ...editForm, lumens: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm text-slate-400">Статус</label>
                  <select
                    className="input-field"
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'banned' | 'pending' })}
                  >
                    <option value="active">Активен</option>
                    <option value="banned">Забанен</option>
                    <option value="pending">Ожидание</option>
                  </select>
                </div>
              </div>
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setEditingUser(null)}
                  className="btn-secondary flex-1"
                >
                  Отмена
                </button>
                <button
                  onClick={handleUpdate}
                  className="btn-primary flex-1"
                >
                  <Save size={18} />
                  Сохранить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chats Modal */}
      <AnimatePresence>
        {showChats && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChats(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 max-h-[80vh] flex flex-col"
            >
              <h3 className="text-xl font-bold text-white mb-6">История сообщений: {showChats.nickname}</h3>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {chatLoading ? (
                  <p className="text-center py-10 text-slate-500">Загрузка...</p>
                ) : userChats.length === 0 ? (
                  <p className="text-center py-10 text-slate-500">Сообщений не найдено</p>
                ) : userChats.map((msg: any) => (
                  <div key={msg._id} className="rounded-xl bg-white/5 p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-blue-400">{msg.sender?.nickname || 'Неизвестный'}</span>
                      <span className="text-caption text-slate-500">{new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-300">{msg.content}</p>
                    {msg.translatedContent && (
                      <p className="text-xs text-slate-500 mt-2 italic border-t border-white/5 pt-2">
                        Перевод: {msg.translatedContent}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowChats(null)}
                className="btn-secondary mt-6 w-full"
              >
                Закрыть
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function toPlainText(value: string) {
  const html = String(value || '');
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

function normalizePostContent(value: string) {
  const raw = String(value || '');
  if (!raw.includes('<')) return raw;
  const div = document.createElement('div');
  div.innerHTML = raw;
  return String(div.innerText || div.textContent || '');
}

function getPostId(post: any) {
  const id = post?._id || post?.id || '';
  return String(id || '');
}

function getPostPreview(content: string, max = 220) {
  const plain = toPlainText(content || '');
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max)}...`;
}

function AdminNewsMediaPreview({
  mediaUrl,
  title,
  compact = false,
}: {
  mediaUrl?: string | null;
  title?: string;
  compact?: boolean;
}) {
  const media = describeNewsMedia(mediaUrl);
  if (!media) return null;

  if (media.kind === 'image') {
    return (
      <img
        src={media.url}
        alt={title || ''}
        className={compact ? 'h-full w-full object-cover' : 'max-h-40 w-full object-cover rounded'}
      />
    );
  }

  if (media.kind === 'video') {
    return (
      <video
        src={media.url}
        className={compact ? 'h-full w-full object-cover' : 'max-h-40 w-full rounded'}
        controls={!compact}
        muted={compact}
        playsInline
        preload="metadata"
      />
    );
  }

  if (media.kind === 'embed' && media.embedUrl) {
    if (compact && media.thumbnailUrl) {
      return <img src={media.thumbnailUrl} alt={title || media.providerLabel} className="h-full w-full object-cover" />;
    }

    if (compact) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 px-2 text-center">
          <div className="text-label text-slate-500">Видео</div>
          <div className="mt-1 text-xs font-semibold text-slate-200">{media.providerLabel}</div>
        </div>
      );
    }

    return (
      <div className="aspect-video w-full overflow-hidden rounded">
        <iframe
          src={media.embedUrl}
          title={title || media.providerLabel}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <div className={compact ? 'flex h-full w-full flex-col items-center justify-center bg-slate-900 px-2 text-center' : 'rounded bg-slate-950/70 p-4'}>
      <div className="text-label text-slate-500">{media.providerLabel}</div>
      <div className="mt-1 break-all text-xs font-semibold text-slate-200">{media.hostLabel}</div>
      {!compact && (
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-white/5"
        >
          Открыть ссылку
        </a>
      )}
    </div>
  );
}

function ContentSection() {

  const [posts, setPosts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');
  const [postForm, setPostForm] = useState<{
    title: string;
    content: string;
    enTitle: string;
    enContent: string;
    mediaUrl: string;
    status: 'draft' | 'scheduled' | 'published';
    scheduledAt: string;
  }>({ title: '', content: '', enTitle: '', enContent: '', mediaUrl: '', status: 'draft', scheduledAt: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [p] = await Promise.all([fetchPosts()]);
      setPosts(Array.isArray(p) ? p : []);
    } catch (e) {
      console.error(e);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = useMemo(() => {
    if (!statusFilter) return posts;
    return posts.filter(p => p.status === statusFilter);
  }, [posts, statusFilter]);

  useEffect(() => {
    loadData();
  }, []);

  const formatLocalDateTimeInput = (value: any) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handlePublish = async (id: string) => {
    if (!id) {
      alert('Не найден ID поста для публикации');
      return;
    }
    try {
      await publishPost(id);
      loadData();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка публикации');
    }
  };

  const handleCreate = async () => {
    try {
      const cleanContent = normalizePostContent(postForm.content);
      const cleanEnContent = normalizePostContent(postForm.enContent);
      if (!postForm.title.trim()) {
        alert('Введите заголовок');
        return;
      }
      if (!cleanContent.trim()) {
        alert('Введите содержание поста');
        return;
      }
      const payload = {
        title: postForm.title,
        content: cleanContent,
        mediaUrl: postForm.mediaUrl,
        status: postForm.status,
        scheduledAt: postForm.scheduledAt,
        translations: {
          en: {
            title: postForm.enTitle.trim(),
            content: cleanEnContent,
          },
        },
      };
      if (editingPost) {
        await updatePost(editingPost._id, payload);
      } else {
        await apiCreatePost(payload);
      }
      loadData();
      setShowCreate(false);
      setEditingPost(null);
      setPostForm({ title: '', content: '', enTitle: '', enContent: '', mediaUrl: '', status: 'draft', scheduledAt: '' });
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка сохранения');
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!id) {
      alert('Не найден ID поста для удаления');
      return false;
    }
    if (!confirm('Удалить этот пост?')) return false;
    try {
      await deletePost(id);
      loadData();
      return true;
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка удаления');
      return false;
    }
  };

  const handleEditPost = (post: any) => {
    const title = getTranslatedField(post.title, post.translations, 'title');
    const content = getTranslatedField(normalizePostContent(post.content || ''), post.translations, 'content');
    setEditingPost(post);
    setPostForm({
      title: title.ru,
      content: content.ru,
      enTitle: title.en,
      enContent: normalizePostContent(content.en),
      mediaUrl: post.mediaUrl || '',
      status: post.status,
      scheduledAt: formatLocalDateTimeInput(post.scheduledAt)
    });
    setShowCreate(true);
  };

  const handleDeleteFromModal = async () => {
    const postId = getPostId(editingPost);
    if (!postId) return;
    const deleted = await handleDeletePost(postId);
    if (!deleted) return;
    setShowCreate(false);
    setEditingPost(null);
    setPostForm({ title: '', content: '', enTitle: '', enContent: '', mediaUrl: '', status: 'draft', scheduledAt: '' });
  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Управление контентом</h2>
        <div className="flex items-center gap-3">
          <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={18} />
            Создать пост
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: '', label: 'Все' },
          { value: 'draft', label: 'Черновики' },
          { value: 'scheduled', label: 'Запланированы' },
          { value: 'published', label: 'Опубликованы' }
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === tab.value
              ? 'bg-blue-600 text-white'
              : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="text-center py-10 text-slate-500">Загрузка...</div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-10 text-slate-500">Постов пока нет</div>
          ) : filteredPosts.map((post) => {
            const postId = getPostId(post);
            const localizedTitle = getLocalizedTextValue(getTranslatedField(post.title, post.translations, 'title'), activeLanguage);
            const localizedContent = getLocalizedTextValue(getTranslatedField(post.content || '', post.translations, 'content'), activeLanguage);
            const preview = getPostPreview(localizedContent || '');
            return (
            <Card key={postId || `${post.title}_${post.createdAt}`} className="group">
              <div className="flex gap-4">
                {post.mediaUrl && (
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                    <AdminNewsMediaPreview mediaUrl={post.mediaUrl} title={localizedTitle} compact />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-white break-words">{localizedTitle}</h4>
                      <p className="mt-1 text-sm text-slate-400 break-all">{preview}</p>
                    </div>
                    <Badge variant={post.status === 'published' ? 'success' : post.status === 'scheduled' ? 'info' : 'warning'}>
                      {post.status === 'published' ? 'Опубликован' : post.status === 'scheduled' ? 'Запланирован' : 'Черновик'}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>

                    </div>
                    <div className="flex gap-2">
                      {post.status !== 'published' && (
                        <button
                          onClick={() => handlePublish(postId)}
                          disabled={!postId}
                          className="text-xs font-semibold text-emerald-400 hover:underline"
                        >
                          Опубликовать
                        </button>
                      )}
                      <button
                        onClick={() => handleEditPost(post)}
                        disabled={!postId}
                        className="text-xs font-semibold text-slate-400 hover:text-white"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDeletePost(postId)}
                        disabled={!postId}
                        className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )})}
        </div>
        <div className="space-y-6">

          <Card title="Статистика контента">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Всего постов</span>
                <span className="font-semibold text-white">{posts.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Опубликовано</span>
                <span className="font-semibold text-emerald-400">{posts.filter(p => p.status === 'published').length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">В черновиках</span>
                <span className="font-semibold text-amber-400">{posts.filter(p => p.status === 'draft').length}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowCreate(false);
                setEditingPost(null);
                setPostForm({ title: '', content: '', enTitle: '', enContent: '', mediaUrl: '', status: 'draft', scheduledAt: '' });
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-xl font-bold text-white mb-6">
                {editingPost ? 'Редактировать пост' : 'Создать новый пост'}
              </h3>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Заголовок</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Введите заголовок..."
                    value={activeLanguage === 'ru' ? postForm.title : postForm.enTitle}
                    onChange={(e) => setPostForm({
                      ...postForm,
                      ...(activeLanguage === 'ru' ? { title: e.target.value } : { enTitle: e.target.value }),
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Содержание</label>
                  <textarea
                    className="input-field min-h-[180px]"
                    placeholder="Текст поста..."
                    value={activeLanguage === 'ru' ? postForm.content : postForm.enContent}
                    onChange={(e) => setPostForm({
                      ...postForm,
                      ...(activeLanguage === 'ru' ? { content: e.target.value } : { enContent: e.target.value }),
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Медиа</label>
                  <input
                    type="file"
                    className="hidden"
                    id="post-media-upload"
                    onChange={async (e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        const formData = new FormData();
                        formData.append('file', file);
                        setUploadingMedia(true);
                        try {
                          const res = await api.post('/api/upload', formData, {
                            headers: {
                              'Content-Type': 'multipart/form-data',
                            },
                          });
                          const url = res.data.url.startsWith('http') ? res.data.url : `${api.defaults.baseURL}${res.data.url}`;
                          setPostForm({ ...postForm, mediaUrl: url });
                        } catch (err) {
                          alert('Ошибка загрузки файла');
                        } finally {
                          setUploadingMedia(false);
                        }
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="input-field flex-1"
                      placeholder="https://... или загрузите файл"
                      value={postForm.mediaUrl}
                      onChange={(e) => setPostForm({ ...postForm, mediaUrl: e.target.value })}
                    />
                    <label htmlFor="post-media-upload" className="btn-secondary cursor-pointer">
                      {uploadingMedia ? 'Загрузка...' : 'Файл'}
                    </label>
                  </div>
                  <div className="text-xs text-slate-500">
                    Поддерживаются картинки, прямые видеофайлы и ссылки на YouTube, Vimeo, RuTube, Dailymotion и Google Drive.
                  </div>
                  {postForm.mediaUrl && (
                    <div className="mt-2 p-2 border border-white/10 rounded-lg bg-black/20">
                      <AdminNewsMediaPreview
                        mediaUrl={postForm.mediaUrl}
                        title={activeLanguage === 'ru' ? postForm.title : (postForm.enTitle || postForm.title)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-400">Статус</label>
                    <select
                      className="input-field"
                      value={postForm.status}
                      onChange={(e) => setPostForm({ ...postForm, status: e.target.value as any })}
                    >
                      <option value="draft">Черновик</option>
                      <option value="scheduled">Запланирован</option>
                      <option value="published">Опубликован</option>
                    </select>
                  </div>
                  {postForm.status === 'scheduled' && (
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Дата публикации</label>
                      <input
                        type="datetime-local"
                        className="input-field"
                        value={postForm.scheduledAt}
                        onChange={(e) => setPostForm({ ...postForm, scheduledAt: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setEditingPost(null);
                    setPostForm({ title: '', content: '', enTitle: '', enContent: '', mediaUrl: '', status: 'draft', scheduledAt: '' });
                  }}
                  className="btn-secondary flex-1"
                >
                  Отмена
                </button>
                {editingPost && (
                  <button
                    onClick={handleDeleteFromModal}
                    className="btn-secondary flex-1 !border-rose-500/40 !text-rose-300 hover:!bg-rose-500/10"
                  >
                    Удалить пост
                  </button>
                )}
                <button
                  onClick={handleCreate}
                  className="btn-primary flex-1"
                >
                  <Save size={18} />
                  {editingPost ? 'Сохранить изменения' : 'Создать пост'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


    </div >
  );
}

function AppealsSection() {
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChats, setShowChats] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    showFilters: false
  });

  const loadAppeals = async () => {
    setLoading(true);
    try {
      const data = await fetchAppeals();
      setAppeals(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppeals();
  }, []);

  const getAppealComplainant = (appeal: any) => appeal?.complainant || appeal?.userId || null;
  const getAppealStatusMeta = (status: string) => {
    if (status === 'pending') return { label: 'В ожидании', variant: 'warning' as const };
    if (status === 'resolved') return { label: 'Подтвержден', variant: 'error' as const };
    if (status === 'rejected') return { label: 'Отменен', variant: 'success' as const };
    return { label: status || 'Неизвестно', variant: 'default' as const };
  };

  const filteredAppeals = useMemo(() => {
    return appeals.filter(a => {
      if (filters.status && a.status !== filters.status) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const complainant = getAppealComplainant(a);
        if (!complainant?.nickname?.toLowerCase().includes(s) && !a.reason?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [appeals, filters]);

  const handleAction = async (id: string, action: 'confirm' | 'decline') => {
    try {
      await handleAppeal(id, action);
      loadAppeals();
    } catch (e) {
      alert('Ошибка');
    }
  };

  const handleViewChat = async (appeal: any) => {
    setShowChats(appeal);
    // Используем messagesSnapshot из Appeal, а не загружаем чаты
    if (appeal.messagesSnapshot && appeal.messagesSnapshot.length > 0) {
      setChatMessages(appeal.messagesSnapshot);
    } else {
      setChatMessages([]);
    }
    setChatLoading(false);
  };

  const exportCSV = () => {
    const headers = ['ID', 'Пользователь', 'Статус', 'Причина', 'Дата'];
    const rows = filteredAppeals.map(a => {
      const complainant = getAppealComplainant(a);
      return [a._id, complainant?.nickname, a.status, a.reason?.replace(/,/g, ';'), new Date(a.createdAt).toLocaleDateString()];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'appeals_export.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Поиск по нику или причине..."
            className="input-field pl-10"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilters(f => ({ ...f, showFilters: !f.showFilters }))}
            className={`btn-secondary ${filters.showFilters ? 'ring-2 ring-blue-500' : ''}`}
          >
            <Filter size={18} />
            Фильтры
          </button>
          <button onClick={exportCSV} className="btn-secondary">
            <Save size={18} />
            CSV
          </button>
          <button onClick={loadAppeals} className="btn-secondary">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {filters.showFilters && (
        <Card className="p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs text-slate-400">Статус</label>
              <select
                className="input-field mt-1"
                value={filters.status}
                onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
              >
                <option value="">Все</option>
                <option value="pending">Новая</option>
                <option value="resolved">Подтверждён</option>
                <option value="rejected">Отменён</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ status: '', search: '', showFilters: true })}
                className="btn-secondary w-full"
              >
                Сбросить
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6">
        {loading ? (
          <div className="text-center py-10 text-slate-500">Загрузка...</div>
        ) : filteredAppeals.length === 0 ? (
          <div className="text-center py-10 text-slate-500">Нет активных апелляций</div>
        ) : filteredAppeals.map((appeal) => (
          <Card key={appeal._id} className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              {(() => {
                const complainant = getAppealComplainant(appeal);
                const statusMeta = getAppealStatusMeta(appeal.status);
                return (
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold">
                  {complainant?.nickname?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="font-semibold text-white">{complainant?.nickname || 'Неизвестный'}</div>
                  <div className="text-xs text-slate-500">{new Date(appeal.createdAt).toLocaleString()}</div>
                </div>
                <Badge variant={statusMeta.variant}>
                  {statusMeta.label}
                </Badge>
              </div>
                );
              })()}
              <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">
                <p className="font-semibold text-white mb-2">Причина апелляции:</p>
                {appeal.reason}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 md:w-64">
              <button
                onClick={() => handleViewChat(appeal)}
                className="btn-secondary"
              >
                <MessageSquare size={18} />
                Смотреть чат
              </button>
              {appeal.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleAction(appeal._id, 'confirm')}
                    className="btn-primary bg-rose-600 hover:bg-rose-500"
                  >
                    <CheckCircle2 size={18} />
                    Подтвердить бан
                  </button>
                  <button
                    onClick={() => handleAction(appeal._id, 'decline')}
                    className="btn-secondary border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    <XCircle size={18} />
                    Отменить бан
                  </button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Chat Modal */}
      <AnimatePresence>
        {showChats && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChats(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-6 max-h-[85vh] flex flex-col"
            >
              {/* Заголовок с информацией о жалобе */}
              <div className="mb-4 pb-4 border-b border-white/10">
                <h3 className="text-xl font-bold text-white mb-3">Просмотр переписки</h3>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Жалобщик:</span>
                    <span className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-medium">
                      {showChats.complainant?.nickname || showChats.complainant?.slice?.(-6) || 'Неизвестный'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Обвиняемый:</span>
                    <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-medium">
                      {showChats.againstUser?.nickname || showChats.againstUser?.slice?.(-6) || 'Неизвестный'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Причина:</span>
                    <span className="text-white">{showChats.reason || 'Не указана'}</span>
                  </div>
                  {showChats.appealText && (
                    <div className="mt-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="text-xs text-blue-400 mb-1">Текст оспаривания от обвиняемого:</div>
                      <div className="text-sm text-white italic">"{showChats.appealText}"</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Сообщения чата */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
                {chatLoading ? (
                  <p className="text-center py-10 text-slate-500">Загрузка...</p>
                ) : chatMessages.length === 0 ? (
                  <p className="text-center py-10 text-slate-500">Сообщений не найдено</p>
                ) : chatMessages.map((msg: any, idx: number) => {
                  // Определяем принадлежность сообщения
                  const isComplainant = msg.sender === (showChats.complainant?._id || showChats.complainant);
                  const isAccused = msg.sender === (showChats.againstUser?._id || showChats.againstUser);

                  return (
                    <div
                      key={idx}
                      className={`flex ${isComplainant ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 ${isComplainant
                          ? 'bg-rose-500/20 border border-rose-500/30 rounded-bl-sm'
                          : 'bg-amber-500/20 border border-amber-500/30 rounded-br-sm'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-caption font-bold ${isComplainant ? 'text-rose-400' : 'text-amber-400'}`}>
                            {isComplainant ? '👤 Жалобщик' : isAccused ? '⚠️ Обвиняемый' : 'Участник'}
                          </span>
                          <span className="text-caption text-slate-500">
                            {new Date(msg.sentAt || msg.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-white">{msg.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Кнопка закрытия */}
              <button
                onClick={() => setShowChats(null)}
                className="btn-secondary w-full"
              >
                Закрыть
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


function WishesSection() {
  const [wishes, setWishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [editingWish, setEditingWish] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    text: '',
    status: 'open',
    supportCount: 0,
    supportSc: 0
  });

  const loadWishes = async () => {
    setLoading(true);
    try {
      const data = await fetchWishes({ status: statusFilter });
      setWishes(data.wishes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWishes();
  }, [statusFilter]);

  useEffect(() => {
    if (editingWish) {
      setEditForm({
        text: editingWish.text,
        status: editingWish.status,
        supportCount: editingWish.supportCount,
        supportSc: editingWish.supportSc
      });
    }
  }, [editingWish]);

  const handleUpdate = async () => {
    if (!editingWish) return;
    try {
      await updateWish(editingWish._id, editForm);
      loadWishes();
      setEditingWish(null);
    } catch (e) {
      alert('Ошибка обновления');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить это желание навсегда?')) return;
    try {
      await deleteWish(id);
      loadWishes();
    } catch (e) {
      alert('Ошибка удаления');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Управление желаниями</h2>
        <div className="flex gap-2">
          <select
            className="input-field w-48"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Все статусы</option>
            <option value="open">Открыто</option>
            <option value="supported">Поддержано</option>
            <option value="pending">В процессе</option>
            <option value="fulfilled">Исполнено</option>
            <option value="archived">Архив</option>
          </select>
          <button onClick={loadWishes} className="btn-secondary">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Автор</th>
                <th className="px-6 py-4 font-semibold">Исполнитель</th>
                <th className="px-6 py-4 font-semibold">Текст желания</th>
                <th className="px-6 py-4 font-semibold">Статус</th>
                <th className="px-6 py-4 font-semibold">Поддержка</th>
                <th className="px-6 py-4 font-semibold text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Загрузка...</td>
                </tr>
              ) : wishes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Желания не найдены</td>
                </tr>
              ) : wishes.map((wish) => (
                <tr key={wish._id} className="group hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{wish.author?.nickname || 'Удален'}</div>
                    <div className="text-xs text-slate-500">{wish.author?.email || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {wish.executor ? (
                      <>
                        <div className="font-medium text-blue-400">{wish.executor.nickname}</div>
                        <div className="text-caption text-slate-500">{wish.executor.email}</div>
                      </>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 max-w-xs">
                    <p className="line-clamp-2 text-slate-300 italic">"{wish.text}"</p>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={
                      wish.status === 'fulfilled' ? 'success' :
                        wish.status === 'pending' ? 'warning' :
                          wish.status === 'open' ? 'info' : 'default'
                    }>
                      {wish.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-rose-400 text-xs">
                        <Heart size={12} /> {wish.supportCount}
                      </div>
                      <div className="flex items-center gap-1 text-amber-400 text-xs">
                        <Coins size={12} /> {formatAdminSc(wish.supportSc)} K
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingWish(wish)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(wish._id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingWish && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingWish(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg glass-panel p-8"
            >
              <h3 className="text-xl font-bold text-white mb-6">Редактирование желания</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Текст желания</label>
                  <textarea
                    className="input-field min-h-[120px] resize-none"
                    value={editForm.text}
                    onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-400">Статус</label>
                    <select
                      className="input-field"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option value="open">Открыто</option>
                      <option value="supported">Поддержано</option>
                      <option value="pending">В процессе</option>
                      <option value="fulfilled">Исполнено</option>
                      <option value="archived">Архив</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-slate-400">Поддержка (K)</label>
                    <input
                      type="number"
                      className="input-field"
                      value={editForm.supportSc}
                      onChange={(e) => setEditForm({ ...editForm, supportSc: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setEditingWish(null)}
                  className="btn-secondary flex-1"
                >
                  Отмена
                </button>
                <button
                  onClick={handleUpdate}
                  className="btn-primary flex-1"
                >
                  <Save size={18} />
                  Сохранить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsSection() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'economy' | 'system'>('economy');

  const loadData = async () => {
    setLoading(true);
    try {
      const s = await fetchSettings();
      setSettings(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveEconomy = async () => {
    try {
      const payload = {
        SC_PER_HOUR_CHAT: settings?.SC_PER_HOUR_CHAT,
        CHAT_MINUTES_PER_DAY_CAP: settings?.CHAT_MINUTES_PER_DAY_CAP,
        INITIAL_LIVES: settings?.INITIAL_LIVES,
        SC_APPEAL_COMPENSATION: settings?.SC_APPEAL_COMPENSATION,
      };
      await updateSettings(payload);
      alert('Настройки экономики сохранены');
    } catch (e) {
      alert('Ошибка сохранения');
    }
  };

  const handleBackup = async () => {
    if (!confirm('Создать заявку на резервную копию?')) return;
    const approval = requestApprovalPayload({
      title: 'Создание полной резервной копии',
      impactPreviewDefault: 'Будет создан архив резервной копии данных проекта.',
      confirmationPhrase: 'CONFIRM system.backup.create',
    });
    if (!approval) return;

    try {
      const res = await createBackup(approval);
      alert(
        res?.operationId
          ? `Заявка создана. Номер операции: ${res.operationId}`
          : (res?.message || 'Операция отправлена')
      );
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Ошибка создания заявки');
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-white/10 pb-4 flex-wrap">
        {[
          { id: 'economy', label: 'Экономика', icon: Coins },
          { id: 'system', label: 'Система', icon: Shield },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>


      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'economy' && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Экономика и K">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">K за час общения</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.SC_PER_HOUR_CHAT || ''}
                        onChange={(e) => setSettings({ ...settings, SC_PER_HOUR_CHAT: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Компенсация за апелляцию</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.SC_APPEAL_COMPENSATION || ''}
                        onChange={(e) => setSettings({ ...settings, SC_APPEAL_COMPENSATION: e.target.value })}
                      />
                    </div>
                  </div>
                </Card>
                <Card title="Лимиты и Жизни">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Начальное кол-во жизней</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.INITIAL_LIVES || ''}
                        onChange={(e) => setSettings({ ...settings, INITIAL_LIVES: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Лимит минут чата в сутки</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.CHAT_MINUTES_PER_DAY_CAP || ''}
                        onChange={(e) => setSettings({ ...settings, CHAT_MINUTES_PER_DAY_CAP: e.target.value })}
                      />
                    </div>
                  </div>
                </Card>
              </div>
              <div className="flex justify-end">
                <button onClick={handleSaveEconomy} className="btn-primary">
                  <Save size={18} />
                  Сохранить экономику
                </button>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="space-y-6">
              <Card title="Обслуживание системы">
                <div className="grid gap-6 sm:grid-cols-1">
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                    <h4 className="font-bold text-white mb-2">Резервное копирование</h4>
                    <p className="text-sm text-slate-400 mb-6">Создать полный дамп базы данных. Файл будет сохранен на сервере.</p>
                    <button onClick={handleBackup} className="btn-secondary w-full">
                      <RefreshCw size={18} />
                      Создать резервную копию
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LogsSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionTypeFilter, setActionTypeFilter] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogsV2({
        page,
        limit: 50,
        actionType: actionTypeFilter || undefined,
      });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setTotalPages(Math.max(1, Number(data?.pagination?.totalPages) || 1));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, actionTypeFilter]);

  const openLogDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const data = await fetchAuditLogByIdV2(id);
      setSelectedLog(data || null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось загрузить детали');
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Логи аудита</h2>
        <div className="flex items-center gap-2">
          <input
            className="input-field w-64"
            placeholder="Фильтр по действию"
            value={actionTypeFilter}
            onChange={(e) => {
              setPage(1);
              setActionTypeFilter(e.target.value);
            }}
          />
          <button onClick={() => loadLogs()} className="btn-secondary">
            <RefreshCw size={16} />
            Обновить
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="btn-secondary py-1 px-3 disabled:opacity-50"
          >
            Назад
          </button>
          <span className="flex items-center px-4 text-sm text-slate-400">
            Страница {page} из {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="btn-secondary py-1 px-3 disabled:opacity-50"
          >
            Вперед
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-xs font-bold uppercase tracking-wider text-slate-400">
              <th className="px-6 py-4">Дата</th>
              <th className="px-6 py-4">Модератор</th>
              <th className="px-6 py-4">Действие</th>
              <th className="px-6 py-4">Объект</th>
              <th className="px-6 py-4">Уровень</th>
              <th className="px-6 py-4">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm text-slate-300">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center">Загрузка...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center">Логов нет</td></tr>
            ) : logs.map((log) => (
              <tr key={log._id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className="text-white">{new Date(log.createdAt).toLocaleDateString()}</span>
                    <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-white">{log.actor?.nickname || log.actor?.email || 'Система'}</div>
                  <div className="text-xs text-slate-500">{log.actor?.email || '—'}</div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant="info">{log.actionType}</Badge>
                </td>
                <td className="px-6 py-4 text-xs text-slate-300">
                  <div>{log.entityType || '—'}</div>
                  <div className="text-slate-500">{log.entityId || '—'}</div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={log.severity === 'high' ? 'warning' : 'default'}>
                    {log.severity || 'normal'}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => openLogDetails(log._id)}
                    className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                  >
                    Показать детали
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Log Details Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLog(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Детали лога</h3>
                <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              {loadingDetails ? (
                <div className="py-10 text-center text-slate-400">Загрузка...</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">Время</p>
                      <p className="text-white font-mono">{new Date(selectedLog.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">IP Адрес</p>
                      <p className="text-white font-mono">{selectedLog.ip || '—'}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">Модератор</p>
                      <p className="text-white">{selectedLog.actor?.nickname || selectedLog.actor?.email || 'Система'}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">Действие</p>
                      <p className="text-emerald-400 font-medium">{selectedLog.actionType}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-2">Было до</p>
                      <pre className="text-xs text-amber-300 font-mono overflow-x-auto p-2 rounded bg-black/30">
                        {JSON.stringify(selectedLog.before, null, 2)}
                      </pre>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-2">Стало после</p>
                      <pre className="text-xs text-emerald-300 font-mono overflow-x-auto p-2 rounded bg-black/30">
                        {JSON.stringify(selectedLog.after, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-slate-400 mb-2">Мета-данные (детали)</p>
                    <pre className="text-xs text-blue-300 font-mono overflow-x-auto p-2 rounded bg-black/30">
                      {JSON.stringify(selectedLog.meta, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="btn-primary"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BridgesSection() {
  const [bridges, setBridges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBridges = async () => {
    try {
      const data = await api.get('/bridges');
      setBridges(data.data?.bridges || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBridges();
  }, []);

  const handleDelete = async (bridgeId: string) => {
    if (!confirm('Удалить этот мост?')) return;
    try {
      await api.delete(`/bridges/${bridgeId}`);
      loadBridges();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-slate-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Мосты Мира" subtitle="Активные межстрановые мосты">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Маршрут</th>
                <th className="pb-3 font-medium">Прогресс</th>
                <th className="pb-3 font-medium">Участников</th>
                <th className="pb-3 font-medium">Статус</th>
                <th className="pb-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bridges.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">Нет активных мостов</td></tr>
              ) : bridges.map((bridge: any) => (
                <tr key={bridge._id} className="text-sm">
                  <td className="py-3 text-white">{bridge.fromCountry} → {bridge.toCountry}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 max-w-[100px] rounded-full bg-slate-700">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${Math.min(100, (bridge.currentStones / bridge.requiredStones) * 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-400">{bridge.currentStones}/{bridge.requiredStones}</span>
                    </div>
                  </td>
                  <td className="py-3 text-slate-300">{bridge.contributors?.length || 0}</td>
                  <td className="py-3">
                    <Badge variant={bridge.status === 'completed' ? 'success' : 'info'}>
                      {bridge.status === 'completed' ? 'Завершён' : 'Строится'}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleDelete(bridge._id)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BattlesSection() {
  const [battles, setBattles] = useState<any[]>([]);
  const [suspiciousRows, setSuspiciousRows] = useState<any[]>([]);
  const [battleMood, setBattleMood] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspiciousLoading, setSuspiciousLoading] = useState(true);
  const [controlLoading, setControlLoading] = useState(true);
  const [moodLoading, setMoodLoading] = useState(true);
  const [activeBattle, setActiveBattle] = useState<any | null>(null);
  const [upcomingBattle, setUpcomingBattle] = useState<any | null>(null);
  const [scheduledBattles, setScheduledBattles] = useState<any[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [battleTab, setBattleTab] = useState<'control' | 'mood' | 'history'>('control');
  const [editingScheduledBattleId, setEditingScheduledBattleId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editDurationSeconds, setEditDurationSeconds] = useState('');

  const toDatetimeLocal = (value: any) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const editingScheduledBattle = useMemo(() => {
    if (!editingScheduledBattleId) return null;
    return scheduledBattles.find((battle) => String(battle?._id || '') === editingScheduledBattleId) || null;
  }, [editingScheduledBattleId, scheduledBattles]);

  const resetScheduleEditor = () => {
    setEditingScheduledBattleId(null);
    setEditStartsAt('');
    setEditDurationSeconds('');
  };

    const loadControl = async () => {
      setControlLoading(true);
      try {
        const data = await fetchBattleControl();
        setActiveBattle(data?.active || null);
        setUpcomingBattle(data?.upcoming || null);
        const fromServer = Array.isArray(data?.scheduledBattles) ? data.scheduledBattles : [];
        setScheduledBattles(fromServer);
      } catch (e) {
        console.error(e);
      } finally {
        setControlLoading(false);
      }
    };

  const loadBattles = async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/battles');
      setBattles(data.data?.battles || data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSuspicious = async () => {
    setSuspiciousLoading(true);
    try {
      const data = await fetchSuspiciousBattleUsers({ limit: 200 });
      setSuspiciousRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
      setSuspiciousRows([]);
    } finally {
      setSuspiciousLoading(false);
    }
  };

  const loadMood = async () => {
    setMoodLoading(true);
    try {
      const data = await fetchBattleMoodForecast();
      setBattleMood(data || null);
    } catch (e) {
      console.error(e);
      setBattleMood(null);
    } finally {
      setMoodLoading(false);
    }
  };

  useEffect(() => {
    loadBattles();
    loadControl();
    loadSuspicious();
    loadMood();
  }, []);

  useEffect(() => {
    if (editingScheduledBattle) {
      setEditStartsAt(toDatetimeLocal(editingScheduledBattle.startsAt));
      setEditDurationSeconds(editingScheduledBattle.durationSeconds ? String(editingScheduledBattle.durationSeconds) : '');
      return;
    }
    if (editingScheduledBattleId) {
      setEditingScheduledBattleId(null);
    }
    setEditStartsAt('');
    setEditDurationSeconds('');
  }, [editingScheduledBattle, editingScheduledBattleId]);

  const handleSchedule = async () => {
    if (!startsAt) {
      alert('Укажите время запуска');
      return;
    }
    if (scheduledBattles.length > 0) {
      alert('Сначала выбери запланированный бой в списке ниже для изменения, либо удали его.');
      return;
    }

    const startsAtIso = normalizeBattleStartsAtForApproval(startsAt);
    const approval = requestApprovalPayload({
      title: 'Запланировать новый бой',
      impactPreviewDefault: `Будет создан новый бой на ${new Date(startsAtIso || startsAt).toLocaleString('ru-RU')}${durationSeconds ? ` длительностью ${Number(durationSeconds)} сек.` : '.'}`,
      confirmationPhrase: 'CONFIRM game.battle.schedule',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const payload: any = { startsAt };
      payload.startsAt = startsAtIso;
      if (durationSeconds) payload.durationSeconds = Number(durationSeconds);
      const res = await createApprovalV2({
        actionType: 'game.battle.schedule',
        ...approval,
        payload,
      });
      alert(res?.operationId
        ? `Заявка создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на создание боя отправлена');
      setStartsAt('');
      setDurationSeconds('');
      await Promise.all([loadControl(), loadMood()]);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка планирования Мрака');
    } finally {
      setActionBusy(false);
    }
  };

  const handleEditScheduledBattle = (battle: any) => {
    if (!battle?._id) return;
    setEditingScheduledBattleId(String(battle._id));
    setEditStartsAt(toDatetimeLocal(battle.startsAt));
    setEditDurationSeconds(battle.durationSeconds ? String(battle.durationSeconds) : '');
  };

  const handleSaveScheduledBattle = async (battle: any) => {
    const battleId = String(battle?._id || '').trim();
    if (!battleId) {
      alert('Не найден запланированный бой');
      return;
    }
    if (!editStartsAt) {
      alert('Укажите новое время запуска');
      return;
    }

    const startsAtIso = normalizeBattleStartsAtForApproval(editStartsAt);
    const approval = requestApprovalPayload({
      title: 'Изменить запланированный бой',
      impactPreviewDefault: `Время запуска боя будет изменено на ${new Date(startsAtIso || editStartsAt).toLocaleString('ru-RU')}${editDurationSeconds ? `, длительность станет ${Number(editDurationSeconds)} сек.` : '.'}`,
      confirmationPhrase: 'CONFIRM game.battle.schedule',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const payload: any = {
        battleId,
        startsAt: startsAtIso,
      };
      if (editDurationSeconds) payload.durationSeconds = Number(editDurationSeconds);
      const res = await createApprovalV2({
        actionType: 'game.battle.schedule',
        ...approval,
        payload,
      });
      alert(res?.operationId
        ? `Заявка на изменение создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на изменение отправлена');
      resetScheduleEditor();
      await Promise.all([loadControl(), loadMood()]);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка изменения запланированного боя');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteScheduledBattle = async (battle: any) => {
    if (!battle?._id) {
      alert('Сейчас нет запланированного боя для удаления');
      return;
    }
    const approval = requestApprovalPayload({
      title: 'Удалить запланированный бой',
      impactPreviewDefault: 'Запланированный бой будет полностью удалён из базы вместе со служебными хвостами.',
      confirmationPhrase: 'CONFIRM game.battle.schedule_cancel',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const res = await createApprovalV2({
        actionType: 'game.battle.schedule_cancel',
        ...approval,
        payload: {
          battleId: String(battle._id),
        },
      });
      alert(res?.operationId
        ? `Заявка на удаление создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на удаление отправлена');
      if (String(battle._id) === editingScheduledBattleId) {
        resetScheduleEditor();
      }
      await Promise.all([loadControl(), loadMood()]);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка удаления запланированного боя');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelEditingScheduledBattle = () => {
    resetScheduleEditor();
  };

  const handleFinishNow = async () => {
    if (!activeBattle) {
      alert('Сейчас нет активного боя');
      return;
    }
    const approval = requestApprovalPayload({
      title: 'Завершить текущий бой',
      impactPreviewDefault: 'Текущий бой будет принудительно доведён до завершения и закрыт.',
      confirmationPhrase: 'CONFIRM game.battle.finish_now',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const res = await createApprovalV2({
        actionType: 'game.battle.finish_now',
        ...approval,
        payload: {
          battleId: String(activeBattle._id),
        },
      });
      alert(res?.operationId
        ? `Заявка на завершение создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на завершение отправлена');
      await Promise.all([loadControl(), loadMood()]);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка завершения боя');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-slate-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
        <button
          onClick={() => setBattleTab('control')}
          className={`rounded-xl px-4 py-2 text-sm transition-colors ${battleTab === 'control' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
        >
          Управление боем
        </button>
        <button
          onClick={() => setBattleTab('mood')}
          className={`rounded-xl px-4 py-2 text-sm transition-colors ${battleTab === 'mood' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
        >
          Настроение Мрака
        </button>
        <button
          onClick={() => setBattleTab('history')}
          className={`rounded-xl px-4 py-2 text-sm transition-colors ${battleTab === 'history' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
        >
          История и подозрительные
        </button>
      </div>

      {battleTab === 'control' && (
      <Card title="Управление Мраком" subtitle="Ручной запуск и расписание">
        {controlLoading ? (
          <div className="text-center text-slate-500">Загрузка...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase text-slate-500">Текущий бой</div>
                <div className="mt-2 text-sm text-white">
                  {activeBattle
                    ? `Активен с ${new Date(activeBattle.startsAt).toLocaleString('ru')}`
                    : 'Нет активного боя'}
                </div>
                {activeBattle && (
                  <div className="mt-2 text-xs text-slate-400">
                    До {activeBattle.endsAt ? new Date(activeBattle.endsAt).toLocaleString('ru') : '—'}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase text-slate-500">Следующий запуск</div>
                <div className="mt-2 text-sm text-white">
                  {upcomingBattle?.scheduleSource === 'auto'
                    ? 'Скрыт волей Мрака'
                    : upcomingBattle?.startsAt
                    ? new Date(upcomingBattle.startsAt).toLocaleString('ru')
                    : 'Не запланирован'}
                </div>
                {upcomingBattle?.durationSeconds && upcomingBattle?.scheduleSource !== 'auto' && (
                  <div className="mt-2 text-xs text-slate-400">Длительность: {upcomingBattle.durationSeconds} сек.</div>
                )}
                <div className="mt-1 text-xs text-slate-400">
                  Источник: {upcomingBattle?.scheduleSource === 'auto' ? 'Решение Мрака скрыто' : (upcomingBattle?.scheduleSource || '—')}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase text-slate-500">Тайна Мрака</div>
                <div className="mt-2 text-sm text-white">
                  Точный момент автонападения скрыт
                </div>
                <div className="mt-1 text-xs text-slate-400">Смотри вкладку настроения Мрака, если хочешь лишь примерный прогноз.</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase text-slate-500">Запланировано</div>
                  <div className="mt-1 text-sm text-white">Список будущих боёв для изменения или удаления</div>
                </div>
                <div className="text-xs text-slate-400">Всего: {scheduledBattles.length}</div>
              </div>

              {scheduledBattles.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-slate-500">
                  Запланированных боёв сейчас нет.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {scheduledBattles.map((battle) => {
                    const battleId = String(battle?._id || '');
                    const selected = battleId === editingScheduledBattleId;
                    return (
                      <div
                        key={battleId}
                        className={`rounded-xl border p-4 transition-colors ${selected ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-black/10'}`}
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">
                              {battle?.startsAt ? new Date(battle.startsAt).toLocaleString('ru') : 'Дата не указана'}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                              <span>Длительность: {battle?.durationSeconds || '—'} сек.</span>
                              <span>Источник: {battle?.scheduleSource || '—'}</span>
                              {selected && <span className="text-blue-200">Выбран для изменения</span>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleEditScheduledBattle(battle)}
                              disabled={actionBusy}
                              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Edit3 size={16} className="inline-block mr-2" />
                              Изменить
                            </button>
                            <button
                              onClick={() => handleDeleteScheduledBattle(battle)}
                              disabled={actionBusy}
                              className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 size={16} className="inline-block mr-2" />
                              Удалить
                            </button>
                          </div>
                        </div>

                        {selected && (
                          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <label className="text-xs uppercase text-slate-500">Новая дата и время</label>
                                  <input
                                    type="datetime-local"
                                    className="input-field mt-2"
                                    value={editStartsAt}
                                    onChange={(e) => setEditStartsAt(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs uppercase text-slate-500">Новая длительность</label>
                                  <input
                                    type="number"
                                    min="60"
                                    placeholder="секунд"
                                    className="input-field mt-2"
                                    value={editDurationSeconds}
                                    onChange={(e) => setEditDurationSeconds(e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
                                <button
                                  onClick={() => handleSaveScheduledBattle(battle)}
                                  disabled={actionBusy}
                                  className="btn-secondary w-full sm:w-auto"
                                >
                                  <Save size={16} />
                                  Сохранить изменения
                                </button>
                                <button
                                  onClick={handleCancelEditingScheduledBattle}
                                  disabled={actionBusy}
                                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto"
                                >
                                  <XCircle size={16} className="inline-block mr-2" />
                                  Отменить
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase text-slate-500">Новый запланированный бой</div>
              <div className="mt-1 text-sm text-white">Общая форма только для создания нового боя</div>
              {scheduledBattles.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Сейчас уже есть запланированный бой. Его можно изменить или удалить в списке выше.
                </div>
              )}

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase text-slate-500">Длительность</div>
                    <input
                      type="number"
                      min="60"
                      placeholder="секунд (опционально)"
                      className="input-field mt-2"
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(e.target.value)}
                    />
                    <div className="mt-2 text-xs text-slate-500">Оставьте пустым для значения по умолчанию.</div>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-slate-500">Дата и время запуска</label>
                    <input
                      type="datetime-local"
                      className="input-field mt-2"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                    <div className="mt-2 text-xs text-slate-500">Создание нового боя доступно, когда список выше пуст.</div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
                  <button
                    onClick={handleSchedule}
                    disabled={actionBusy || scheduledBattles.length > 0}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    <Clock size={16} />
                    Запланировать
                  </button>
                  <button
                    onClick={handleFinishNow}
                    disabled={actionBusy || !activeBattle}
                    className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto"
                  >
                    <XCircle size={16} className="inline-block mr-2" />
                    Завершить сейчас
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
      )}

      {battleTab === 'mood' && (
      <div className="space-y-6">
        <Card title="Настроение Мрака" subtitle="Не просто графики, а примерное чувство мира: насколько Мрак близок к удару и почему.">
          {moodLoading ? (
            <div className="py-12 text-center text-slate-500">Загрузка...</div>
          ) : !battleMood ? (
            <div className="py-12 text-center text-slate-500">Не удалось собрать прогноз</div>
          ) : (
            <div className="space-y-8">
              <div className="grid gap-6 xl:grid-cols-[320px,1fr]">
                <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
                  <DarknessMeter
                    score={battleMood.riskScore}
                    stage={battleMood?.stage?.title || '—'}
                    horizon={battleMood?.stage?.horizon || '—'}
                  />
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Прогноз</div>
                        <h3 className="mt-2 text-2xl font-bold text-white">{battleMood?.stage?.title || '—'}</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{battleMood?.stage?.forecast || '—'}</p>
                      </div>
                      <button onClick={loadMood} className="btn-secondary">
                        <RefreshCw size={16} />
                        Обновить прогноз
                      </button>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase text-slate-500">Активные жители</div>
                        <div className="mt-2 text-2xl font-bold text-white">{battleMood?.stats?.activeUsers72h ?? 0}</div>
                        <div className="mt-1 text-xs text-slate-400">За 72 часа</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase text-slate-500">Польза миру</div>
                        <div className="mt-2 text-2xl font-bold text-white">{battleMood?.stats?.usefulActions72h ?? 0}</div>
                        <div className="mt-1 text-xs text-slate-400">Вес полезных действий</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase text-slate-500">Жалобы</div>
                        <div className="mt-2 text-2xl font-bold text-white">{battleMood?.stats?.pendingAppeals ?? 0}</div>
                        <div className="mt-1 text-xs text-slate-400">Ждут решения</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase text-slate-500">Подозрительные бои</div>
                        <div className="mt-2 text-2xl font-bold text-white">{battleMood?.stats?.suspiciousReports7d ?? 0}</div>
                        <div className="mt-1 text-xs text-slate-400">За 7 дней</div>
                      </div>
                    </div>

                    {(battleMood?.notes?.activeBattleText || battleMood?.notes?.upcomingBattleText) && (
                      <div className="mt-6 space-y-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                        {battleMood?.notes?.activeBattleText && <div>{battleMood.notes.activeBattleText}</div>}
                        {battleMood?.notes?.upcomingBattleText && <div>{battleMood.notes.upcomingBattleText}</div>}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6">
                      <div className="mb-4 flex items-center gap-3">
                        <XCircle className="text-rose-300" size={18} />
                        <div className="text-sm font-semibold text-rose-100">Что злит Мрак сейчас</div>
                      </div>
                      <div className="space-y-3">
                        {(Array.isArray(battleMood?.darkReasons) ? battleMood.darkReasons : []).map((item: any, idx: number) => (
                          <div key={`dark_${idx}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div className="font-semibold text-white">{item.title}</div>
                              <div className="text-sm font-bold text-rose-200">{item.value}</div>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-rose-50/80">{item.text}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6">
                      <div className="mb-4 flex items-center gap-3">
                        <CheckCircle2 className="text-emerald-300" size={18} />
                        <div className="text-sm font-semibold text-emerald-100">Что пока сдерживает Мрак</div>
                      </div>
                      <div className="space-y-3">
                        {(Array.isArray(battleMood?.calmReasons) ? battleMood.calmReasons : []).map((item: any, idx: number) => (
                          <div key={`calm_${idx}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div className="font-semibold text-white">{item.title}</div>
                              <div className="text-sm font-bold text-emerald-200">{item.value}</div>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-emerald-50/80">{item.text}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {(Array.isArray(battleMood?.scales) ? battleMood.scales : []).map((scale: any) => (
                  <MoodScaleBar
                    key={scale.id}
                    title={scale.title}
                    score={scale.score}
                    text={scale.text}
                  />
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-slate-400"><Globe size={16} /> Мир и сущности</div>
                  <div className="mt-3 text-sm text-white">Сущность есть у {battleMood?.stats?.entityCoveragePercent ?? 0}% жителей.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-slate-400"><Coins size={16} /> Доход и траты</div>
                  <div className="mt-3 text-sm text-white">За 7 дней мир получил {battleMood?.stats?.scEarned7d ?? 0} K и потратил {battleMood?.stats?.scSpent7d ?? 0} K.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-slate-400"><Sparkles size={16} /> Рекламная жила</div>
                  <div className="mt-3 text-sm text-white">Примерная рекламная прибыль за 7 дней: {battleMood?.stats?.adRevenue7d ?? 0}.</div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
      )}

      {battleTab === 'history' && (
      <>
      <Card title="История боёв с Мраком" subtitle="Результаты защиты Древа">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Дата</th>
                <th className="pb-3 font-medium">Участников</th>
                <th className="pb-3 font-medium">Урон Света</th>
                <th className="pb-3 font-medium">Урон Мрака</th>
                <th className="pb-3 font-medium">Источник</th>
                <th className="pb-3 font-medium">Результат</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {battles.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Нет данных о боях</td></tr>
              ) : battles.map((battle: any) => (
                <tr key={battle._id} className="text-sm">
                  <td className="py-3 text-white">{new Date(battle.createdAt).toLocaleDateString('ru')}</td>
                  <td className="py-3 text-slate-300">{battle.attendanceCount || battle.attendance?.length || battle.participants?.length || 0}</td>
                  <td className="py-3 text-emerald-400">{(battle.lightDamage || 0).toLocaleString()}</td>
                  <td className="py-3 text-rose-400">{(battle.darknessDamage || 0).toLocaleString()}</td>
                  <td className="py-3 text-slate-300">
                    <div>{battle.scheduleSource || '—'}</div>
                    <div className="text-caption text-slate-500">{battle.scheduledIntervalHours ? `${battle.scheduledIntervalHours}ч` : '—'}</div>
                  </td>
                  <td className="py-3">
                    {Number(battle.lightDamage || 0) === Number(battle.darknessDamage || 0) ? (
                      <Badge variant="info">Ничья</Badge>
                    ) : Number(battle.lightDamage || 0) > Number(battle.darknessDamage || 0) ? (
                      <Badge variant="success">Победа Света</Badge>
                    ) : (
                      <Badge variant="error">Победа Мрака</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Подозрительные в боях" subtitle="Игроки, у которых отчеты выглядят невозможными">
        {suspiciousLoading ? (
          <div className="text-center text-slate-500 py-10">Загрузка...</div>
        ) : suspiciousRows.length === 0 ? (
          <div className="text-center text-slate-500 py-10">Нет подозрительных</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                  <th className="pb-3 font-medium">Когда</th>
                  <th className="pb-3 font-medium">Игрок</th>
                  <th className="pb-3 font-medium">Бой</th>
                  <th className="pb-3 font-medium">Причины</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {suspiciousRows.map((row: any, idx: number) => (
                  <tr key={`${row.battleId || 'battle'}_${row.userId || 'user'}_${idx}`} className="text-sm">
                    <td className="py-3 text-slate-300">
                      {row.suspiciousAt ? new Date(row.suspiciousAt).toLocaleString('ru') : '—'}
                    </td>
                    <td className="py-3">
                      <div className="text-white font-semibold">{row.nickname || '—'}</div>
                      <div className="text-xs text-slate-500">{row.email || '—'}</div>
                    </td>
                    <td className="py-3 text-slate-300">
                      <div className="text-xs">{row.battleId ? String(row.battleId) : '—'}</div>
                      <div className="text-caption text-slate-500">
                        {row.startsAt ? `Старт: ${new Date(row.startsAt).toLocaleString('ru')}` : '—'}
                      </div>
                    </td>
                    <td className="py-3 text-slate-300">
                      <div className="space-y-1">
                        {(Array.isArray(row.suspiciousReasons) ? row.suspiciousReasons : []).slice(0, 5).map((r: any, i: number) => (
                          <div key={`${idx}_reason_${i}`} className="text-xs">{String(r)}</div>
                        ))}
                      </div>
                      {row.suspiciousEvidence ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-400">доказательства</summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 text-caption text-slate-200">
                            {JSON.stringify(row.suspiciousEvidence, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>
      )}
    </div>
  );
}

function ReferralsSection() {
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<{ active: number; pending: number; inactive: number }>({ active: 0, pending: 0, inactive: 0 });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const loadReferrals = async () => {
    setLoading(true);
    try {
      const { fetchReferrals } = await import('./api/admin');
      const data = await fetchReferrals({ page, limit: 20, search, status: status || undefined });
      setReferrals(data.referrals || []);
      setTotalPages(data.totalPages || 1);
      setTotalReferrals(data.totalReferrals || 0);
      setStatusCounts(data.statusCounts || { active: 0, pending: 0, inactive: 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReferrals();
  }, [page, search, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, any>();
    referrals.forEach((ref) => {
      const key = ref.inviter?._id || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          inviter: ref.inviter || { nickname: 'Без пригласителя', email: '—', _id: key },
          referrals: [],
          total: 0,
          active: 0,
          pending: 0,
          inactive: 0,
        });
      }
      const g = map.get(key);
      g.referrals.push(ref);
      g.total += 1;
      if (ref.status === 'active') g.active += 1;
      else if (ref.status === 'pending') g.pending += 1;
      else g.inactive += 1;
    });
    return Array.from(map.values());
  }, [referrals]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Управление рефералами</h2>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Поиск по нику или email..."
            className="input-field pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: null, label: 'Все', count: statusCounts.active + statusCounts.pending + statusCounts.inactive },
          { key: 'active', label: 'Активные', count: statusCounts.active },
          { key: 'pending', label: 'Ожидают', count: statusCounts.pending },
          { key: 'inactive', label: 'Не прошли', count: statusCounts.inactive },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => { setPage(1); setStatus(item.key as any); }}
            className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${status === item.key || (item.key === null && status === null)
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
          >
            {item.label} ({item.count || 0})
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-600/20 to-transparent border-blue-500/20">
          <div className="text-center">
            <p className="text-sm text-slate-400">Всего рефералов</p>
            <h4 className="text-3xl font-bold text-white">{totalReferrals}</h4>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="space-y-4">
          {loading ? (
            <div className="py-10 text-center text-slate-500">Загрузка...</div>
          ) : grouped.length === 0 ? (
            <div className="py-10 text-center text-slate-500">Рефералов не найдено</div>
          ) : grouped.map((group) => {
            const isOpen = openGroups[group.inviter?._id || 'unknown'];
            return (
              <div key={group.inviter?._id || 'unknown'} className="rounded-2xl border border-white/10 bg-white/5">
                <button
                  onClick={() => toggleGroup(group.inviter?._id || 'unknown')}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/5"
                >
                  <div className="flex flex-col items-start">
                    <div className="text-lg font-semibold text-white">{group.inviter?.nickname || 'Без пригласителя'}</div>
                    <div className="text-xs text-slate-500">{group.inviter?.email || '—'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="success">Актив {group.active}</Badge>
                    <Badge variant="warning">Ожидают {group.pending}</Badge>
                    <Badge variant="error">Не прошли {group.inactive}</Badge>
                    <Badge variant="info">Всего {group.total}</Badge>
                    <ChevronRight className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} size={18} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-white/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="px-6 py-3">Дата</th>
                            <th className="px-6 py-3">Приглашенный</th>
                            <th className="px-6 py-3">Статус</th>
                            <th className="px-6 py-3">Проверка</th>
                            <th className="px-6 py-3">Активность 30д</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {group.referrals.map((ref: any) => (
                            <tr key={ref._id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 text-slate-400">
                                {new Date(ref.createdAt).toLocaleDateString()} <span className="text-xs">{new Date(ref.createdAt).toLocaleTimeString()}</span>
                              </td>
                              <td className="px-6 py-3">
                                <div className="font-medium text-emerald-400">{ref.invitee?.nickname || 'Неизвестный'}</div>
                                <div className="text-xs text-slate-500">{ref.invitee?.email}</div>
                              </td>
                              <td className="px-6 py-3">
                                <div className="flex flex-col gap-1">
                                  <Badge variant={ref.status === 'active' ? 'success' : ref.status === 'inactive' ? 'error' : 'warning'}>
                                    {ref.status}
                                  </Badge>
                                  {ref.checkReason && <span className="text-xs text-slate-500 max-w-[180px] line-clamp-2">{ref.checkReason}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-3 text-slate-300">
                                <div className="text-xs">Проверен: {ref.checkedAt ? new Date(ref.checkedAt).toLocaleDateString() : '—'}</div>
                                <div className="text-xs text-slate-500">Активен с: {ref.activeSince ? new Date(ref.activeSince).toLocaleDateString() : '—'}</div>
                                <div className="text-caption text-slate-500">IP: {ref.inviteeIp || '—'}</div>
                                <div className="text-caption text-slate-500">FP: {ref.inviteeFingerprint ? ref.inviteeFingerprint.slice(0, 10) + '…' : '—'}</div>
                              </td>
                              <td className="px-6 py-3">
                                <div className="grid grid-cols-2 gap-2 text-caption text-white">
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-emerald-400 font-semibold">{ref.activitySummary?.daysActive ?? 0}</div>
                                    <div className="text-slate-500">дней</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-emerald-400 font-semibold">{ref.activitySummary?.minutesTotal ?? 0}</div>
                                    <div className="text-slate-500">минут</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-amber-400 font-semibold">{ref.activitySummary?.solarCollects ?? 0}</div>
                                    <div className="text-slate-500">solar</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-amber-400 font-semibold">{ref.activitySummary?.battleCount ?? 0}</div>
                                    <div className="text-slate-500">бои</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-blue-400 font-semibold">{ref.activitySummary?.searchCount ?? 0}</div>
                                    <div className="text-slate-500">поиски</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-blue-400 font-semibold">{ref.activitySummary?.bridgeStones ?? 0}</div>
                                    <div className="text-slate-500">камни</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center col-span-2">
                                    <div className={`font-semibold ${ref.activitySummary?.hasEntity ? 'text-emerald-400' : 'text-slate-400'}`}>
                                      {ref.activitySummary?.hasEntity ? 'Сущность создана' : 'Сущность нет'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-white/10">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-secondary py-1 px-3 disabled:opacity-50"
            >
              Назад
            </button>
            <span className="text-sm text-slate-400">
              Страница {page} из {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary py-1 px-3 disabled:opacity-50"
            >
              Вперед
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function EntitiesSection() {
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [avatarInput, setAvatarInput] = useState('');

  const normalizeAvatarUrl = (url?: string) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/collection/') || url.startsWith('/entitycollect/')) {
      return `${FRONTEND_BASE_URL}${url}`;
    }
    const apiBase = api.defaults.baseURL || '';
    return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const formatMood = (mood?: string) => {
    if (!mood) return 'Нейтральное';
    const map: Record<string, string> = {
      happy: 'Радостное',
      neutral: 'Нейтральное',
      sad: 'Грустное',
    };
    return map[mood] || mood;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get('/admin/entities');
        setEntities(data.data?.entities || data.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить эту сущность?')) return;
    try {
      await api.delete(`/admin/entities/${id}`);
      setEntities(entities.filter(e => e._id !== id));
    } catch (e) {
      alert('Ошибка удаления');
    }
  };

  const handleOpen = (entity: any) => {
    setSelectedEntity(entity);
    setAvatarInput(entity.avatarUrl || '');
  };

  const handleClose = () => {
    setSelectedEntity(null);
    setAvatarInput('');
  };

  const handleSaveAvatar = async () => {
    if (!selectedEntity || !avatarInput.trim()) return;
    try {
      const res = await api.patch(`/admin/entities/${selectedEntity._id}/avatar`, {
        avatarUrl: avatarInput.trim()
      });
      const updated = res.data?.entity || res.data;
      setEntities(prev => prev.map(e => (e._id === updated._id ? updated : e)));
      setSelectedEntity(updated);
    } catch (e) {
      alert('Ошибка сохранения аватара');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-slate-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Сущности пользователей" subtitle="Управление созданными аватарами">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.length === 0 ? (
            <p className="col-span-full py-8 text-center text-slate-500">Нет созданных сущностей</p>
          ) : entities.map((entity: any) => (
            <div key={entity._id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              {entity.avatarUrl ? (
                <button onClick={() => handleOpen(entity)} className="w-12 h-12 rounded-full overflow-hidden">
                  <img src={normalizeAvatarUrl(entity.avatarUrl)} alt="" className="w-full h-full object-cover" />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                  {entity.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{entity.name}</p>
                <p className="text-xs text-slate-500">Настроение: {formatMood(entity.mood)}</p>
                <p className="text-xs text-slate-500">Создан: {new Date(entity.createdAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleOpen(entity)}
                className="text-blue-400 hover:text-blue-300"
                title="Открыть"
              >
                <Search size={16} />
              </button>
              <button
                onClick={() => handleDelete(entity._id)}
                className="text-rose-400 hover:text-rose-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Card>
      <AnimatePresence>
        {selectedEntity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-white/10 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Сущность пользователя</h3>
                <button onClick={handleClose} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <div className="grid gap-4 md:grid-cols-[200px,1fr]">
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  {selectedEntity.avatarUrl ? (
                    <img src={normalizeAvatarUrl(selectedEntity.avatarUrl)} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-48 flex items-center justify-center text-slate-500">Нет изображения</div>
                  )}
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <div><span className="text-slate-500">Имя:</span> {selectedEntity.name}</div>
                  <div><span className="text-slate-500">Пользователь:</span> {selectedEntity.user?.nickname || '—'} ({selectedEntity.user?.email || '—'})</div>
                  <div><span className="text-slate-500">Настроение:</span> {formatMood(selectedEntity.mood)}</div>
                  <div><span className="text-slate-500">Создан:</span> {new Date(selectedEntity.createdAt).toLocaleString()}</div>
                  <div className="pt-2">
                    <label className="text-slate-500 text-xs uppercase">Новый аватар URL</label>
                    <input
                      value={avatarInput}
                      onChange={(e) => setAvatarInput(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSaveAvatar} className="btn-primary">Сохранить</button>
                    <button onClick={handleClose} className="btn-secondary">Закрыть</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const AD_TARGET_OPTIONS = [
  { id: 'all', name: 'Все страницы' },
  { id: 'about', name: 'О нас' },
  { id: 'rules', name: 'Правила' },
  { id: 'roadmap', name: 'Дорожная карта' },
  { id: 'feedback', name: 'Обратная связь' },
  { id: 'fortune', name: 'Фортуна' },
  { id: 'fortune/roulette', name: 'Рулетка' },
  { id: 'fortune/lottery', name: 'Лотерея' },
  { id: 'shop', name: 'Магазин' },
  { id: 'night_shift', name: 'Ночная смена' },
  { id: 'practice', name: 'Практика' },
  { id: 'practice_gratitude', name: 'Благодарность' },
  { id: 'practice_meditation', name: 'Медитации' },
  { id: 'activity_collect', name: 'Сбор осколков' },
  { id: 'activity_achievements', name: 'Достижения' },
  { id: 'activity_attendance', name: 'Посещаемость' },
  { id: 'news', name: 'Новости' },
  { id: 'chronicle', name: 'Летопись' },
  { id: 'chat', name: 'Чат' },
  { id: 'galaxy', name: 'Галактика желаний' },
  { id: 'bridges', name: 'Мосты' },
  { id: 'battle', name: 'Бой' },
  { id: 'entity/profile', name: 'Профиль сущности' },
  { id: 'entity', name: 'Панели Древа: сущность' },
  { id: 'solar', name: 'Панели Древа: энергия' },
];

function AdsSection() {
  const [stats, setStats] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const emptyCreativeForm = { name: '', type: 'banner', content: '', duration: 10, active: true, priority: 0, targetPages: ['all'] };
  const [creativeForm, setCreativeForm] = useState<any>(emptyCreativeForm);
  const [editingCreative, setEditingCreative] = useState<any>(null);

  const getCreativeTypeLabel = (creative: any) => {
    const kind = String(creative?.kind || creative?.type || '').toLowerCase();
    if (kind === 'vast') return 'VAST';
    if (kind === 'banner' || kind === 'html') return 'Баннер';
    return 'Старый формат';
  };

  const getTargetLabel = (id: string) => AD_TARGET_OPTIONS.find((target) => target.id === id)?.name || id;

  const resetCreativeForm = () => {
    setEditingCreative(null);
    setCreativeForm(emptyCreativeForm);
  };

  const toggleTargetPage = (pageId: string) => {
    const current = Array.isArray(creativeForm.targetPages) ? creativeForm.targetPages : ['all'];
    if (pageId === 'all') {
      setCreativeForm({ ...creativeForm, targetPages: ['all'] });
      return;
    }
    const withoutAll = current.filter((id: string) => id !== 'all');
    const next = withoutAll.includes(pageId)
      ? withoutAll.filter((id: string) => id !== pageId)
      : [...withoutAll, pageId];
    setCreativeForm({ ...creativeForm, targetPages: next.length ? next : ['all'] });
  };

  const formatDuration = (seconds: number) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    if (minutes > 0) return `${minutes}м ${secs}с`;
    return `${secs}с`;
  };

  const formatCountry = (country: string) => {
    const code = String(country || '').toUpperCase();
    if (!code || code === 'ZZ') return 'Неизвестно';
    return code;
  };

  const formatDevice = (device: string) => {
    const normalized = String(device || '').toLowerCase();
    if (normalized === 'desktop') return 'Desktop';
    if (normalized === 'mobile') return 'Mobile';
    if (normalized === 'tablet') return 'Tablet';
    if (normalized === 'bot') return 'Bot';
    return 'Unknown';
  };

  const totalSessionDuration = stats?.sessionTotals?.totalDurationSeconds || 0;
  const totalSessions = stats?.sessionTotals?.sessions || 0;
  const avgSessionDuration = stats?.sessionTotals?.avgDurationSeconds || 0;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, creativesRes] = await Promise.all([
        api.get('/ads/stats'),
        api.get('/ads/creatives')
      ]);
      setStats(statsRes.data);
      setCreatives(creativesRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCreative = async () => {
    try {
      const payload = {
        ...creativeForm,
        kind: creativeForm.type,
        targetPages: Array.isArray(creativeForm.targetPages) && creativeForm.targetPages.length ? creativeForm.targetPages : ['all'],
        targetPlacements: ['all'],
      };
      if (editingCreative) {
        await api.patch(`/ads/creatives/${editingCreative._id}`, payload);
      } else {
        await api.post('/ads/creatives', payload);
      }
      setShowCreativeModal(false);
      resetCreativeForm();
      loadData();
    } catch (e: any) {
      console.error(e);
      alert(e.response?.data?.message || e.message || 'Ошибка сохранения креатива');
    }
  };

  const handleEdit = (creative: any) => {
    setEditingCreative(creative);
    const kind = String(creative.kind || creative.type || '').toLowerCase();
    setCreativeForm({
      ...emptyCreativeForm,
      ...creative,
      type: kind === 'vast' ? 'vast' : 'banner',
      targetPages: Array.isArray(creative.targetPages) && creative.targetPages.length ? creative.targetPages : ['all'],
    });
    setShowCreativeModal(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить этот креатив?')) {
      try {
        await api.delete(`/ads/creatives/${id}`);
        loadData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const toggleCreativeActive = async (id: string, active: boolean) => {
    try {
      await api.patch(`/ads/creatives/${id}`, { active: !active });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-slate-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Card className="bg-gradient-to-br from-emerald-600/20 to-transparent border-emerald-500/20">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Потенциальный доход</p>
              <h4 className="text-2xl font-bold text-white">${(stats?.totals?.potentialRevenue ?? stats?.totals?.revenue ?? 0)}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-blue-600/20 to-transparent border-blue-500/20">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <BarChart3 size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Показов (всего)</p>
              <h4 className="text-2xl font-bold text-white">{(stats?.totals?.impressions || 0).toLocaleString()}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-amber-600/20 to-transparent border-amber-500/20">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 text-white">
              <Globe size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Стран</p>
              <h4 className="text-2xl font-bold text-white">{stats?.byCountry?.length || 0}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-purple-600/20 to-transparent border-purple-500/20">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 text-white">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Креативов</p>
              <h4 className="text-2xl font-bold text-white">{creatives.length}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-600/20 to-transparent border-cyan-500/20">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-600 text-white">
              <MonitorSmartphone size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Сессий</p>
              <h4 className="text-2xl font-bold text-white">{totalSessions.toLocaleString()}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-indigo-600/20 to-transparent border-indigo-500/20">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Время в страницах</p>
              <h4 className="text-2xl font-bold text-white">{formatDuration(totalSessionDuration)}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-fuchsia-600/20 to-transparent border-fuchsia-500/20">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-600 text-white">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Средняя сессия</p>
              <h4 className="text-2xl font-bold text-white">{formatDuration(avgSessionDuration)}</h4>
            </div>
          </div>
        </Card>
      </div>

      {/* Daily Stats */}
      <Card title="Статистика по дням" subtitle="Показы и доход за последние 30 дней">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Дата</th>
                <th className="pb-3 font-medium">Показов</th>
                <th className="pb-3 font-medium">Средний SCM</th>
                <th className="pb-3 font-medium">Доход</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(stats?.daily || []).map((day: any) => (
                <tr key={day.date} className="text-sm">
                  <td className="py-3 text-white">{day.date}</td>
                  <td className="py-3 text-slate-300">{day.impressions.toLocaleString()}</td>
                  <td className="py-3 text-slate-300">${day.avgAdRate}</td>
                  <td className="py-3 text-emerald-400">${day.revenue}</td>
                </tr>
              ))}
              {(!stats?.daily || stats.daily.length === 0) && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-500">Нет данных о показах</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Время по страницам" subtitle="Суммарное время по всем пользователям">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Страница</th>
                <th className="pb-3 font-medium">Общее время</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(stats?.timeByPage || []).map((row: any) => (
                <tr key={row.page} className="text-sm">
                  <td className="py-3 text-white">{row.page}</td>
                  <td className="py-3 text-slate-300">{formatDuration(row.totalDurationSeconds || 0)}</td>
                </tr>
              ))}
              {(!stats?.timeByPage || stats.timeByPage.length === 0) && (
                <tr><td colSpan={2} className="py-8 text-center text-slate-500">Нет данных по времени на страницах</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Время по странам">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                  <th className="pb-3 font-medium">Страна</th>
                  <th className="pb-3 font-medium">Сессий</th>
                  <th className="pb-3 font-medium">Общее время</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(stats?.timeByCountry || []).map((row: any) => (
                  <tr key={row.country} className="text-sm">
                    <td className="py-3 text-white">{formatCountry(row.country)}</td>
                    <td className="py-3 text-slate-300">{(row.sessions || 0).toLocaleString()}</td>
                    <td className="py-3 text-slate-300">{formatDuration(row.totalDurationSeconds || 0)}</td>
                  </tr>
                ))}
                {(!stats?.timeByCountry || stats.timeByCountry.length === 0) && (
                  <tr><td colSpan={3} className="py-8 text-center text-slate-500">Нет данных по странам</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Время по устройствам">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                  <th className="pb-3 font-medium">Устройство</th>
                  <th className="pb-3 font-medium">Сессий</th>
                  <th className="pb-3 font-medium">Общее время</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(stats?.timeByDevice || []).map((row: any) => (
                  <tr key={row.device} className="text-sm">
                    <td className="py-3 text-white">{formatDevice(row.device)}</td>
                    <td className="py-3 text-slate-300">{(row.sessions || 0).toLocaleString()}</td>
                    <td className="py-3 text-slate-300">{formatDuration(row.totalDurationSeconds || 0)}</td>
                  </tr>
                ))}
                {(!stats?.timeByDevice || stats.timeByDevice.length === 0) && (
                  <tr><td colSpan={3} className="py-8 text-center text-slate-500">Нет данных по устройствам</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Creatives Management */}
      <Card title="Креативы" subtitle="Управление рекламными материалами">
        <div className="mb-4 flex justify-end">
          <button onClick={() => { resetCreativeForm(); setShowCreativeModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Добавить креатив
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Название</th>
                <th className="pb-3 font-medium">Тип</th>
                <th className="pb-3 font-medium">Страницы</th>
                <th className="pb-3 font-medium">Длительность</th>
                <th className="pb-3 font-medium">Показов</th>
                <th className="pb-3 font-medium">Статус</th>
                <th className="pb-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {creatives.map((creative: any) => (
                <tr key={creative._id} className="text-sm">
                  <td className="py-3 text-white">{creative.name}</td>
                  <td className="py-3 text-slate-300">{getCreativeTypeLabel(creative)}</td>
                  <td className="py-3 text-slate-300">
                    {(Array.isArray(creative.targetPages) ? creative.targetPages : ['all']).map(getTargetLabel).join(', ')}
                  </td>
                  <td className="py-3 text-slate-300">
                    {creative.duration || 10} сек.
                  </td>
                  <td className="py-3 text-slate-300">{(creative.impressions || 0).toLocaleString()}</td>
                  <td className="py-3">
                    <Badge variant={creative.active ? 'success' : 'default'}>
                      {creative.active ? 'Активен' : 'Выключен'}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleCreativeActive(creative._id, creative.active)}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {creative.active ? 'Выключить' : 'Включить'}
                      </button>
                      <button
                        onClick={() => handleEdit(creative)}
                        className="text-amber-400 hover:text-amber-300"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(creative._id)}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {creatives.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Нет креативов</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Creative Modal */}
      <AnimatePresence>
        {showCreativeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowCreativeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-4">{editingCreative ? 'Редактировать креатив' : 'Новый креатив'}</h3>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <label className="text-sm font-medium text-slate-300">Название</label>
                  <input
                    className="input-field mt-1"
                    value={creativeForm.name}
                    onChange={(e) => setCreativeForm({ ...creativeForm, name: e.target.value })}
                    placeholder="Моя реклама"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Тип</label>
                  <select
                    className="input-field mt-1"
                    value={creativeForm.type}
                    onChange={(e) => setCreativeForm({ ...creativeForm, type: e.target.value })}
                  >
                    <option value="banner">Баннер</option>
                    <option value="vast">VAST</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">
                    {creativeForm.type === 'vast' ? 'VAST ссылка DAO.ad' : 'Код баннера'}
                  </label>
                  <textarea
                    className="input-field mt-1 min-h-[150px] font-mono text-sm"
                    value={creativeForm.content}
                    onChange={(e) => setCreativeForm({ ...creativeForm, content: e.target.value })}
                    placeholder={creativeForm.type === 'vast' ? 'https://... VAST link DAO.ad' : '<script...> или <div...>'}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Где показывать</label>
                  <div className="mt-2 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
                    {AD_TARGET_OPTIONS.map((target) => {
                      const selected = Array.isArray(creativeForm.targetPages) && creativeForm.targetPages.includes(target.id);
                      return (
                        <label key={target.id} className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleTargetPage(target.id)}
                          />
                          <span>{target.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Приоритет</label>
                  <input
                    type="number"
                    className="input-field mt-1"
                    value={creativeForm.priority}
                    onChange={(e) => setCreativeForm({ ...creativeForm, priority: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Время показа (сек)</label>
                  <input
                    type="number"
                    className="input-field mt-1"
                    value={creativeForm.duration}
                    onChange={(e) => setCreativeForm({ ...creativeForm, duration: Number(e.target.value) })}
                    placeholder="10"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => { setShowCreativeModal(false); resetCreativeForm(); }} className="btn-secondary flex-1">Отмена</button>
                  <button onClick={handleSaveCreative} className="btn-primary flex-1">{editingCreative ? 'Сохранить' : 'Создать'}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// --- Main App ---

export default function App() {
  const [active, setActive] = useState<SectionKey>('dashboard');
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const loadStats = async () => {
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      try {
        const res = await api.get('/auth/me');
        if (cancelled) return;
        if (res.data?.user?.role === 'admin') {
          setIsAuthenticated(true);
          await loadStats();
          return;
        }
        setIsAuthenticated(false);
      } catch (_e) {
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    };

    bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminEmail(email)) {
      setError(`Для админки нужен email вида local@${ADMIN_EMAIL_DOMAIN} без точек/символов до @`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, seedPhrase });
      if (res.data.user.role !== 'admin') {
        throw new Error('У вас нет прав администратора');
      }
      setIsAuthenticated(true);
      await loadStats();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.post('/auth/logout', {}).catch(() => {});
    setIsAuthenticated(false);
    setStats(null);
  };

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-slate-400">
        Проверка сессии...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass-panel p-8"
        >
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]">
              <Shield size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">GIVKOIN Админка</h1>
            <p className="text-slate-400">Панель управления мирозданием</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-rose-500/20 border border-rose-500/30 p-3 text-sm text-rose-400">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                required
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`admin@${ADMIN_EMAIL_DOMAIN}`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Сид-фраза</label>
              <textarea
                required
                className="input-field"
                value={seedPhrase}
                onChange={(e) => setSeedPhrase(e.target.value)}
                placeholder="Введите 24 слова через пробел"
                rows={3}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-4"
            >
              {loading ? <RefreshCw className="animate-spin" /> : 'Войти в систему'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-72 border-r border-white/10 bg-slate-950/50 backdrop-blur-2xl">
        <div className="flex h-full flex-col p-6">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Zap size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">GIVKOIN</span>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
            {sections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActive(section.key)}
                className={`nav-item w-full ${active === section.key ? 'nav-item-active' : ''}`}
              >
                <section.icon size={20} />
                {section.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6">
            <button
              onClick={handleLogout}
              className="nav-item w-full text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut size={20} />
              Выйти
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-72 flex-1 p-10 overflow-y-auto h-full">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white">
              {sections.find(s => s.key === active)?.label}
            </h2>
            <p className="text-slate-400">Управление параметрами и данными проекта</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <span className="text-xs font-medium text-slate-300">Система активна</span>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Suspense fallback={<SectionFallback />}>
              {active === 'dashboard' && <DashboardSection stats={stats} />}
              {active === 'control' && <ControlCenterSection />}
              {active === 'cms' && <CmsOperations />}
              {active === 'users' && <UsersSection />}
              {active === 'admins' && <AdminsSection />}
              {active === 'content' && <ContentSection />}
              {active === 'rules' && <RulesPagesSection />}
              {active === 'about' && <AboutPageSection />}
              {active === 'roadmap' && <RoadmapPageSection />}
              {active === 'appeals' && <AppealsSection />}
              {active === 'wishes' && <WishesSection />}
              {active === 'bridges' && <BridgesSection />}
              {active === 'battles' && <BattlesSection />}
              {active === 'referrals' && <ReferralsSection />}
              {active === 'entities' && <EntitiesSection />}
              {active === 'ads' && <AdsSection />}
              {active === 'night_guardians' && <NightGuardiansPage />}
              {active === 'crystal' && <CrystalManagement />}
              {active === 'fortune' && <FortuneControl />}
              {active === 'practice' && <PracticeSection />}
              {active === 'feedback' && <FeedbackSection />}
              {active === 'settings' && <SettingsSection />}
              {active === 'logs' && <LogsSection />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}



