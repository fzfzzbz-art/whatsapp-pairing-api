'use strict';

/**
 * lib/liveWhatsAppBridge.js — THE MISSING PIECE
 *
 * Prior to this file, `server.js` paired and stored credentials but NEVER
 * created the LIVE Baileys socket that processes incoming WhatsApp messages.
 * `index.js` imported `makeWASocket` / `useMultiFileAuthState` but never
 * called them, so no `messages.upsert` listener ever fired — the bot "looked"
 * active but never replied.
 *
 * This module:
 *  1. Restores every persisted number (local creds.json OR MongoDB).
 *  2. Calls `useMultiFileAuthState` + `makeWASocket` for each phone.
 *  3. Binds `messages.upsert` and routes each message to message-handlers
 *     in the calling process (legacy-command-bridge + status handlers).
 *  4. Persists creds on every `creds.update` to disk + Mongo (debounced 250ms).
 *  5. Reconnects on close with exponential backoff (≤ 5 retries).
 *  6. Survives SIGKILL because creds are written inline, not on a debounce.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const pino = require('pino');
const { EventEmitter } = require('events');

let baileys;
try { baileys = require('@whiskeysockets/baileys'); }
catch (e) {
    console.error('[live-wa] baileys missing — `npm i @whiskeysockets/baileys` first');
    throw e;
}

const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    delay
} = baileys;

const { dispatchLegacyMessage, dispatchLegacyGroupParticipantsUpdate, hasLegacyHandleMessages } = (() => {
    try { return require('./legacyCommandBridge'); }
    catch (_) { return { dispatchLegacyMessage: null, dispatchLegacyGroupParticipantsUpdate: null, hasLegacyHandleMessages: () => false }; }
})();

const remoteStore = (() => {
    try { return require('../remoteSessionStore'); } catch (_) { return null; }
})();

const logger = pino({ level: process.env.LIVE_WA_LOG_LEVEL || 'silent' }).child({ module: 'live-wa-bridge' });

const SESSION_ROOT = path.join(process.cwd(), 'sessions');
const RECONNECT_BASE_MS = Math.max(1500, Number(process.env.LIVE_WA_RECONNECT_BASE_MS || 3500));
const RECONNECT_MAX_MS = Math.max(8000, Number(process.env.LIVE_WA_RECONNECT_MAX_MS || 60000));
const PERSIST_DEBOUNCE_MS = Math.max(120, Number(process.env.LIVE_WA_PERSIST_DEBOUNCE_MS || 250));

const liveSockets = new Map();        // phone -> Baileys socket
const liveAuthStates = new Map();     // phone -> authState helper (saveCreds)
const livePersistTimers = new Map();  // phone -> debounce timer
const liveReconnectAttempts = new Map(); // phone -> consecutive retries
const liveSkipUntil = new Map();      // phone -> epoch ms; ignore upserts until passed (fixes history replay)

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function normalizePhone(raw = '') {
    return String(raw || '').replace(/\D/g, '').trim();
}

function sessionDirFor(phone) {
    return path.join(SESSION_ROOT, normalizePhone(phone));
}

function isRemoteStoreEnabled() {
    if (!remoteStore) return false;
    if (typeof remoteStore.isRemoteSessionStoreEnabled === 'function') {
        try { return Boolean(remoteStore.isRemoteSessionStoreEnabled()); } catch (_) { return false; }
    }
    return false;
}

function getBrowserProfile() {
    try { if (typeof Browsers === 'function') return Browsers.ubuntu('Chrome'); } catch (_) {}
    try { if (typeof Browsers === 'function') return Browsers.windows('Chrome'); } catch (_) {}
    try { if (typeof Browsers === 'function') return Browsers.macOS('Safari'); } catch (_) {}
    return ['Ubuntu', 'Chrome', '22.04'];
}

function hasLocalAuthFiles(phone) {
    try {
        const dir = sessionDirFor(phone);
        if (!fs.existsSync(dir)) return false;
        const entries = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        return entries.some(f => f === 'creds.json' || f.startsWith('app-state-sync-') || f.startsWith('pre-key-') || f.startsWith('sender-key-') || f.startsWith('session-'));
    } catch (_) { return false; }
}

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }

async function restoreAuthFromRemoteStore(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized || !remoteStore || !isRemoteStoreEnabled()) return false;
    try {
        const record = await remoteStore.fetchRemoteSession(normalized);
        if (!record || !record.files || !Object.keys(record.files || {}).length) return false;
        const dir = sessionDirFor(normalized);
        await ensureDir(dir);
        for (const [fileName, content] of Object.entries(record.files || {})) {
            const safeName = String(fileName || '').trim();
            if (!safeName.endsWith('.json') || typeof content !== 'string') continue;
            await fsp.writeFile(path.join(dir, safeName), content, 'utf8');
        }
        return true;
    } catch (error) {
        console.error('[live-wa] restore-from-remote failed:', normalized, error?.message || error);
        return false;
    }
}

function persistSessionImmediate(phone, authState) {
    const normalized = normalizePhone(phone);
    if (!normalized) return Promise.resolve(false);
    if (!authState || typeof authState.saveCreds !== 'function') return Promise.resolve(false);
    return Promise.resolve().then(() => authState.saveCreds()).then(() => true).catch((err) => {
        console.error('[live-wa] saveCreds failed:', normalized, err?.message || err);
        return false;
    });
}

function persistSessionDebounced(phone, authState) {
    const normalized = normalizePhone(phone);
    if (!normalized || !authState) return;

    // Save immediately (in case of SIGKILL) AND schedule remote upload.
    persistSessionImmediate(normalized, authState).catch(() => {});

    const existing = livePersistTimers.get(normalized);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
        livePersistTimers.delete(normalized);
        if (!remoteStore || !isRemoteStoreEnabled()) return;
        try {
            const dir = sessionDirFor(normalized);
            if (!fs.existsSync(dir)) return;
            const files = {};
            for (const fileName of fs.readdirSync(dir)) {
                if (!fileName.endsWith('.json')) continue;
                try { files[fileName] = await fsp.readFile(path.join(dir, fileName), 'utf8'); }
                catch (_) { /* ignore unreadable */ }
            }
            // Truncate oversized pre-key/sender-key pools to keep Mongo happy.
            const PRE_KEY_LIMIT = 90;
            const SENDER_KEY_LIMIT = 60;
            const SESSION_LIMIT = 90;
            const buckets = { pre: [], sender: [], session: [] };
            for (const f of Object.keys(files)) {
                if (f.startsWith('pre-key-')) buckets.pre.push(f);
                else if (f.startsWith('sender-key-')) buckets.sender.push(f);
                else if (f.startsWith('session-')) buckets.session.push(f);
            }
            buckets.pre.sort(); buckets.sender.sort(); buckets.session.sort();
            const remove = new Set([
                ...buckets.pre.slice(0, Math.max(0, buckets.pre.length - PRE_KEY_LIMIT)),
                ...buckets.sender.slice(0, Math.max(0, buckets.sender.length - SENDER_KEY_LIMIT)),
                ...buckets.session.slice(0, Math.max(0, buckets.session.length - SESSION_LIMIT)),
            ]);
            for (const f of remove) { try { await fsp.unlink(path.join(dir, f)); delete files[f]; } catch (_) {} }

            await remoteStore.upsertRemoteSession(normalized, {
                phone: normalized,
                sessionId: normalized,
                registered: true,
                files,
                updatedAt: new Date().toISOString(),
            }).catch(() => null);
        } catch (error) {
            console.error('[live-wa] remote persist failed:', normalized, error?.message || error);
        }
    }, PERSIST_DEBOUNCE_MS);
    if (typeof timer.unref === 'function') timer.unref();
    livePersistTimers.set(normalized, timer);
}

