import { useEffect, useState } from 'react';
import { Globe, MessageSquare, RefreshCw, Save, Swords } from 'lucide-react';
import { fetchPagesContent, updatePagesContent } from '../api/admin';
import LanguageToggle from '../components/LanguageToggle';
import { Card } from '../components/ui';
import {
  emptyLocalizedText,
  getLocalizedTextValue,
  normalizeLocalizedText,
  updateLocalizedTextValue,
  type ContentLanguage,
} from '../utils/localizedContent';

type RulesTab = 'battle' | 'site' | 'communication';

function RulesPagesSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<RulesTab>('battle');
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');

  const [rulesBattle, setRulesBattle] = useState(emptyLocalizedText());
  const [rulesSite, setRulesSite] = useState(emptyLocalizedText());
  const [rulesCommunication, setRulesCommunication] = useState(emptyLocalizedText());
  const rulesInputPlaceholder = [
    'Можно вставить обычный текст или HTML.',
    '',
    '<h2>Заголовок</h2>',
    '<p>Первый абзац или пункт правил.</p>',
  ].join('\n');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPagesContent();
      setRulesBattle(normalizeLocalizedText(data?.rules?.battle));
      setRulesSite(normalizeLocalizedText(data?.rules?.site));
      setRulesCommunication(normalizeLocalizedText(data?.rules?.communication));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updatePagesContent({
        rules: {
          battle: rulesBattle,
          site: rulesSite,
          communication: rulesCommunication,
        },
      });
      alert('Сохранено');
    } catch (e) {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  const activeValue = activeTab === 'battle'
    ? getLocalizedTextValue(rulesBattle, activeLanguage)
    : activeTab === 'site'
      ? getLocalizedTextValue(rulesSite, activeLanguage)
      : getLocalizedTextValue(rulesCommunication, activeLanguage);

  const handleActiveValueChange = (nextValue: string) => {
    if (activeTab === 'battle') {
      setRulesBattle((prev) => updateLocalizedTextValue(prev, activeLanguage, nextValue));
      return;
    }
    if (activeTab === 'site') {
      setRulesSite((prev) => updateLocalizedTextValue(prev, activeLanguage, nextValue));
      return;
    }
    setRulesCommunication((prev) => updateLocalizedTextValue(prev, activeLanguage, nextValue));
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-white/10 pb-4 flex-wrap">
        {[
          { id: 'battle', label: 'Правила боя', icon: Swords },
          { id: 'site', label: 'Правила сайта', icon: Globe },
          { id: 'communication', label: 'Правила общения', icon: MessageSquare },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as RulesTab)}
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

      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-400">
              {activeTab === 'battle'
                ? 'Текст или HTML для страницы «Правила боя»'
                : activeTab === 'site'
                  ? 'Текст или HTML для страницы «Правила сайта»'
                  : 'Текст или HTML для страницы «Правила общения»'}
            </div>
            <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
          </div>
          <textarea
            className="input-field min-h-[400px] font-mono text-sm leading-relaxed"
            value={activeValue}
            onChange={(e) => handleActiveValueChange(e.target.value)}
            placeholder={rulesInputPlaceholder}
            spellCheck={false}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <button onClick={load} className="btn-secondary" disabled={saving}>
          <RefreshCw size={18} />
          Обновить
        </button>
        <button onClick={save} className="btn-primary" disabled={saving}>
          <Save size={18} />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

export default RulesPagesSection;
