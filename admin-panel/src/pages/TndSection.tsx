import { useEffect, useState } from 'react';
import { fetchTndStats } from '../api/admin';
import { Card } from '../components/ui';
import { TndDailyTab } from './tnd/TndDailyTab';
import { TndHeader } from './tnd/TndHeader';
import { TndReferralsTab } from './tnd/TndReferralsTab';
import { TndRulesTab } from './tnd/TndRulesTab';
import { TndTabs } from './tnd/TndUi';
import type { TndStatsData, TndTab } from './tnd/tndTypes';

function TndSection() {
  const [tab, setTab] = useState<TndTab>('daily');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TndStatsData | null>(null);
  const [dayKey, setDayKey] = useState('');
  const [dailyPage, setDailyPage] = useState(1);
  const [referralPage, setReferralPage] = useState(1);
  const [referralStatus, setReferralStatus] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchTndStats({
        dayKey: dayKey || undefined,
        dailyPage,
        dailyLimit: 20,
        referralPage,
        referralLimit: 20,
        referralStatus: referralStatus || undefined,
      });
      setData(result || null);
      if (!dayKey && result?.daily?.dayKey) {
        setDayKey(result.daily.dayKey);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [dayKey, dailyPage, referralPage, referralStatus]);

  const daily = data?.daily || {};
  const referrals = data?.referrals || {};
  const rules = data?.rules || {};

  return (
    <div className="space-y-6">
      <TndHeader onReload={load} />
      <TndTabs tab={tab} onTabChange={setTab} />

      {loading && !data ? (
        <Card>
          <div className="py-10 text-center text-slate-500">Загрузка...</div>
        </Card>
      ) : null}

      {tab === 'daily' && (
        <TndDailyTab
          daily={daily}
          dayKey={dayKey}
          dailyPage={dailyPage}
          onDayKeyChange={setDayKey}
          onDailyPageChange={setDailyPage}
        />
      )}

      {tab === 'referrals' && (
        <TndReferralsTab
          referrals={referrals}
          referralStatus={referralStatus}
          referralPage={referralPage}
          onReferralStatusChange={setReferralStatus}
          onReferralPageChange={setReferralPage}
        />
      )}

      {tab === 'rules' && <TndRulesTab rules={rules} />}
    </div>
  );
}

export default TndSection;
