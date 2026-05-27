const { getSupabaseClient } = require('../../lib/supabaseClient');

function toId(value, depth = 0) {
    if (depth > 3) return '';
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'object') {
        if (value._id != null) return toId(value._id, depth + 1);
        if (value.id != null) return toId(value.id, depth + 1);
        if (value.value != null) return toId(value.value, depth + 1);
        if (typeof value.toString === 'function') {
            const s = value.toString();
            if (s && s !== '[object Object]') return s;
        }
    }
    return '';
}

async function getUsersByIds(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => toId(id)).filter(Boolean)));
    if (!list.length) return new Map();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,nickname,email')
        .in('id', list);
    if (error) return new Map();
    return new Map((Array.isArray(data) ? data : []).map((row) => [String(row.id), row]));
}

module.exports = {
    getUsersByIds,
    toId,
};
