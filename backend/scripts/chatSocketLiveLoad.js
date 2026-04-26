process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eqIndex = body.indexOf('=');
    args[eqIndex === -1 ? body : body.slice(0, eqIndex)] = eqIndex === -1 ? true : body.slice(eqIndex + 1);
  }
  return args;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function mockModule(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

const state = {
  users: [],
  chats: [],
  messages: new Map(),
  transcriptState: new Map(),
};

function nowIso() {
  return new Date().toISOString();
}

function getTableRows(table) {
  if (table === 'users') return state.users;
  if (table === 'chats') return state.chats;
  return [];
}

function normalizeField(field) {
  return String(field || '').trim();
}

function rowMatchesFilter(row, filter) {
  const field = normalizeField(filter.field);
  if (!field) return true;
  const value = filter.value;

  if (field === 'id') {
    if (filter.type === 'eq') return String(row.id) === String(value);
    if (filter.type === 'neq') return String(row.id) !== String(value);
  }

  if (field === 'status') {
    if (filter.type === 'eq') return String(row.status) === String(value);
    if (filter.type === 'neq') return String(row.status) !== String(value);
  }

  if (field === 'created_at') {
    const rowTs = new Date(row.created_at || 0).getTime();
    const valueTs = new Date(value || 0).getTime();
    if (filter.type === 'gte') return rowTs >= valueTs;
  }

  if (field === 'updated_at') {
    const rowTs = new Date(row.updated_at || 0).getTime();
    const valueTs = new Date(value || 0).getTime();
    if (filter.type === 'gte') return rowTs >= valueTs;
  }

  if (field === 'participants' && filter.type === 'contains') {
    const expected = Array.isArray(value) ? value.map((item) => String(item)) : [];
    const actual = Array.isArray(row.participants) ? row.participants.map((item) => String(item)) : [];
    return expected.every((item) => actual.includes(item));
  }

  return true;
}

class FakeQueryBuilder {
  constructor(table) {
    this.table = table;
    this.mode = 'select';
    this.filters = [];
    this.orderBy = null;
    this.limitValue = null;
    this.rangeValue = null;
    this.insertValue = null;
    this.updateValue = null;
  }

  select() {
    this.mode = this.mode === 'update' || this.mode === 'insert' ? this.mode : 'select';
    return this;
  }

  eq(field, value) {
    this.filters.push({ type: 'eq', field, value });
    return this;
  }

  neq(field, value) {
    this.filters.push({ type: 'neq', field, value });
    return this;
  }

  gte(field, value) {
    this.filters.push({ type: 'gte', field, value });
    return this;
  }

  contains(field, value) {
    this.filters.push({ type: 'contains', field, value });
    return this;
  }

  order(field, options = {}) {
    this.orderBy = { field, ascending: options.ascending !== false };
    return this;
  }

  limit(value) {
    this.limitValue = Number(value) || 0;
    return this;
  }

  range(from, to) {
    this.rangeValue = { from: Number(from) || 0, to: Number(to) || 0 };
    return this;
  }

  insert(value) {
    this.mode = 'insert';
    this.insertValue = Array.isArray(value) ? value : [value];
    return this;
  }

  update(value) {
    this.mode = 'update';
    this.updateValue = value && typeof value === 'object' ? value : {};
    return this;
  }

  maybeSingle() {
    return this._execute(true);
  }

  async _execute(single = false) {
    const rows = getTableRows(this.table);

    if (this.mode === 'insert') {
      const insertedRows = this.insertValue.map((entry) => clone(entry));
      insertedRows.forEach((row) => rows.push(row));
      const data = single ? clone(insertedRows[0] || null) : clone(insertedRows);
      return { data, error: null };
    }

    let matchedRows = rows.filter((row) => this.filters.every((filter) => rowMatchesFilter(row, filter)));

    if (this.mode === 'update') {
      matchedRows.forEach((row) => {
        Object.assign(row, clone(this.updateValue));
      });
    }

    if (this.orderBy) {
      const field = normalizeField(this.orderBy.field);
      const ascending = this.orderBy.ascending;
      matchedRows = [...matchedRows].sort((left, right) => {
        const a = left[field];
        const b = right[field];
        if (a === b) return 0;
        return ascending ? (a > b ? 1 : -1) : (a < b ? 1 : -1);
      });
    }

    if (this.rangeValue) {
      matchedRows = matchedRows.slice(this.rangeValue.from, this.rangeValue.to + 1);
    } else if (this.limitValue != null) {
      matchedRows = matchedRows.slice(0, this.limitValue);
    }

    if (single) {
      return { data: clone(matchedRows[0] || null), error: null };
    }

    return { data: clone(matchedRows), error: null };
  }

  then(resolve, reject) {
    return this._execute(false).then(resolve, reject);
  }
}

const fakeSupabaseClient = {
  from(table) {
    return new FakeQueryBuilder(table);
  },
};

function buildUser(index) {
  const gender = index % 2 === 0 ? 'male' : 'female';
  const age = 20 + (index % 20);
  const birthYear = new Date().getFullYear() - age;
  const birthDate = `${birthYear}-01-15`;
  return {
    id: `chat_bench_user_${index}`,
    email: `chat_bench_user_${index}@choizze.test`,
    nickname: `bench_user_${index}`,
    language: 'ru',
    status: 'active',
    created_at: nowIso(),
    updated_at: nowIso(),
    data: {
      gender,
      birthDate,
      preferredGender: 'any',
      preferredAgeFrom: 18,
      preferredAgeTo: 99,
      chatStatus: 'available',
      blockedUsers: [],
      lives: 5,
      complaintChips: 1,
      connectionWarnings: [],
      warningCount30Days: 0,
      chatHistory: [],
      friends: [],
    },
  };
}

function reseedUsers(count) {
  state.users = [];
  state.chats = [];
  state.messages = new Map();
  state.transcriptState = new Map();
  for (let index = 0; index < count; index += 1) {
    state.users.push(buildUser(index));
  }
}

const fakeChatService = {
  async touchChatActivity(chatId, patch = {}) {
    const current = state.transcriptState.get(String(chatId)) || {};
    const next = { ...current, ...clone(patch) };
    if (!next.lastActivityAt) next.lastActivityAt = nowIso();
    state.transcriptState.set(String(chatId), next);
    return clone(next);
  },
  async ensureTranscriptState(chatId) {
    const current = state.transcriptState.get(String(chatId)) || {};
    const next = {
      startedAt: current.startedAt || nowIso(),
      lastActivityAt: current.lastActivityAt || nowIso(),
      participantLanguages: current.participantLanguages || {},
      isFriendSnapshot: Boolean(current.isFriendSnapshot),
    };
    state.transcriptState.set(String(chatId), next);
    return clone(next);
  },
  async getTranscriptState(chatId) {
    return clone(state.transcriptState.get(String(chatId)) || null);
  },
  async createMessage({ chatId, senderId, content }) {
    const list = state.messages.get(String(chatId)) || [];
    const message = {
      _id: `msg_${chatId}_${list.length + 1}_${Date.now()}`,
      senderId: String(senderId),
      originalText: String(content || ''),
      translatedText: String(content || ''),
      createdAt: nowIso(),
      status: 'sent',
    };
    list.push(message);
    state.messages.set(String(chatId), list);
    await fakeChatService.touchChatActivity(chatId, {
      lastActivityAt: message.createdAt,
    });
    return clone(message);
  },
  async persistTranscript() {},
  async cleanupTranscript() {},
  async markForAppeal() {},
};

function computeDurationSeconds({ startedAt, endedAt, reportedTotalDurationSeconds }) {
  const reported = Number(reportedTotalDurationSeconds);
  if (Number.isFinite(reported) && reported > 0) {
    return Math.max(0, Math.floor(reported));
  }
  const startTs = new Date(startedAt || Date.now()).getTime();
  const endTs = new Date(endedAt || Date.now()).getTime();
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return 0;
  return Math.max(0, Math.floor((endTs - startTs) / 1000));
}

mockModule(path.resolve(__dirname, '../src/lib/supabaseClient.js'), {
  getSupabaseClient: () => fakeSupabaseClient,
});
mockModule(path.resolve(__dirname, '../src/services/chatService.js'), fakeChatService);
mockModule(path.resolve(__dirname, '../src/services/kService.js'), {
  creditK: async () => ({ ok: true }),
});
mockModule(path.resolve(__dirname, '../src/services/emailService.js'), {
  sendGenericEventEmail: async () => {},
});
mockModule(path.resolve(__dirname, '../src/services/activityRadianceService.js'), {
  awardRadianceForActivity: async () => 0,
});
mockModule(path.resolve(__dirname, '../src/services/friendService.js'), {
  areUsersFriends: async () => false,
  sendFriendRequestOrAutoAccept: async () => ({ status: 'user_not_found' }),
  acceptFriendRequest: async () => ({ status: 'user_not_found' }),
});
mockModule(path.resolve(__dirname, '../src/controllers/notificationController.js'), {
  createNotification: async () => null,
});
mockModule(path.resolve(__dirname, '../src/utils/penalties.js'), {
  isComplaintBlocked: () => false,
});
mockModule(path.resolve(__dirname, '../src/services/chatCompletionService.js'), {
  applyChatCompletionEffects: async () => {},
  computeDurationSeconds,
});

const socketService = require('../src/services/socketService');

let socketIdCounter = 0;

class FakeIO {
  constructor() {
    this.connectionHandler = null;
    this.socketsById = new Map();
    this.rooms = new Map();
    this.sockets = {
      adapter: {
        rooms: this.rooms,
      },
    };
  }

  on(event, handler) {
    if (event === 'connection') {
      this.connectionHandler = handler;
    }
  }

  connectSocket(socket) {
    this.socketsById.set(socket.id, socket);
    if (typeof this.connectionHandler === 'function') {
      this.connectionHandler(socket);
    }
  }

  removeSocket(socket) {
    this.socketsById.delete(socket.id);
    for (const room of Array.from(socket.rooms.values())) {
      this.leaveRoom(socket, room);
    }
  }

  joinRoom(socket, room) {
    const roomName = String(room);
    const set = this.rooms.get(roomName) || new Set();
    set.add(socket.id);
    this.rooms.set(roomName, set);
    socket.rooms.add(roomName);
  }

  leaveRoom(socket, room) {
    const roomName = String(room);
    const set = this.rooms.get(roomName);
    if (!set) return;
    set.delete(socket.id);
    socket.rooms.delete(roomName);
    if (set.size === 0) {
      this.rooms.delete(roomName);
    }
  }

  emitToRoom(room, event, payload, excludedSocketId = null) {
    const set = this.rooms.get(String(room));
    if (!set) return;
    for (const socketId of Array.from(set.values())) {
      if (excludedSocketId && socketId === excludedSocketId) continue;
      const socket = this.socketsById.get(socketId);
      if (!socket) continue;
      socket.receive(event, payload);
    }
  }

  to(room) {
    return {
      emit: (event, payload) => {
        this.emitToRoom(room, event, payload, null);
      },
    };
  }

  in(room) {
    return {
      allSockets: async () => new Set(this.rooms.get(String(room)) || []),
    };
  }
}

class FakeSocket {
  constructor(io, userId) {
    this.io = io;
    this.id = `sock_${++socketIdCounter}`;
    this.data = { userId: String(userId) };
    this.rooms = new Set();
    this.serverHandlers = new Map();
    this.clientHandlers = new Map();
  }

  on(event, handler) {
    const list = this.serverHandlers.get(String(event)) || [];
    list.push(handler);
    this.serverHandlers.set(String(event), list);
    return this;
  }

  join(room) {
    this.io.joinRoom(this, room);
  }

  leave(room) {
    this.io.leaveRoom(this, room);
  }

  to(room) {
    return {
      emit: (event, payload) => {
        this.io.emitToRoom(room, event, payload, this.id);
      },
    };
  }

  emit(event, payload) {
    const list = this.clientHandlers.get(String(event)) || [];
    for (const handler of list) {
      handler(payload);
    }
  }

  receive(event, payload) {
    this.emit(event, payload);
  }

  clientOn(event, handler) {
    const list = this.clientHandlers.get(String(event)) || [];
    list.push(handler);
    this.clientHandlers.set(String(event), list);
  }

  async trigger(event, payload) {
    const list = this.serverHandlers.get(String(event)) || [];
    for (const handler of list) {
      // eslint-disable-next-line no-await-in-loop
      await handler(payload);
    }
  }

  async disconnect() {
    await this.trigger('disconnect');
    this.io.removeSocket(this);
  }
}

const io = new FakeIO();
socketService.initSocketService(io);

function getUserById(userId) {
  return state.users.find((row) => String(row.id) === String(userId)) || null;
}

async function buildClient(userId, registry) {
  const client = {
    userId: String(userId),
    socket: null,
    chatId: null,
    paired: false,
    ended: false,
    resumed: false,
    reconnectPlanned: false,
    reconnectCompleted: false,
    sentMessages: 0,
    receivedMessages: 0,
    errors: [],
    leaving: false,
  };

  const bindSocket = async () => {
    const socket = new FakeSocket(io, client.userId);
    client.socket = socket;

    socket.clientOn('incoming_call', (data) => {
      setTimeout(() => {
        socket.trigger('call_response', { accepted: true, callerId: data.callerId }).catch((error) => {
          client.errors.push(`accept_failed:${error.message || error}`);
        });
      }, randomInt(5, 20));
    });

    socket.clientOn('partner_found', async ({ chatId }) => {
      client.chatId = String(chatId);
      client.paired = true;
      try {
        await socket.trigger('chat:join', { chatId: client.chatId });
      } catch (error) {
        client.errors.push(`join_failed:${error.message || error}`);
      }
    });

    socket.clientOn('new_message', () => {
      client.receivedMessages += 1;
    });

    socket.clientOn('chat_ended', () => {
      client.ended = true;
    });

    socket.clientOn('chat_resumed', () => {
      client.resumed = true;
      client.reconnectCompleted = true;
    });

    socket.clientOn('partner_reconnected', () => {
      client.resumed = true;
    });

    io.connectSocket(socket);
    await socket.trigger('auth');
    registry.set(client.userId, client);
  };

  await bindSocket();
  client.rebind = bindSocket;
  return client;
}

async function waitForCondition(condition, timeoutMs, stepMs = 25) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return true;
    // eslint-disable-next-line no-await-in-loop
    await sleep(stepMs);
  }
  return false;
}

