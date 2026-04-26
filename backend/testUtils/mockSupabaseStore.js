function createMockSupabaseStore() {
  const store = new Map();

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const getModelStore = (modelName) => {
    const key = String(modelName || '');
    if (!store.has(key)) store.set(key, new Map());
    return store.get(key);
  };

  return {
    ensureStoreReady: typeof jest !== 'undefined' ? jest.fn(async () => {}) : async () => {},
    getDocument: async (modelName, id) => {
      const modelStore = getModelStore(modelName);
      const row = modelStore.get(String(id));
      return row
        ? { ...clone(row), createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) }
        : null;
    },
    listDocuments: async (modelName) => {
      const modelStore = getModelStore(modelName);
      return Array.from(modelStore.values()).map((row) => ({
        ...clone(row),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      }));
    },
    upsertDocument: async (modelName, id, data, opts = {}) => {
      const modelStore = getModelStore(modelName);
      const key = String(id);
      const existing = modelStore.get(key);
      const now = new Date();
      modelStore.set(key, {
        id: key,
        data: clone(data || {}),
        createdAt: opts.createdAt ? new Date(opts.createdAt) : (existing?.createdAt || now),
        updatedAt: opts.updatedAt ? new Date(opts.updatedAt) : now,
      });
    },
    insertDocument: async (modelName, id, data, opts = {}) => {
      const modelStore = getModelStore(modelName);
      const key = String(id);
      if (modelStore.has(key)) {
        const error = new Error(`duplicate key value violates unique constraint "${String(modelName)}_${key}"`);
        error.code = '23505';
        throw error;
      }
      const now = new Date();
      modelStore.set(key, {
        id: key,
        data: clone(data || {}),
        createdAt: opts.createdAt ? new Date(opts.createdAt) : now,
        updatedAt: opts.updatedAt ? new Date(opts.updatedAt) : now,
      });
    },
    deleteDocument: async (modelName, id) => {
      const modelStore = getModelStore(modelName);
      modelStore.delete(String(id));
    },
    __reset() {
      store.clear();
    },
  };
}

module.exports = {
  createMockSupabaseStore,
};
