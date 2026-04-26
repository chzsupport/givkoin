#!/usr/bin/env node
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const BACKEND_SRC = path.resolve(__dirname, '..', 'src');
const FRONTEND_SOCKET_IO_CLIENT = path.resolve(__dirname, '..', '..', 'frontend', 'node_modules', 'socket.io-client');
const { io: createClient } = require(FRONTEND_SOCKET_IO_CLIENT);

function parseArgs(argv) {
    const args = {};
    for (const raw of argv) {
        if (!raw.startsWith('--')) continue;
        const [key, value = 'true'] = raw.slice(2).split('=');
        args[key] = value;
    }
    const pickNumber = (key, fallback) => (
        Object.prototype.hasOwnProperty.call(args, key) ? Number(args[key]) : fallback
    );
    return {
        users: Math.max(2, pickNumber('users', 100)),
        port: Math.max(1000, pickNumber('port', 13000)),
        stageTimeoutMs: Math.max(5000, pickNumber('timeout', 20000)),
        connectTimeoutMs: Math.max(5000, pickNumber('connectTimeout', 15000)),
        chatStartDelayMs: Math.max(0, pickNumber('chatStartDelay', 0)),
        reconnectPercent: Math.max(0, Math.min(100, pickNumber('reconnectPercent', 10))),
        closerPercent: Math.max(0, Math.min(100, pickNumber('closerPercent', 20))),
        passivePercent: Math.max(0, Math.min(90, pickNumber('passivePercent', 40))),
        authWaitMs: Math.max(50, pickNumber('authWaitMs', 200)),
        logFailures: args.logFailures === 'true',
    };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function samplePercent(index, percent, modulo = 100) {
    if (!percent) return false;
    return (index % modulo) < percent;
}

function createUsers(count) {
    const users = [];
    for (let index = 0; index < count; index += 1) {
        const userId = `chat-load-${index + 1}`;
        users.push({
            id: userId,
            email: `${userId}@example.test`,
            nickname: `ChatLoad${index + 1}`,
            language: 'ru',
            data: {
                gender: index % 2 === 0 ? 'male' : 'female',
                birthDate: '2003-01-01',
                preferredGender: 'any',
                preferredAgeFrom: 22,
                preferredAgeTo: 24,
                chatStatus: 'available',
                lives: 5,
                blockedUsers: [],
                friends: [],
                chatHistory: [],
                language: 'ru',
            },
            status: 'active',
            last_online_at: null,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        });
    }
    return users;
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createStore(users) {
    const store = {
        users: new Map(),
        chats: new Map(),
        documents: new Map(),
        transcriptStates: new Map(),
        messagesByChat: new Map(),
        notifications: [],
        emails: [],
        errors: [],
    };

    for (const user of users) {
        store.users.set(String(user.id), clone(user));
    }

    return store;
}

function pickFields(row, selectValue) {
    if (!row || !selectValue || selectValue === '*' || selectValue === 'id') {
        if (selectValue === 'id') return { id: row.id };
        return clone(row);
    }

    const fields = String(selectValue)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (!fields.length) return clone(row);

    const picked = {};
    for (const field of fields) {
        picked[field] = clone(row[field]);
    }
    return picked;
}

function createQueryBuilder(store, table) {
    const state = {
        table,
        action: 'select',
        selectValue: '*',
        filters: [],
        limitValue: null,
        orderValue: null,
        updatePatch: null,
        insertRows: null,
    };

    function getTableMap() {
        if (table === 'users') return store.users;
        if (table === 'chats') return store.chats;
        if (table === 'app_documents') return store.documents;
        throw new Error(`Unsupported table: ${table}`);
    }

    function listRows() {
        return Array.from(getTableMap().values()).map((row) => clone(row));
    }

    function applyFilters(rows) {
        let next = rows;
        for (const filter of state.filters) {
            if (filter.type === 'eq') {
                next = next.filter((row) => String(row?.[filter.field] ?? '') === String(filter.value ?? ''));
            } else if (filter.type === 'in') {
                const allowed = new Set((Array.isArray(filter.values) ? filter.values : []).map((value) => String(value)));
                next = next.filter((row) => allowed.has(String(row?.[filter.field] ?? '')));
            } else if (filter.type === 'contains') {
                const values = Array.isArray(filter.values) ? filter.values.map((value) => String(value)) : [];
                next = next.filter((row) => {
                    const target = Array.isArray(row?.[filter.field]) ? row[filter.field].map((value) => String(value)) : [];
                    return values.every((value) => target.includes(value));
                });
            }
        }
        if (state.orderValue) {
            const { field, ascending } = state.orderValue;
            next = [...next].sort((left, right) => {
                const a = left?.[field];
                const b = right?.[field];
                if (a === b) return 0;
                if (a == null) return ascending ? -1 : 1;
                if (b == null) return ascending ? 1 : -1;
                return ascending ? (a > b ? 1 : -1) : (a > b ? -1 : 1);
            });
        }
        if (Number.isFinite(state.limitValue)) {
            next = next.slice(0, state.limitValue);
        }
        return next;
    }

    async function execute() {
        const tableMap = getTableMap();

        if (state.action === 'insert') {
            const insertedRows = [];
            const inputRows = Array.isArray(state.insertRows) ? state.insertRows : [state.insertRows];
            for (const rawRow of inputRows) {
                const row = clone(rawRow);
                tableMap.set(String(row.id), row);
                insertedRows.push(pickFields(row, state.selectValue));
            }
            return { data: insertedRows, error: null };
        }

        const filtered = applyFilters(listRows());

        if (state.action === 'update') {
            const updatedRows = [];
            for (const filteredRow of filtered) {
                const existingRow = tableMap.get(String(filteredRow.id));
                if (!existingRow) continue;
                const nextRow = {
                    ...existingRow,
                    ...clone(state.updatePatch || {}),
                };
                tableMap.set(String(filteredRow.id), nextRow);
                updatedRows.push(pickFields(nextRow, state.selectValue));
            }
            return { data: updatedRows, error: null };
        }

        return {
            data: filtered.map((row) => pickFields(row, state.selectValue)),
            error: null,
        };
    }

    const builder = {
        select(value = '*') {
            state.selectValue = value;
            return builder;
        },
        eq(field, value) {
            state.filters.push({ type: 'eq', field, value });
            return builder;
        },
        in(field, values) {
            state.filters.push({ type: 'in', field, values });
            return builder;
        },
        contains(field, values) {
            state.filters.push({ type: 'contains', field, values });
            return builder;
        },
        order(field, options = {}) {
            state.orderValue = {
                field,
                ascending: options.ascending !== false,
            };
            return builder;
        },
        limit(value) {
            state.limitValue = Math.max(0, Number(value) || 0);
            return builder;
        },
        update(patch) {
            state.action = 'update';
            state.updatePatch = clone(patch || {});
            return builder;
        },
        insert(rows) {
            state.action = 'insert';
            state.insertRows = clone(rows);
            return builder;
        },
        async maybeSingle() {
            const result = await execute();
            const list = Array.isArray(result.data) ? result.data : [];
            return {
                data: list.length ? list[0] : null,
                error: result.error,
            };
        },
        then(resolve, reject) {
            execute().then(resolve, reject);
        },
    };

    return builder;
}

function createFakeSupabase(store) {
    return {
        from(table) {
            return createQueryBuilder(store, table);
        },
    };
}

function createFakeChatService(store) {
    return {
        async createMessage({ chatId, senderId, content }) {
            const message = {
                _id: `msg-${chatId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                chatId: String(chatId),
                senderId: String(senderId),
                originalText: String(content),
                translatedText: null,
                createdAt: new Date().toISOString(),
            };
            const messages = store.messagesByChat.get(String(chatId)) || [];
            messages.push(message);
            store.messagesByChat.set(String(chatId), messages);
            const currentState = store.transcriptStates.get(String(chatId)) || {};
            store.transcriptStates.set(String(chatId), {
                ...currentState,
                lastActivityAt: new Date().toISOString(),
            });
            return message;
        },
        async touchChatActivity(chatId, patch = {}) {
            const chatKey = String(chatId);
            const currentState = store.transcriptStates.get(chatKey) || {};
            const nextState = {
                ...currentState,
                ...clone(patch),
            };
            if (!nextState.lastActivityAt) {
                nextState.lastActivityAt = new Date().toISOString();
            }
            store.transcriptStates.set(chatKey, nextState);
            return nextState;
        },
        async ensureTranscriptState(chatId) {
            const chatKey = String(chatId);
            const existing = store.transcriptStates.get(chatKey);
            if (existing) return clone(existing);
            const nextState = {
                lastActivityAt: new Date().toISOString(),
                participantLanguages: {},
                isFriendSnapshot: false,
            };
            store.transcriptStates.set(chatKey, nextState);
            return clone(nextState);
        },
        async getTranscriptState(chatId) {
            return clone(store.transcriptStates.get(String(chatId)) || null);
        },
        async persistTranscript() { },
        async cleanupTranscript() { },
        async markForAppeal() { },
        async captureSnapshot() { return []; },
        async listMessages(chatId) {
            return clone(store.messagesByChat.get(String(chatId)) || []);
        },
    };
}

function createFakeChatCompletionService() {
    return {
        async applyChatCompletionEffects() { },
        computeDurationSeconds({ startedAt, endedAt, reportedTotalDurationSeconds }) {
            if (Number.isFinite(Number(reportedTotalDurationSeconds))) {
                return Math.max(0, Math.floor(Number(reportedTotalDurationSeconds)));
            }
            const startMs = new Date(startedAt || Date.now()).getTime();
            const endMs = new Date(endedAt || Date.now()).getTime();
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
            return Math.max(0, Math.floor((endMs - startMs) / 1000));
        },
    };
}

function setMockModule(modulePath, exportsValue) {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports: exportsValue,
    };
}

function installMocks(store) {
    const supabaseClientPath = path.resolve(BACKEND_SRC, 'lib', 'supabaseClient.js');
    const chatServicePath = path.resolve(BACKEND_SRC, 'services', 'chatService.js');
    const friendServicePath = path.resolve(BACKEND_SRC, 'services', 'friendService.js');
    const kServicePath = path.resolve(BACKEND_SRC, 'services', 'kService.js');
    const emailServicePath = path.resolve(BACKEND_SRC, 'services', 'emailService.js');
    const radianceServicePath = path.resolve(BACKEND_SRC, 'services', 'activityRadianceService.js');
    const chatCompletionServicePath = path.resolve(BACKEND_SRC, 'services', 'chatCompletionService.js');
    const socketAdapterServicePath = path.resolve(BACKEND_SRC, 'services', 'socketAdapterService.js');
    const notificationControllerPath = path.resolve(BACKEND_SRC, 'controllers', 'notificationController.js');

    const supabase = createFakeSupabase(store);
    setMockModule(supabaseClientPath, {
        getSupabaseClient() {
            return supabase;
        },
    });

    setMockModule(chatServicePath, createFakeChatService(store));
    setMockModule(friendServicePath, {
        async areUsersFriends() {
            return false;
        },
        async sendFriendRequestOrAutoAccept() {
            return { status: 'request_sent' };
        },
    });
    setMockModule(kServicePath, {
        async creditK() { },
    });
    setMockModule(emailServicePath, {
        async sendGenericEventEmail(to, subject) {
            store.emails.push({ to, subject });
        },
    });
    setMockModule(radianceServicePath, {
        async awardRadianceForActivity() { },
    });
    setMockModule(chatCompletionServicePath, createFakeChatCompletionService());
    setMockModule(socketAdapterServicePath, {
        getSocketStateClient() {
            return null;
        },
    });
    setMockModule(notificationControllerPath, {
        async createNotification(payload) {
            store.notifications.push(clone(payload));
        },
    });
}

function createClientScenario(user, index, options, metrics) {
    return {
        user,
        index,
        isPassive: samplePercent(index, options.passivePercent),
        wantsReconnect: samplePercent(index + 17, options.reconnectPercent),
        wantsClose: samplePercent(index + 37, options.closerPercent),
        socket: null,
        connected: false,
        authDone: false,
        matched: false,
        chatId: '',
        messagesSent: 0,
        messagesReceived: 0,
        heartbeatsSent: 0,
        partnerDisconnectedEvents: 0,
        partnerReconnectedEvents: 0,
        resumed: false,
        disconnectedOnce: false,
        closed: false,
        chatEnded: false,
        noPartner: false,
        fatalError: '',
        pendingTimers: new Set(),
        stageDone: false,
        events: [],
        chatStartDelayMs: options.chatStartDelayMs,
        metrics,
    };
}

function scheduleScenarioTask(scenario, fn, delayMs) {
    const timeoutId = setTimeout(async () => {
        scenario.pendingTimers.delete(timeoutId);
        try {
            await fn();
        } catch (error) {
            if (!scenario.fatalError) {
                scenario.fatalError = error?.message || 'Неизвестная ошибка задачи';
            }
        }
    }, delayMs);
    scenario.pendingTimers.add(timeoutId);
}

function clearScenarioTimers(scenario) {
    for (const timeoutId of scenario.pendingTimers) {
        clearTimeout(timeoutId);
    }
    scenario.pendingTimers.clear();
}

function getScenarioSuccess(scenario) {
    if (scenario.fatalError) return false;
    if (!scenario.matched) return false;
    if (scenario.messagesReceived <= 0) return false;
    if (scenario.wantsReconnect && !scenario.resumed) return false;
    if (scenario.wantsClose && !scenario.chatEnded) return false;
    return true;
}

async function connectScenario(url, scenario, options) {
    const socket = createClient(url, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        auth: {
            userId: scenario.user.id,
        },
    });

    scenario.socket = socket;

    socket.on('connect', () => {
        scenario.connected = true;
        socket.emit('auth');
    });

    socket.on('connect_error', (error) => {
        scenario.fatalError = error?.message || 'Ошибка соединения';
    });

    socket.on('auth:error', (payload) => {
        scenario.fatalError = payload?.message || 'Ошибка авторизации';
    });

    socket.on('error', (payload) => {
        scenario.fatalError = payload?.message || 'Ошибка сокета';
    });

    socket.on('searching', () => {
        scenario.events.push('searching');
    });

    socket.on('no_partner', () => {
        scenario.noPartner = true;
        if (!scenario.fatalError) {
            scenario.fatalError = 'Собеседник не найден';
        }
    });

    socket.on('call_timeout', () => {
        scenario.events.push('call_timeout');
    });

    socket.on('call_declined', () => {
        scenario.events.push('call_declined');
    });

    socket.on('chat_preparing', () => {
        scenario.events.push('chat_preparing');
    });

    socket.on('incoming_call', ({ callerId } = {}) => {
        scheduleScenarioTask(scenario, async () => {
            if (!scenario.socket?.connected) return;
            scenario.socket.emit('call_response', {
                accepted: true,
                callerId,
            });
        }, 20 + (scenario.index % 40));
    });

    socket.on('partner_found', ({ chatId } = {}) => {
        if (!chatId || scenario.chatId) return;
        scenario.matched = true;
        scenario.chatId = String(chatId);
        scenario.noPartner = false;
        if (scenario.fatalError === 'Собеседник не найден') {
            scenario.fatalError = '';
        }
        for (const joinDelay of [40, 260, 700]) {
            scheduleScenarioTask(scenario, async () => {
                if (!scenario.socket?.connected) return;
                scenario.socket.emit('chat:join', { chatId: scenario.chatId });
            }, joinDelay + (scenario.index % 60));
        }

        scheduleScenarioTask(scenario, async () => {
            if (!scenario.socket?.connected) return;
            scenario.socket.emit('send_message', {
                chatId: scenario.chatId,
                text: `Привет от ${scenario.user.id}`,
            });
            scenario.messagesSent += 1;
        }, 260 + (scenario.index % 220));

        scheduleScenarioTask(scenario, async () => {
            if (!scenario.socket?.connected) return;
            scenario.socket.emit('chat_heartbeat', { chatId: scenario.chatId });
            scenario.heartbeatsSent += 1;
        }, 760 + (scenario.index % 260));

        scheduleScenarioTask(scenario, async () => {
            if (!scenario.socket?.connected) return;
            scenario.socket.emit('send_message', {
                chatId: scenario.chatId,
                text: `Продолжаем диалог ${scenario.user.id}`,
            });
            scenario.messagesSent += 1;
        }, 1320 + (scenario.index % 320));

        if (scenario.wantsReconnect && !scenario.disconnectedOnce) {
            scheduleScenarioTask(scenario, async () => {
                if (!scenario.socket?.connected) return;
                scenario.disconnectedOnce = true;
                const oldSocket = scenario.socket;
                oldSocket.disconnect();
                await wait(350 + (scenario.index % 100));
                await reconnectScenario(url, scenario, options);
            }, 1700 + (scenario.index % 260));
        }

        if (scenario.wantsClose) {
            scheduleScenarioTask(scenario, async () => {
                if (!scenario.socket?.connected || !scenario.chatId) return;
                scenario.socket.emit('leave_chat', {
                    chatId: scenario.chatId,
                    reportedTotalDurationSeconds: 301,
                });
            }, 2600 + (scenario.index % 320));
        }
    });

    socket.on('new_message', () => {
        scenario.messagesReceived += 1;
    });

    socket.on('partner_disconnected', () => {
        scenario.partnerDisconnectedEvents += 1;
    });

    socket.on('partner_reconnected', () => {
        scenario.partnerReconnectedEvents += 1;
    });

    socket.on('chat_resumed', () => {
        scenario.resumed = true;
    });

    socket.on('chat_ended', () => {
        scenario.chatEnded = true;
        scenario.closed = true;
    });

    socket.on('rate_partner', () => {
        scenario.events.push('rate_partner');
    });

    await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Тайм-аут соединения')), options.connectTimeoutMs);
        socket.once('connect', () => {
            clearTimeout(timeoutId);
            resolve();
        });
        socket.once('connect_error', (error) => {
            clearTimeout(timeoutId);
            reject(error || new Error('Ошибка соединения'));
        });
    });

    await wait(options.authWaitMs);
    scenario.authDone = true;
}

async function reconnectScenario(url, scenario, options) {
    const socket = createClient(url, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        auth: {
            userId: scenario.user.id,
        },
    });

    scenario.socket = socket;

    socket.on('connect', () => {
        socket.emit('auth');
    });

    socket.on('connect_error', (error) => {
        scenario.fatalError = error?.message || 'Ошибка переподключения';
    });

    socket.on('auth:error', (payload) => {
        scenario.fatalError = payload?.message || 'Ошибка переподключения';
    });

    socket.on('partner_disconnected', () => {
        scenario.partnerDisconnectedEvents += 1;
    });

    socket.on('partner_reconnected', () => {
        scenario.partnerReconnectedEvents += 1;
    });

    socket.on('chat_resumed', () => {
        scenario.resumed = true;
    });

    socket.on('new_message', () => {
        scenario.messagesReceived += 1;
    });

    socket.on('chat_ended', () => {
        scenario.chatEnded = true;
        scenario.closed = true;
    });

    await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Тайм-аут переподключения')), options.connectTimeoutMs);
        socket.once('connect', () => {
            clearTimeout(timeoutId);
            resolve();
        });
        socket.once('connect_error', (error) => {
            clearTimeout(timeoutId);
            reject(error || new Error('Ошибка переподключения'));
        });
    });

    await wait(options.authWaitMs);

    if (scenario.chatId) {
        socket.emit('chat:join', { chatId: scenario.chatId });
        await wait(50);
        socket.emit('chat_heartbeat', { chatId: scenario.chatId });
        scenario.heartbeatsSent += 1;
        socket.emit('send_message', {
            chatId: scenario.chatId,
            text: `Я вернулся ${scenario.user.id}`,
        });
        scenario.messagesSent += 1;
    }
}

async function disconnectScenario(scenario) {
    clearScenarioTimers(scenario);
    if (scenario.socket) {
        try {
            scenario.socket.removeAllListeners();
            scenario.socket.disconnect();
        } catch (_error) {
            // ignore
        }
        scenario.socket = null;
    }
}

async function startSocketServer(store, port) {
    installMocks(store);
    process.env.CHAT_PREPARE_DELAY_MS = String(Math.max(0, Number(store.options?.chatStartDelayMs) || 0));
    delete require.cache[path.resolve(BACKEND_SRC, 'services', 'socketService.js')];
    delete require.cache[path.resolve(BACKEND_SRC, 'services', 'matchingService.js')];
    const { initSocketService } = require(path.resolve(BACKEND_SRC, 'services', 'socketService.js'));
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('ok');
    });
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        transports: ['websocket'],
    });

    io.use((socket, next) => {
        const userId = String(socket.handshake.auth?.userId || '').trim();
        socket.data.userId = userId || null;
        next();
    });

    initSocketService(io);

    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    return { server, io };
}

async function runStage(options) {
    const users = createUsers(options.users);
    const store = createStore(users);
    store.options = options;
    const originalConsoleError = console.error;
    console.error = (...args) => {
        store.errors.push(args.map((item) => String(item)).join(' '));
        originalConsoleError(...args);
    };

    const { server, io } = await startSocketServer(store, options.port);
    const socketServiceModule = require(path.resolve(BACKEND_SRC, 'services', 'socketService.js'));
    const matchingServiceModule = require(path.resolve(BACKEND_SRC, 'services', 'matchingService.js'));
    const url = `http://127.0.0.1:${options.port}`;
    const scenarios = users.map((user, index) => createClientScenario(user, index, options, store));
    const stageStartedAt = Date.now();

    try {
        for (let batchStart = 0; batchStart < scenarios.length; batchStart += 100) {
            const batch = scenarios.slice(batchStart, batchStart + 100);
            await Promise.all(batch.map((scenario) => connectScenario(url, scenario, options)));
            await wait(20);
        }

        const waitForAuthDeadline = Date.now() + 5000;
        while (Date.now() < waitForAuthDeadline) {
            const onlineUsers = socketServiceModule.getOnlineUserCount(io);
            const registeredProfiles = scenarios.filter((scenario) => matchingServiceModule.getOnlineProfile(scenario.user.id)).length;
            if (onlineUsers >= scenarios.length && registeredProfiles >= scenarios.length) {
                break;
            }
            await wait(50);
        }

        const searchers = scenarios.filter((scenario) => !scenario.isPassive);
        for (let batchStart = 0; batchStart < searchers.length; batchStart += 100) {
            const batch = searchers.slice(batchStart, batchStart + 100);
            for (const scenario of batch) {
                scenario.socket?.emit('find_partner');
            }
            await wait(15);
        }

        for (const retryDelay of [250, 800]) {
            await wait(retryDelay);
            for (const scenario of searchers) {
                if (scenario.matched) continue;
                if (scenario.events.includes('searching')) continue;
                scenario.socket?.emit('find_partner');
            }
        }

        await wait(options.stageTimeoutMs);

        const matchedUsers = scenarios.filter((scenario) => scenario.matched).length;
        const successfulUsers = scenarios.filter((scenario) => getScenarioSuccess(scenario)).length;
        const failedScenarios = scenarios.filter((scenario) => !getScenarioSuccess(scenario));
        const failedUsers = failedScenarios.length;
        const reconnectUsers = scenarios.filter((scenario) => scenario.wantsReconnect).length;
        const reconnectSuccess = scenarios.filter((scenario) => scenario.wantsReconnect && scenario.resumed).length;
        const closedUsers = scenarios.filter((scenario) => scenario.chatEnded).length;
        const noPartnerUsers = scenarios.filter((scenario) => scenario.noPartner).length;
        const durationMs = Date.now() - stageStartedAt;
        const onlineUsers = socketServiceModule.getOnlineUserCount(io);
        const registeredProfiles = scenarios.filter((scenario) => matchingServiceModule.getOnlineProfile(scenario.user.id)).length;
        const searchingEvents = scenarios.filter((scenario) => scenario.events.includes('searching')).length;

        return {
            users: options.users,
            onlineUsers,
            registeredProfiles,
            searchingEvents,
            matchedUsers,
            successfulUsers,
            failedUsers,
            reconnectUsers,
            reconnectSuccess,
            closedUsers,
            noPartnerUsers,
            messagesSent: scenarios.reduce((sum, scenario) => sum + scenario.messagesSent, 0),
            messagesReceived: scenarios.reduce((sum, scenario) => sum + scenario.messagesReceived, 0),
            heartbeatsSent: scenarios.reduce((sum, scenario) => sum + scenario.heartbeatsSent, 0),
            partnerDisconnectedEvents: scenarios.reduce((sum, scenario) => sum + scenario.partnerDisconnectedEvents, 0),
            partnerReconnectedEvents: scenarios.reduce((sum, scenario) => sum + scenario.partnerReconnectedEvents, 0),
            serverErrors: store.errors.length,
            durationMs,
            sampleFailures: failedScenarios.slice(0, 10).map((scenario) => ({
                userId: scenario.user.id,
                matched: scenario.matched,
                chatId: scenario.chatId,
                messagesSent: scenario.messagesSent,
                messagesReceived: scenario.messagesReceived,
                resumed: scenario.resumed,
                chatEnded: scenario.chatEnded,
                noPartner: scenario.noPartner,
                events: scenario.events.slice(0, 10),
                fatalError: scenario.fatalError || '',
            })),
        };
    } finally {
        await Promise.all(scenarios.map((scenario) => disconnectScenario(scenario).catch(() => { })));
        await new Promise((resolve) => io.close(resolve));
        await new Promise((resolve) => server.close(resolve));
        console.error = originalConsoleError;
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const result = await runStage(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
    process.exit(1);
});

