const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { createMockClient, seedUsers, seedNews, seedBridges, seedChats, seedShop, seedCrystal, clearAll, getStats, getStore } = require('./mock-supabase');

const JWT_SECRET = 'IWillNeverGiveUp2025!';
const PORT = 3099;

let mockClient = null;
let testUsers = [];
let serverInstance = null;
let ioInstance = null;
let activeBattle = null;

function authMiddleware(req, res, next) {
  const authHeader = req?.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    const store = getStore('users');
    const userRow = store.get(String(userId));
    if (!userRow) return res.status(401).json({ message: 'User not found' });
    if (userRow.status === 'banned') return res.status(403).json({ message: 'Banned' });

    const extra = userRow.data && typeof userRow.data === 'object' ? userRow.data : {};
    req.user = {
      _id: userRow.id, id: userRow.id, email: userRow.email,
      role: userRow.role, nickname: userRow.nickname, status: userRow.status,
      emailConfirmed: true, language: userRow.language || 'ru',
      siteLanguage: userRow.language || 'ru', profileLanguage: userRow.language || 'ru',
      data: extra, ...extra,
    };
    req.auth = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
}

function adminAuth(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
}

function issueToken(userId) {
  return jwt.sign({ userId, sid: `sid_stress_${userId}`, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: '30d' });
}

