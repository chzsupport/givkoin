import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import api from '../../api/client';
import { ActiveGuardiansCard } from './ActiveGuardiansCard';
import { getErrorMessage } from './formatters';
import { Button, StatTile } from './NightGuardiansUi';
import { RecentShiftsCard } from './RecentShiftsCard';
import { SalarySettingsCard } from './SalarySettingsCard';
import { SuspiciousShiftsCard } from './SuspiciousShiftsCard';
import type { ActiveGuardian, RecentShift, SalarySettings, SuspiciousShift } from './types';

export default function NightGuardiansPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [actionSessionId, setActionSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const [settings, setSettings] = useState<SalarySettings>({ k: 0, lm: 0, stars: 0 });
  const [activeGuardians, setActiveGuardians] = useState<ActiveGuardian[]>([]);
  const [recentShifts, setRecentShifts] = useState<RecentShift[]>([]);
  const [suspiciousShifts, setSuspiciousShifts] = useState<SuspiciousShift[]>([]);

  const summary = useMemo(() => {
    const recentPaidHours = recentShifts.reduce((sum, row) => sum + Math.max(0, Number(row.payableHours) || 0), 0);
    return {
      activeCount: activeGuardians.length,
      suspiciousCount: suspiciousShifts.length,
      recentCount: recentShifts.length,
      recentPaidHours,
    };
  }, [activeGuardians.length, recentShifts, suspiciousShifts.length]);

  const fetchData = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [settingsRes, dataRes] = await Promise.all([
        api.get('/night-shift/admin/settings'),
        api.get('/night-shift/admin/data'),
      ]);

      setSettings({
        k: Number(settingsRes.data?.settings?.k) || 0,
        lm: Number(settingsRes.data?.settings?.lm) || 0,
        stars: Number(settingsRes.data?.settings?.stars) || 0,
      });
      setActiveGuardians(Array.isArray(dataRes.data?.active) ? dataRes.data.active : []);
      setRecentShifts(Array.isArray(dataRes.data?.recentShifts) ? dataRes.data.recentShifts : []);
      setSuspiciousShifts(Array.isArray(dataRes.data?.suspicious) ? dataRes.data.suspicious : []);
      setLastLoadedAt(new Date());
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Не удалось загрузить данные ночной смены'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    try {
      await api.post('/night-shift/admin/settings', {
        k: Number(settings.k) || 0,
        lm: Number(settings.lm) || 0,
        stars: Number(settings.stars) || 0,
      });
      alert('Оплата ночной смены сохранена');
      await fetchData(true);
    } catch (nextError) {
      alert(getErrorMessage(nextError, 'Ошибка сохранения'));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleReview = async (sessionId: string, action: 'approve' | 'penalize') => {
    if (!sessionId) return;

    if (action === 'penalize') {
      const confirmed = window.confirm('Подтвердить штраф 80% за эту ночную смену?');
      if (!confirmed) return;
    }

    setActionSessionId(sessionId);
    setError(null);

    try {
      await api.post('/night-shift/admin/review', { sessionId, action });
      alert(action === 'approve' ? 'Смена отмечена как чистая' : 'Штраф применён');
      await fetchData(true);
    } catch (nextError) {
      alert(getErrorMessage(nextError, 'Не удалось завершить проверку'));
    } finally {
      setActionSessionId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 pb-12 text-slate-200">
        <main className="container mx-auto px-4 py-8">
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
            Загрузка раздела ночной смены...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 pb-12 text-slate-200">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-blue-500" />
              <h1 className="text-3xl font-bold text-white">Ночная смена</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">
              Смена жёстко работает по серверу с 19:00 до 06:00. Один человек не может брать две смены подряд.
              Здесь модератор видит тех, кто сейчас на посту, последние завершённые смены и подозрительные отчёты.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Последнее обновление: {lastLoadedAt ? lastLoadedAt.toLocaleString('ru-RU') : 'ещё не загружено'}
            </p>
          </div>

          <Button onClick={() => fetchData(true)} variant="secondary" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>

        {error ? (
          <div className="mb-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Сейчас на посту"
            value={summary.activeCount}
            hint="Только те, у кого смена ещё идёт"
            accent="text-emerald-400"
          />
          <StatTile
            label="Ждут проверки"
            value={summary.suspiciousCount}
            hint="Сомнительные отчёты ночной смены"
            accent="text-amber-300"
          />
          <StatTile
            label="Последние смены"
            value={summary.recentCount}
            hint="Список завершённых смен"
            accent="text-blue-300"
          />
          <StatTile
            label="Оплаченных часов"
            value={summary.recentPaidHours}
            hint="Сумма по последним сменам на экране"
            accent="text-purple-300"
          />
        </div>

        <SalarySettingsCard
          settings={settings}
          savingSettings={savingSettings}
          onChange={setSettings}
          onSave={handleSaveSettings}
        />

        <ActiveGuardiansCard activeGuardians={activeGuardians} />

        <SuspiciousShiftsCard
          suspiciousShifts={suspiciousShifts}
          actionSessionId={actionSessionId}
          onReview={handleReview}
        />

        <RecentShiftsCard recentShifts={recentShifts} />
      </main>
    </div>
  );
}