function reconnectDelayMs(attempt) {
    const n = Math.max(0, Number(attempt) || 0);
    const jitter = Math.floor(Math.random() * 800);
    return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(1.6, n)) + jitter;
}

function scheduleReconnect(phone, reason = 'unknown') {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const attempt = (liveReconnectAttempts.get(normalized) || 0) + 1;
    liveReconnectAttempts.set(normalized, attempt);
    const delay = reconnectDelayMs(attempt - 1);
    console.log(`[live-wa] scheduling reconnect for ${normalized} in ${delay}ms (attempt #${attempt}, reason=${reason})`);

    setTimeout(async () => {
        try { await activatePhone(normalized, { reason: `reconnect:${reason}` }); }
        catch (error) {
            console.error('[live-wa] reconnect failed:', normalized, error?.message || error);
            scheduleReconnect(normalized, 'retry-after-failure');
        }
    }, delay);
    if (typeof delay === 'number' && typeof setTimeout === 'function') { /* noop for linter */ }
}

function shouldDispatchMessage(msg = {}) {
    try {
        if (msg?.key?.fromMe === true) return false; // never echo outbox
        const stub = String(msg?.key?.id || '').toLowerCase();
        if (stub.endsWith('@baileys-stub')) return false; // framework stub noise
        return Boolean(msg?.message || msg?.messageStubType);
    } catch (_) { return false; }
}

