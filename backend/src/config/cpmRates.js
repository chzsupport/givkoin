// SCM rates by country (in USD) - based on AADS 2024 rates
// Publisher receives 80% (after 20% commission)

const SCM_RATES = {
    // TIER 1 - Premium countries ($1.15 - $1.80)
    'US': 1.80, 'CH': 1.70, 'CA': 1.60, 'AU': 1.60, 'NO': 1.60,
    'GB': 1.50, 'DK': 1.45, 'DE': 1.40, 'SE': 1.40, 'NL': 1.35,
    'IE': 1.35, 'NZ': 1.30, 'FR': 1.25, 'FI': 1.25, 'AT': 1.25,
    'BE': 1.20, 'JP': 1.15,

    // TIER 2 - Developed countries ($0.70 - $1.20)
    'SG': 1.20, 'KR': 1.10, 'AE': 1.10, 'HK': 1.00, 'SA': 1.00,
    'QA': 1.00, 'IL': 0.95, 'TW': 0.90, 'KW': 0.90, 'BH': 0.75,
    'OM': 0.70, 'ES': 0.70, 'IT': 0.70,

    // TIER 3 - Eastern Europe ($0.42 - $0.60)
    'PL': 0.60, 'CZ': 0.60, 'EE': 0.58, 'SI': 0.55, 'PT': 0.55,
    'LT': 0.52, 'GR': 0.50, 'RO': 0.50, 'HU': 0.50, 'LV': 0.50,
    'BG': 0.48, 'HR': 0.48, 'SK': 0.45, 'RS': 0.42,

    // TIER 4 - Latin America ($0.30 - $0.60)
    'CL': 0.60, 'AR': 0.55, 'UY': 0.52, 'CR': 0.50, 'MX': 0.50,
    'BR': 0.50, 'PA': 0.45, 'CO': 0.45, 'EC': 0.38, 'PE': 0.38,
    'BO': 0.30,

    // TIER 5 - Asia (developing) ($0.18 - $0.50)
    'CN': 0.50, 'MY': 0.42, 'TH': 0.42, 'JO': 0.42, 'LB': 0.38,
    'ID': 0.32, 'VN': 0.32, 'PH': 0.32, 'MN': 0.25, 'KH': 0.19,
    'MM': 0.18,

    // TIER 6 - CIS & Eastern Europe ($0.18 - $0.45)
    'RU': 0.45, 'TR': 0.45, 'UA': 0.38, 'MD': 0.35, 'KZ': 0.32,
    'BY': 0.32, 'GE': 0.32, 'AZ': 0.32, 'AM': 0.32, 'UZ': 0.28,
    'KG': 0.22, 'TM': 0.20, 'TJ': 0.18,

    // TIER 7 - Middle East & Africa ($0.18 - $0.45)
    'ZA': 0.45, 'MA': 0.30, 'IN': 0.28, 'EG': 0.28, 'NG': 0.28,
    'KE': 0.28, 'PK': 0.22, 'BD': 0.22, 'LK': 0.22, 'NP': 0.20,
    'AF': 0.18
};

// Default SCM for unknown countries
const DEFAULT_SCM = 0.20;

// Commission rate (AADS takes 20%)
const COMMISSION_RATE = 0.20;

/**
 * Get SCM rate for a country
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {number} SCM rate in USD
 */
const getSCM = (countryCode) => {
    const code = (countryCode || '').toUpperCase();
    return SCM_RATES[code] || DEFAULT_SCM;
};

/**
 * Calculate revenue from impressions
 * @param {number} impressions - Number of ad impressions
 * @param {string} countryCode - ISO country code
 * @returns {number} Revenue in USD (after commission)
 */
const calculateRevenue = (impressions, countryCode) => {
    const cpm = getSCM(countryCode);
    const grossRevenue = (impressions * cpm) / 1000;
    const netRevenue = grossRevenue * (1 - COMMISSION_RATE);
    return Math.round(netRevenue * 100) / 100; // Round to 2 decimal places
};

/**
 * Get tier for a country
 * @param {string} countryCode - ISO country code
 * @returns {number} Tier number (1-7)
 */
const getTier = (countryCode) => {
    const cpm = getSCM(countryCode);
    if (cpm >= 1.15) return 1;
    if (cpm >= 0.70) return 2;
    if (cpm >= 0.42) return 3;
    if (cpm >= 0.30) return 4;
    if (cpm >= 0.25) return 5;
    if (cpm >= 0.18) return 6;
    return 7;
};

module.exports = {
    SCM_RATES,
    DEFAULT_SCM,
    COMMISSION_RATE,
    getSCM,
    calculateRevenue,
    getTier
};

