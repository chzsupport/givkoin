import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import {
  createDefaultLotteryConfig,
  createDefaultRouletteConfig,
  formatDrawTime,
  getFortuneApiErrorMessage,
  parseDrawTime,
  toNum,
} from './fortune/fortuneHelpers';
import { FortuneMessage, FortuneModeTabs } from './fortune/FortuneUi';
import { FortuneStatsView } from './fortune/FortuneStatsView';
import { LotterySettingsView } from './fortune/LotterySettingsView';
import { RouletteSettingsView } from './fortune/RouletteSettingsView';
import { WinsHistoryView } from './fortune/WinsHistoryView';
import type {
  FortuneMode,
  FortuneStats,
  FortuneWinRow,
  FortuneWinsSummary,
  LotteryConfig,
  RouletteConfig,
  RouletteSector,
  WinsFilter,
} from './fortune/fortuneTypes';

export default function FortuneControl() {
  const [mode, setMode] = useState<FortuneMode>('stats');
  const [stats, setStats] = useState<FortuneStats | null>(null);
  const [winsRows, setWinsRows] = useState<FortuneWinRow[]>([]);
  const [winsSummary, setWinsSummary] = useState<FortuneWinsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [winsFilter, setWinsFilter] = useState<WinsFilter>({
    gameType: '',
    rewardType: '',
    userId: '',
    from: '',
    to: '',
  });

  const [rouletteDraft, setRouletteDraft] = useState<RouletteConfig>(createDefaultRouletteConfig);
  const [lotteryDraft, setLotteryDraft] = useState<LotteryConfig>(createDefaultLotteryConfig);
  const [lotteryTime, setLotteryTime] = useState('23:59');
  const [initialRoulette, setInitialRoulette] = useState<RouletteConfig | null>(null);
  const [initialLottery, setInitialLottery] = useState<LotteryConfig | null>(null);

  const activeSectorCount = useMemo(
    () => (Array.isArray(rouletteDraft.sectors) ? rouletteDraft.sectors.filter((s) => s?.enabled).length : 0),
    [rouletteDraft.sectors]
  );

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, configRes, winsRes] = await Promise.all([
        api.get('/admin/v2/cms/fortune/stats'),
        api.get('/admin/v2/cms/fortune/config'),
        api.get('/admin/v2/cms/fortune/wins', { params: { limit: 100 } }),
      ]);
      const rouletteConfig = configRes.data?.config?.roulette || rouletteDraft;
      const lotteryConfig = configRes.data?.config?.lottery || lotteryDraft;
      setStats(statsRes.data || null);
      setRouletteDraft(rouletteConfig);
      setLotteryDraft(lotteryConfig);
      setLotteryTime(formatDrawTime(lotteryConfig?.drawHour, lotteryConfig?.drawMinute));
      setInitialRoulette(rouletteConfig);
      setInitialLottery(lotteryConfig);
      setWinsRows(Array.isArray(winsRes.data?.rows) ? winsRes.data.rows : []);
      setWinsSummary(winsRes.data?.summary || null);
    } catch (e) {
      setError(getFortuneApiErrorMessage(e, 'Ошибка загрузки Фортуны'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const reloadWins = async () => {
    setError('');
    try {
      const res = await api.get('/admin/v2/cms/fortune/wins', {
        params: {
          ...winsFilter,
          gameType: winsFilter.gameType || undefined,
          rewardType: winsFilter.rewardType || undefined,
          userId: winsFilter.userId || undefined,
          from: winsFilter.from || undefined,
          to: winsFilter.to || undefined,
          limit: 200,
        },
      });
      setWinsRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setWinsSummary(res.data?.summary || null);
    } catch (e) {
      setError(getFortuneApiErrorMessage(e, 'Не удалось загрузить журнал выигрышей'));
    }
  };

  const saveRoulette = async () => {
    setError('');
    setOk('');
    try {
      if (activeSectorCount < 1) {
        setError('Нужно оставить минимум 1 активный приз в рулетке');
        return;
      }
      const payload = {
        dailyFreeSpins: Math.max(1, Math.round(toNum(rouletteDraft.dailyFreeSpins, 3))),
        minSpinsSinceStar: Math.max(0, Math.round(toNum(rouletteDraft.minSpinsSinceStar, 21))),
        minDaysSinceStar: Math.max(0, Math.round(toNum(rouletteDraft.minDaysSinceStar, 7))),
        sectors: Array.isArray(rouletteDraft.sectors) ? rouletteDraft.sectors.map((s) => ({
          label: String(s.label || ''),
          type: String(s.type || 'k'),
          value: toNum(s.value, 0),
          weight: Math.max(1, Math.round(toNum(s.weight, 1))),
          enabled: Boolean(s.enabled),
        })) : [],
      };
      await api.patch('/admin/v2/cms/fortune/config/roulette', payload);
      setOk('Рулетка сохранена');
      await loadAll();
    } catch (e) {
      setError(getFortuneApiErrorMessage(e, 'Не удалось сохранить рулетку'));
    }
  };

  const saveLottery = async () => {
    setError('');
    setOk('');
    try {
      const parsed = parseDrawTime(lotteryTime);
      const payoutByMatches = lotteryDraft.payoutByMatches || {};
      const payload = {
        ticketCost: Math.max(1, Math.round(toNum(lotteryDraft.ticketCost, 100))),
        maxTicketsPerDay: Math.max(1, Math.round(toNum(lotteryDraft.maxTicketsPerDay, 10))),
        drawHour: parsed.hour,
        drawMinute: parsed.minute,
        payoutByMatches: {
          3: Math.max(0, Math.round(toNum(payoutByMatches[3], 0))),
          4: Math.max(0, Math.round(toNum(payoutByMatches[4], 0))),
          5: Math.max(0, Math.round(toNum(payoutByMatches[5], 0))),
          6: Math.max(0, Math.round(toNum(payoutByMatches[6], 0))),
          7: Math.max(0, Math.round(toNum(payoutByMatches[7], 0))),
        },
      };
      await api.patch('/admin/v2/cms/fortune/config/lottery', payload);
      setOk('Лотерея сохранена');
      await loadAll();
    } catch (e) {
      setError(getFortuneApiErrorMessage(e, 'Не удалось сохранить лотерею'));
    }
  };

  const patchSector = (index: number, patch: Partial<RouletteSector>) => {
    const next = [...(rouletteDraft.sectors || [])];
    next[index] = { ...(next[index] || {}), ...patch };
    setRouletteDraft({ ...rouletteDraft, sectors: next });
  };

  const resetRouletteDraft = () => {
    if (!initialRoulette) return;
    setRouletteDraft(initialRoulette);
    setOk('Откатили изменения рулетки до последнего сохранения');
    setError('');
  };

  const resetLotteryDraft = () => {
    if (!initialLottery) return;
    setLotteryDraft(initialLottery);
    setLotteryTime(formatDrawTime(initialLottery?.drawHour, initialLottery?.drawMinute));
    setOk('Откатили изменения лотереи до последнего сохранения');
    setError('');
  };

  const drawNow = async () => {
    const phrase = prompt('Для запуска розыгрыша введите: CONFIRM fortune.lottery.draw_now');
    if (!phrase) return;
    setError('');
    setOk('');
    try {
      await api.post('/admin/v2/cms/fortune/lottery/draw-now', {
        confirmationPhrase: phrase,
      });
      setOk('Розыгрыш запущен');
      await loadAll();
    } catch (e) {
      setError(getFortuneApiErrorMessage(e, 'Не удалось запустить розыгрыш'));
    }
  };

  const exportWins = async () => {
    setError('');
    try {
      const res = await api.get('/admin/v2/cms/fortune/wins/export', {
        params: {
          gameType: winsFilter.gameType || undefined,
          rewardType: winsFilter.rewardType || undefined,
          userId: winsFilter.userId || undefined,
          from: winsFilter.from || undefined,
          to: winsFilter.to || undefined,
        },
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fortune-wins-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(getFortuneApiErrorMessage(e, 'Не удалось выгрузить CSV'));
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <FortuneMessage error={error} ok={ok} />
      <FortuneModeTabs mode={mode} onModeChange={setMode} onReload={loadAll} />

      {mode === 'stats' && <FortuneStatsView stats={stats} />}

      {mode === 'roulette' && (
        <RouletteSettingsView
          rouletteDraft={rouletteDraft}
          activeSectorCount={activeSectorCount}
          onDraftChange={setRouletteDraft}
          onPatchSector={patchSector}
          onSave={saveRoulette}
          onReset={resetRouletteDraft}
        />
      )}

      {mode === 'lottery' && (
        <LotterySettingsView
          lotteryDraft={lotteryDraft}
          lotteryTime={lotteryTime}
          onDraftChange={setLotteryDraft}
          onLotteryTimeChange={setLotteryTime}
          onSave={saveLottery}
          onReset={resetLotteryDraft}
          onDrawNow={drawNow}
        />
      )}

      {mode === 'wins' && (
        <WinsHistoryView
          winsFilter={winsFilter}
          winsRows={winsRows}
          winsSummary={winsSummary}
          onWinsFilterChange={setWinsFilter}
          onReloadWins={reloadWins}
          onExportWins={exportWins}
        />
      )}
    </div>
  );
}