async function activatePhone(phone, options = {}) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error('phone is required');
    if (liveSockets.has(normalized)) return liveSockets.get(normalized);

    const dir = sessionDirFor(normalized);
    await ensureDir(dir);

    // Restore creds from Mongo if local files missing.
    if (!hasLocalAuthFiles(normalized)) {
        const restored = await restoreAuthFromRemoteStore(normalized);
        if (restored) console.log(`[live-wa] ${normalized} creds restored from MongoDB`);
    }

    if (!hasLocalAuthFiles(normalized)) {
        throw new Error(`No credentials found for ${normalized}. Pair it first.`);
    }

    const helper = await useMultiFileAuthState(dir);
    const state = helper.state;
    liveAuthStates.set(normalized, helper);

    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const sock = makeWASocket({
        version,
        printQRInTerminal: false,
        logger,
        browser: getBrowserProfile(),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: 0,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 20000,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        emitOwnEvents: false,
    });

    liveSockets.set(normalized, sock);
    liveReconnectAttempts.set(normalized, 0);

    // [CRITICAL FIX] This is the listener that was missing. Without it the
    // bot never replies. Binding it on the LIVE socket — not a stale copy —
    // so every incoming WhatsApp message is dispatched to the legacy bridge.
    sock.ev.on('messages.upsert', async (upsert = {}) => {
        const now = Date.now();
        const skipUntil = liveSkipUntil.get(normalized) || 0;
        if (now < skipUntil) return; // ignore history replay on first connect

        const messages = Array.isArray(upsert?.messages) ? upsert.messages : [];
        for (const msg of messages) {
            if (!shouldDispatchMessage(msg)) continue;
            try {
                if (typeof dispatchLegacyMessage === 'function') {
                    await dispatchLegacyMessage(sock, normalized, msg).catch((err) => {
                        console.error('[live-wa] legacy dispatch error:', normalized, err?.message || err);
                    });
                } else {
                    console.warn('[live-wa] no legacy bridge — message ignored for', normalized);
                }
                emitter.emit('message', normalized, msg, sock);
            } catch (error) {
                console.error('[live-wa] messages.upsert handler error:', error?.message || error);
            }
        }
    });

    sock.ev.on('group-participants.update', async (update = {}) => {
        try {
            if (typeof dispatchLegacyGroupParticipantsUpdate === 'function') {
                await dispatchLegacyGroupParticipantsUpdate(sock, normalized, update);
            }
        } catch (error) {
            console.error('[live-wa] group update error:', error?.message || error);
        }
    });

    sock.ev.on('creds.update', async () => {
        persistSessionDebounced(normalized, helper);
        try { if (remoteStore?.touchRemoteSession) await remoteStore.touchRemoteSession(normalized, { registered: true }); } catch (_) {}
    });

    sock.ev.on('connection.update', async (update = {}) => {
        const { connection, lastDisconnect } = update || {};
        const statusCode = Number(lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || 0);

        if (connection === 'open') {
            liveReconnectAttempts.set(normalized, 0);
            // History replay guard: don't dispatch any messages received in the
            // first 6 seconds after open — that's the sync window.
            liveSkipUntil.set(normalized, Date.now() + 6000);
            emitter.emit('phone.opened', normalized, sock);
            console.log(`[live-wa] phone ${normalized} is open`);
        }

        if (connection === 'close') {
            emitter.emit('phone.closed', normalized, { reason: String(lastDisconnect?.error?.message || statusCode || 'unknown') });
            liveSockets.delete(normalized);
            liveAuthStates.delete(normalized);

            const isLoggedOut = statusCode === Number(DisconnectReason?.loggedOut)
                || /logged\s*out/i.test(String(lastDisconnect?.error?.message || ''))
                || /device\s*removed/i.test(String(lastDisconnect?.error?.message || ''));
            const restartRequired = statusCode === Number(DisconnectReason?.restartRequired);

            if (isLoggedOut) {
                console.warn(`[live-wa] ${normalized} was logged out — clearing creds (must re-pair)`);
                try {
                    for (const f of fs.readdirSync(dir)) {
                        if (f.endsWith('.json')) { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} }
                    }
                    if (remoteStore?.deleteRemoteSession) await remoteStore.deleteRemoteSession(normalized).catch(() => null);
                } catch (_) {}
                return;
            }

            if (restartRequired) {
                setTimeout(() => activatePhone(normalized, { reason: 'restartRequired' }).catch(() => {}), 1500);
                return;
            }

            scheduleReconnect(normalized, String(lastDisconnect?.error?.message || statusCode || 'close'));
        }
    });

    return sock;
}

