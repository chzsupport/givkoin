import { CheckCircle2, Coins, Globe, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Card } from '../../components/ui';
import type { BattleMood } from './battleTypes';

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

export function BattleMoodTab({
  battleMood,
  moodLoading,
  onRefresh,
}: {
  battleMood: BattleMood | null;
  moodLoading: boolean;
  onRefresh: () => void;
}) {
  return (
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
                  score={battleMood.riskScore || 0}
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
                    <button onClick={onRefresh} className="btn-secondary">
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
                      {(Array.isArray(battleMood?.darkReasons) ? battleMood.darkReasons : []).map((item, idx) => (
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
                      {(Array.isArray(battleMood?.calmReasons) ? battleMood.calmReasons : []).map((item, idx) => (
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
              {(Array.isArray(battleMood?.scales) ? battleMood.scales : []).map((scale) => (
                <MoodScaleBar
                  key={scale.id || scale.title}
                  title={scale.title || '—'}
                  score={scale.score || 0}
                  text={scale.text || '—'}
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
                <div className="mt-3 text-sm text-white">За 7 дней мир получил {battleMood?.stats?.kEarned7d ?? 0} K и потратил {battleMood?.stats?.kSpent7d ?? 0} K.</div>
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
  );
}
