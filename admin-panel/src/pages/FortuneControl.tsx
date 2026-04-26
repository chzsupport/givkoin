import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="text-sm font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}

function Message({ error, ok }: { error: string; ok: string }) {
  if (error) {
    return <div className="rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{error}</div>;
  }
  if (ok) {
    return <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-300">{ok}</div>;
  }
  return null;
}

type FortuneMode = 'stats' | 'roulette' | 'lottery' | 'wins';

function toNum(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDrawTime(hour: unknown, minute: unknown) {
  const h = String(Math.max(0, Math.min(23, Math.round(toNum(hour, 23))))).padStart(2, '0');
  const m = String(Math.max(0, Math.min(59, Math.round(toNum(minute, 59))))).padStart(2, '0');
  return `${h}:${m}`;
}

function parseDrawTime(input: string) {
  const [h, m] = String(input || '').split(':');
  return {
    hour: Math.max(0, Math.min(23, Math.round(toNum(h, 23)))),
    minute: Math.max(0, Math.min(59, Math.round(toNum(m, 59)))),
  };
}

function getSectorReadableName(row: any) {
  if (row?.type === 'sc') return `${toNum(row?.value, 0)} K`;
  if (row?.type === 'star') return `${toNum(row?.value, 0)} ⭐`;
  if (row?.type === 'spin') return '+1 бесплатный спин';
  return String(row?.label || 'Приз');
}

export default function FortuneControl() {
  const [mode, setMode] = useState<FortuneMode>('stats');
  const [stats, setStats] = useState<any>(null);
  const [winsRows, setWinsRows] = useState<any[]>([]);
  const [winsSummary, setWinsSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [winsFilter, setWinsFilter] = useState({
    gameType: '',
    rewardType: '',
    userId: '',
    from: '',
    to: '',
  });

  const [rouletteDraft, setRouletteDraft] = useState<any>({
    dailyFreeSpins: 3,
    minSpinsSinceStar: 21,
    minDaysSinceStar: 7,
    sectors: [],
  });
  const [lotteryDraft, setLotteryDraft] = useState<any>({
    ticketCost: 100,
    maxTicketsPerDay: 10,
    drawHour: 23,
    drawMinute: 59,
    payoutByMatches: { 3: 150, 4: 300, 5: 600, 6: 900, 7: 1000 },
  });
  const [lotteryTime, setLotteryTime] = useState('23:59');
  const [initialRoulette, setInitialRoulette] = useState<any>(null);
  const [initialLottery, setInitialLottery] = useState<any>(null);

  const activeSectorCount = useMemo(
    () => (Array.isArray(rouletteDraft.sectors) ? rouletteDraft.sectors.filter((s: any) => s?.enabled).length : 0),
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
      setStats(statsRes.data || null);
      const rouletteConfig = configRes.data?.config?.roulette || rouletteDraft;
      const lotteryConfig = configRes.data?.config?.lottery || lotteryDraft;
      setRouletteDraft(rouletteConfig);
      setLotteryDraft(lotteryConfig);
      setLotteryTime(formatDrawTime(lotteryConfig?.drawHour, lotteryConfig?.drawMinute));
      setInitialRoulette(rouletteConfig);
      setInitialLottery(lotteryConfig);
      setWinsRows(Array.isArray(winsRes.data?.rows) ? winsRes.data.rows : []);
      setWinsSummary(winsRes.data?.summary || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Ошибка загрузки Фортуны');
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
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить журнал выигрышей');
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
        sectors: Array.isArray(rouletteDraft.sectors) ? rouletteDraft.sectors.map((s: any) => ({
          label: String(s.label || ''),
          type: String(s.type || 'sc'),
          value: toNum(s.value, 0),
          weight: Math.max(1, Math.round(toNum(s.weight, 1))),
          enabled: Boolean(s.enabled),
        })) : [],
      };
      await api.patch('/admin/v2/cms/fortune/config/roulette', payload);
      setOk('Рулетка сохранена');
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить рулетку');
    }
  };

  const saveLottery = async () => {
    setError('');
    setOk('');
    try {
      const parsed = parseDrawTime(lotteryTime);
      const payload = {
        ticketCost: Math.max(1, Math.round(toNum(lotteryDraft.ticketCost, 100))),
        maxTicketsPerDay: Math.max(1, Math.round(toNum(lotteryDraft.maxTicketsPerDay, 10))),
        drawHour: parsed.hour,
        drawMinute: parsed.minute,
        payoutByMatches: {
          3: Math.max(0, Math.round(toNum(lotteryDraft?.payoutByMatches?.[3], 0))),
          4: Math.max(0, Math.round(toNum(lotteryDraft?.payoutByMatches?.[4], 0))),
          5: Math.max(0, Math.round(toNum(lotteryDraft?.payoutByMatches?.[5], 0))),
          6: Math.max(0, Math.round(toNum(lotteryDraft?.payoutByMatches?.[6], 0))),
          7: Math.max(0, Math.round(toNum(lotteryDraft?.payoutByMatches?.[7], 0))),
        },
      };
      await api.patch('/admin/v2/cms/fortune/config/lottery', payload);
      setOk('Лотерея сохранена');
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить лотерею');
    }
  };

  const patchSector = (index: number, patch: Record<string, any>) => {
    const next = [...(rouletteDraft.sectors || [])];
    next[index] = { ...next[index], ...patch };
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
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось запустить розыгрыш');
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
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось выгрузить CSV');
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <Message error={error} ok={ok} />
      <div className="flex gap-2 flex-wrap">
        <button className={`btn-secondary ${mode === 'stats' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setMode('stats')}>Статистика</button>
        <button className={`btn-secondary ${mode === 'roulette' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setMode('roulette')}>Рулетка</button>
        <button className={`btn-secondary ${mode === 'lottery' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setMode('lottery')}>Лотерея</button>
        <button className={`btn-secondary ${mode === 'wins' ? 'ring-2 ring-cyan-400/40' : ''}`} onClick={() => setMode('wins')}>Выигрыши 90 дней</button>
        <button className="btn-secondary" onClick={loadAll}>Обновить</button>
      </div>

      {mode === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Panel title="Рулетка: всего вращений"><div className="text-2xl font-bold text-white">{stats?.roulette?.totalSpins || 0}</div></Panel>
          <Panel title="Рулетка: активных игроков"><div className="text-2xl font-bold text-white">{stats?.roulette?.activeUsers || 0}</div></Panel>
          <Panel title="Лотерея: всего билетов"><div className="text-2xl font-bold text-white">{stats?.lottery?.totalTickets || 0}</div></Panel>
          <Panel title="Лотерея: выплачено K"><div className="text-2xl font-bold text-white">{stats?.lottery?.totalPrizesPaid || 0}</div></Panel>
        </div>
      )}

      {mode === 'roulette' && (
        <div className="space-y-4">
          <Panel title="Рулетка: основные параметры">
            <p className="text-sm text-slate-400">Меняй только понятные параметры. После сохранения изменения применяются сразу.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Бесплатных вращений в день</label>
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  value={rouletteDraft.dailyFreeSpins}
                  onChange={(e) => setRouletteDraft({ ...rouletteDraft, dailyFreeSpins: toNum(e.target.value, rouletteDraft.dailyFreeSpins) })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Минимум вращений до звезды</label>
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  value={rouletteDraft.minSpinsSinceStar}
                  onChange={(e) => setRouletteDraft({ ...rouletteDraft, minSpinsSinceStar: toNum(e.target.value, rouletteDraft.minSpinsSinceStar) })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Минимум дней между звездами</label>
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  value={rouletteDraft.minDaysSinceStar}
                  onChange={(e) => setRouletteDraft({ ...rouletteDraft, minDaysSinceStar: toNum(e.target.value, rouletteDraft.minDaysSinceStar) })}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
              Активных призов: <b>{activeSectorCount}</b>. Если приз выключен, он не выпадает.
            </div>
          </Panel>

          <Panel title="Рулетка: призы и частота выпадения">
            <div className="space-y-2">
              {(rouletteDraft.sectors || []).map((row: any, idx: number) => (
                <div key={`${row.label}_${idx}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{getSectorReadableName(row)}</div>
                      <div className="text-xs text-slate-400">Тип награды: {row.type}</div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(row.enabled)}
                        onChange={(e) => patchSector(idx, { enabled: e.target.checked })}
                      />
                      Активен
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Название</label>
                      <input
                        className="input-field"
                        value={row.label || ''}
                        onChange={(e) => patchSector(idx, { label: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Размер награды</label>
                      <input
                        className="input-field"
                        type="number"
                        value={row.value ?? 0}
                        disabled={row.type === 'spin'}
                        onChange={(e) => patchSector(idx, { value: toNum(e.target.value, row.value ?? 0) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400">Частота выпадения (вес)</label>
                      <input
                        className="input-field"
                        type="number"
                        min={1}
                        value={row.weight ?? 1}
                        onChange={(e) => patchSector(idx, { weight: Math.max(1, Math.round(toNum(e.target.value, row.weight ?? 1))) })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button className="btn-primary" onClick={saveRoulette}>Сохранить рулетку</button>
              <button className="btn-secondary" onClick={resetRouletteDraft}>Отменить изменения</button>
            </div>
          </Panel>
        </div>
      )}

      {mode === 'lottery' && (
        <div className="space-y-4">
          <Panel title="Лотерея: основные параметры">
            <p className="text-sm text-slate-400">Задай цену билета, лимит в день и время ежедневного розыгрыша.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Цена билета (K)</label>
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  value={lotteryDraft.ticketCost}
                  onChange={(e) => setLotteryDraft({ ...lotteryDraft, ticketCost: toNum(e.target.value, lotteryDraft.ticketCost) })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Максимум билетов в день</label>
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  value={lotteryDraft.maxTicketsPerDay}
                  onChange={(e) => setLotteryDraft({ ...lotteryDraft, maxTicketsPerDay: toNum(e.target.value, lotteryDraft.maxTicketsPerDay) })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Время розыгрыша</label>
                <input
                  className="input-field"
                  type="time"
                  value={lotteryTime}
                  onChange={(e) => setLotteryTime(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
              Сейчас: билет <b>{lotteryDraft.ticketCost} K</b>, лимит <b>{lotteryDraft.maxTicketsPerDay}</b> в день, розыгрыш в <b>{lotteryTime}</b>.
            </div>
          </Panel>

          <Panel title="Лотерея: выплаты за совпадения">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {[3, 4, 5, 6, 7].map((m) => (
                <div key={m} className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
                  <div className="text-xs text-slate-400">{m} совпадения</div>
                  <input
                    className="input-field"
                    type="number"
                    min={0}
                    value={lotteryDraft?.payoutByMatches?.[m] ?? 0}
                    onChange={(e) => setLotteryDraft({
                      ...lotteryDraft,
                      payoutByMatches: {
                        ...(lotteryDraft.payoutByMatches || {}),
                        [m]: Math.max(0, Math.round(toNum(e.target.value, lotteryDraft?.payoutByMatches?.[m] ?? 0))),
                      },
                    })}
                  />
                  <div className="text-xs text-slate-500">K</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button className="btn-primary" onClick={saveLottery}>Сохранить лотерею</button>
              <button className="btn-secondary" onClick={resetLotteryDraft}>Отменить изменения</button>
              <button className="btn-secondary" onClick={drawNow}>Запустить розыгрыш сейчас</button>
            </div>
          </Panel>
        </div>
      )}

      {mode === 'wins' && (
        <Panel title="История выигрышей (последние 90 дней)">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <select className="input-field" value={winsFilter.gameType} onChange={(e) => setWinsFilter({ ...winsFilter, gameType: e.target.value })}>
              <option value="">Все игры</option>
              <option value="roulette">Рулетка</option>
              <option value="lottery">Лотерея</option>
            </select>
            <select className="input-field" value={winsFilter.rewardType} onChange={(e) => setWinsFilter({ ...winsFilter, rewardType: e.target.value })}>
              <option value="">Все награды</option>
              <option value="sc">K</option>
              <option value="star">Star</option>
              <option value="spin">Spin</option>
            </select>
            <input className="input-field" placeholder="ID пользователя" value={winsFilter.userId} onChange={(e) => setWinsFilter({ ...winsFilter, userId: e.target.value })} />
            <input className="input-field" type="date" value={winsFilter.from} onChange={(e) => setWinsFilter({ ...winsFilter, from: e.target.value })} />
            <input className="input-field" type="date" value={winsFilter.to} onChange={(e) => setWinsFilter({ ...winsFilter, to: e.target.value })} />
            <button className="btn-primary" onClick={reloadWins}>Применить</button>
          </div>
          <div className="flex gap-3 text-sm text-slate-300">
            <span>Всего: {winsSummary?.all?.count || 0}</span>
            <span>Сумма: {winsSummary?.all?.totalAmount || 0}</span>
            <button className="btn-secondary" onClick={exportWins}>CSV</button>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400"><th className="py-2">Время</th><th className="py-2">Игра</th><th className="py-2">Награда</th><th className="py-2">Сумма</th><th className="py-2">Пользователь</th><th className="py-2">Детали</th></tr>
              </thead>
              <tbody>
                {winsRows.map((row) => (
                  <tr key={row._id} className="border-t border-white/5">
                    <td className="py-2 text-slate-300">{new Date(row.occurredAt || row.createdAt).toLocaleString()}</td>
                    <td className="py-2 text-slate-200">{row.gameType}</td>
                    <td className="py-2 text-slate-200">{row.rewardType}</td>
                    <td className="py-2 text-slate-300">{row.amount}</td>
                    <td className="py-2 text-slate-300">{row.user?.nickname || row.user?.email || row.user?._id || '-'}</td>
                    <td className="py-2 text-xs text-slate-400">{row.label || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

