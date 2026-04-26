const axios = require('axios');

const PYTHON_SERVER_URL = process.env.TRANSLATION_API_URL || '';

// Placeholder for language detection
// In a real scenario, use 'franc' or 'langdetect'
function detectLanguage(text) {
    // Simple heuristic or default to 'ru' if not detectable
    // For now, let's assume if it has Cyrillic it's 'ru', else 'en'
    if (/[а-яА-ЯЁё]/.test(text)) return 'ru';
    return 'en';
}

async function translateMessage(text, fromLang, toLang) {
    if (!text) return { originalText: '', translatedText: '', originalLang: fromLang, targetLang: toLang };
    if (fromLang === toLang) {
        return { originalText: text, translatedText: text, originalLang: fromLang, targetLang: toLang };
    }
    if (!PYTHON_SERVER_URL) {
        return {
            originalText: text,
            translatedText: text,
            originalLang: fromLang,
            targetLang: toLang
        };
    }

    try {
        const response = await axios.post(PYTHON_SERVER_URL, {
            q: text,
            source: fromLang,
            target: toLang
        }, { timeout: 60000 }); // 60s timeout

        if (response.data && response.data.translatedText) {
            return {
                originalText: text,
                translatedText: response.data.translatedText,
                originalLang: fromLang,
                targetLang: toLang
            };
        } else {
            throw new Error('Invalid response from translation server');
        }
    } catch (error) {
        console.error('Translation failed:', {
            text, fromLang, toLang,
            errorMsg: error.message,
            responseData: error.response?.data,
            responseStatus: error.response?.status
        });

        // Fallback: return original text
        return {
            originalText: text,
            translatedText: text + ' (Translation unavailable)', // Visual indicator
            originalLang: fromLang,
            targetLang: toLang
        };
    }
}

module.exports = {
    translateMessage,
    detectLanguage
};
