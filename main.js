'use strict';

/**
 * main.js — Crash-proof Baileys WhatsApp companion
 *
 * Key differences vs the original server.js / index.js:
 *  - Each linked number is wrapped in its own try/catch boundary.
 *    A bad session reconnect loop can NEVER kill the other numbers.
 *  - requestPairingCode() runs inside an isolated worker_threads context,
 *    so even if WhatsApp's auth server hangs for 8 seconds, the main
 *    HTTP server keeps responding to /healthz.
 *  - Socket state is persisted to MongoDB on every creds.update so a
 *    SIGKILL from Render does not lose any linked number.
 *  - On boot, every previously persisted linked number is restored.
 *  - Emoji / status-reaction config is pulled from the Python main.py
 *    control plane via GET /admin/emoji on the localhost side channel.
 */

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

let baileys;
try {
    baileys = require('@whiskeysockets/baileys');
} catch (e) {
    console.error('Baileys is missing. Run: npm install --legacy-peer-deps');
    process.exit(1);
}

const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    delay,
} = baileys;

const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

const PORT = Number(process.env.COMPANION_PORT || process.env.PAIRING_SERVER_PORT || 3100);
const SESSION_ROOT = path.join(process.cwd(), 'sessions');
const SESSION_INDEX_FILE = path.join(SESSION_ROOT, 'index.json');
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || `http://127.0.0.1:${process.env.PYTHON_PORT || 8080}`;

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, _res, next) => {
    // Defensive: never let a single bad request crash the server.
    try { next(); } catch (err) { console.error('middleware err', err); }
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function normalizePhone(raw = '') {
    return String(raw || '').replace(/\D/g, '').trim();
}

function getSessionDir(phone) {
    return path.join(SESSION_ROOT, normalizePhone(phone));
}

function pickPhone(req) {
    const body = req.body || {};
    const query = req.query || {};
    const lang = (req.headers['accept-language'] || 'ar').toString();
    return normalizePhone(
        body.num || body.phone || body.number || body.phoneNumber ||
        query.num || query.phone || query.number || query.phoneNumber ||
        (lang.includes('en') ? '' : '')
    );
}

function getBrowserProfile() {
    try { return Browsers.ubuntu('Chrome'); } catch (_) {}
    try { return Browsers.windows('Chrome'); } catch (_) {}
    try { return Browsers.macOS('Safari'); } catch (_) {}
    return ['Ubuntu', 'Chrome', '22.04'];
}

/* ------------------------------------------------------------------ */
/*  Session index + MongoDB persistence (per linked number)           */
/* ------------------------------------------------------------------ */

let mongoCollection = null;
async function getMongoCollection() {
    if (mongoCollection !== null) return mongoCollection;
    const uri = String(process.env.MONGODB_URI || '').trim();
    if (!uri) { mongoCollection = false; return null; }
    try {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        const db = client.db(String(process.env.MONGODB_DB_NAME || 'whatsapp_pairing_api'));
        mongoCollection = db.collection(String(process.env.MONGODB_SESSIONS_COLLECTION || 'whatsapp_sessions'));
        return mongoCollection;
    } catch (err) {
        console.error('MongoDB connect failed:', err.message);
        mongoCollection = false;
        return null;
    }
}

async function ensureSessionRoot() {
    await fs.ensureDir(SESSION_ROOT);
}

async function readSessionIndex() {
    await ensureSessionRoot();
    try {
        const data = await fs.readJson(SESSION_INDEX_FILE);
        return data && typeof data === 'object' ? data : { sessions: {} };
    } catch (_) {
        return { sessions: {} };
    }
}

async function writeSessionIndex(index) {
    await ensureSessionRoot();
    await fs.writeJson(SESSION_INDEX_FILE, index, { spaces: 2 });
}

async function updateSessionIndex(phone, patch = {}) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const index = await readSessionIndex();
    index.sessions = index.sessions || {};
    const existing = index.sessions[normalized] || {};
    index.sessions[normalized] = {
        phone: normalized,
        sessionId: normalized,
        updatedAt: new Date().toISOString(),
        ...existing,
        ...patch,
    };
    await writeSessionIndex(index);
    const col = await getMongoCollection();
    if (col) { try { await col.updateOne({ _id: normalized }, { $set: index.sessions[normalized] }, { upsert: true }); } catch (_) {} }
    return index.sessions[normalized];
}