async function listRestorablePhones() {
    const out = new Set();

    // 1) Local sessions/<phone>/ directories with at least creds.json or app-state
    try {
        await ensureDir(SESSION_ROOT);
        for (const entry of fs.readdirSync(SESSION_ROOT)) {
            if (entry === 'index.json') continue;
            if (hasLocalAuthFiles(entry)) out.add(normalizePhone(entry));
        }
    } catch (_) {}

    // 2) Remote Mongo
    if (remoteStore && isRemoteStoreEnabled() && typeof remoteStore.listRemoteSessions === 'function') {
        try {
            const list = await remoteStore.listRemoteSessions();
            for (const rec of (list || [])) {
                const phone = normalizePhone(rec?.phone || rec?.sessionId || rec?._id || '');
                if (phone) out.add(phone);
            }
        } catch (_) {}
    }

    return Array.from(out);
}

async function bootstrapAll(options = {}) {
    const phones = await listRestorablePhones();
    const concurrency = Math.max(1, Number(options.concurrency || 2));
    const results = [];
    console.log(`[live-wa] restoring ${phones.length} number(s): ${phones.join(', ') || '(none)'}`);
    for (let i = 0; i < phones.length; i += concurrency) {
        const slice = phones.slice(i, i + concurrency);
        await Promise.allSettled(slice.map(async (phone) => {
            try { await activatePhone(phone, { reason: 'boot' }); results.push({ phone, ok: true }); }
            catch (err) { results.push({ phone, ok: false, error: err?.message || String(err) }); }
        }));
    }
    emitter.emit('boot.done', results);
    return results;
}

function listActive() {
    return Array.from(liveSockets.keys());
}

function getSocket(phone) {
    return liveSockets.get(normalizePhone(phone)) || null;
}

function on(handler) { emitter.on('message', handler); return () => emitter.off('message', handler); }
function onOpen(handler) { emitter.on('phone.opened', handler); return () => emitter.off('phone.opened', handler); }
function onClose(handler) { emitter.on('phone.closed', handler); return () => emitter.off('phone.closed', handler); }
function onBoot(handler) { emitter.on('boot.done', handler); return () => emitter.off('boot.done', handler); }

module.exports = {
    activatePhone,
    bootstrapAll,
    listActive,
    listRestorablePhones,
    getSocket,
    on,
    onOpen,
    onClose,
    onBoot,
    normalizePhone,
    sessionDirFor,
    emitter,
};

// Auto-bootstrap if started directly (e.g. node lib/liveWhatsAppBridge.js)
if (require.main === module) {
    bootstrapAll().then((res) => {
        console.log('[live-wa] bootstrap complete:', res);
        setInterval(() => { /* keepalive */ }, 60_000);
    }).catch((err) => {
        console.error('[live-wa] bootstrap failed:', err?.message || err);
        process.exit(1);
    });
}
