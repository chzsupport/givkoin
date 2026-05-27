import { Card } from '../../components/ui';
import type { TndRules } from './tndTypes';

export function TndRulesTab({ rules }: { rules: TndRules }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="mb-4 text-lg font-semibold text-white">Юзер активен за день, если выполнено всё</h3>
        <div className="space-y-3 text-slate-300">
          <div>1. На сайте минимум {rules.daily?.minutes || 5} минут.</div>
          <div>2. Минимум {rules.daily?.kActions || 5} действий, где K списываются или начисляются.</div>
          <div>3. Посещено минимум {rules.daily?.pages || 3} разные страницы.</div>
        </div>
      </Card>
      <Card>
        <h3 className="mb-4 text-lg font-semibold text-white">Реферал активен за 30 дней, если выполнено всё</h3>
        <div className="space-y-3 text-slate-300">
          <div>1. Минимум {rules.referral?.visitDays || 15} дней посещений.</div>
          <div>2. Минимум {rules.referral?.kDebits || 30} трат K.</div>
          <div>3. Минимум {rules.referral?.kCredits || 60} заработков K.</div>
          <div>4. Сущность создана.</div>
          <div>5. Минимум {rules.referral?.battles || 3} участия в боях.</div>
          <div>6. Хотя бы {rules.referral?.bigBattleRewards || 1} бой с наградой больше 100 K.</div>
          <div>7. Минимум {rules.referral?.newsViews || 15} просмотренных постов.</div>
        </div>
      </Card>
    </div>
  );
}
