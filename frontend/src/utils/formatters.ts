import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';

function resolveLocale(language?: string) {
    return getSiteLanguageLocale(language === 'en' ? 'en' : getSiteLanguage());
}

export const formatUserSc = (value: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    const whole = Math.floor(n);
    const frac = n - whole;
    const normalized = frac >= 0.59 ? whole + 1 : frac > 0 ? whole + 0.5 : whole;
    return new Intl.NumberFormat(resolveLocale(), {
        minimumFractionDigits: normalized % 1 === 0 ? 0 : 1,
        maximumFractionDigits: 1,
    }).format(normalized);
};

export const formatNumber = (value: number, language?: string, options?: Intl.NumberFormatOptions) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return new Intl.NumberFormat(resolveLocale(language), options).format(n);
};

export const formatDateTime = (
    value: string | number | Date | null | undefined,
    language?: string,
    options?: Intl.DateTimeFormatOptions,
) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(resolveLocale(language), options);
};

export const formatDate = (
    value: string | number | Date | null | undefined,
    language?: string,
    options?: Intl.DateTimeFormatOptions,
) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(resolveLocale(language), options);
};

export const formatTime = (
    value: string | number | Date | null | undefined,
    language?: string,
    options?: Intl.DateTimeFormatOptions,
) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(resolveLocale(language), options);
};

