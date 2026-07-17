require('dotenv').config();

const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const {
    isRemoteSessionStoreEnabled,
    fetchRemoteSession,
    upsertRemoteSession,
    deleteRemoteSession
} = require('./lib/remoteSessionStore');

const SESSION_CACHE = new Map();
const SESSION_WRITE_QUEUES = new Map();

function normalizeSessionId(value = '') {
    return String(value || '').replace(/\D/g, '').trim();
}

function fixFileName(file = '') {
    return String(file || '').replace(/\//g, '__').replace(/:/g, '-');
}

function cloneFiles(files = {}) {
    const output = {};
    for (const [fileName, content] of Object.entries(files || {})) {
        if (!fileName || typeof content !== 'string') continue;
        output[fixFileName(fileName)] = content;
    }
    return output;
}

function buildSnapshot(cache) {
    return {
        phone: cache.phone,
        sessionId: cache.phone,
        ownerId: String(cache.ownerId || '').trim(),
        registered: cache.registered === true,
        lastConnectedAt: cache.lastConnectedAt || null,
        files: cloneFiles(cache.files || {})
    };
}

function getQueue(phone) {
    return SESSION_WRITE_QUEUES.get(phone) || Promise.resolve();
}

function setQueue(phone, promise) {
    SESSION_WRITE_QUEUES.set(phone, promise.catch(() => undefined));
}

async function queuePersist(phone, task) {
    const next = getQueue(phone).then(task);
    setQueue(phone, next);
    return next;
}

async function ensureSessionCache(phone, defaults = {}) {
    const normalizedPhone = normalizeSessionId(phone);
    if (!normalizedPhone) {
        throw new Error('A valid phone/session id is required');
    }

    const cached = SESSION_CACHE.get(normalizedPhone);
    if (cached) {
        if (String(defaults.ownerId || '').trim() && !cached.ownerId) {
            cached.ownerId = String(defaults.ownerId || '').trim();
        }
        if (defaults.registered === true) {
            cached.registered = true;
        }
        if (defaults.lastConnectedAt && !cached.lastConnectedAt) {
            cached.lastConnectedAt = defaults.lastConnectedAt;
        }
        return cached;
    }

    let remote = null;
    if (isRemoteSessionStoreEnabled()) {
        try {
            remote = await fetchRemoteSession(normalizedPhone);
        } catch (_) {
            remote = null;
        }
    }

    const cache = {
        phone: normalizedPhone,
        ownerId: String(remote?.ownerId || defaults.ownerId || '').trim(),
        registered: remote?.registered === true || defaults.registered === true,
        lastConnectedAt: remote?.lastConnectedAt || defaults.lastConnectedAt || null,
        files: cloneFiles(remote?.files || {})
    };

    SESSION_CACHE.set(normalizedPhone, cache);
    return cache;
}

function readSerializedFile(cache, file) {
    const safeFile = fixFileName(file);
    const raw = cache.files?.[safeFile];
    if (typeof raw !== 'string' || !raw.length) return null;
    try {
        return JSON.parse(raw, BufferJSON.reviver);
    } catch (_) {
        return null;
    }
}

function writeSerializedFile(cache, file, value) {
    const safeFile = fixFileName(file);
    if (!value) {
        delete cache.files[safeFile];
        return false;
    }
    cache.files[safeFile] = JSON.stringify(value, BufferJSON.replacer);
    return true;
}

async function persistSessionCache(phone, cache, metadata = {}) {
    const normalizedPhone = normalizeSessionId(phone);
    if (!normalizedPhone) return buildSnapshot(cache);

    if (String(metadata.ownerId || '').trim()) {
        cache.ownerId = String(metadata.ownerId || '').trim();
    }
    if (metadata.registered === true) {
        cache.registered = true;
    } else if (Object.prototype.hasOwnProperty.call(metadata, 'registered')) {
        cache.registered = metadata.registered === true;
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'lastConnectedAt')) {
        cache.lastConnectedAt = metadata.lastConnectedAt || null;
    }

    if (!isRemoteSessionStoreEnabled()) {
        return buildSnapshot(cache);
    }

    return queuePersist(normalizedPhone, async () => {
        const saved = await upsertRemoteSession(normalizedPhone, buildSnapshot(cache));
        if (saved) {
            cache.ownerId = String(saved.ownerId || cache.ownerId || '').trim();
            cache.registered = saved.registered === true;
            cache.lastConnectedAt = saved.lastConnectedAt || null;
            cache.files = cloneFiles(saved.files || cache.files || {});
            return buildSnapshot(cache);
        }
        return buildSnapshot(cache);
    });
}

