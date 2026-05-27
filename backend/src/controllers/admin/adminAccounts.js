const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { ADMIN_EMAIL_DOMAIN, isAdminEmail } = require('../../utils/accountRole');

const ADMIN_EMAIL_REQUIREMENT_MESSAGE = `Email администратора должен быть в домене @${ADMIN_EMAIL_DOMAIN}`;

function extractNicknameFromEmail(email) {
    const e = String(email || '').trim();
    const at = e.indexOf('@');
    const nick = at > 0 ? e.slice(0, at) : e;
    return nick.trim();
}

function generateUserId() {
    return crypto.randomBytes(12).toString('hex');
}

function validateSeedPhrase24(value) {
    const words = String(value || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    return words.length === 24;
}

function hasValidEmailLocalPart(email) {
    const [local, domain] = String(email || '').trim().toLowerCase().split('@');
    if (!local || !domain) return false;
    if (local.includes('.') || /[^a-zA-Z0-9]/.test(local)) return false;
    return true;
}

const getAdmins = async (_req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .eq('role', 'admin')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ message: error.message });

        const admins = (Array.isArray(data) ? data : [])
            .filter((row) => isAdminEmail(row?.email))
            .map((row) => ({
                _id: row.id,
                email: row.email,
                nickname: row.nickname,
                role: row.role,
                status: row.status,
                emailConfirmed: Boolean(row.email_confirmed),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }));
        res.json({ admins });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createAdmin = async (req, res) => {
    try {
        const { email, seedPhrase } = req.body || {};
        const e = String(email || '').trim().toLowerCase();
        const sp = String(seedPhrase || '').trim();

        if (!e) return res.status(400).json({ message: 'Email обязателен' });
        if (!e.includes('@')) return res.status(400).json({ message: 'Некорректный email' });
        if (!hasValidEmailLocalPart(e)) {
            return res.status(400).json({ message: 'Email не должен содержать точки и спецсимволы до @' });
        }
        if (!isAdminEmail(e)) return res.status(400).json({ message: ADMIN_EMAIL_REQUIREMENT_MESSAGE });
        if (!sp) return res.status(400).json({ message: 'Введите сид-фразу' });
        if (!validateSeedPhrase24(sp)) {
            return res.status(400).json({ message: 'Сид-фраза должна содержать 24 слова' });
        }

        const nickname = extractNicknameFromEmail(e);
        if (!nickname) return res.status(400).json({ message: 'Некорректный email' });

        const supabase = getSupabaseClient();

        const { data: existingEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', e)
            .maybeSingle();
        if (existingEmail) return res.status(400).json({ message: 'Почта уже используется' });

        const { data: existingNick } = await supabase
            .from('users')
            .select('id')
            .eq('nickname', nickname)
            .maybeSingle();
        if (existingNick) return res.status(400).json({ message: 'Никнейм уже занят' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(sp, salt);
        const nowIso = new Date().toISOString();
        const adminId = generateUserId();

        const { data: admin, error } = await supabase
            .from('users')
            .insert({
                id: adminId,
                email: e,
                password_hash: passwordHash,
                role: 'admin',
                nickname,
                status: 'active',
                email_confirmed: true,
                email_confirmed_at: nowIso,
                access_restricted_until: null,
                access_restriction_reason: '',
                language: 'ru',
                data: {},
                created_at: nowIso,
                updated_at: nowIso,
            })
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .maybeSingle();
        if (error || !admin) {
            return res.status(400).json({ message: 'Не удалось создать пользователя' });
        }

        res.status(201).json({
            admin: {
                _id: admin.id,
                email: admin.email,
                nickname: admin.nickname,
                role: admin.role,
                status: admin.status,
                emailConfirmed: Boolean(admin.email_confirmed),
                createdAt: admin.created_at,
                updatedAt: admin.updated_at,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateAdminEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body || {};
        const e = String(email || '').trim().toLowerCase();

        if (!e) return res.status(400).json({ message: 'Email обязателен' });
        if (!e.includes('@')) return res.status(400).json({ message: 'Некорректный email' });
        if (!hasValidEmailLocalPart(e)) {
            return res.status(400).json({ message: 'Email не должен содержать точки и спецсимволы до @' });
        }
        if (!isAdminEmail(e)) return res.status(400).json({ message: ADMIN_EMAIL_REQUIREMENT_MESSAGE });

        const supabase = getSupabaseClient();
        const { data: admin, error: adminError } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .eq('id', String(id))
            .maybeSingle();
        if (adminError || !admin) return res.status(404).json({ message: 'Админ не найден' });
        if (admin.role !== 'admin' || !isAdminEmail(admin.email)) {
            return res.status(400).json({ message: 'Пользователь не является админом' });
        }

        const nickname = extractNicknameFromEmail(e);
        if (!nickname) return res.status(400).json({ message: 'Некорректный email' });

        const { data: existingEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', e)
            .neq('id', String(admin.id))
            .maybeSingle();
        if (existingEmail) return res.status(400).json({ message: 'Почта уже используется' });

        const { data: existingNick } = await supabase
            .from('users')
            .select('id')
            .eq('nickname', nickname)
            .neq('id', String(admin.id))
            .maybeSingle();
        if (existingNick) return res.status(400).json({ message: 'Никнейм уже занят' });

        const nowIso = new Date().toISOString();
        const { data: updated, error } = await supabase
            .from('users')
            .update({ email: e, nickname, updated_at: nowIso })
            .eq('id', String(admin.id))
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .maybeSingle();
        if (error || !updated) return res.status(500).json({ message: 'Server error' });

        res.json({
            admin: {
                _id: updated.id,
                email: updated.email,
                nickname: updated.nickname,
                role: updated.role,
                status: updated.status,
                emailConfirmed: Boolean(updated.email_confirmed),
                createdAt: updated.created_at,
                updatedAt: updated.updated_at,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAdmins,
    createAdmin,
    updateAdminEmail,
};
