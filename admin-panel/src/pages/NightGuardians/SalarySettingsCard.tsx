import { Coins } from 'lucide-react';
import { Button, Card, Input } from './NightGuardiansUi';
import type { SalarySettings } from './types';

export function SalarySettingsCard({
  settings,
  savingSettings,
  onChange,
  onSave,
}: {
  settings: SalarySettings;
  savingSettings: boolean;
  onChange: (settings: SalarySettings) => void;
  onSave: () => void;
}) {
  return (
    <Card
      title={
        <>
          <Coins className="h-5 w-5 text-yellow-500" />
          Оплата ночной смены
        </>
      }
      subtitle="Меняется только оплата за полный час. Само расписание фиксировано и не редактируется."
      className="mb-8"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-400">K за час</label>
          <Input
            type="number"
            value={settings.k}
            onChange={(event) => onChange({ ...settings, k: Number(event.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-400">Люмены за час</label>
          <Input
            type="number"
            value={settings.lm}
            onChange={(event) => onChange({ ...settings, lm: Number(event.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-400">Звёзды за час</label>
          <Input
            type="number"
            step="0.0001"
            value={settings.stars}
            onChange={(event) => onChange({ ...settings, stars: Number(event.target.value) })}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={onSave} disabled={savingSettings} className="w-full">
            <Coins className="h-4 w-4" />
            {savingSettings ? 'Сохраняю...' : 'Сохранить оплату'}
          </Button>
        </div>
      </div>
      <div className="mt-4 text-xs text-slate-500">
        При штрафе модератор снимает 80% именно от награды конкретной смены.
      </div>
    </Card>
  );
}