async function runStage(stageUsers, options = {}) {
  const stageStartedAt = Date.now();
  reseedUsers(stageUsers);
  socketService.__testUtils.resetRuntimeState();

  const registry = new Map();
  const users = state.users.map((row) => String(row.id));
  const clients = [];

  for (const userId of users) {
    // eslint-disable-next-line no-await-in-loop
    clients.push(await buildClient(userId, registry));
  }

  await Promise.all(clients.map((client) => client.socket.trigger('find_partner')));

  const pairedWithinTime = await waitForCondition(
    () => clients.filter((client) => client.paired).length >= stageUsers,
    options.pairTimeoutMs || 12000
  );

  if (!pairedWithinTime) {
    clients.forEach((client) => {
      if (!client.paired) client.errors.push('search_timeout');
    });
  }

  const pairedClients = clients.filter((client) => client.paired && client.chatId);
  await Promise.all(pairedClients.map(async (client) => {
    try {
      await client.socket.trigger('typing', { chatId: client.chatId });
      await client.socket.trigger('send_message', { chatId: client.chatId, text: `Привет ${client.userId}` });
      await client.socket.trigger('stop_typing', { chatId: client.chatId });
      await client.socket.trigger('chat_heartbeat', { chatId: client.chatId });
      await client.socket.trigger('send_message', { chatId: client.chatId, text: `Сообщение ${Date.now()}` });
      await client.socket.trigger('chat_heartbeat', { chatId: client.chatId });
      client.sentMessages += 2;
    } catch (error) {
      client.errors.push(`message_failed:${error.message || error}`);
    }
  }));

  const chatsById = new Map();
  for (const client of pairedClients) {
    const list = chatsById.get(client.chatId) || [];
    list.push(client);
    chatsById.set(client.chatId, list);
  }

  const reconnectTargets = Array.from(chatsById.values())
    .filter((group) => group.length === 2)
    .slice(0, Math.floor(chatsById.size * 0.1))
    .map((group) => group[0]);

  await Promise.all(reconnectTargets.map(async (client) => {
    client.reconnectPlanned = true;
    await client.socket.disconnect();
    await sleep(randomInt(150, 350));
    await client.rebind();
    if (client.chatId) {
      await client.socket.trigger('chat:join', { chatId: client.chatId });
    }
  }));

  await waitForCondition(
    () => reconnectTargets.every((client) => client.reconnectCompleted),
    options.reconnectTimeoutMs || 4000
  );

  const chatRowsById = new Map(state.chats.map((row) => [String(row.id), row]));
  let oldChatToggle = false;
  for (const [chatId] of chatsById) {
    const chatRow = chatRowsById.get(chatId);
    if (!chatRow) continue;
    oldChatToggle = !oldChatToggle;
    if (oldChatToggle) {
      chatRow.started_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    }
  }

  const leavingClients = Array.from(chatsById.values())
    .filter((group) => group.length > 0)
    .map((group) => group[0]);

  await Promise.all(leavingClients.map(async (client) => {
    if (!client.chatId) return;
    client.leaving = true;
    try {
      await client.socket.trigger('leave_chat', {
        chatId: client.chatId,
        reportedTotalDurationSeconds: 360,
      });
    } catch (error) {
      client.errors.push(`leave_failed:${error.message || error}`);
    }
  }));

  await waitForCondition(
    () => pairedClients.every((client) => client.ended),
    options.endTimeoutMs || 5000
  );

  pairedClients.forEach((client) => {
    if (!client.ended) {
      client.errors.push('chat_not_closed');
    }
    if (client.sentMessages > 0 && client.receivedMessages === 0) {
      client.errors.push('no_messages_received');
    }
    if (client.reconnectPlanned && !client.reconnectCompleted) {
      client.errors.push('reconnect_not_completed');
    }
  });

  const failedUsers = clients.filter((client) => client.errors.length > 0);
  const durationMs = Date.now() - stageStartedAt;
  const reasonCounts = new Map();
  failedUsers.forEach((client) => {
    client.errors.forEach((reason) => {
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    });
  });

  return {
    users: stageUsers,
    pairedUsers: clients.filter((client) => client.paired).length,
    endedUsers: clients.filter((client) => client.ended).length,
    okUsers: stageUsers - failedUsers.length,
    failedUsers: failedUsers.length,
    durationMs,
    reasons: Object.fromEntries(reasonCounts),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stages = String(args.users || '500,1000,1500,2000,2500,3000,3500,4000,4500,5000')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Boolean);
  const stopOnFirstFailure = args.stopOnFirstFailure !== 'false';

  console.log(`[chat-socket-live] users=${stages.join(', ')}`);
  for (const stageUsers of stages) {
    console.log(`\n[chat-socket-live] stage users=${stageUsers} started`);
    // eslint-disable-next-line no-await-in-loop
    const result = await runStage(stageUsers);
    console.log(
      `[chat-socket-live] stage users=${result.users} done okUsers=${result.okUsers} failedUsers=${result.failedUsers} ` +
      `pairedUsers=${result.pairedUsers} endedUsers=${result.endedUsers} duration=${result.durationMs}ms`
    );
    console.log(`[chat-socket-live] reasons=${JSON.stringify(result.reasons)}`);
    if (stopOnFirstFailure && result.failedUsers > 0) {
      break;
    }
  }
}

main().catch((error) => {
  console.error('[chat-socket-live] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

