function normalizeLang(value) {
    return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
    return normalizeLang(lang) === 'en' ? en : ru;
}

function getRequestLang(req, source = 'body') {
    const sourceLang = source === 'query' ? req?.query?.language : req?.body?.language;
    return normalizeLang(req?.user?.language || req?.user?.data?.language || sourceLang || 'ru');
}

function sendLocalizedError(res, { status, lang, ru, en }) {
    return res.status(status).json({ message: pickLang(lang, ru, en) });
}

function sendServerError(res, req, source = 'body') {
    return sendLocalizedError(res, {
        status: 500,
        lang: getRequestLang(req, source),
        ru: 'Ошибка сервера',
        en: 'Server error',
    });
}

module.exports = {
    getRequestLang,
    normalizeLang,
    pickLang,
    sendLocalizedError,
    sendServerError,
};
