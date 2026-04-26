'use client';

import { useI18n } from '@/context/I18nContext';

type LanguageSwitcherProps = {
  floating?: boolean;
};

export function LanguageSwitcher({ floating = false }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useI18n();

  const wrapperClassName = floating
    ? 'fixed right-3 top-3 z-[120] sm:right-4 sm:top-4'
    : '';

  const isEn = language === 'en';

  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        onClick={() => setLanguage(isEn ? 'ru' : 'en')}
        aria-label={isEn ? t('language.switch_to_russian') : t('language.switch_to_english')}
        className={`group relative flex items-center rounded-full border border-white/15 bg-black/40 backdrop-blur-md transition-all duration-300 hover:border-white/25 ${
          floating ? 'shadow-lg shadow-black/30' : ''
        }`}
        style={{ padding: '3px' }}
      >
        {/* Background slider */}
        <span
          className="absolute top-[3px] h-[calc(100%-6px)] w-[calc(50%-2px)] rounded-full bg-gradient-to-r from-cyan-500/30 to-blue-500/30 border border-cyan-400/20 transition-all duration-300 ease-in-out"
          style={{
            left: isEn ? 'calc(50% + 1px)' : '3px',
          }}
        />

        {/* RU label */}
        <span
          className={`relative z-10 px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-300 ${
            !isEn
              ? 'text-cyan-200'
              : 'text-white/40 group-hover:text-white/60'
          }`}
        >
          RU
        </span>

        {/* EN label */}
        <span
          className={`relative z-10 px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-300 ${
            isEn
              ? 'text-cyan-200'
              : 'text-white/40 group-hover:text-white/60'
          }`}
        >
          EN
        </span>
      </button>
    </div>
  );
}

export default LanguageSwitcher;
