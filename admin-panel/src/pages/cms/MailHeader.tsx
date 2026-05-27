import LanguageToggle from '../../components/LanguageToggle';
import type { ContentLanguage } from '../../utils/localizedContent';

export function MailHeader({
  language,
  onLanguageChange,
}: {
  language: ContentLanguage;
  onLanguageChange: (language: ContentLanguage) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      <div className="text-sm text-slate-300">Шаблоны писем (RU/EN)</div>
      <LanguageToggle value={language} onChange={onLanguageChange} />
    </div>
  );
}
