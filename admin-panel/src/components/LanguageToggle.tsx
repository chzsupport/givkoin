import type { ContentLanguage } from '../utils/localizedContent';

function LanguageToggle({
  value,
  onChange,
}: {
  value: ContentLanguage;
  onChange: (next: ContentLanguage) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
      {([
        { id: 'ru', label: 'RU' },
        { id: 'en', label: 'EN' },
      ] as Array<{ id: ContentLanguage; label: string }>).map((language) => (
        <button
          key={language.id}
          type="button"
          onClick={() => onChange(language.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${value === language.id
            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
            : 'text-slate-400 hover:text-white'
            }`}
        >
          {language.label}
        </button>
      ))}
    </div>
  );
}

export default LanguageToggle;