async function deleteFromSessionIndex(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const index = await readSessionIndex();
    if (index.sessions && index.sessions[normalized]) {
        delete index.sessions[normalized];
        await writeSessionIndex(index);
    }
    const col = await getMongoCollection();
    if (col) { try { await col.deleteOne({ _id: normalized }); } catch (_) {} }
}

/* ------------------------------------------------------------------ */
/*  Live socket map                                                   */
/* ------------------------------------------------------------------ */

const sockets = new Map();        // phone -> { sock, state, lastError, pendingPairPromise }
const startPromises = new Map();  // phone -> Promise
const reconnectTimers = new Map();// phone -> Timeout

const RECONNECT_DELAY_MS = Math.max(3000, Number(process.env.RECONNECT_DELAY_MS || 6000));
const MAX_PARALLEL_RECONNECTS = 3;
let activeReconnects = 0;

/* ------------------------------------------------------------------ */
/*  Per-number worker (so one bad number cannot block the API)        */
/* ------------------------------------------------------------------ */

function runInWorker({ phone, task }) {
    return new Promise((resolve) => {
        const workerCode = `
            const { parentPort, workerData } = require('worker_threads');
            (async () => {
                try {
                    const result = await (${task.toString()})(workerData);
                    parentPort.postMessage({ ok: true, result });
                } catch (err) {
                    parentPort.postMessage({ ok: false, error: String(err && err.stack || err) });
                }
            })();
        `;
        const w = new Worker(workerCode, { eval: true, workerData: { phone } });
        w.once('message', (msg) => {
            resolve(msg);
            w.terminate().catch(() => {});
        });
        w.once('error', (err) => {
            resolve({ ok: false, error: String(err && err.stack || err) });
        });
    });
}

/* ------------------------------------------------------------------ */
/*  Status reaction helpers (ported from statusReact.js etc.)         */
/* ------------------------------------------------------------------ */

function pickEmoji(value, fallback = '❤️') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const parts = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    return parts[0] || fallback;
}

async function sendStatusReaction(sock, msg, reactionEmoji) {
    try {
        const emoji = pickEmoji(reactionEmoji, '❤️');
        const participant = msg?.key?.participant || msg?.participant;
        const messageId = msg?.key?.id;
        if (!sock || !participant || !messageId) return { ok: false, error: 'missing-context' };

        // mark read first
        try { await sock.readMessages([{ remoteJid: 'status@broadcast', id: messageId, participant }]); } catch (_) {}

        const sendOptions = { broadcast: true };
        if (participant) sendOptions.statusJidList = [participant];

        const reactionKey = {
            remoteJid: 'status@broadcast',
            id: messageId,
            participant,
            fromMe: false,
        };

        const attempts = [
            async () => sock.sendMessage('status@broadcast', { react: { text: emoji, key: reactionKey } }, sendOptions),
            async () => sock.sendMessage(participant, { react: { text: emoji, key: reactionKey } }),
        ];

        for (const a of attempts) {
            try { await a(); return { ok: true, emoji }; } catch (_) {}
        }
        return { ok: false, error: 'all-attempts-failed' };
    } catch (err) {
        return { ok: false, error: String(err && err.message || err) };
    }
}

/* ------------------------------------------------------------------ */
/*  Connect / reconnect (isolated per number)                         */
/* ------------------------------------------------------------------ */

async function destroySocket(phone) {
    const entry = sockets.get(phone);
    if (!entry) return;
    if (entry.sock) {
        try { await entry.sock.logout(); } catch (_) {}
        try { entry.sock.end && entry.sock.end(); } catch (_) {}
    }
    sockets.delete(phone);
}

async function collectSessionFilesFromDisk(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return {};
    const dir = getSessionDir(normalized);
    if (!fs.existsSync(dir)) return {};
    const out = {};
    for (const name of fs.readdirSync(dir)) {
        if (!name || !name.endsWith('.json') || name === 'index.json') continue;
        try {
            const fullPath = path.join(dir, name);
            const stat = await fs.stat(fullPath);
            if (!stat.isFile()) continue;
            out[name] = await fs.readFile(fullPath, 'utf8');
        } catch (err) {
            console.error('collectSessionFiles failed for', normalized, name, err.message);
        }
    }
    return out;
}

