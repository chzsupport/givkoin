const logger = require('../utils/logger');
const { getSupabaseClient } = require('../lib/supabaseClient');

const connectDB = async () => {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required to start backend');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('users')
    .select('id', { head: true, count: 'exact' })
    .limit(1);
  if (error) {
    throw new Error(`[DB] Supabase connection failed: ${error.message}`);
  }
  logger.info('[DB] Supabase connection established');
};

module.exports = connectDB;
