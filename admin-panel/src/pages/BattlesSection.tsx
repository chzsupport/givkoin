import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../api/client';
import { fetchBattleMoodForecast, fetchSuspiciousBattleUsers } from '../api/admin';
import { BattleControlTab } from './battles/BattleControlTab';
import { BattleHistoryTab } from './battles/BattleHistoryTab';
import { BattleMoodTab } from './battles/BattleMoodTab';
import type {
  BattleMood,
  BattleRecord,
  RequestApprovalPayload,
  SuspiciousBattleRow,
} from './battles/battleTypes';

// --- Sections ---


function BattlesSection({
  requestApprovalPayload,
}: {
  requestApprovalPayload: RequestApprovalPayload;
}) {
  const [battles, setBattles] = useState<BattleRecord[]>([]);
  const [suspiciousRows, setSuspiciousRows] = useState<SuspiciousBattleRow[]>([]);
  const [battleMood, setBattleMood] = useState<BattleMood | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspiciousLoading, setSuspiciousLoading] = useState(true);
  const [moodLoading, setMoodLoading] = useState(true);
  const [battleTab, setBattleTab] = useState<'control' | 'mood' | 'history'>('control');

  const loadBattles = async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/battles');
      const nextBattles = data.data?.battles || data.data || [];
      setBattles(Array.isArray(nextBattles) ? nextBattles : []);
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
    loadSuspicious();
    loadMood();
  }, []);

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
        <BattleControlTab requestApprovalPayload={requestApprovalPayload} onRefreshMood={loadMood} />
      )}

      {battleTab === 'mood' && (
        <BattleMoodTab battleMood={battleMood} moodLoading={moodLoading} onRefresh={loadMood} />
      )}

      {battleTab === 'history' && (
        <BattleHistoryTab battles={battles} suspiciousRows={suspiciousRows} suspiciousLoading={suspiciousLoading} />
      )}
    </div>
  );
}

export default BattlesSection;