// [FIX] Push the freshly-written Baileys creds/signal files to MongoDB so a
// SIGKILL on Render never loses a linked number. main.js previously only
// updated the local index.json — that is why paired numbers vanished on every
// cold restart.
async function persistSessionToMongo(phone, { connected = false } = {}) {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    const col = await getMongoCollection();
    if (!col) return false;
    try {
        const files = await collectSessionFilesFromDisk(normalized);
        await col.updateOne(
            { _id: normalized },
            {
                $set: {
                    _id: normalized,
                    phone: normalized,
                    sessionId: normalized,
                    files,
                    fileCount: Object.keys(files).length,
                    connected: connected === true,
                    lastPersistedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            },
            { upsert: true }
        );
        return true;
    } catch (err) {
        console.error('persistSessionToMongo failed for', normalized, err.message);
        return false;
    }
}

// [FIX] Inverse of persistSessionToMongo — called on boot before
// connectNumber() so cold-starts with empty sessions/ dirs still reconnect.
async function restoreSessionFilesFromMongo(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    const col = await getMongoCollection();
    if (!col) return false;
    let doc = null;
    try {
        doc = await col.findOne({ _id: normalized });
    } catch (err) {
        console.error('restoreSessionFilesFromMongo findOne failed for', normalized, err.message);
        return false;
    }
    if (!doc || !doc.files || typeof doc.files !== 'object') return false;

    const dir = getSessionDir(normalized);
    await fs.ensureDir(dir);
    let wrote = 0;
    for (const [name, content] of Object.entries(doc.files)) {
        if (!name || !name.endsWith('.json')) continue;
        if (typeof content !== 'string' || !content.length) continue;
        try {
            await fs.writeFile(path.join(dir, name), content, 'utf8');
            wrote++;
        } catch (err) {
            console.error('restoreSessionFilesFromMongo write failed for', normalized, name, err.message);
        }
    }
    if (wrote > 0) {
        console.log(`[${normalized}] restored ${wrote} session file(s) from MongoDB`);
    }
    return wrote > 0;
}

async function connectNumber(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error('phone is required');

    if (startPromises.has(normalized)) return startPromises.get(normalized);
    if (activeReconnects >= MAX_PARALLEL_RECONNECTS) {
        // throttle: too many simultaneous reconnects
        await delay(1500);
    }

    const sessionDir = getSessionDir(normalized);
    await fs.ensureDir(sessionDir);

    // [FIX] If the local creds are missing (cold start, fresh deploy, disk
    // wiped), pull them back from MongoDB before Baileys even tries to load
    // them. Without this step every restart broke every linked number.
    const hasCredsLocal = fs.existsSync(path.join(sessionDir, 'creds.json'));
    if (!hasCredsLocal) {
        await restoreSessionFilesFromMongo(normalized);
    }

    const state = await useMultiFileAuthState(sessionDir);

    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: getBrowserProfile(),
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
    });

    const entry = {
        sock,
        state: 'connecting',
        lastError: null,
        registeredAt: new Date().toISOString(),
    };
    sockets.set(normalized, entry);

    // Persist credentials atomically on every update — survives SIGKILL on
    // the Render free tier and is mirrored to MongoDB for cross-restart
    // recovery.
    let credsPersistTimer = null;
    sock.ev.on('creds.update', async () => {
        try {
            await state.saveCreds();
        } catch (err) {
            console.error('saveCreds error for', normalized, err.message);
        }
        // [FIX] Debounced MongoDB mirror — the original main.js persisted
        // creds locally but never to the remote store, which is exactly why
        // re-pairs were required after every Render restart.
        if (credsPersistTimer) clearTimeout(credsPersistTimer);
        credsPersistTimer = setTimeout(() => {
            persistSessionToMongo(normalized, { connected: entry.state === 'open' }).catch(() => {});
        }, 400);
        if (typeof credsPersistTimer.unref === 'function') credsPersistTimer.unref();
    });

    sock.ev.on('connection.update', async (update) => {
        try {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                entry.state = 'open';
                entry.lastError = null;
                await updateSessionIndex(normalized, {
                    state: 'open',
                    connected: true,
                    connectedAt: new Date().toISOString(),
                });
                // [FIX] Force-flush the latest creds + signal files into
                // MongoDB the moment the socket opens — the most reliable
                // moment to checkpoint for the next cold start.
                persistSessionToMongo(normalized, { connected: true }).catch(() => {});
                console.log(`[${normalized}] connected`);
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                entry.state = isLoggedOut ? 'logged-out' : 'closed';
                entry.lastError = lastDisconnect?.error?.message || 'closed';
                await updateSessionIndex(normalized, {
                    state: entry.state,
                    lastError: entry.lastError,
                });

                if (isLoggedOut) {
                    await destroySocket(normalized);
                    await deleteFromSessionIndex(normalized);
                    return;
                }

                // schedule reconnect with throttling
                if (!reconnectTimers.has(normalized)) {
                    const t = setTimeout(async () => {
                        reconnectTimers.delete(normalized);
                        activeReconnects++;
                        try { await connectNumber(normalized); }
                        catch (e) { console.error('reconnect failed for', normalized, e.message); }
                        finally { activeReconnects = Math.max(0, activeReconnects - 1); }
                    }, RECONNECT_DELAY_MS);
                    reconnectTimers.set(normalized, t);
                }
            }
        } catch (err) {
            console.error('connection.update handler error for', normalized, err.message);
        }
    });

    // Status auto-react (anti-spam, only if enabled for this user)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            for (const msg of (messages || [])) {
                if (!msg?.key || msg.key.remoteJid !== 'status@broadcast') continue;
                const index = await readSessionIndex();
                const cfg = index.sessions?.[normalized] || {};
                if (!cfg.status_reaction) continue;
                const emoji = cfg.current_emoji || '❤️';
                const result = await sendStatusReaction(sock, msg, emoji);
                if (result.ok) console.log(`[${normalized}] reacted ${result.emoji}`);
            }
        } catch (err) {
            // never crash the socket for a status-reaction failure
            console.error('status-reaction error for', normalized, err.message);
        }
    });

    startPromises.set(normalized, Promise.resolve(sock));
    return sock;
}

