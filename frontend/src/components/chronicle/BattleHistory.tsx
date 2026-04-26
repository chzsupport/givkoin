import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';

const BattleHistory = () => {
  const { t } = useI18n();

  const formatNumber = (num: number) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  type ChronicleBattle = {
    battleId: string;
    status?: string;
    lightDamage?: number;
    darknessDamage?: number;
    attendanceCount?: number;
    endedAt?: string;
  };

  type Chronicle = {
    _id: string;
    date: string;
    battles?: ChronicleBattle[];
  };

  const [battles, setBattles] = useState<ChronicleBattle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiGet<{ chronicle: Chronicle }>('/chronicle/latest');
        const list = res?.chronicle?.battles;
        if (!cancelled) setBattles(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setBattles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      viewport={{ once: true }}
      className="mb-12"
    >
      <h2 className="text-[28px] font-bold text-[#D4AF37] mb-6">{t('battle_history.title')}</h2>

      {loading ? (
        <div className="text-[14px] text-slate-400">{t('battle_history.loading')}</div>
      ) : battles.length === 0 ? (
        <div className="text-[14px] text-slate-400">{t('battle_history.no_data')}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow-2xl border border-white/10 bg-black/20 backdrop-blur-md">
          <table className="w-full text-[14px] text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[#D4AF37] font-bold">
                <th className="p-4 border-b border-white/10">{t('battle_history.col_battle')}</th>
                <th className="p-4 border-b border-white/10">{t('battle_history.col_date')}</th>
                <th className="p-4 border-b border-white/10">{t('battle_history.col_outcome')}</th>
                <th className="p-4 border-b border-white/10">{t('battle_history.col_light_damage')}</th>
                <th className="p-4 border-b border-white/10">{t('battle_history.col_dark_damage')}</th>
                <th className="p-4 border-b border-white/10">{t('battle_history.col_attendance')}</th>
              </tr>
            </thead>
            <tbody>
              {battles.map((battle, index) => {
                const endedAt = battle.endedAt ? new Date(battle.endedAt) : null;
                const endedAtText = endedAt && !Number.isNaN(endedAt.getTime()) ? endedAt.toLocaleString() : '—';
                const outcome = battle.status === 'finished' ? t('battle_history.finished') : battle.status || '—';
                return (
                  <tr
                    key={battle.battleId}
                    className={`${index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'} hover:bg-white/5 transition-colors text-slate-300`}
                  >
                    <td className="p-4 border-b border-white/5 font-medium text-slate-200">{String(battle.battleId).slice(-6)}</td>
                    <td className="p-4 border-b border-white/5">{endedAtText}</td>
                    <td className="p-4 border-b border-white/5">{outcome}</td>
                    <td className="p-4 border-b border-white/5 font-mono text-slate-200">{formatNumber(battle.lightDamage || 0)}</td>
                    <td className="p-4 border-b border-white/5 font-mono text-slate-200">{formatNumber(battle.darknessDamage || 0)}</td>
                    <td className="p-4 border-b border-white/5 font-mono text-slate-200">{formatNumber(battle.attendanceCount || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
};

export default BattleHistory;