function createApp() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // === AUTH ===
  app.get('/auth/me', authMiddleware, (req, res) => {
    const user = req.user;
    res.json({
      id: user._id, email: user.email, nickname: user.nickname,
      role: user.role, status: user.status, language: user.language,
      emailConfirmed: true, data: user.data,
    });
  });

  app.post('/auth/logout', authMiddleware, (_req, res) => res.json({ ok: true }));

  // === NEWS ===
  app.get('/news', optionalAuth, (req, res) => {
    const store = getStore('news_posts');
    const posts = [...store.values()].filter(p => p.status === 'published');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const start = (page - 1) * limit;
    res.json({ posts: posts.slice(start, start + limit), total: posts.length, page, limit });
  });

  app.get('/news/categories', (_req, res) => {
    const store = getStore('news_categories');
    res.json([...store.values()]);
  });

  app.post('/news/views', authMiddleware, (req, res) => {
    const postIds = req.body.postIds || [];
    const store = getStore('news_posts');
    for (const id of postIds) {
      const post = store.get(String(id));
      if (post) { post.views = (post.views || 0) + 1; store.set(id, post); }
    }
    res.json({ ok: true });
  });

  app.post('/news/:id/actions', authMiddleware, (req, res) => {
    const type = req.body.type;
    const postId = req.params.id;
    const store = getStore('news_posts');
    const post = store.get(String(postId));
    if (post) {
      if (type === 'like') post.likes = (post.likes || 0) + 1;
      if (type === 'repost') post.reposts = (post.reposts || 0) + 1;
      store.set(postId, post);
    }
    res.json({ ok: true, type });
  });

  app.get('/news/:id/comments', authMiddleware, (req, res) => {
    const store = getStore('news_comments');
    const comments = [...store.values()].filter(c => c.post_id === req.params.id);
    res.json({ comments, total: comments.length });
  });

  app.post('/news/:id/comments', authMiddleware, (req, res) => {
    const crypto = require('crypto');
    const store = getStore('news_comments');
    const id = crypto.randomBytes(8).toString('hex');
    const comment = {
      id, post_id: req.params.id, author_id: req.user._id,
      content: req.body.content, created_at: new Date().toISOString(),
    };
    store.set(id, comment);
    res.json({ ok: true, comment });
  });

  // === BATTLES ===

  app.get('/battles/current', authMiddleware, (_req, res) => {
    if (!activeBattle) {
      activeBattle = {
        id: 'battle_stress_1', status: 'active',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        durationSeconds: 3600,
        darknessDamage: 0, lightDamage: 0,
        attendanceCount: 0,
      };
    }
    res.json(activeBattle);
  });

  app.post('/battles/join', authMiddleware, (req, res) => {
    if (activeBattle) activeBattle.attendanceCount = (activeBattle.attendanceCount || 0) + 1;
    res.json({ ok: true, battle: activeBattle });
  });

  app.post('/battles/heartbeat', authMiddleware, (req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.post('/battles/damage', authMiddleware, (req, res) => {
    const damage = req.body.damage || 10;
    const side = req.body.side || 'light';
    if (activeBattle) {
      if (side === 'light') activeBattle.lightDamage = (activeBattle.lightDamage || 0) + damage;
      else activeBattle.darknessDamage = (activeBattle.darknessDamage || 0) + damage;
    }
    res.json({ ok: true, damage, side });
  });

  app.get('/battles/history', authMiddleware, (_req, res) => {
    res.json({ battles: [], total: 0 });
  });

  app.get('/battles/summary', authMiddleware, (_req, res) => {
    res.json({ totalBattles: 0, totalDamage: 0 });
  });

  // === FORTUNE ===
  app.get('/fortune/status', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    const data = user?.data || {};
    res.json({ spinsLeft: 3, lastSpinAt: data.lastSpinAt || null });
  });

  app.get('/fortune/config', authMiddleware, (_req, res) => {
    res.json({ segments: 8, cost: 50 });
  });

  app.post('/fortune/spin', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) {
      user.data.lastSpinAt = new Date().toISOString();
      user.data.sc = (user.data.sc || 0) + Math.floor(Math.random() * 100);
      store.set(req.user._id, user);
    }
    res.json({ ok: true, prize: Math.floor(Math.random() * 100), segment: Math.floor(Math.random() * 8) });
  });

  app.get('/fortune/stats', (_req, res) => {
    res.json({ totalSpins: 0, totalPrizes: 0 });
  });

  app.get('/fortune/stats/user', authMiddleware, (_req, res) => {
    res.json({ spins: 0, prizes: 0 });
  });

  app.post('/fortune/lucky-draw', authMiddleware, (_req, res) => {
    res.json({ ok: true, prize: 0 });
  });

  app.get('/fortune/lottery/status', authMiddleware, (_req, res) => {
    res.json({ active: true, ticketsSold: 0, prize: 1000 });
  });

  app.post('/fortune/lottery/buy', authMiddleware, (_req, res) => {
    res.json({ ok: true, ticketNumber: Math.floor(Math.random() * 10000) });
  });

  app.get('/fortune/lottery/results', authMiddleware, (_req, res) => {
    res.json({ winners: [], drawnAt: null });
  });

  // === BRIDGES ===
  app.get('/bridges', authMiddleware, (_req, res) => {
    const store = getStore('bridges');
    res.json({ bridges: [...store.values()], total: store.size });
  });

  app.get('/bridges/my', authMiddleware, (req, res) => {
    const store = getStore('bridges');
    const bridges = [...store.values()].filter(b => b.creator_id === req.user._id);
    res.json({ bridges, total: bridges.length });
  });

  app.get('/bridges/stats', authMiddleware, (_req, res) => {
    const store = getStore('bridges');
    res.json({ totalBridges: store.size, totalStones: [...store.values()].reduce((s, b) => s + (b.stones || 0), 0) });
  });

  app.post('/bridges', authMiddleware, (req, res) => {
    const crypto = require('crypto');
    const store = getStore('bridges');
    const id = crypto.randomBytes(8).toString('hex');
    const bridge = { id, creator_id: req.user._id, stones: 0, target_stones: 100, status: 'active', ...req.body, created_at: new Date().toISOString() };
    store.set(id, bridge);
    res.json({ ok: true, bridge });
  });

  app.post('/bridges/:bridgeId/contribute', authMiddleware, (req, res) => {
    const store = getStore('bridges');
    const bridge = store.get(req.params.bridgeId);
    if (bridge) { bridge.stones = (bridge.stones || 0) + (req.body.stones || 1); store.set(bridge.id, bridge); }
    res.json({ ok: true, stones: bridge?.stones || 0 });
  });

  // === TREE ===
  app.get('/tree/status', authMiddleware, (_req, res) => {
    res.json({ health: 100, fruits: Math.floor(Math.random() * 10), level: 5, radiance: 500 });
  });

  app.post('/tree/collect-fruit', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.sc = (user.data.sc || 0) + 5; store.set(req.user._id, user); }
    res.json({ ok: true, collected: 1, reward: 5 });
  });

  app.get('/tree/radiance', authMiddleware, (_req, res) => {
    res.json({ radiance: 500, level: 5 });
  });

  app.post('/tree/heal', authMiddleware, (_req, res) => {
    res.json({ ok: true, healthRestored: 10 });
  });

  // === CRYSTAL ===
  app.get('/crystal/locations', (_req, res) => {
    const store = getStore('crystal_locations');
    res.json({ locations: [...store.values()] });
  });

  app.get('/crystal/status', authMiddleware, (req, res) => {
    res.json({ collected: Math.floor(Math.random() * 5), total: 8 });
  });

  app.post('/crystal/collect', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.lumens = (user.data.lumens || 0) + 1; store.set(req.user._id, user); }
    res.json({ ok: true, shardId: req.body.locationId });
  });

  app.post('/crystal/complete', authMiddleware, (_req, res) => {
    res.json({ ok: true, reward: 100 });
  });

  // === DAILY STREAK ===
  app.get('/daily-streak/state', authMiddleware, (_req, res) => {
    res.json({ streak: 5, lastClaimDate: new Date().toISOString().slice(0, 10), rewards: [] });
  });

  app.get('/daily-streak/today', authMiddleware, (_req, res) => {
    res.json({ claimed: false, questCompleted: false, questDescription: 'Visit the tree' });
  });

  app.post('/daily-streak/claim', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.sc = (user.data.sc || 0) + 10; store.set(req.user._id, user); }
    res.json({ ok: true, reward: 10, streak: 6 });
  });

  app.post('/daily-streak/quest/complete', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/daily-streak/welcome/seen', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  // === NIGHT SHIFT ===
  app.get('/night-shift/status', authMiddleware, (_req, res) => {
    res.json({ active: false, shiftEndAt: null });
  });

  app.post('/night-shift/start', authMiddleware, (_req, res) => {
    res.json({ ok: true, shiftEndAt: new Date(Date.now() + 3600000).toISOString() });
  });

  app.post('/night-shift/heartbeat', authMiddleware, (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.post('/night-shift/end', authMiddleware, (_req, res) => {
    res.json({ ok: true, reward: 50 });
  });

  app.get('/night-shift/radar', authMiddleware, (_req, res) => {
    res.json({ users: [], count: 0 });
  });

  app.post('/night-shift/complete', authMiddleware, (_req, res) => {
    res.json({ ok: true, reward: 100 });
  });

  // === MEDITATION ===
  app.get('/meditation/collective', optionalAuth, (_req, res) => {
    res.json({ active: false, nextAt: new Date(Date.now() + 7200000).toISOString(), participantsCount: 0 });
  });

  app.get('/meditation/collective/participants', authMiddleware, (_req, res) => {
    res.json({ participants: [], count: 0 });
  });

  app.post('/meditation/collective/opt-in', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/meditation/collective/opt-out', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/meditation/collective/join', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/meditation/collective/finish', authMiddleware, (_req, res) => {
    res.json({ ok: true, radiance: 10 });
  });

  app.post('/meditation/collective/heartbeat', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/meditation/individual/breath', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.lumens = (user.data.lumens || 0) + 1; store.set(req.user._id, user); }
    res.json({ ok: true, countedBreaths: 1, grantedRadiance: 1, remainingDaily: 100 });
  });

  app.post('/meditation/individual/settle', authMiddleware, (req, res) => {
    const breaths = req.body.completedBreaths || 1;
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.lumens = (user.data.lumens || 0) + breaths; store.set(req.user._id, user); }
    res.json({ ok: true, countedBreaths: breaths, grantedRadiance: breaths, remainingDaily: 100 - breaths });
  });

  app.post('/meditation/collective/participation', authMiddleware, (_req, res) => {
    res.json({ ok: true, compatibility: true });
  });

  // === SHOP ===
  app.get('/shop/catalog', authMiddleware, (_req, res) => {
    const store = getStore('shop_items');
    res.json({ items: [...store.values()], total: store.size });
  });

  app.post('/shop/buy', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.sc = Math.max(0, (user.data.sc || 0) - 100); store.set(req.user._id, user); }
    res.json({ ok: true, itemId: req.body.itemId, newBalance: user?.data?.sc || 0 });
  });

  // === CHATS ===
  app.get('/chats/active', authMiddleware, (req, res) => {
    const store = getStore('chats');
    const chats = [...store.values()].filter(c => c.participants?.includes(req.user._id));
    res.json({ chat: chats[0] || null });
  });

  app.get('/chats/history', authMiddleware, (_req, res) => {
    res.json({ chats: [], total: 0 });
  });

  app.get('/chats/:chatId', authMiddleware, (req, res) => {
    const store = getStore('chats');
    const chat = store.get(req.params.chatId);
    res.json(chat || { message: 'Chat not found' });
  });

  app.get('/chats/:chatId/messages', authMiddleware, (_req, res) => {
    res.json({ messages: [], total: 0 });
  });

  app.post('/chats/:chatId/messages', authMiddleware, (req, res) => {
    const crypto = require('crypto');
    const store = getStore('chat_messages');
    const id = crypto.randomBytes(8).toString('hex');
    const msg = { id, chatId: req.params.chatId, senderId: req.user._id, content: req.body.content, created_at: new Date().toISOString() };
    store.set(id, msg);
    res.json({ ok: true, messageId: id });
  });

  app.post('/chats/:chatId/complaint', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/chats/:chatId/delete', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/chats/:chatId/appeal', authMiddleware, (_req, res) => {
    res.json({ ok: true });
  });

  // === EVIL ROOT ===
  app.post('/evil-root/session', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.lumens = (user.data.lumens || 0) + 5; store.set(req.user._id, user); }
    res.json({ ok: true, reward: 5 });
  });

  // === PRACTICE (GRATITUDE) ===
  app.post('/practice/gratitude', authMiddleware, (req, res) => {
    const items = req.body.items || [];
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    if (user?.data) { user.data.sc = (user.data.sc || 0) + 5; user.data.stars = (user.data.stars || 0) + 0.001; store.set(req.user._id, user); }
    res.json({ ok: true, reward: 5, items });
  });

  // === ACTIVITY ===
  app.post('/activity/page-view', authMiddleware, (req, res) => {
    res.json({ ok: true });
  });

  app.post('/activity/behavior', authMiddleware, (req, res) => {
    res.json({ ok: true });
  });

  app.post('/activity/leave', authMiddleware, (req, res) => {
    res.json({ ok: true });
  });

  // === ACHIEVEMENTS ===
  app.get('/achievements', authMiddleware, (_req, res) => {
    res.json({ achievements: [], total: 0 });
  });

  // === CHRONICLE ===
  app.get('/chronicle', optionalAuth, (_req, res) => {
    res.json({ entries: [], total: 0 });
  });

  // === NOTIFICATIONS ===
  app.get('/notifications', authMiddleware, (_req, res) => {
    res.json({ notifications: [], total: 0, unread: 0 });
  });

  // === QUOTES ===
  app.get('/quotes/active', (_req, res) => {
    res.json({ text_ru: 'Тестовая цитата', text_en: 'Test quote', author_ru: 'Автор', author_en: 'Author' });
  });

  // === ENTITY ===
  app.get('/entity', authMiddleware, (_req, res) => {
    res.json({ entity: null, hasEntity: false });
  });

  app.post('/entity/ask', authMiddleware, (req, res) => {
    res.json({ answer: 'Test answer from entity', mood: 'neutral' });
  });

  // === SOLAR ===
  app.get('/tree/solar/status', authMiddleware, (_req, res) => {
    res.json({ active: false, nextAt: null });
  });

  // === WAREHOUSE ===
  app.get('/warehouse', authMiddleware, (_req, res) => {
    res.json({ items: [], total: 0 });
  });

  // === FEEDBACK ===
  app.post('/feedback', authMiddleware, (req, res) => {
    res.json({ ok: true });
  });

  // === REFERRALS ===
  app.get('/referrals', authMiddleware, (_req, res) => {
    res.json({ referrals: [], total: 0 });
  });

  // === WISHES ===
  app.get('/wishes', authMiddleware, (_req, res) => {
    res.json({ wishes: [], total: 0 });
  });

  // === MATCH ===
  app.post('/match/find', authMiddleware, (_req, res) => {
    res.json({ matched: false, chatId: null });
  });

  // === RADIANCE ===
  app.get('/radiance', authMiddleware, (_req, res) => {
    res.json({ radiance: 500, level: 5 });
  });

  // === ECONOMY ===
  app.get('/economy/balance', authMiddleware, (req, res) => {
    const store = getStore('users');
    const user = store.get(String(req.user._id));
    res.json({ sc: user?.data?.sc || 0, lumens: user?.data?.lumens || 0 });
  });

  // === PAGES (static content) ===
  app.get('/pages/about', (_req, res) => {
    res.json({ content_ru: 'О проекте GIVKOIN', content_en: 'About GIVKOIN' });
  });

  app.get('/pages/rules', (_req, res) => {
    res.json({ content_ru: 'Правила проекта', content_en: 'Project rules' });
  });

  app.get('/pages/roadmap', (_req, res) => {
    res.json({ content_ru: 'Дорожная карта', content_en: 'Roadmap' });
  });

  // === META ===
  app.get('/meta/stats', (_req, res) => {
    const userStore = getStore('users');
    res.json({ totalUsers: userStore.size, onlineUsers: Math.floor(userStore.size * 0.3) });
  });

  return app;
}

