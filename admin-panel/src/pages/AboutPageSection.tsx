import { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
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

function AboutPageSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');
  const [about, setAbout] = useState(emptyLocalizedText());
  const aboutInputPlaceholder = [
    'Можно вставить обычный текст или HTML.',
    '',
    '<h2>О проекте</h2>',
    '<p>Первый абзац страницы.</p>',
  ].join('\n');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPagesContent();
      setAbout(normalizeLocalizedText(data?.about));
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
      await updatePagesContent({ about });
      alert('Сохранено');
    } catch (e) {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-2">
          <div className="text-sm text-slate-400">Текст или HTML для страницы «О нас»</div>
          <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
          <textarea
            className="input-field min-h-[500px] font-mono text-sm leading-relaxed"
            value={getLocalizedTextValue(about, activeLanguage)}
            onChange={(e) => setAbout((prev) => updateLocalizedTextValue(prev, activeLanguage, e.target.value))}
            placeholder={aboutInputPlaceholder}
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

export default AboutPageSection;
