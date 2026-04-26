import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';

const ChronicleStats = () => {
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
    stage?: number;
    healthPercent?: number;
    radianceTotal?: number;
    injuriesActive?: number;
    lastHealedAt?: string | null;
    lastGrowthAt?: string | null;
    battles?: ChronicleBattle[];
    summary?: string;
  };

  const [chronicle, setChronicle] = useState<Chronicle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiGet<{ chronicle: Chronicle }>('/chronicle/latest');
        if (!cancelled) setChronicle(res.chronicle || null);
      } catch (e) {
        if (!cancelled) setChronicle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const lastBattleAt = useMemo(() => {
    const endedAt = chronicle?.battles?.[0]?.endedAt;
    if (!endedAt) return null;
    const d = new Date(endedAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [chronicle?.battles]);

  const radianceTotal = chronicle?.radianceTotal ?? null;
  const healthPercent = chronicle?.healthPercent ?? null;
  const stage = chronicle?.stage ?? null;
  const injuriesActive = chronicle?.injuriesActive ?? null;
  const totalBattles = chronicle?.battles?.length ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
      className="bg-[#2D5016]/20 backdrop-blur-md p-[20px] rounded-[12px] border border-white/10 shadow-2xl mb-8"
    >
      <h2 className="text-[24px] font-bold text-[#D4AF37] mb-6">{t('chronicle_stats.title')}</h2>

      {loading ? (
        <div className="text-[14px] text-slate-400">{t('chronicle_stats.loading')}</div>
      ) : !chronicle ? (
        <div className="text-[14px] text-slate-400">{t('chronicle_stats.no_data')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Левая колонка */}
          <div className="space-y-4">
            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.tree_stage')}:</p>
              <p className="text-[16px] font-bold text-slate-200">{stage ?? '—'}</p>
            </div>

            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.radiance_total')}:</p>
              <p className="text-[16px] font-bold text-slate-200">{radianceTotal == null ? '—' : formatNumber(radianceTotal)}</p>
            </div>

            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.health')}:</p>
              <p className="text-[16px] font-bold text-slate-200">{healthPercent == null ? '—' : `${healthPercent}%`}</p>
            </div>

            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.active_injuries')}:</p>
              <p className="text-[16px] font-bold text-slate-200">{injuriesActive == null ? '—' : injuriesActive}</p>
            </div>
          </div>

          {/* Правая колонка */}
          <div className="space-y-4">
            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.battles_per_day')}:</p>
              <p className="text-[16px] font-bold text-slate-200">{totalBattles == null ? '—' : totalBattles}</p>
            </div>

            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.last_battle')}:</p>
              <p className="text-[16px] font-bold text-slate-200">{lastBattleAt ? lastBattleAt.toLocaleString() : '—'}</p>
            </div>

            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.last_heal')}:</p>
              <p className="text-[16px] font-bold text-slate-200">
                {chronicle.lastHealedAt ? new Date(chronicle.lastHealedAt).toLocaleString() : '—'}
              </p>
            </div>

            <div>
              <p className="text-[16px] text-slate-400">{t('chronicle_stats.last_growth')}:</p>
              <p className="text-[16px] font-bold text-slate-200">
                {chronicle.lastGrowthAt ? new Date(chronicle.lastGrowthAt).toLocaleString() : '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ChronicleStats;
