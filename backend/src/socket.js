const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const battleService = require('./services/battleService');
const chatService = require('./services/chatService');
const logger = require('./utils/logger');
const { getAllowedOrigins, isOriginAllowed } = require('./config/env');
const {
    getTokenFromRequest,
    isSessionActive,
    enforceSingleDeviceSession,
} = require('./services/authTrackingService');
const { JWT_SECRET } = require('./config/auth');
const { configureSocketAdapter, closeSocketAdapter } = require('./services/socketAdapterService');
const { getSupabaseClient } = require('./lib/supabaseClient');
const { getSocketLanguage } = require('./utils/requestLanguage');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const BATTLE_ROOM = 'battle-room';
const CHAT_ROOM_PREFIX = 'chat-';
const allowedOrigins = getAllowedOrigins();
const BATTLE_STATE_CACHE_TTL_MS = 5000;

let battleStateCache = null;
let battleStateCacheAt = 0;
let battleStateInflight = null;

function mapBattleToState(battle) {
    if (!battle) return { status: 'idle' };
    return {
        id: battle._id?.toString(),
        status: battle.status,
        startsAt: battle.startsAt,
        endsAt: battle.endsAt,
        durationSeconds: battle.durationSeconds,
        darknessDamage: battle.darknessDamage,
        lightDamage: battle.lightDamage,
        attendanceCount: battle.attendanceCount,
    };
}

function resetBattleStateCache() {
    battleStateCache = null;
    battleStateCacheAt = 0;
    battleStateInflight = null;
}

async function buildBattleStatePayload({ force = false } = {}) {
    const now = Date.now();
    if (!force && battleStateCache && (now - battleStateCacheAt) < BATTLE_STATE_CACHE_TTL_MS) {
        return battleStateCache;
    }
    if (!force && battleStateInflight) {
        return battleStateInflight;
    }

    battleStateInflight = (async () => {
        const [active, upcoming] = await Promise.all([
            battleService.getCurrentBattle(),
            battleService.getUpcomingBattle(),
        ]);
        const payload = {
            active: mapBattleToState(active),
            upcoming: mapBattleToState(upcoming),
            ts: Date.now(),
        };
        battleStateCache = payload;
        battleStateCacheAt = Date.now();
        return payload;
    })();

    try {
        return await battleStateInflight;
    } finally {
        battleStateInflight = null;
    }
}

async function broadcastBattleState(io) {
    const payload = await buildBattleStatePayload({ force: true });
    io.to(BATTLE_ROOM).emit('battle:state', payload);
    return payload;
}

async function chatExists(chatId, userId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('chats')
        .select('id')
        .eq('id', String(chatId))
        .contains('participants', [String(userId)])
        .eq('status', 'active')
        .maybeSingle();
    if (error) return false;
    return Boolean(data);
}

const { initSocketService } = require('./services/socketService');

