const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getRequestLang,
    normalizeLang,
    pickLang,
    sendLocalizedError,
    sendServerError,
} = require('../controllers/battle/localizedResponse');

function createFakeResponse() {
    const state = {};
    return {
        state,
        status(code) {
            state.status = code;
            return this;
        },
        json(payload) {
            state.payload = payload;
            return payload;
        },
    };
}

test('battle localized response keeps old language fallback', () => {
    assert.equal(normalizeLang('en'), 'en');
    assert.equal(normalizeLang('ru'), 'ru');
    assert.equal(normalizeLang('de'), 'ru');
    assert.equal(pickLang('en', 'Ошибка', 'Error'), 'Error');
    assert.equal(pickLang('ru', 'Ошибка', 'Error'), 'Ошибка');
});

test('battle localized response reads body or query language after user language', () => {
    assert.equal(getRequestLang({ body: { language: 'en' } }), 'en');
    assert.equal(getRequestLang({ query: { language: 'en' } }, 'query'), 'en');
    assert.equal(getRequestLang({ user: { language: 'ru' }, body: { language: 'en' } }), 'ru');
    assert.equal(getRequestLang({ user: { data: { language: 'en' } } }), 'en');
});

test('battle localized response sends old error shape', () => {
    const res = createFakeResponse();
    const payload = sendLocalizedError(res, {
        status: 400,
        lang: 'en',
        ru: 'Не указан battleId',
        en: 'Missing battleId',
    });

    assert.deepEqual(payload, { message: 'Missing battleId' });
    assert.equal(res.state.status, 400);
    assert.deepEqual(res.state.payload, { message: 'Missing battleId' });
});

test('battle localized response sends server error shape', () => {
    const res = createFakeResponse();
    const payload = sendServerError(res, { user: { language: 'ru' } });

    assert.deepEqual(payload, { message: 'Ошибка сервера' });
    assert.equal(res.state.status, 500);
});
