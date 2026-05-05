const express = require('express');

const router = express.Router();

const auth = require('../middleware/auth');

const { getSupabaseClient } = require('../lib/supabaseClient');

const { recordActivity } = require('../services/activityService');

const { answerEntityQuestion } = require('../services/entityBrain');

const { awardRadianceForActivity } = require('../services/activityRadianceService');

const { getMoodDiagnosticsForUser } = require('../services/entityMoodService');



const CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const RESET_LIVES = 0;

const RESET_COMPLAINT_CHIPS = 0;

const RESET_STARS = 0;

const RESET_SC = 0;

const RESET_LUMENS = 0;



async function getUserRowById(userId) {

    if (!userId) return null;

    const supabase = getSupabaseClient();

    const { data, error } = await supabase

        .from('users')

        .select('id,data')

        .eq('id', String(userId))

        .maybeSingle();

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

    const { data, error } = await supabase

        .from('users')

        .update({ data: next, updated_at: nowIso })

        .eq('id', String(userId))

        .select('id,data')

        .maybeSingle();

    if (error) return null;

    return data || null;

}



async function clearUserEntityLinkAndResetStats(userId) {

    return updateUserDataById(userId, {

        entity: null,

        entityId: null,

        lives: RESET_LIVES,

        complaintChips: RESET_COMPLAINT_CHIPS,

        stars: RESET_STARS,

        sc: RESET_SC,

        lumens: RESET_LUMENS,

        starsMilestonesAwarded: [],

        starsCriticalHits: 0,

        starsRecoveryRequired: false,

        starsRecoveryStartedAt: null,

    });

}



function mapEntityRowToApi(entityRow) {

    if (!entityRow) return null;

    return {

        id: entityRow.id,

        name: entityRow.name,

        avatarUrl: entityRow.avatar_url,

        stage: entityRow.stage,

        mood: entityRow.mood,

        satietyUntil: entityRow.satiety_until,

        createdAt: entityRow.created_at,

    };

}



// Create entity for user

router.post('/', auth, async (req, res) => {

    try {

        const { name, avatarUrl } = req.body;



        if (!name || !avatarUrl) {

            return res.status(400).json({ message: 'Name and avatarUrl are required' });

        }



        // Check if user already has entity

        const supabase = getSupabaseClient();

        const { data: existing, error: existingError } = await supabase

            .from('entities')

            .select('id')

            .eq('user_id', String(req.user._id))

            .maybeSingle();

        if (!existingError && existing) {

            return res.status(400).json({ message: 'User already has an entity' });

        }



        const nowIso = new Date().toISOString();

        const { data: entityRow, error: createError } = await supabase

            .from('entities')

            .insert({

                user_id: String(req.user._id),

                name: name.trim(),

                avatar_url: String(avatarUrl || '').trim(),

                stage: 1,

                mood: 'neutral',

                satiety_until: null,

                history: [],

                created_at: nowIso,

                updated_at: nowIso,

            })

            .select('*')

            .maybeSingle();

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



        try {

            await awardRadianceForActivity({

                userId: req.user._id,

                amount: 10,

                activityType: 'entity_create',

                meta: { entityId: entityRow.id },

                dedupeKey: `entity_create:${String(entityRow.id)}:${String(req.user._id)}`,

            });

        } catch (e) {

            // eslint-disable-next-line no-console

            console.error('Entity create radiance error:', e);

        }



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

        if (!name || !avatarUrl) {

            return res.status(400).json({ message: 'Name and avatarUrl are required' });

        }



        if (!(confirmReset === true || confirmReset === 'true')) {

            return res.status(400).json({ message: 'Нужно подтвердить обнуление ресурсов' });

        }



        const supabase = getSupabaseClient();

        const { data: entityRow, error: entityError } = await supabase

            .from('entities')

            .select('*')

            .eq('user_id', String(req.user._id))

            .maybeSingle();

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

        const { data: updatedEntity, error: updateEntityError } = await supabase

            .from('entities')

            .update({

                name: name.trim(),

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

            .maybeSingle();

        if (updateEntityError || !updatedEntity) {

            return res.status(400).json({ message: 'Не удалось обновить сущность' });

        }



        const patchedUser = await clearUserEntityLinkAndResetStats(req.user._id);

        if (!patchedUser) {

            return res.status(404).json({ message: 'User not found' });

        }



        await updateUserDataById(req.user._id, { entityId: updatedEntity.id });



        // Ачивка #96. Ритуал перерождения

        try {

            const { grantAchievement } = require('../services/achievementService');

            await grantAchievement({ userId: req.user._id, achievementId: 96 });

        } catch (e) {

            console.error('Achievement #96 error:', e);

        }



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

        const { data: entityRow, error: entityError } = await supabase

            .from('entities')

            .select('id,created_at')

            .eq('user_id', String(req.user._id))

            .maybeSingle();

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



        const { error: deleteError } = await supabase

            .from('entities')

            .delete()

            .eq('id', Number(entityRow.id));

        if (deleteError) {

            return res.status(400).json({ message: 'Не удалось удалить сущность' });

        }



        const patchedUser = await clearUserEntityLinkAndResetStats(req.user._id);

        if (!patchedUser) {

            return res.status(404).json({ message: 'User not found' });

        }



        // Ачивка #96. Ритуал перерождения

        try {

            const { grantAchievement } = require('../services/achievementService');

            await grantAchievement({ userId: req.user._id, achievementId: 96 });

        } catch (e) {

            console.error('Achievement #96 error:', e);

        }



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

        const { data: entityRow, error } = await supabase

            .from('entities')

            .select('*')

            .eq('user_id', String(req.user._id))

            .maybeSingle();

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



        if (!name) {

            return res.status(400).json({ message: 'Name is required' });

        }



        const supabase = getSupabaseClient();

        const nowIso = new Date().toISOString();

        const { data: entityRow, error } = await supabase

            .from('entities')

            .update({ name: name.trim(), updated_at: nowIso })

            .eq('user_id', String(req.user._id))

            .select('*')

            .maybeSingle();



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