async function initSocket(server) {
    const io = new Server(server, {
        cors: {
            origin(origin, callback) {
                if (isOriginAllowed(origin, allowedOrigins)) {
                    return callback(null, true);
                }
                return callback(new Error(`Not allowed by CORS: ${origin || '(empty)'}`));
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    await configureSocketAdapter(io);

    io.use(async (socket, next) => {
        try {
            socket.data.siteLanguage = getSocketLanguage(socket);
            const token = getTokenFromRequest({ headers: socket.handshake.headers || {} });
            if (!token) {
                socket.data.userId = null;
                return next();
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            const supabase = getSupabaseClient();
            const { data: user, error } = await supabase
                .from('users')
                .select('id,role,status,email,data')
                .eq('id', String(decoded.userId))
                .maybeSingle();
            const freezeStatus = String(user?.data?.securityFreeze?.status || '').trim();
            if (error || !user || user.status === 'banned' || user.status === 'frozen' || freezeStatus === 'frozen') {
                socket.data.userId = null;
                return next();
            }

            const sessionId = String(decoded?.sid || '').trim();
            if (!sessionId) {
                socket.data.userId = null;
                return next();
            }

            const fakeReq = {
                headers: socket.handshake.headers || {},
                ip: socket.handshake.address || '',
                socket: { remoteAddress: socket.handshake.address || '' },
            };
            const active = await isSessionActive({ userId: user.id, sessionId });
            if (!active) {
                socket.data.userId = null;
                return next();
            }
            const singleDeviceCheck = await enforceSingleDeviceSession({
                userId: user.id,
                sessionId,
                req: fakeReq,
                revokedBy: user.id,
            });
            if (singleDeviceCheck.conflict) {
                socket.data.userId = null;
                return next();
            }

            socket.data.userId = String(user.id);
            socket.data.userRole = user.role;
            socket.data.sessionId = sessionId;
            return next();
        } catch (_error) {
            socket.data.siteLanguage = getSocketLanguage(socket);
            socket.data.userId = null;
            return next();
        }
    });

    // Initialize Chat Socket Service
    initSocketService(io);

    io.on('connection', (socket) => {
        logger.debug('Socket connected', {
            socketId: socket.id,
            transport: socket.conn?.transport?.name,
        });

        socket.on('disconnect', (reason) => {
            logger.debug('Socket disconnected', { socketId: socket.id, reason });
        });

        socket.on('battle:join', async () => {
            logger.debug('Socket event battle:join', { socketId: socket.id });
            socket.join(BATTLE_ROOM);
            socket.emit('battle:state', await buildBattleStatePayload());
        });

        socket.on('battle:leave', () => {
            logger.debug('Socket event battle:leave', { socketId: socket.id });
            socket.leave(BATTLE_ROOM);
        });

        socket.on('chat:join', async (payload = {}) => {
            const { chatId } = payload;
            const userId = socket.data.userId || null;
            if (!chatId || !userId) return;

            const canJoin = await chatExists(chatId, userId);
            if (!canJoin) return;

            logger.debug('Socket event chat:join', { socketId: socket.id, chatId, userId });
            socket.join(`${CHAT_ROOM_PREFIX}${chatId}`);
        });

        socket.on('chat:message', async (payload = {}, cb) => {
            try {
                const { chatId, content, language } = payload;
                const senderId = socket.data.userId || null;
                if (!chatId || !senderId || !content) {
                    throw new Error('chatId, content и авторизация обязательны');
                }

                const canSend = await chatExists(chatId, senderId);
                if (!canSend) {
                    throw new Error('Нет доступа к этому чату');
                }
                logger.debug('Socket event chat:message', {
                    socketId: socket.id,
                    chatId,
                    senderId,
                    contentLength: String(content).length,
                });
                const msg = await chatService.createMessage({ chatId, senderId, content, language });
                const outbound = {
                    chatId,
                    senderId,
                    content: msg.content,
                    language: msg.language,
                    messageId: msg._id,
                    sentAt: msg.createdAt,
                    status: msg.status,
                };
                io.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('chat:message', outbound);
                if (cb) cb({ ok: true, messageId: msg._id });
            } catch (error) {
                logger.error('Socket chat:message failed', error);
                if (cb) cb({ ok: false, error: error.message });
            }
        });
    });

    // Широковещательный тик состояния каждые TICK_SECONDS
    const intervalMs = Math.max((battleService.TICK_SECONDS || 5) * 1000, 30000);
    const timer = setInterval(() => {
        broadcastBattleState(io).catch((err) => {
            logger.error('Failed to broadcast battle state', err);
        });
    }, intervalMs);

    io.engine.on('close', () => clearInterval(timer));

    // Сохраняем ссылку на io для использования в контроллерах
    global.io = io;

    return io;
}

// Функция для получения io из любого места
function getIO() {
    return global.io;
}

module.exports = {
    initSocket,
    broadcastBattleState,
    closeSocketAdapter,
    getIO,
    __testUtils: {
        buildBattleStatePayload,
        resetBattleStateCache,
    },
};

