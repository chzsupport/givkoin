import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../api/client';
import { AdsCreativesTable } from './ads/AdsCreativesTable';
import { AdsStatsCards } from './ads/AdsStatsCards';
import { AdsDailyStatsTable, AdsTimeBreakdownTables, AdsTimeByPageTable } from './ads/AdsStatsTables';
import { CreativeModal } from './ads/CreativeModal';
import { createEmptyCreativeForm, getAdsApiErrorMessage } from './ads/adFormatters';
import type { AdCreative, AdsStats, CreativeForm } from './ads/adTypes';

function AdsSection() {
  const [stats, setStats] = useState<AdsStats | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [creativeForm, setCreativeForm] = useState<CreativeForm>(createEmptyCreativeForm());
  const [editingCreative, setEditingCreative] = useState<AdCreative | null>(null);

  const resetCreativeForm = () => {
    setEditingCreative(null);
    setCreativeForm(createEmptyCreativeForm());
  };

  const loadData = async () => {
    try {
      const [statsRes, creativesRes] = await Promise.all([
        api.get('/ads/stats'),
        api.get('/ads/creatives'),
      ]);
      setStats(statsRes.data);
      setCreatives(Array.isArray(creativesRes.data) ? creativesRes.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = () => {
    resetCreativeForm();
    setShowCreativeModal(true);
  };

  const handleSaveCreative = async () => {
    try {
      const payload = {
        ...creativeForm,
        kind: creativeForm.type,
        targetPages: Array.isArray(creativeForm.targetPages) && creativeForm.targetPages.length ? creativeForm.targetPages : ['all'],
        targetPlacements: ['all'],
      };
      if (editingCreative) {
        await api.patch(`/ads/creatives/${editingCreative._id}`, payload);
      } else {
        await api.post('/ads/creatives', payload);
      }
      setShowCreativeModal(false);
      resetCreativeForm();
      loadData();
    } catch (e) {
      console.error(e);
      alert(getAdsApiErrorMessage(e));
    }
  };

  const handleEdit = (creative: AdCreative) => {
    const kind = String(creative.kind || creative.type || '').toLowerCase();
    const emptyForm = createEmptyCreativeForm();
    setEditingCreative(creative);
    setCreativeForm({
      name: creative.name || emptyForm.name,
      type: kind === 'vast' ? 'vast' : 'banner',
      content: creative.content || emptyForm.content,
      duration: Number(creative.duration) || emptyForm.duration,
      active: typeof creative.active === 'boolean' ? creative.active : emptyForm.active,
      priority: Number(creative.priority) || emptyForm.priority,
      targetPages: Array.isArray(creative.targetPages) && creative.targetPages.length ? creative.targetPages : ['all'],
    });
    setShowCreativeModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот креатив?')) return;
    try {
      await api.delete(`/ads/creatives/${id}`);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleCreativeActive = async (id: string, active: boolean) => {
    try {
      await api.patch(`/ads/creatives/${id}`, { active: !active });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-slate-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <AdsStatsCards stats={stats} creativesCount={creatives.length} />
      <AdsDailyStatsTable stats={stats} />
      <AdsTimeByPageTable stats={stats} />
      <AdsTimeBreakdownTables stats={stats} />

      <AdsCreativesTable
        creatives={creatives}
        onCreate={handleCreate}
        onToggleActive={toggleCreativeActive}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <CreativeModal
        show={showCreativeModal}
        editingCreative={editingCreative}
        creativeForm={creativeForm}
        onFormChange={setCreativeForm}
        onClose={() => setShowCreativeModal(false)}
        onCancel={() => {
          setShowCreativeModal(false);
          resetCreativeForm();
        }}
        onSave={handleSaveCreative}
      />
    </div>
  );
}

export default AdsSection;
