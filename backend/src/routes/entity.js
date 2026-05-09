const express = require('express');

const router = express.Router();

const auth = require('../middleware/auth');

const { getSupabaseClient } = require('../lib/supabaseClient');

const { recordActivity } = require('../services/activityService');

const { answerEntityQuestion } = require('../services/entityBrain');

const { awardRadianceForActivity } = require('../services/activityRadianceService');

const { getMoodDiagnosticsForUser } = require('../services/entityMoodService');

const { getNumericSettingValue } = require('../services/settingsRegistryService');


const CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const ENTITY_NAME_MAX_LENGTH = 10;

function normalizeEntityName(value) {
    const name = String(value || '').trim();
    if (!name) {
        return { ok: false, message: 'Введите имя сущности' };
    }
    if ([...name].length > ENTITY_NAME_MAX_LENGTH) {
        return { ok: false, message: `Имя сущности должно быть не длиннее ${ENTITY_NAME_MAX_LENGTH} символов` };
    }
    return { ok: true, name };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(error) {
    const text = String(error?.message || error?.details || error || '').toLowerCase();
    return (
        text.includes('invalid response')
        || text.includes('upstream')
        || text.includes('timeout')
        || text.includes('econnreset')
        || text.includes('fetch failed')
        || text.includes('network')
    );
}

async function runDb(task, { attempts = 3 } = {}) {
    let last = { data: null, error: null };
    for (let index = 0; index < attempts; index += 1) {
        try {
            const result = await task();
            last = result || { data: null, error: null };
            if (!last.error || !isRetryableDbError(last.error) || index === attempts - 1) {
                return last;
            }
        } catch (error) {
            last = { data: null, error };
            if (!isRetryableDbError(error) || index === attempts - 1) {
                return last;
            }
        }
        await wait(80 * (index + 1));
    }
    return last;
}



async function getUserRowById(userId) {

    if (!userId) return null;

    const supabase = getSupabaseClient();

    const { data, error } = await runDb(() => supabase

        .from('users')

        .select('id,data')

        .eq('id', String(userId))

        .maybeSingle());

    if (error) return null;

    return data || null;

}



async function updateUserDataById(userId, patch) {

    if (!userId || !patch || typeof patch !== 'object') return null;

    const supabase = getSupabaseClient();

    const row = await getUserRowById(userId);

    if (!row) return null;

    const existing = row.data && typeof row.data === 'object' ? row.data : {};

    const next = { ...existing, ...patch };

    const nowIso = new Date().toISOString();

    const { data, error } = await runDb(() => supabase

        .from('users')

        .update({ data: next, updated_at: nowIso })

        .eq('id', String(userId))

        .select('id,data')

        .maybeSingle());

    if (error) return null;

    return data || null;

}



async function getInitialAccountValues() {

    const lives = await getNumericSettingValue('INITIAL_LIVES', Number(process.env.INITIAL_LIVES ?? 5) || 5);

    const complaintChips = Number(process.env.INITIAL_COMPLAINT_CHIPS ?? 15) || 15;

    const stars = Number(process.env.INITIAL_STARS ?? 1) || 1;

    const k = Number(process.env.INITIAL_K ?? 0) || 0;

    const lumens = Number(process.env.INITIAL_LUMENS ?? 0) || 0;

    return { lives, complaintChips, stars, k, lumens };

}



async function clearUserEntityLinkAndResetStats(userId) {

    const initial = await getInitialAccountValues();

    return updateUserDataById(userId, {

        entity: null,

        entityId: null,

        lives: initial.lives,

        complaintChips: initial.complaintChips,

        stars: initial.stars,

        k: initial.k,

        lumens: initial.lumens,

        starsMilestonesAwarded: [],

        starsCriticalHits: 0,

        starsRecoveryRequired: false,

        starsRecoveryStartedAt: null,

    });

}



function mapEntityRowToApi(entityRow) {

    if (!entityRow) return null;

    return {

        _id: String(entityRow.id),

        id: entityRow.id,

        user: entityRow.user_id,

        name: entityRow.name,

        avatarUrl: entityRow.avatar_url,

        stage: entityRow.stage,

        mood: entityRow.mood,

        satietyUntil: entityRow.satiety_until,

        history: Array.isArray(entityRow.history) ? entityRow.history : [],

        createdAt: entityRow.created_at,

        updatedAt: entityRow.updated_at,

    };

}



// Create entity for user

router.post('/', auth, async (req, res) => {

    try {

        const { name, avatarUrl } = req.body;



        const normalizedName = normalizeEntityName(name);

        if (!normalizedName.ok) {

            return res.status(400).json({ message: normalizedName.message });

        }

        if (!avatarUrl) {

            return res.status(400).json({ message: 'Name and avatarUrl are required' });

        }



        // Check if user already has entity

        const supabase = getSupabaseClient();

        const { data: existing, error: existingError } = await runDb(() => supabase

            .from('entities')

            .select('id')

            .eq('user_id', String(req.user._id))

            .maybeSingle());

        if (existingError) {

            return res.status(500).json({ message: 'Не удалось проверить сущность' });

        }

        if (!existingError && existing) {

            return res.status(400).json({ message: 'User already has an entity' });

        }



        const nowIso = new Date().toISOString();

        const { data: entityRow, error: createError } = await runDb(() => supabase

            .from('entities')

            .insert({

                user_id: String(req.user._id),

                name: normalizedName.name,

                avatar_url: String(avatarUrl || '').trim(),

                stage: 1,

                mood: 'neutral',

                satiety_until: null,

                history: [],

                created_at: nowIso,

                updated_at: nowIso,

            })

            .select('*')

            .maybeSingle());

        if (createError || !entityRow) {

            return res.status(400).json({ message: 'Не удалось создать сущность' });

        }



        // Update user to reference entity

        await updateUserDataById(req.user._id, { entityId: entityRow.id });



        // Лог активности для «Тихого ночного дозора»

        recordActivity({

            userId: req.user._id,

            type: 'entity_create',

            minutes: 1,

            meta: { entityId: entityRow.id },

        }).catch(() => { });



        awardRadianceForActivity({
            userId: req.user._id,
            amount: 10,
            activityType: 'entity_create',
            meta: { entityId: entityRow.id },
            dedupeKey: `entity_create:${String(entityRow.id)}:${String(req.user._id)}`,
        }).catch((e) => {
            console.error('Entity create radiance error:', e);
        });



        res.status(201).json({

            entity: mapEntityRowToApi(entityRow),

        });

    } catch (error) {

        console.error('Create entity error:', error);

        res.status(500).json({ message: 'Server error' });

    }

});



// Change entity (reset stats)

router.post('/change', auth, async (req, res) => {

    try {

        const { name, avatarUrl, confirmReset } = req.body || {};

        const normalizedName = normalizeEntityName(name);

        if (!normalizedName.ok) {

            return res.status(400).json({ message: normalizedName.message });

        }

        if (!avatarUrl) {

            return res.status(400).json({ message: 'Name and avatarUrl are required' });

        }



        if (!(confirmReset === true || confirmReset === 'true')) {

            return res.status(400).json({ message: 'Нужно подтвердить обнуление ресурсов' });

        }



        const supabase = getSupabaseClient();

        const { data: entityRow, error: entityError } = await runDb(() => supabase

            .from('entities')

            .select('*')

            .eq('user_id', String(req.user._id))

            .maybeSingle());

        if (entityError || !entityRow) {

            return res.status(404).json({ message: 'Entity not found' });

        }



        const now = new Date();

        const availableAt = new Date(new Date(entityRow.created_at).getTime() + CHANGE_COOLDOWN_MS);

        if (now < availableAt) {

            return res.status(400).json({

                message: 'Сменить сущность можно через 7 дней после создания',

                availableAt,

            });

        }



        const nowIso = now.toISOString();

        const { data: updatedEntity, error: updateEntityError } = await runDb(() => supabase

            .from('entities')

            .update({

                name: normalizedName.name,

                avatar_url: String(avatarUrl || '').trim(),

                stage: 1,

                mood: 'neutral',

                satiety_until: null,

                history: [],

                created_at: nowIso,

                updated_at: nowIso,

            })

            .eq('id', Number(entityRow.id))

            .select('*')

            .maybeSingle());

        if (updateEntityError || !updatedEntity) {

            return res.status(400).json({ message: 'Не удалось обновить сущность' });

        }



        const patchedUser = await clearUserEntityLinkAndResetStats(req.user._id);

        if (!patchedUser) {

            return res.status(404).json({ message: 'User not found' });

        }



        await updateUserDataById(req.user._id, { entityId: updatedEntity.id });



        // Ачивка #96. Ритуал перерождения

        const { grantAchievement } = require('../services/achievementService');
        grantAchievement({ userId: req.user._id, achievementId: 96 }).catch((e) => {
            console.error('Achievement #96 error:', e);
        });



        return res.json({

            entity: mapEntityRowToApi(updatedEntity),

        });

    } catch (error) {

        console.error('Change entity error:', error);

        return res.status(500).json({ message: 'Server error' });

    }

});



// Reset entity (delete and reset stats)

router.post('/reset', auth, async (req, res) => {

    try {

        const supabase = getSupabaseClient();

        const { data: entityRow, error: entityError } = await runDb(() => supabase

            .from('entities')

            .select('id,created_at')

            .eq('user_id', String(req.user._id))

            .maybeSingle());

        if (entityError || !entityRow) {

            return res.status(404).json({ message: 'Entity not found' });

        }



        const now = new Date();

        const availableAt = new Date(new Date(entityRow.created_at).getTime() + CHANGE_COOLDOWN_MS);

        if (now < availableAt) {

            return res.status(400).json({

                message: 'Сменить сущность можно через 7 дней после создания',

                availableAt,

            });

        }



        const patchedUser = await clearUserEntityLinkAndResetStats(req.user._id);

        if (!patchedUser) {

            return res.status(404).json({ message: 'User not found' });

        }



        const { error: deleteError } = await runDb(() => supabase

            .from('entities')

            .delete()

            .eq('id', Number(entityRow.id)));

        if (deleteError) {

            return res.status(400).json({ message: 'Не удалось удалить сущность' });

        }



        // Ачивка #96. Ритуал перерождения

        const { grantAchievement } = require('../services/achievementService');
        grantAchievement({ userId: req.user._id, achievementId: 96 }).catch((e) => {
            console.error('Achievement #96 error:', e);
        });



        return res.json({ ok: true });

    } catch (error) {

        console.error('Reset entity error:', error);

        return res.status(500).json({ message: 'Server error' });

    }

});



// Get current user's entity

router.get('/me', auth, async (req, res) => {

    try {

        const supabase = getSupabaseClient();

        const { data: entityRow, error } = await runDb(() => supabase

            .from('entities')

            .select('*')

            .eq('user_id', String(req.user._id))

            .maybeSingle());

        if (error || !entityRow) {

            return res.status(404).json({ message: 'Entity not found' });

        }



        const diag = await getMoodDiagnosticsForUser(req.user._id).catch(() => null);



        res.json({

            entity: {

                ...mapEntityRowToApi(entityRow),

                mood: diag?.mood || entityRow.mood,

            },

        });

    } catch (error) {

        console.error('Get entity error:', error);

        res.status(500).json({ message: 'Server error' });

    }

});



// Update entity name

router.patch('/name', auth, async (req, res) => {

    try {

        const { name } = req.body;



        const normalizedName = normalizeEntityName(name);

        if (!normalizedName.ok) {

            return res.status(400).json({ message: normalizedName.message });

        }



        const supabase = getSupabaseClient();

        const nowIso = new Date().toISOString();

        const { data: entityRow, error } = await runDb(() => supabase

            .from('entities')

            .update({ name: normalizedName.name, updated_at: nowIso })

            .eq('user_id', String(req.user._id))

            .select('*')

            .maybeSingle());



        if (error || !entityRow) {

            return res.status(404).json({ message: 'Entity not found' });

        }



        res.json({

            entity: mapEntityRowToApi(entityRow),

        });

    } catch (error) {

        console.error('Update entity name error:', error);

        res.status(500).json({ message: 'Server error' });

    }

});



// Ask entity (LLM)

router.post('/ask', auth, async (req, res) => {

    try {

        const { question } = req.body || {};

        if (!question || !question.toString().trim()) {

            return res.status(400).json({ message: 'question is required' });

        }



        const supabase = getSupabaseClient();

        const { data: entityRow, error } = await supabase

            .from('entities')

            .select('mood,satiety_until')

            .eq('user_id', String(req.user._id))

            .maybeSingle();

        if (error || !entityRow) {

            return res.status(404).json({ message: 'Entity not found' });

        }

        const diag = await getMoodDiagnosticsForUser(req.user._id).catch(() => null);

        const mood = diag?.mood || entityRow?.mood || 'neutral';



        let isSated = false;

        if (entityRow?.satiety_until) {

            const until = new Date(entityRow.satiety_until);

            isSated = until.getTime() > Date.now();

        }

        if (typeof diag?.isSated === 'boolean') {

            isSated = diag.isSated;

        }



        const answer = await answerEntityQuestion({

            question: question.toString(),

            mood,

            context: {

                isSated,

                corePercent: diag?.corePercent,

                confirmedCount: diag?.confirmedCount,

                activeDebuff: diag?.activeDebuff,

            },

        });

        return res.json({ answer });

    } catch (error) {

        console.error('Entity ask error:', error);

        return res.status(500).json({ message: 'Server error' });

    }

});



// Entity mood diagnostics

router.get('/mood-diagnostics', auth, async (req, res) => {

    try {

        const data = await getMoodDiagnosticsForUser(req.user._id);

        if (!data) {

            return res.status(404).json({ message: 'Entity not found' });

        }

        return res.json({ diagnostics: data });

    } catch (error) {

        console.error('Entity mood diagnostics error:', error);

        return res.status(500).json({ message: 'Server error' });

    }

});



module.exports = router;