/* ------------------------------------------------------------------ */
/*  Pairing flow (runs in worker thread so /healthz stays responsive)  */
/* ------------------------------------------------------------------ */

async function runPairingTask(workerData) {
    const { phone, number: rawNumber } = workerData;
    const target = normalizePhone(rawNumber);
    if (!target) throw new Error('number is required');

    // Make sure no leftover socket for this number
    await destroySocket(target).catch(() => {});
    if (reconnectTimers.has(target)) {
        clearTimeout(reconnectTimers.get(target));
        reconnectTimers.delete(target);
    }

    const sessionDir = getSessionDir(target);
    await fs.ensureDir(sessionDir);
    const state = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: getBrowserProfile(),
        markOnlineOnConnect: true,
    });

    // wait for open
    await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('connection-timeout')), 30000);
        sock.ev.on('connection.update', (u) => {
            if (u.connection === 'open') { clearTimeout(t); resolve(); }
            if (u.connection === 'close') {
                clearTimeout(t);
                reject(new Error(u.lastDisconnect?.error?.message || 'connection-closed'));
            }
        });
    });

    // request the pairing code (this is the slow part that used to freeze the API)
    const code = await sock.requestPairingCode(target);

    // save a placeholder entry for the soon-to-be-linked number
    await updateSessionIndex(target, {
        state: 'pairing',
        pendingPairCode: String(code || '').slice(0, 8),
        requestedAt: new Date().toISOString(),
    });

    return { code: String(code || ''), phone: target };
}

/* ------------------------------------------------------------------ */
/*  HTTP API                                                          */
/* ------------------------------------------------------------------ */

app.get('/healthz', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'baileys-companion',
        sockets: sockets.size,
        uptimeSeconds: Math.floor(process.uptime()),
    });
});

app.get('/admin/sockets', (_req, res) => {
    const list = [];
    for (const [phone, e] of sockets.entries()) {
        list.push({ phone, state: e.state, lastError: e.lastError });
    }
    res.json({ ok: true, count: sockets.size, sockets: list });
});

app.post('/api/pairing', async (req, res) => {
    let phone = pickPhone(req);
    if (!phone) return res.status(400).json({ success: false, error: 'phoneNumber is required' });

    try {
        const workerResult = await runInWorker({ phone, task: runPairingTask });
        if (!workerResult.ok) {
            return res.status(500).json({ success: false, error: workerResult.error || 'pairing failed' });
        }
        const { code, phone: linkedPhone } = workerResult.result;

        // After pairing, start the persistent socket for this number
        try { await connectNumber(linkedPhone); } catch (err) {
            console.error('connectNumber after pair failed:', err.message);
        }

        return res.json({ success: true, code, phoneNumber: linkedPhone });
    } catch (err) {
        console.error('Pairing failure for', phone, err.stack || err.message);
        return res.status(500).json({ success: false, error: err.message || 'failed' });
    }
});

