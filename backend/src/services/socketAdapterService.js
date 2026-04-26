const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const logger = require('../utils/logger');
const { getRedisUrl } = require('../config/env');

let socketRedisClients = null;
let socketRedisInitPromise = null;

function bindRedisLogging(client, clientName) {
    if (!client || typeof client.on !== 'function') return;
    client.on('error', (error) => {
        logger.warn('Socket Redis client error', {
            client: clientName,
            message: error?.message || 'Unknown Redis error',
        });
    });
}

async function ensureSocketRedisClients() {
    if (socketRedisClients) return socketRedisClients;
    if (socketRedisInitPromise) return socketRedisInitPromise;

    const redisUrl = getRedisUrl();
    if (!redisUrl) return null;

    socketRedisInitPromise = (async () => {
        const pubClient = createClient({ url: redisUrl });
        const subClient = pubClient.duplicate();
        const stateClient = pubClient.duplicate();

        bindRedisLogging(pubClient, 'socket-pub');
        bindRedisLogging(subClient, 'socket-sub');
        bindRedisLogging(stateClient, 'socket-state');

        try {
            await Promise.all([
                pubClient.connect(),
                subClient.connect(),
                stateClient.connect(),
            ]);

            socketRedisClients = { pubClient, subClient, stateClient };
            return socketRedisClients;
        } catch (error) {
            await Promise.allSettled(
                [pubClient, subClient, stateClient].map(async (client) => {
                    if (client?.isOpen) {
                        await client.quit();
                    }
                })
            );
            throw error;
        }
    })();

    try {
        return await socketRedisInitPromise;
    } finally {
        socketRedisInitPromise = null;
    }
}

async function configureSocketAdapter(io) {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
        return { enabled: false };
    }

    try {
        const clients = await ensureSocketRedisClients();
        if (!clients) return { enabled: false };

        io.adapter(createAdapter(clients.pubClient, clients.subClient));
        logger.info('Socket Redis adapter enabled');
        return { enabled: true };
    } catch (error) {
        logger.warn('Socket Redis adapter disabled, using local fallback', {
            message: error?.message || 'Unknown Redis adapter error',
        });
        return { enabled: false, error };
    }
}

function getSocketStateClient() {
    return socketRedisClients?.stateClient || null;
}

async function closeSocketAdapter() {
    if (socketRedisInitPromise) {
        try {
            await socketRedisInitPromise;
        } catch (_error) {
            // Ignore init failure during shutdown.
        }
    }

    const clients = socketRedisClients;
    socketRedisClients = null;
    socketRedisInitPromise = null;

    if (!clients) return;

    await Promise.allSettled(
        [clients.pubClient, clients.subClient, clients.stateClient].map(async (client) => {
            if (client?.isOpen) {
                await client.quit();
            }
        })
    );
}

module.exports = {
    configureSocketAdapter,
    getSocketStateClient,
    closeSocketAdapter,
};