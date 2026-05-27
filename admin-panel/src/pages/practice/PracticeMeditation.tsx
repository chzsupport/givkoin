import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import {
  fetchMeditationSettings,
  updateMeditationSettings,
} from '../../api/admin';
import LanguageToggle from '../../components/LanguageToggle';
import { Card } from '../../components/ui';
import { formatAdminK } from '../../utils/adminFormat';
import {
  getLocalizedTextValue,
  getTranslatedField,
  updateLocalizedTextValue,
  type ContentLanguage,
} from '../../utils/localizedContent';

type MeditationTranslations = {
  en?: {
    weText?: string;
  };
} & Record<string, unknown>;

type MeditationScheduleSession = {
  id?: string;
  startsAt?: number | string;
  phase1Min?: number;
  phase2Min?: number;
  rounds?: number;
  weText?: unknown;
  translations?: MeditationTranslations;
};

type MeditationSummary = {
  completedSessions?: number;
  totalParticipations?: number;
  rewardedParticipations?: number;
  totalRadianceGranted?: number;
  averageParticipantsPerSession?: number;
};

type RecentMeditationSession = {
  sessionId?: string;
  startsAt?: number | string;
  durationMinutes?: number;
  participantsCount?: number;
  rewardedCount?: number;
  totalRadiance?: number;
};

type TopMeditationParticipant = {
  userId?: string;
  nickname?: string;
  email?: string;
  meditations?: number;
  radiance?: number;
  lastJoinedAt?: number | string;
};

type MeditationStats = {
  summary?: MeditationSummary;
  recentSessions?: RecentMeditationSession[];
  topParticipants?: TopMeditationParticipant[];
};

function toDatetimeLocal(ms: number) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MeditationSettings() {
  const [loading, setLoading] = useState(true);
  const [serverNow, setServerNow] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<MeditationScheduleSession[]>([]);
  const [stats, setStats] = useState<MeditationStats | null>(null);
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

  const upsert = (idx: number, patch: Partial<MeditationScheduleSession>) => {
    setSchedule((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const getSessionWeText = (session: MeditationScheduleSession | undefined) => {
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
  const recentSessions: RecentMeditationSession[] = Array.isArray(stats?.recentSessions) ? stats.recentSessions : [];
  const topParticipants: TopMeditationParticipant[] = Array.isArray(stats?.topParticipants) ? stats.topParticipants : [];

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
              <div className="mt-2 text-2xl font-bold text-white">{formatAdminK(summary.totalRadianceGranted || 0)}</div>
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
                  {recentSessions.map((session, idx) => (
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
                        <div className="text-slate-300">Сияние: <span className="text-white font-semibold">{formatAdminK(session.totalRadiance || 0)}</span></div>
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
                  {topParticipants.map((participant, idx) => (
                    <div key={participant.userId || idx} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{participant.nickname || 'Без имени'}</div>
                          <div className="text-xs text-slate-500">{participant.email || 'Без почты'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-cyan-300">{participant.meditations || 0} медитаций</div>
                          <div className="text-xs text-slate-500">{formatAdminK(participant.radiance || 0)} сияния</div>
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