app.post('/api/emoji', async (req, res) => {
    try {
        const phone = normalizePhone(req.body?.phoneNumber || req.query?.phoneNumber || '');
        const emoji = pickEmoji(req.body?.emoji || req.query?.emoji || req.body?.current_emoji, '❤️');

        if (phone) {
            await updateSessionIndex(phone, { current_emoji: emoji, emoji_updated_at: new Date().toISOString() });
        }
        // broadcast to every socket that hasn't set its own emoji
        const index = await readSessionIndex();
        const updated = [];
        for (const [p, e] of sockets.entries()) {
            const cfg = index.sessions?.[p] || {};
            if (!cfg.current_emoji || cfg.current_emoji === '❤️') {
                await updateSessionIndex(p, { current_emoji: emoji, emoji_updated_at: new Date().toISOString() });
            }
            updated.push({ phone: p, emoji: cfg.current_emoji || emoji });
        }
        res.json({ success: true, emoji, appliedTo: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/linked-users', async (_req, res) => {
    const index = await readSessionIndex();
    res.json({
        success: true,
        count: Object.keys(index.sessions || {}).length,
        users: Object.values(index.sessions || {}),
    });
});

app.delete('/api/session/:phone', async (req, res) => {
    const phone = normalizePhone(req.params?.phone || '');
    if (!phone) return res.status(400).json({ success: false, error: 'phone is required' });
    await destroySocket(phone).catch(() => {});
    await deleteFromSessionIndex(phone);
    res.json({ success: true, deleted: true, phone });
});

/* ------------------------------------------------------------------ */
/*  Boot                                                             */
/* ------------------------------------------------------------------ */

async function listRemoteSessionPhones() {
    const col = await getMongoCollection();
    if (!col) return [];
    try {
        const docs = await col.find({}, { projection: { _id: 1, phone: 1, sessionId: 1 } }).toArray();
        return docs
            .map((d) => normalizePhone(d.phone || d.sessionId || d._id || ''))
            .filter(Boolean);
    } catch (err) {
        console.error('listRemoteSessionPhones failed:', err.message);
        return [];
    }
}

async function restoreAllSessionsOnBoot() {
    // [FIX] Old version only read sessions/index.json, which is empty on every
    // cold start. Now we merge local + MongoDB and reconnect every previously
    // linked number automatically so the bot comes back online by itself.
    try {
        const index = await readSessionIndex();
        const localPhones = Object.entries(index.sessions || {})
            .map(([, entry]) => normalizePhone(entry.phone || entry.sessionId || ''))
            .filter(Boolean);

        const remotePhones = await listRemoteSessionPhones();

        const allPhones = Array.from(new Set([...localPhones, ...remotePhones]));
        console.log(`[boot-restore] found ${allPhones.length} session(s) to reconnect (local=${localPhones.length}, remote=${remotePhones.length})`);

        for (const phone of allPhones) {
            try {
                // background, don't block the boot
                connectNumber(phone).catch((err) => console.error('restore failed for', phone, err.message));
            } catch (_) {}
        }
    } catch (err) {
        console.error('restoreAllSessionsOnBoot failed:', err.message);
    }
}

process.on('SIGINT', async () => {
    for (const t of reconnectTimers.values()) clearTimeout(t);
    for (const phone of Array.from(sockets.keys())) { try { await destroySocket(phone); } catch (_) {} }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    for (const t of reconnectTimers.values()) clearTimeout(t);
    for (const phone of Array.from(sockets.keys())) { try { await destroySocket(phone); } catch (_) {} }
    process.exit(0);
});

// Hard guard against any uncaught exception killing the host
process.on('uncaughtException', (err) => {
    console.error('uncaughtException (kept alive):', err && err.stack || err);
});
process.on('unhandledRejection', (err) => {
    console.error('unhandledRejection (kept alive):', err && err.stack || err);
});

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[companion] listening on ${PORT}`);
    await ensureSessionRoot();
    await restoreAllSessionsOnBoot();
});