async function useMongoAuthState(id, defaults = {}) {
    const phone = normalizeSessionId(id);
    const cache = await ensureSessionCache(phone, defaults);

    let creds = readSerializedFile(cache, 'creds.json');
    if (!creds) {
        creds = initAuthCreds();
        writeSerializedFile(cache, 'creds.json', creds);
        await persistSessionCache(phone, cache, defaults);
    }

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {};
                await Promise.all((ids || []).map(async (id) => {
                    let value = readSerializedFile(cache, `${type}-${id}.json`);
                    if (type === 'app-state-sync-key' && value) {
                        value = proto.Message.AppStateSyncKeyData.fromObject(value);
                    }
                    data[id] = value;
                }));
                return data;
            },
            set: async (data) => {
                for (const category of Object.keys(data || {})) {
                    for (const id of Object.keys(data[category] || {})) {
                        const value = data[category][id];
                        const file = `${category}-${id}.json`;
                        if (value) {
                            writeSerializedFile(cache, file, value);
                        } else {
                            delete cache.files[fixFileName(file)];
                        }
                    }
                }
                return persistSessionCache(phone, cache, {
                    ownerId: String(defaults.ownerId || cache.ownerId || '').trim(),
                    registered: state?.creds?.registered === true,
                    lastConnectedAt: cache.lastConnectedAt || null
                });
            }
        }
    };

    const saveCreds = async (metadata = {}) => {
        writeSerializedFile(cache, 'creds.json', creds);
        return persistSessionCache(phone, cache, {
            ownerId: metadata.ownerId || defaults.ownerId || cache.ownerId || '',
            registered: metadata.registered === true || creds?.registered === true,
            lastConnectedAt: Object.prototype.hasOwnProperty.call(metadata, 'lastConnectedAt')
                ? (metadata.lastConnectedAt || null)
                : (cache.lastConnectedAt || defaults.lastConnectedAt || null)
        });
    };

    return {
        state,
        saveCreds,
        flush: (metadata = {}) => saveCreds(metadata),
        getSnapshot: () => buildSnapshot(cache)
    };
}

function getMongoSessionSnapshot(phone = '') {
    const normalizedPhone = normalizeSessionId(phone);
    if (!normalizedPhone) return null;
    const cache = SESSION_CACHE.get(normalizedPhone);
    if (cache) return buildSnapshot(cache);
    if (!isRemoteSessionStoreEnabled()) {
        return {
            phone: normalizedPhone,
            sessionId: normalizedPhone,
            ownerId: '',
            registered: false,
            lastConnectedAt: null,
            files: {}
        };
    }

    return {
        phone: normalizedPhone,
        sessionId: normalizedPhone,
        ownerId: '',
        registered: false,
        lastConnectedAt: null,
        files: {}
    };
}

function listMongoSessionJsonFiles(phone = '') {
    const snapshot = getMongoSessionSnapshot(phone);
    return Object.keys(snapshot?.files || {}).sort();
}

function sessionHasMongoAuthFiles(phone = '') {
    return listMongoSessionJsonFiles(phone).some((fileName) => fileName === 'creds.json' || fileName.startsWith('app-state-sync-') || fileName.startsWith('pre-key-') || fileName.startsWith('sender-key-') || fileName.startsWith('session-'));
}

function replaceMongoSessionSnapshot(phone = '', payload = {}) {
    const normalizedPhone = normalizeSessionId(phone || payload.phone || payload.sessionId || '');
    if (!normalizedPhone) return null;

    const cache = SESSION_CACHE.get(normalizedPhone) || {
        phone: normalizedPhone,
        ownerId: '',
        registered: false,
        lastConnectedAt: null,
        files: {}
    };

    cache.ownerId = String(payload.ownerId || cache.ownerId || '').trim();
    cache.registered = payload.registered === true;
    cache.lastConnectedAt = payload.lastConnectedAt || null;
    cache.files = cloneFiles(payload.files || {});
    SESSION_CACHE.set(normalizedPhone, cache);
    void persistSessionCache(normalizedPhone, cache, payload).catch(() => undefined);
    return buildSnapshot(cache);
}

function clearMongoSessionAuthFiles(phone = '', options = {}) {
    const normalizedPhone = normalizeSessionId(phone);
    if (!normalizedPhone) return 0;

    const cache = SESSION_CACHE.get(normalizedPhone) || {
        phone: normalizedPhone,
        ownerId: String(options.ownerId || '').trim(),
        registered: false,
        lastConnectedAt: options.lastConnectedAt || null,
        files: {}
    };

    const existingFiles = Object.keys(cache.files || {});
    const nextFiles = {};
    if (options.preserveSessionMeta === true && typeof cache.files['session-meta.json'] === 'string') {
        nextFiles['session-meta.json'] = cache.files['session-meta.json'];
    }

    const removed = existingFiles.filter((fileName) => !Object.prototype.hasOwnProperty.call(nextFiles, fileName)).length;
    cache.ownerId = String(options.ownerId || cache.ownerId || '').trim();
    cache.registered = false;
    cache.lastConnectedAt = options.lastConnectedAt || cache.lastConnectedAt || null;
    cache.files = nextFiles;
    SESSION_CACHE.set(normalizedPhone, cache);
    void persistSessionCache(normalizedPhone, cache, {
        ownerId: cache.ownerId,
        registered: false,
        lastConnectedAt: cache.lastConnectedAt
    }).catch(() => undefined);
    return removed;
}

function dropMongoSessionCache(phone = '') {
    const normalizedPhone = normalizeSessionId(phone);
    if (!normalizedPhone) return false;
    SESSION_CACHE.delete(normalizedPhone);
    SESSION_WRITE_QUEUES.delete(normalizedPhone);
    return true;
}

async function deleteMongoSessionSnapshot(phone = '') {
    const normalizedPhone = normalizeSessionId(phone);
    if (!normalizedPhone) return false;
    dropMongoSessionCache(normalizedPhone);
    if (!isRemoteSessionStoreEnabled()) return true;
    return deleteRemoteSession(normalizedPhone);
}

module.exports = {
    useMongoAuthState,
    getMongoSessionSnapshot,
    replaceMongoSessionSnapshot,
    listMongoSessionJsonFiles,
    sessionHasMongoAuthFiles,
    clearMongoSessionAuthFiles,
    dropMongoSessionCache,
    deleteMongoSessionSnapshot
};