async function startServer(userCount = 5000) {
  clearAll();

  testUsers = seedUsers(userCount);
  seedNews(50);
  seedBridges(30);
  seedChats(50);
  seedShop();
  seedCrystal();

  console.log(`[STRESS] Mock DB seeded: ${userCount} users, ${JSON.stringify(getStats())}`);

  const app = createApp();
  const server = http.createServer(app);

  ioInstance = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  ioInstance.use((socket, next) => {
    const token = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.data.userId = decoded.userId;
      } catch (_) {
        socket.data.userId = null;
      }
    }
    next();
  });

  ioInstance.on('connection', (socket) => {
    socket.on('battle:join', () => {
      socket.join('battle-room');
      socket.emit('battle:state', activeBattle || { status: 'idle' });
    });

    socket.on('battle:leave', () => {
      socket.leave('battle-room');
    });

    socket.on('chat:join', (payload) => {
      const chatId = payload?.chatId;
      if (chatId) socket.join(`chat-${chatId}`);
    });

    socket.on('chat:message', (payload, cb) => {
      const { chatId, content } = payload || {};
      const senderId = socket.data.userId;
      if (chatId && content) {
        ioInstance.to(`chat-${chatId}`).emit('chat:message', { chatId, senderId, content, sentAt: new Date().toISOString() });
      }
      if (cb) cb({ ok: true });
    });

    socket.on('disconnect', () => {});
  });

  // Battle state broadcast every 30s
  const battleInterval = setInterval(() => {
    if (activeBattle && ioInstance) {
      ioInstance.to('battle-room').emit('battle:state', activeBattle);
    }
  }, 30000);

  return new Promise((resolve, reject) => {
    server.listen(PORT, () => {
      serverInstance = server;
      console.log(`[STRESS] Test server running on port ${PORT} with ${userCount} users`);
      resolve({ server, port: PORT, users: testUsers });
    });
    server.on('error', reject);
  });
}

async function stopServer() {
  if (serverInstance) {
    return new Promise((resolve) => {
      serverInstance.close(() => {
        serverInstance = null;
        console.log('[STRESS] Test server stopped');
        resolve();
      });
    });
  }
}

function getUsers() { return testUsers; }
function getTokens() {
  return testUsers.map(u => ({
    userId: u.id,
    token: issueToken(u.id),
    nickname: u.nickname,
  }));
}
function getTokenForUser(userId) { return issueToken(userId); }

module.exports = {
  startServer,
  stopServer,
  getUsers,
  getTokens,
  getTokenForUser,
  issueToken,
  PORT,
  JWT_SECRET,
};
