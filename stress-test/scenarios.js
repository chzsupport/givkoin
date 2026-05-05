const axios = require('axios');
const { io } = require('socket.io-client');

class ScenarioRunner {
  constructor(baseUrl, tokens) {
    this.baseUrl = baseUrl;
    this.tokens = tokens;
  }

  pickTokens(n) {
    const shuffled = [...this.tokens].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  async measure(label, fn) {
    const start = Date.now();
    try {
      const result = await fn();
      return { label, duration: Date.now() - start, ok: true, status: 200 };
    } catch (err) {
      const status = err?.response?.status || 0;
      const errMsg = err?.response?.data?.message || err.message || '';
      return { label, duration: Date.now() - start, ok: false, status, error: errMsg };
    }
  }

  async runBatch(batch, label, requestFn) {
    const promises = batch.map(({ token }) =>
      this.measure(label, () => requestFn(token))
    );
    return Promise.all(promises);
  }

  async runAuthCheck(tokens) {
    const batch = tokens || this.pickTokens(10);
    return this.runBatch(batch, 'auth/me', (token) =>
      axios.get(`${this.baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runNewsBrowse(tokens) {
    const batch = tokens || this.pickTokens(15);
    const allResults = [];
    for (const { token } of batch) {
      const r1 = await this.measure('news/list', () =>
        axios.get(`${this.baseUrl}/news`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
      );
      const r2 = await this.measure('news/views', () =>
        axios.post(`${this.baseUrl}/news/views`, { postIds: ['test_post_1', 'test_post_2'] }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
      );
      allResults.push(r1, r2);
    }
    return allResults;
  }

  async runNewsInteract(tokens) {
    const batch = tokens || this.pickTokens(8);
    return this.runBatch(batch, 'news/interact', (token) =>
      axios.post(`${this.baseUrl}/news/test_post_1/actions`, { type: 'like' }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runNewsComment(tokens) {
    const batch = tokens || this.pickTokens(5);
    const comments = ['Отличная новость!', 'Спасибо за информацию', 'Интересно', 'Поддерживаю!', 'Круто!'];
    return this.runBatch(batch, 'news/comment', (token) =>
      axios.post(`${this.baseUrl}/news/test_post_1/comments`, { content: comments[Math.floor(Math.random() * comments.length)] }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runBattleJoin(tokens) {
    const batch = tokens || this.pickTokens(20);
    return this.runBatch(batch, 'battle/join', (token) =>
      axios.post(`${this.baseUrl}/battles/join`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runBattleHeartbeat(tokens) {
    const batch = tokens || this.pickTokens(20);
    return this.runBatch(batch, 'battle/heartbeat', (token) =>
      axios.post(`${this.baseUrl}/battles/heartbeat`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runBattleDamage(tokens) {
    const batch = tokens || this.pickTokens(15);
    return this.runBatch(batch, 'battle/damage', (token) =>
      axios.post(`${this.baseUrl}/battles/damage`, { damage: Math.floor(Math.random() * 50) + 10, side: 'light' }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runFortuneSpin(tokens) {
    const batch = tokens || this.pickTokens(5);
    return this.runBatch(batch, 'fortune/spin', (token) =>
      axios.post(`${this.baseUrl}/fortune/spin`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runFortuneStatus(tokens) {
    const batch = tokens || this.pickTokens(10);
    return this.runBatch(batch, 'fortune/status', (token) =>
      axios.get(`${this.baseUrl}/fortune/status`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runBridgeBrowse(tokens) {
    const batch = tokens || this.pickTokens(10);
    return this.runBatch(batch, 'bridges/list', (token) =>
      axios.get(`${this.baseUrl}/bridges`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runBridgeContribute(tokens) {
    const batch = tokens || this.pickTokens(5);
    return this.runBatch(batch, 'bridge/contribute', (token) =>
      axios.post(`${this.baseUrl}/bridges/test_bridge_1/contribute`, { stones: 1 }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runTreeStatus(tokens) {
    const batch = tokens || this.pickTokens(15);
    return this.runBatch(batch, 'tree/status', (token) =>
      axios.get(`${this.baseUrl}/tree/status`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runTreeCollectFruit(tokens) {
    const batch = tokens || this.pickTokens(5);
    return this.runBatch(batch, 'tree/collect', (token) =>
      axios.post(`${this.baseUrl}/tree/collect-fruit`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runCrystalCollect(tokens) {
    const batch = tokens || this.pickTokens(8);
    return this.runBatch(batch, 'crystal/collect', (token) =>
      axios.post(`${this.baseUrl}/crystal/collect`, { locationId: 'test_location' }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runDailyStreak(tokens) {
    const batch = tokens || this.pickTokens(10);
    const allResults = [];
    for (const { token } of batch) {
      const r1 = await this.measure('streak/state', () =>
        axios.get(`${this.baseUrl}/daily-streak/state`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
      );
      const r2 = await this.measure('streak/claim', () =>
        axios.post(`${this.baseUrl}/daily-streak/claim`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
      );
      allResults.push(r1, r2);
    }
    return allResults;
  }

  async runNightShift(tokens) {
    const batch = tokens || this.pickTokens(5);
    const allResults = [];
    for (const { token } of batch) {
      const r1 = await this.measure('nightshift/start', () =>
        axios.post(`${this.baseUrl}/night-shift/start`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
      );
      const r2 = await this.measure('nightshift/heartbeat', () =>
        axios.post(`${this.baseUrl}/night-shift/heartbeat`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
      );
      allResults.push(r1, r2);
    }
    return allResults;
  }

  async runMeditation(tokens) {
    const batch = tokens || this.pickTokens(8);
    return this.runBatch(batch, 'meditation/breath', (token) =>
      axios.post(`${this.baseUrl}/meditation/individual/breath`, { clientEventId: `breath_${Date.now()}_${Math.random()}` }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runMeditationCollective(tokens) {
    const batch = tokens || this.pickTokens(10);
    return this.runBatch(batch, 'meditation/collective', (token) =>
      axios.get(`${this.baseUrl}/meditation/collective`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runShopBrowse(tokens) {
    const batch = tokens || this.pickTokens(8);
    return this.runBatch(batch, 'shop/catalog', (token) =>
      axios.get(`${this.baseUrl}/shop/catalog`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runShopBuy(tokens) {
    const batch = tokens || this.pickTokens(3);
    return this.runBatch(batch, 'shop/buy', (token) =>
      axios.post(`${this.baseUrl}/shop/buy`, { itemId: 'test_item_1', quantity: 1 }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runEvilRoot(tokens) {
    const batch = tokens || this.pickTokens(5);
    return this.runBatch(batch, 'evilroot/session', (token) =>
      axios.post(`${this.baseUrl}/evil-root/session`, { duration: Math.floor(Math.random() * 300) + 60, score: Math.floor(Math.random() * 100) }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runGratitude(tokens) {
    const batch = tokens || this.pickTokens(5);
    const gratitudes = [
      ['Благодарю за этот день', 'Спасибо за поддержку', 'Рад быть здесь'],
      ['Ценю каждый момент', 'Благодарю друзей', 'Спасибо за доброту'],
    ];
    return this.runBatch(batch, 'practice/gratitude', (token) =>
      axios.post(`${this.baseUrl}/practice/gratitude`, { items: gratitudes[Math.floor(Math.random() * gratitudes.length)] }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runActivityPageView(tokens) {
    const batch = tokens || this.pickTokens(20);
    const pages = ['/tree', '/news', '/battle', '/fortune', '/bridges', '/cabinet', '/shop', '/practice'];
    return this.runBatch(batch, 'activity/page-view', (token) =>
      axios.post(`${this.baseUrl}/activity/page-view`, { page: pages[Math.floor(Math.random() * pages.length)], duration: Math.floor(Math.random() * 120) + 10 }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
    );
  }

  async runSocketBattle(tokens, durationMs = 10000) {
    const batch = tokens || this.pickTokens(20);
    const results = [];
    const sockets = [];

    for (const { token, userId } of batch) {
      const start = Date.now();
      try {
        const sock = io(this.baseUrl, {
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
          timeout: 5000,
        });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('connect timeout')), 5000);
          sock.on('connect', () => { clearTimeout(timeout); resolve(); });
          sock.on('connect_error', (err) => { clearTimeout(timeout); reject(err); });
        });
        sock.emit('battle:join');
        sockets.push(sock);
        results.push({ label: 'socket/battle/join', duration: Date.now() - start, ok: true, status: 200 });
      } catch (err) {
        results.push({ label: 'socket/battle/join', duration: Date.now() - start, ok: false, status: 0, error: err.message });
      }
    }

    if (durationMs > 0 && sockets.length > 0) {
      await new Promise(resolve => setTimeout(resolve, durationMs));
    }

    for (const sock of sockets) { try { sock.disconnect(); } catch (_) {} }
    return results;
  }

  async runSocketChat(tokens, messageCount = 3) {
    const batch = tokens || this.pickTokens(10);
    const results = [];
    const sockets = [];
    const chatMessages = ['Привет!', 'Как дела?', 'Кто онлайн?', 'Добрый вечер', 'Давайте общаться'];

    for (const { token, userId } of batch) {
      const start = Date.now();
      try {
        const sock = io(this.baseUrl, {
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
          timeout: 5000,
        });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('connect timeout')), 5000);
          sock.on('connect', () => { clearTimeout(timeout); resolve(); });
          sock.on('connect_error', (err) => { clearTimeout(timeout); reject(err); });
        });
        sock.emit('chat:join', { chatId: 'test_chat_1' });
        sockets.push({ sock, token, userId });
        results.push({ label: 'socket/chat/join', duration: Date.now() - start, ok: true, status: 200 });
      } catch (err) {
        results.push({ label: 'socket/chat/join', duration: Date.now() - start, ok: false, status: 0, error: err.message });
      }
    }

    for (const { sock } of sockets) {
      for (let i = 0; i < messageCount; i++) {
        const start = Date.now();
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('msg timeout')), 5000);
            sock.emit('chat:message', { chatId: 'test_chat_1', content: chatMessages[Math.floor(Math.random() * chatMessages.length)], language: 'ru' }, (ack) => {
              clearTimeout(timeout);
              if (ack?.ok) resolve(ack); else reject(new Error(ack?.error || 'no ack'));
            });
          });
          results.push({ label: 'socket/chat/message', duration: Date.now() - start, ok: true, status: 200 });
        } catch (err) {
          results.push({ label: 'socket/chat/message', duration: Date.now() - start, ok: false, status: 0, error: err.message });
        }
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
      }
    }

    for (const { sock } of sockets) { try { sock.disconnect(); } catch (_) {} }
    return results;
  }

  async runMixedLoad(tokens, durationSeconds = 30) {
    const allResults = [];
    const endTime = Date.now() + durationSeconds * 1000;
    const batchSize = Math.max(1, Math.floor(tokens.length / 20));

    const scenarios = [
      { name: 'auth', weight: 10, fn: (t) => this.runAuthCheck(t) },
      { name: 'news_browse', weight: 15, fn: (t) => this.runNewsBrowse(t) },
      { name: 'news_interact', weight: 8, fn: (t) => this.runNewsInteract(t) },
      { name: 'news_comment', weight: 3, fn: (t) => this.runNewsComment(t) },
      { name: 'battle_heartbeat', weight: 12, fn: (t) => this.runBattleHeartbeat(t) },
      { name: 'battle_damage', weight: 8, fn: (t) => this.runBattleDamage(t) },
      { name: 'fortune_status', weight: 6, fn: (t) => this.runFortuneStatus(t) },
      { name: 'fortune_spin', weight: 2, fn: (t) => this.runFortuneSpin(t) },
      { name: 'bridge_browse', weight: 5, fn: (t) => this.runBridgeBrowse(t) },
      { name: 'tree_status', weight: 10, fn: (t) => this.runTreeStatus(t) },
      { name: 'crystal_collect', weight: 4, fn: (t) => this.runCrystalCollect(t) },
      { name: 'daily_streak', weight: 5, fn: (t) => this.runDailyStreak(t) },
      { name: 'night_shift', weight: 3, fn: (t) => this.runNightShift(t) },
      { name: 'meditation', weight: 5, fn: (t) => this.runMeditation(t) },
      { name: 'shop_browse', weight: 4, fn: (t) => this.runShopBrowse(t) },
      { name: 'activity_pageview', weight: 15, fn: (t) => this.runActivityPageView(t) },
    ];

    const totalWeight = scenarios.reduce((s, sc) => s + sc.weight, 0);
    let round = 0;

    while (Date.now() < endTime) {
      round++;
      const rand = Math.random() * totalWeight;
      let cumulative = 0;
      let chosen = scenarios[0];
      for (const sc of scenarios) {
        cumulative += sc.weight;
        if (rand <= cumulative) { chosen = sc; break; }
      }

      const batch = this.pickTokens(batchSize);
      try {
        const results = await chosen.fn(batch);
        allResults.push(...results);
      } catch (err) {
        allResults.push({ label: chosen.name, duration: 0, ok: false, status: 0, error: err.message });
      }

      if (round % 10 === 0) await new Promise(r => setTimeout(r, 50));
    }

    return allResults;
  }

  async runFocusedTest(scenarioName, tokens, rounds = 5) {
    const allResults = [];
    const scenarioMap = {
      'auth': (t) => this.runAuthCheck(t),
      'news': async (t) => {
        const r1 = await this.runNewsBrowse(t);
        const r2 = await this.runNewsInteract(t);
        const r3 = await this.runNewsComment(t);
        return [...r1, ...r2, ...r3];
      },
      'battle': async (t) => {
        const r1 = await this.runBattleJoin(t);
        const r2 = await this.runBattleHeartbeat(t);
        const r3 = await this.runBattleDamage(t);
        return [...r1, ...r2, ...r3];
      },
      'fortune': async (t) => {
        const r1 = await this.runFortuneStatus(t);
        const r2 = await this.runFortuneSpin(t);
        return [...r1, ...r2];
      },
      'bridges': async (t) => {
        const r1 = await this.runBridgeBrowse(t);
        const r2 = await this.runBridgeContribute(t);
        return [...r1, ...r2];
      },
      'tree': async (t) => {
        const r1 = await this.runTreeStatus(t);
        const r2 = await this.runTreeCollectFruit(t);
        return [...r1, ...r2];
      },
      'crystal': (t) => this.runCrystalCollect(t),
      'streak': (t) => this.runDailyStreak(t),
      'nightshift': (t) => this.runNightShift(t),
      'meditation': async (t) => {
        const r1 = await this.runMeditation(t);
        const r2 = await this.runMeditationCollective(t);
        return [...r1, ...r2];
      },
      'shop': async (t) => {
        const r1 = await this.runShopBrowse(t);
        const r2 = await this.runShopBuy(t);
        return [...r1, ...r2];
      },
      'evilroot': (t) => this.runEvilRoot(t),
      'gratitude': (t) => this.runGratitude(t),
      'sockets_battle': (t) => this.runSocketBattle(t, 5000),
      'sockets_chat': (t) => this.runSocketChat(t, 2),
    };

    const fn = scenarioMap[scenarioName];
    if (!fn) throw new Error(`Unknown scenario: ${scenarioName}`);

    for (let i = 0; i < rounds; i++) {
      const batch = this.pickTokens(Math.min(tokens.length, 30));
      try {
        const results = await fn(batch);
        allResults.push(...results);
      } catch (err) {
        allResults.push({ label: scenarioName, duration: 0, ok: false, status: 0, error: err.message });
      }
      await new Promise(r => setTimeout(r, 200));
    }

    return allResults;
  }
}

module.exports = ScenarioRunner;
