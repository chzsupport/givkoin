const crypto = require('crypto');

const stores = {};

function getStore(table) {
  if (!stores[table]) stores[table] = new Map();
  return stores[table];
}

function matchRow(row, filters) {
  for (const [key, val] of Object.entries(filters)) {
    const rowVal = row[key];
    if (Array.isArray(val) && !Array.isArray(rowVal)) return false;
    if (Array.isArray(val) && Array.isArray(rowVal)) {
      for (const v of val) { if (!rowVal.includes(v)) return false; }
      continue;
    }
    if (String(rowVal) !== String(val)) return false;
  }
  return true;
}

function createMockQuery(table) {
  const filters = {};
  let single = false;
  let headOnly = false;
  let countMode = false;
  let orderKey = null;
  let orderAsc = true;
  let limitN = null;
  let rangeFrom = null;
  let rangeTo = null;
  let selectFields = '*';

  const chain = {
    select(fields) { selectFields = fields || '*'; countMode = fields === undefined; return chain; },
    eq(key, val) { filters[key] = val; return chain; },
    neq(key, val) { filters[`neq_${key}`] = val; return chain; },
    contains(key, val) { filters[key] = val; return chain; },
    gte(key, val) { filters[`gte_${key}`] = val; return chain; },
    lte(key, val) { filters[`lte_${key}`] = val; return chain; },
    maybeSingle() { single = true; return chain; },
    single() { single = true; return chain; },
    limit(n) { limitN = n; return chain; },
    range(from, to) { rangeFrom = from; rangeTo = to; return chain; },
    order(key, opts) { orderKey = key; orderAsc = opts?.ascending !== false; return chain; },
    head(val) { headOnly = val !== false; return chain; },
    delete() {
      return {
        eq(key, val) {
          const store = getStore(table);
          let deleted = 0;
          for (const [id, row] of store) {
            if (String(row[key]) === String(val)) { store.delete(id); deleted++; }
          }
          return Promise.resolve({ error: null, count: deleted });
        }
      };
    },
    insert(rows) {
      const store = getStore(table);
      const arr = Array.isArray(rows) ? rows : [rows];
      const inserted = arr.map(r => {
        if (!r.id) r.id = crypto.randomBytes(12).toString('hex');
        const now = new Date().toISOString();
        if (!r.created_at) r.created_at = now;
        if (!r.updated_at) r.updated_at = now;
        store.set(r.id, { ...r });
        return { ...r };
      });
      return Promise.resolve({ data: inserted, error: null });
    },
    update(patch) {
      return {
        eq(key, val) {
          const store = getStore(table);
          const now = new Date().toISOString();
          const updated = [];
          for (const [id, row] of store) {
            if (String(row[key]) === String(val)) {
              const next = { ...row, ...patch, updated_at: now };
              store.set(id, next);
              updated.push({ ...next });
            }
          }
          return Promise.resolve({ data: updated.length ? updated : null, error: null });
        }
      };
    },
    async then(resolve, reject) {
      try {
        const store = getStore(table);
        let rows = [...store.values()];

        for (const [key, val] of Object.entries(filters)) {
          if (key.startsWith('neq_')) {
            const realKey = key.slice(4);
            rows = rows.filter(r => String(r[realKey]) !== String(val));
          } else if (key.startsWith('gte_')) {
            const realKey = key.slice(4);
            rows = rows.filter(r => r[realKey] !== undefined && r[realKey] >= val);
          } else if (key.startsWith('lte_')) {
            const realKey = key.slice(4);
            rows = rows.filter(r => r[realKey] !== undefined && r[realKey] <= val);
          } else {
            rows = rows.filter(r => matchRow(r, { [key]: val }));
          }
        }

        if (orderKey) {
          rows.sort((a, b) => {
            const va = a[orderKey], vb = b[orderKey];
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }

        if (rangeFrom !== null && rangeTo !== null) {
          rows = rows.slice(rangeFrom, rangeTo + 1);
        } else if (limitN) {
          rows = rows.slice(0, limitN);
        }

        const count = rows.length;

        if (single) {
          const row = rows[0] || null;
          resolve({ data: row, error: null });
          return;
        }

        if (headOnly) {
          resolve({ data: null, error: null, count });
          return;
        }

        resolve({ data: rows, error: null, count });
      } catch (err) {
        resolve({ data: null, error: { message: err.message }, count: 0 });
      }
    }
  };

  return chain;
}

function createMockClient() {
  return {
    from(table) { return createMockQuery(table); },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {}, unsubscribe: () => {} }),
  };
}

