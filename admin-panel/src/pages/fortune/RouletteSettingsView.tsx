import { getSectorReadableName, toNum } from './fortuneHelpers';
import { FortunePanel } from './FortuneUi';
import type { RouletteConfig, RouletteSector } from './fortuneTypes';

export function RouletteSettingsView({
  rouletteDraft,
  activeSectorCount,
  onDraftChange,
  onPatchSector,
  onSave,
  onReset,
}: {
  rouletteDraft: RouletteConfig;
  activeSectorCount: number;
  onDraftChange: (draft: RouletteConfig) => void;
  onPatchSector: (index: number, patch: Partial<RouletteSector>) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const sectors = rouletteDraft.sectors || [];

  return (
    <div className="space-y-4">
      <FortunePanel title="Рулетка: основные параметры">
        <p className="text-sm text-slate-400">Меняй только понятные параметры. После сохранения изменения применяются сразу.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Бесплатных вращений в день</label>
            <input
              className="input-field"
              type="number"
              min={1}
              value={rouletteDraft.dailyFreeSpins ?? 3}
              onChange={(e) => onDraftChange({ ...rouletteDraft, dailyFreeSpins: toNum(e.target.value, rouletteDraft.dailyFreeSpins ?? 3) })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Минимум вращений до звезды</label>
            <input
              className="input-field"
              type="number"
              min={0}
              value={rouletteDraft.minSpinsSinceStar ?? 21}
              onChange={(e) => onDraftChange({ ...rouletteDraft, minSpinsSinceStar: toNum(e.target.value, rouletteDraft.minSpinsSinceStar ?? 21) })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Минимум дней между звездами</label>
            <input
              className="input-field"
              type="number"
              min={0}
              value={rouletteDraft.minDaysSinceStar ?? 7}
              onChange={(e) => onDraftChange({ ...rouletteDraft, minDaysSinceStar: toNum(e.target.value, rouletteDraft.minDaysSinceStar ?? 7) })}
            />
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
          Активных призов: <b>{activeSectorCount}</b>. Если приз выключен, он не выпадает.
        </div>
      </FortunePanel>

      <FortunePanel title="Рулетка: призы и частота выпадения">
        <div className="space-y-2">
          {sectors.map((row, idx) => (
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
                    onChange={(e) => onPatchSector(idx, { enabled: e.target.checked })}
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
                    onChange={(e) => onPatchSector(idx, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Размер награды</label>
                  <input
                    className="input-field"
                    type="number"
                    value={row.value ?? 0}
                    disabled={row.type === 'spin'}
                    onChange={(e) => onPatchSector(idx, { value: toNum(e.target.value, row.value ?? 0) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Частота выпадения (вес)</label>
                  <input
                    className="input-field"
                    type="number"
                    min={1}
                    value={row.weight ?? 1}
                    onChange={(e) => onPatchSector(idx, { weight: Math.max(1, Math.round(toNum(e.target.value, row.weight ?? 1))) })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button className="btn-primary" onClick={onSave}>Сохранить рулетку</button>
          <button className="btn-secondary" onClick={onReset}>Отменить изменения</button>
        </div>
      </FortunePanel>
    </div>
  );
}
