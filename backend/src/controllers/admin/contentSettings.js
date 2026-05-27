const { adminAudit } = require('../../middleware/adminAudit');
const { getSetting, setSetting } = require('../../utils/settings');
const { getPageTextBundle, savePageTextBundle } = require('../../services/pageTextService');
const { normalizeLocalizedTextInput } = require('../../utils/localizedContent');

const getRules = async (_req, res) => {
    try {
        const rules = await getSetting('PROJECT_RULES', 'Здесь будут правила проекта...');
        res.json({ rules });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateRules = async (req, res) => {
    try {
        const { rules } = req.body;
        await setSetting('PROJECT_RULES', rules, 'Updated project rules', req.user._id);
        await adminAudit('rules.update', req, { rules: rules.substring(0, 50) + '...' });
        res.json({ message: 'Правила обновлены' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPagesContent = async (_req, res) => {
    try {
        const payload = await getPageTextBundle();
        res.json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePagesContent = async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const updates = [];

        if (hasOwn(body, 'about')) {
            const about = normalizeLocalizedTextInput(body.about);
            updates.push(
                setSetting('PAGE_ABOUT', about.ru, 'Updated about page', req.user._id)
            );
        }

        if (hasOwn(body, 'roadmapHtml')) {
            const roadmapHtml = normalizeLocalizedTextInput(body.roadmapHtml);
            updates.push(
                setSetting('PAGE_ROADMAP_HTML', roadmapHtml.ru, 'Updated roadmap page', req.user._id)
            );
        }

        const rules = body.rules && typeof body.rules === 'object' ? body.rules : null;
        if (rules) {
            if (hasOwn(rules, 'battle')) {
                const battle = normalizeLocalizedTextInput(rules.battle);
                updates.push(
                    setSetting('RULES_BATTLE', battle.ru, 'Updated battle rules', req.user._id)
                );
            }
            if (hasOwn(rules, 'site')) {
                const site = normalizeLocalizedTextInput(rules.site);
                updates.push(
                    setSetting('RULES_SITE', site.ru, 'Updated site rules', req.user._id)
                );
            }
            if (hasOwn(rules, 'communication')) {
                const communication = normalizeLocalizedTextInput(rules.communication);
                updates.push(
                    setSetting('RULES_COMMUNICATION', communication.ru, 'Updated communication rules', req.user._id)
                );
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'Нет данных для обновления' });
        }

        await Promise.all(updates);
        await savePageTextBundle(body, req.user?._id || null);

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAdSettings = async (_req, res) => {
    try {
        const settings = await getSetting('AD_SETTINGS', {
            networks: ['AdMob', 'Unity'],
            rotation: 'random',
            active: true
        });
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateAdSettings = async (req, res) => {
    try {
        const settings = req.body;
        await setSetting('AD_SETTINGS', settings, 'Updated ad settings', req.user._id);
        await adminAudit('settings.ads.update', req, settings);
        res.json({ message: 'Настройки рекламы обновлены' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getRules,
    updateRules,
    getPagesContent,
    updatePagesContent,
    getAdSettings,
    updateAdSettings,
};
