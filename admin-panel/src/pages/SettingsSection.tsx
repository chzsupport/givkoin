import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Coins, RefreshCw, Save, Shield } from 'lucide-react';
import { createBackup, fetchSettings, updateSettings } from '../api/admin';
import { Card } from '../components/ui';

type SettingsTab = 'economy' | 'system';

type ApprovalPayload = {
  reason?: string;
  impactPreview?: string;
  confirmationPhrase?: string;
};

type RequestApprovalPayload = (options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) => ApprovalPayload | null;

function SettingsSection({
  requestApprovalPayload,
}: {
  requestApprovalPayload: RequestApprovalPayload;
}) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>('economy');

  const loadData = async () => {
    setLoading(true);
    try {
      const s = await fetchSettings();
      setSettings(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveEconomy = async () => {
    try {
      const payload = {
        K_PER_HOUR_CHAT: settings?.K_PER_HOUR_CHAT,
        CHAT_MINUTES_PER_DAY_CAP: settings?.CHAT_MINUTES_PER_DAY_CAP,
        INITIAL_LIVES: settings?.INITIAL_LIVES,
        K_APPEAL_COMPENSATION: settings?.K_APPEAL_COMPENSATION,
      };
      await updateSettings(payload);
      alert('Настройки экономики сохранены');
    } catch (e) {
      alert('Ошибка сохранения');
    }
  };

  const handleBackup = async () => {
    if (!confirm('Создать заявку на резервную копию?')) return;
    const approval = requestApprovalPayload({
      title: 'Создание полной резервной копии',
      impactPreviewDefault: 'Будет создан архив резервной копии данных проекта.',
      confirmationPhrase: 'CONFIRM system.backup.create',
    });
    if (!approval) return;

    try {
      const res = await createBackup(approval);
      alert(
        res?.operationId
          ? `Заявка создана. Номер операции: ${res.operationId}`
          : (res?.message || 'Операция отправлена')
      );
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Ошибка создания заявки');
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-white/10 pb-4 flex-wrap">
        {[
          { id: 'economy', label: 'Экономика', icon: Coins },
          { id: 'system', label: 'Система', icon: Shield },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>


      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'economy' && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Экономика и K">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">K за час общения</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.K_PER_HOUR_CHAT || ''}
                        onChange={(e) => setSettings({ ...settings, K_PER_HOUR_CHAT: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Компенсация за апелляцию</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.K_APPEAL_COMPENSATION || ''}
                        onChange={(e) => setSettings({ ...settings, K_APPEAL_COMPENSATION: e.target.value })}
                      />
                    </div>
                  </div>
                </Card>
                <Card title="Лимиты и Жизни">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Начальное кол-во жизней</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.INITIAL_LIVES || ''}
                        onChange={(e) => setSettings({ ...settings, INITIAL_LIVES: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-400">Лимит минут чата в сутки</label>
                      <input
                        type="number"
                        className="input-field"
                        value={settings?.CHAT_MINUTES_PER_DAY_CAP || ''}
                        onChange={(e) => setSettings({ ...settings, CHAT_MINUTES_PER_DAY_CAP: e.target.value })}
                      />
                    </div>
                  </div>
                </Card>
              </div>
              <div className="flex justify-end">
                <button onClick={handleSaveEconomy} className="btn-primary">
                  <Save size={18} />
                  Сохранить экономику
                </button>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="space-y-6">
              <Card title="Обслуживание системы">
                <div className="grid gap-6 sm:grid-cols-1">
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                    <h4 className="font-bold text-white mb-2">Резервное копирование</h4>
                    <p className="text-sm text-slate-400 mb-6">Создать полный дамп базы данных. Файл будет сохранен на сервере.</p>
                    <button onClick={handleBackup} className="btn-secondary w-full">
                      <RefreshCw size={18} />
                      Создать резервную копию
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default SettingsSection;