function seedUsers(count) {
  const store = getStore('users');
  const sessions = getStore('sessions');
  const users = [];
  for (let i = 0; i < count; i++) {
    const id = crypto.randomBytes(12).toString('hex');
    const now = new Date().toISOString();
    const user = {
      id,
      email: `stress_${i}@testmail.com`,
      nickname: `StressUser${i}`,
      role: 'user',
      status: 'active',
      email_confirmed: true,
      email_confirmed_at: now,
      language: i % 2 === 0 ? 'ru' : 'en',
      gender: i % 3 === 0 ? 'male' : i % 3 === 1 ? 'female' : 'other',
      preferredGender: 'any',
      access_restricted_until: null,
      access_restriction_reason: '',
      last_seen_at: now,
      last_online_at: now,
      last_ip: '127.0.0.1',
      last_device_id: '',
      last_fingerprint: '',
      created_at: now,
      updated_at: now,
      data: {
        sc: 1000 + Math.floor(Math.random() * 5000),
        lumens: Math.floor(Math.random() * 500),
        lives: 5,
        complaintChips: 15,
        stars: Math.random() * 5,
        entity: null,
        entityId: null,
        branch: `${14 + (i % 4)}`,
        seedPhraseHash: crypto.randomBytes(32).toString('hex'),
        dailyStreak: { count: Math.floor(Math.random() * 30), lastClaimDate: now.slice(0, 10) },
      },
    };
    store.set(id, user);
    users.push(user);

    const sid = `sid_stress_${id}`;
    sessions.set(sid, {
      id: sid,
      user_id: id,
      status: 'active',
      created_at: now,
      last_active_at: now,
      ip: '127.0.0.1',
      device_id: '',
      fingerprint: '',
    });
  }
  return users;
}

function seedNews(count) {
  const store = getStore('news_posts');
  const categories = getStore('news_categories');
  const catId1 = crypto.randomBytes(8).toString('hex');
  const catId2 = crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();
  categories.set(catId1, { id: catId1, title_ru: 'Общее', title_en: 'General', slug: 'general', created_at: now });
  categories.set(catId2, { id: catId2, title_ru: 'События', title_en: 'Events', slug: 'events', created_at: now });

  for (let i = 0; i < count; i++) {
    const id = crypto.randomBytes(8).toString('hex');
    store.set(id, {
      id,
      category_id: i % 2 === 0 ? catId1 : catId2,
      title_ru: `Новость ${i}`,
      title_en: `News ${i}`,
      content_ru: `Содержание новости номер ${i}. Текст для нагрузочного теста.`,
      content_en: `Content of news number ${i}. Text for load testing.`,
      status: 'published',
      author_id: 'admin',
      views: Math.floor(Math.random() * 1000),
      likes: Math.floor(Math.random() * 100),
      comments_count: Math.floor(Math.random() * 20),
      created_at: now,
      updated_at: now,
      published_at: now,
    });
  }
}

function seedBridges(count) {
  const store = getStore('bridges');
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    const id = crypto.randomBytes(8).toString('hex');
    store.set(id, {
      id,
      name_ru: `Мост ${i}`,
      name_en: `Bridge ${i}`,
      city_ru: `Город ${i}`,
      city_en: `City ${i}`,
      country_ru: `Страна ${i % 10}`,
      country_en: `Country ${i % 10}`,
      creator_id: `stress_${i}`,
      stones: Math.floor(Math.random() * 50),
      target_stones: 100,
      status: 'active',
      created_at: now,
      updated_at: now,
    });
  }
}

function seedChats(count) {
  const store = getStore('chats');
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    const id = crypto.randomBytes(8).toString('hex');
    store.set(id, {
      id,
      participants: [`stress_${i * 2}`, `stress_${i * 2 + 1}`],
      status: 'active',
      created_at: now,
      updated_at: now,
    });
  }
}

function seedShop() {
  const store = getStore('shop_items');
  const items = [
    { name_ru: 'Зелье жизни', name_en: 'Life Potion', price: 100, type: 'consumable' },
    { name_ru: 'Щит света', name_en: 'Light Shield', price: 250, type: 'consumable' },
    { name_ru: 'Усилитель', name_en: 'Booster', price: 500, type: 'consumable' },
  ];
  const now = new Date().toISOString();
  items.forEach((item, i) => {
    const id = crypto.randomBytes(8).toString('hex');
    store.set(id, { id, ...item, stock: 9999, created_at: now, updated_at: now });
  });
}

function seedCrystal() {
  const store = getStore('crystal_locations');
  const locations = ['forest', 'mountain', 'lake', 'cave', 'sky', 'ocean', 'desert', 'volcano'];
  const now = new Date().toISOString();
  locations.forEach((loc, i) => {
    const id = crypto.randomBytes(8).toString('hex');
    store.set(id, { id, name: loc, shard_count: 10, created_at: now });
  });
}

function clearAll() {
  for (const key of Object.keys(stores)) delete stores[key];
}

function getStats() {
  const stats = {};
  for (const [table, store] of Object.entries(stores)) {
    stats[table] = store.size;
  }
  return stats;
}

module.exports = {
  createMockClient,
  seedUsers,
  seedNews,
  seedBridges,
  seedChats,
  seedShop,
  seedCrystal,
  clearAll,
  getStats,
  getStore,
};
