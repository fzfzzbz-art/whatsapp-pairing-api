const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const { Telegraf, session, Markup } = require('telegraf');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');

// =========================
// الإعدادات الأساسية
// =========================
const APP_PORT = Number(process.env.PORT || 8080);
const DEFAULT_PUBLIC_BASE_URL = `http://localhost:${APP_PORT}`;
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
const DEFAULT_REACTION_EMOJI = '💤';
const STORAGE_ROOT = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const DATA_DIR = path.join(STORAGE_ROOT, 'data');
const SESSIONS_DIR = path.join(STORAGE_ROOT, 'sessions');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DEFAULT_ADMINS = (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
const PUBLIC_BASE_URL = String(
    process.env.PUBLIC_BASE_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.APP_URL ||
        (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '') ||
        DEFAULT_PUBLIC_BASE_URL
).replace(/\/+$/, '');
const TELEGRAM_WEBHOOK_PATH = (() => {
    const hookPath = String(process.env.TELEGRAM_WEBHOOK_PATH || '/telegram/webhook').trim() || '/telegram/webhook';
    return hookPath.startsWith('/') ? hookPath : `/${hookPath}`;
})();
const USE_TELEGRAM_WEBHOOK = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.USE_TELEGRAM_WEBHOOK || (process.env.RENDER_EXTERNAL_HOSTNAME ? 'true' : '')).toLowerCase()
);

if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN is required');
}

const app = express();
app.set('trust proxy', 1);
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());
app.use(express.json());

const waClients = new Map();
const pairingRequests = new Map();
const reconnectTimers = new Map();
const clientActivity = new Map();
const stoppedPairings = new Set();
const PAIRING_TIMEOUT_MS = Number(process.env.PAIRING_TIMEOUT_MS || 180000);
const RECONNECT_DELAY_MS = Number(process.env.RECONNECT_DELAY_MS || 5000);
const HEALTH_CHECK_INTERVAL_MS = Number(process.env.HEALTH_CHECK_INTERVAL_MS || 60000);
const CLIENT_STALE_AFTER_MS = Number(process.env.CLIENT_STALE_AFTER_MS || 180000);
let sessionSupervisorStarted = false;

// =========================
// أدوات الملفات والبيانات
// =========================
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function ensureFile(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
    }
}

function readJSON(filePath, fallback = {}) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.error(`JSON Read Error (${filePath}):`, error);
        return fallback;
    }
}

function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function bootStorage() {
    ensureDir(DATA_DIR);
    ensureDir(SESSIONS_DIR);
    ensureFile(USERS_FILE, { users: {}, phoneOwners: {} });
    ensureFile(SETTINGS_FILE, {
        startMessage:
            'مرحباً بك في نظام Golden Queen المتكامل!\n\n' +
            'يمكنك من هنا ربط واتساب، تغيير إيموجي التفاعل للحالات، عرض أرقامك المربوطة، وحذف أي جلسة خاصة بك.\n\n' +
            'الإيموجي الافتراضي الحالي: {emoji}',
        requiredChannel: '',
        admins: DEFAULT_ADMINS
    });
}

bootStorage();

function getUsersDB() {
    const db = readJSON(USERS_FILE, { users: {}, phoneOwners: {} });
    db.users = db.users || {};
    db.phoneOwners = db.phoneOwners || {};
    return db;
}

function saveUsersDB(db) {
    writeJSON(USERS_FILE, db);
}

function getSettings() {
    const settings = readJSON(SETTINGS_FILE, {
        startMessage: 'مرحباً بك في نظام Golden Queen المتكامل!\nالإيموجي الحالي: {emoji}',
        requiredChannel: '',
        admins: DEFAULT_ADMINS
    });

    settings.startMessage = settings.startMessage || 'مرحباً بك في نظام Golden Queen المتكامل!\nالإيموجي الحالي: {emoji}';
    settings.requiredChannel = settings.requiredChannel || '';
    settings.admins = Array.from(new Set([...(settings.admins || []), ...DEFAULT_ADMINS])).map(String);
    return settings;
}

function saveSettings(settings) {
    settings.admins = Array.from(new Set((settings.admins || []).map(String)));
    writeJSON(SETTINGS_FILE, settings);
}

function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function sanitizeCallbackPhone(phone) {
    return normalizePhone(phone).slice(0, 20);
}

function getUserRecord(userId) {
    const db = getUsersDB();
    const key = String(userId);
    if (!db.users[key]) {
        db.users[key] = {
            telegramId: key,
            firstName: '',
            username: '',
            linkedNumbers: [],
            emojis: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        saveUsersDB(db);
    }
    return db.users[key];
}

function upsertTelegramUser(ctx) {
    if (!ctx?.from) return;
    const db = getUsersDB();
    const key = String(ctx.from.id);
    const current = db.users[key] || {
        telegramId: key,
        linkedNumbers: [],
        emojis: {},
        createdAt: new Date().toISOString()
    };

    current.firstName = ctx.from.first_name || current.firstName || '';
    current.username = ctx.from.username || current.username || '';
    current.linkedNumbers = current.linkedNumbers || [];
    current.emojis = current.emojis || {};
    current.updatedAt = new Date().toISOString();

    db.users[key] = current;
    saveUsersDB(db);
}

function addLinkedNumber(userId, phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;

    const db = getUsersDB();
    const key = String(userId);

    if (!db.users[key]) {
        db.users[key] = {
            telegramId: key,
            firstName: '',
            username: '',
            linkedNumbers: [],
            emojis: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    db.users[key].linkedNumbers = db.users[key].linkedNumbers || [];
    db.users[key].emojis = db.users[key].emojis || {};

    if (!db.users[key].linkedNumbers.includes(normalized)) {
        db.users[key].linkedNumbers.push(normalized);
    }

    if (!db.users[key].emojis[normalized]) {
        db.users[key].emojis[normalized] = DEFAULT_REACTION_EMOJI;
    }

    db.phoneOwners[normalized] = key;
    db.users[key].updatedAt = new Date().toISOString();
    saveUsersDB(db);
    return true;
}

function removeLinkedNumber(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;

    const db = getUsersDB();
    const ownerId = db.phoneOwners[normalized];
    if (!ownerId || !db.users[ownerId]) {
        delete db.phoneOwners[normalized];
        saveUsersDB(db);
        return true;
    }

    db.users[ownerId].linkedNumbers = (db.users[ownerId].linkedNumbers || []).filter((p) => p !== normalized);
    if (db.users[ownerId].emojis) {
        delete db.users[ownerId].emojis[normalized];
    }
    db.users[ownerId].updatedAt = new Date().toISOString();
    delete db.phoneOwners[normalized];
    saveUsersDB(db);
    return true;
}

function userOwnsPhone(userId, phone) {
    const normalized = normalizePhone(phone);
    const db = getUsersDB();
    return db.phoneOwners[normalized] === String(userId);
}

function getUserPhones(userId) {
    const user = getUserRecord(userId);
    return Array.isArray(user.linkedNumbers) ? user.linkedNumbers : [];
}

function getPhoneOwner(phone) {
    const db = getUsersDB();
    return db.phoneOwners[normalizePhone(phone)] || null;
}

function getPhoneEmoji(phone) {
    const ownerId = getPhoneOwner(phone);
    if (!ownerId) return DEFAULT_REACTION_EMOJI;
    const user = getUserRecord(ownerId);
    return user.emojis?.[normalizePhone(phone)] || DEFAULT_REACTION_EMOJI;
}

function setPhoneEmoji(userId, phone, emoji) {
    const normalized = normalizePhone(phone);
    const cleanEmoji = String(emoji || '').trim();
    if (!normalized || !cleanEmoji) return false;

    const db = getUsersDB();
    const key = String(userId);
    if (!db.users[key]) return false;
    if (!db.users[key].linkedNumbers?.includes(normalized)) return false;

    db.users[key].emojis = db.users[key].emojis || {};
    db.users[key].emojis[normalized] = cleanEmoji;
    db.users[key].updatedAt = new Date().toISOString();
    saveUsersDB(db);
    return true;
}

function getAllUserIds() {
    const db = getUsersDB();
    return Object.keys(db.users || {});
}

function getAllLinkedPhones() {
    const db = getUsersDB();
    return Object.keys(db.phoneOwners || {});
}

function isAdmin(userId) {
    const settings = getSettings();
    return (settings.admins || []).map(String).includes(String(userId));
}

function addAdmin(userId) {
    const settings = getSettings();
    settings.admins = Array.from(new Set([...(settings.admins || []), String(userId)]));
    saveSettings(settings);
}

function removeAdmin(userId) {
    const settings = getSettings();
    settings.admins = (settings.admins || []).map(String).filter((id) => id !== String(userId));
    saveSettings(settings);
}

function formatNumbersForUser(userId) {
    const user = getUserRecord(userId);
    const phones = user.linkedNumbers || [];

    if (!phones.length) {
        return 'لا يوجد لديك أي رقم مربوط حالياً.';
    }

    return phones
        .map((phone, index) => `${index + 1}) ${phone} | إيموجي التفاعل: ${user.emojis?.[phone] || DEFAULT_REACTION_EMOJI}`)
        .join('\n');
}

function buildStartMessage(ctx) {
    const settings = getSettings();
    const user = getUserRecord(ctx.from.id);
    const phones = user.linkedNumbers || [];
    const primaryEmoji = phones.length ? user.emojis?.[phones[0]] || DEFAULT_REACTION_EMOJI : DEFAULT_REACTION_EMOJI;
    const numbersList = phones.length
        ? phones.map((phone, index) => `${index + 1}) ${phone} | ${user.emojis?.[phone] || DEFAULT_REACTION_EMOJI}`).join('\n')
        : 'لا يوجد';

    const baseMessage = String(settings.startMessage || '')
        .replaceAll('{name}', ctx.from.first_name || 'صديقي')
        .replaceAll('{username}', ctx.from.username ? `@${ctx.from.username}` : 'بدون معرف')
        .replaceAll('{count}', String(phones.length))
        .replaceAll('{emoji}', primaryEmoji)
        .replaceAll('{numbers}', numbersList);

    const summary = phones.length
        ? `\n\n📱 أرقامك المربوطة:\n${numbersList}`
        : '\n\n📱 لا يوجد لديك أرقام مربوطة حالياً.';

    return `${baseMessage}${summary}`.trim();
}

function getStartKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('ربط واتساب 📱', 'pair_wa'),
            Markup.button.callback('أرقامي المربوطة 📋', 'my_numbers')
        ],
        [
            Markup.button.callback('تغيير الإيموجي 😍', 'change_emoji'),
            Markup.button.callback('حذف جلسة 🗑️', 'delete_session')
        ],
        [Markup.button.callback('تحديث الاشتراك ✅', 'check_sub')]
    ]);
}

function textFromMessage(msg) {
    return (
        msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        msg?.message?.imageMessage?.caption ||
        msg?.message?.videoMessage?.caption ||
        msg?.message?.documentMessage?.caption ||
        msg?.message?.buttonsResponseMessage?.selectedDisplayText ||
        msg?.message?.listResponseMessage?.title ||
        ''
    );
}

function getSessionPath(phone) {
    return path.join(SESSIONS_DIR, normalizePhone(phone));
}

function getTelegramBotLink() {
    return bot.botInfo?.username ? `https://t.me/${bot.botInfo.username}` : '';
}

function getTelegramWebhookUrl() {
    return `${PUBLIC_BASE_URL}${TELEGRAM_WEBHOOK_PATH}`;
}

async function ensureSubscription(ctx) {
    const settings = getSettings();
    const channel = settings.requiredChannel;

    if (!channel || !ctx?.from?.id) {
        return true;
    }

    try {
        const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
        const validStatuses = ['creator', 'administrator', 'member'];
        if (validStatuses.includes(member.status)) {
            return true;
        }
    } catch (error) {
        console.error('Subscription Check Error:', error.message);
        return true;
    }

    const buttons = [];
    if (String(channel).startsWith('@')) {
        buttons.push([Markup.button.url('الاشتراك في القناة 📢', `https://t.me/${String(channel).replace('@', '')}`)]);
    }
    buttons.push([Markup.button.callback('تحقق من الاشتراك ✅', 'check_sub')]);

    await ctx.reply('⚠️ يجب عليك الاشتراك أولاً في القناة المطلوبة لاستخدام البوت.', {
        reply_markup: { inline_keyboard: buttons }
    });
    return false;
}

function isEmojiInput(value) {
    if (!value) return false;
    const text = String(value).trim();
    if (!text || text.length > 12) return false;
    return /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|[\p{Extended_Pictographic}])+$/u.test(text);
}

async function safeReply(ctx, text, extra = {}) {
    try {
        return await ctx.reply(text, extra);
    } catch (error) {
        console.error('Telegram Reply Error:', error.message);
    }
}

async function notifyTelegramUser(userId, text, extra = {}) {
    if (!userId) return;
    try {
        await bot.telegram.sendMessage(String(userId), text, extra);
    } catch (error) {
        console.error(`Telegram Notify Error (${userId}):`, error.message);
    }
}

async function notifyPhoneOwner(phone, text, extra = {}) {
    const ownerId = getPhoneOwner(phone);
    if (!ownerId) return;
    await notifyTelegramUser(ownerId, text, extra);
}

function touchClient(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    clientActivity.set(normalized, Date.now());
}

function clearReconnectTimer(phone) {
    const normalized = normalizePhone(phone);
    const timer = reconnectTimers.get(normalized);
    if (timer) {
        clearTimeout(timer);
        reconnectTimers.delete(normalized);
    }
}

function clearPairingRequest(phone) {
    const normalized = normalizePhone(phone);
    const pending = pairingRequests.get(normalized);
    if (pending?.timer) {
        clearTimeout(pending.timer);
    }
    pairingRequests.delete(normalized);
}

function scheduleReconnect(phone, ownerId = null, delay = RECONNECT_DELAY_MS) {
    const normalized = normalizePhone(phone);
    if (!normalized || reconnectTimers.has(normalized)) return;

    const timer = setTimeout(async () => {
        reconnectTimers.delete(normalized);
        try {
            await startWhatsApp(normalized, null, ownerId || getPhoneOwner(normalized));
        } catch (error) {
            console.error(`Reconnect Error (${normalized}):`, error.message);
            scheduleReconnect(normalized, ownerId || getPhoneOwner(normalized), RECONNECT_DELAY_MS);
        }
    }, delay);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    reconnectTimers.set(normalized, timer);
}

function schedulePairingTimeout(phone, telegramUserId, sessionPath, sock) {
    const normalized = normalizePhone(phone);
    clearPairingRequest(normalized);
    stoppedPairings.delete(normalized);

    const timer = setTimeout(async () => {
        const pending = pairingRequests.get(normalized);
        if (!pending || pending.completed) return;

        pending.timedOut = true;
        pairingRequests.set(normalized, pending);
        stoppedPairings.add(normalized);
        clearReconnectTimer(normalized);
        waClients.delete(normalized);
        clientActivity.delete(normalized);

        try {
            sock.ws?.close?.();
        } catch (_) {}

        try {
            sock.end?.();
        } catch (_) {}

        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        } catch (_) {}

        await notifyTelegramUser(
            telegramUserId,
            `⏱️ تم توقيف كود ربط الرقم ${normalized} بسبب تأخير إكمال الربط. أعد المحاولة مرة أخرى عندما تكون جاهزاً.`
        );

        clearPairingRequest(normalized);
    }, PAIRING_TIMEOUT_MS);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    pairingRequests.set(normalized, {
        telegramUserId: telegramUserId ? String(telegramUserId) : null,
        timer,
        timedOut: false,
        completed: false
    });
}

function startSessionSupervisor() {
    if (sessionSupervisorStarted) return;
    sessionSupervisorStarted = true;

    const interval = setInterval(() => {
        const phones = getAllLinkedPhones();

        for (const phone of phones) {
            const normalized = normalizePhone(phone);
            const sock = waClients.get(normalized);
            const pending = pairingRequests.get(normalized);

            if (pending?.timedOut) continue;

            if (!sock) {
                scheduleReconnect(normalized, getPhoneOwner(normalized), 3000);
                continue;
            }

            const lastSeen = clientActivity.get(normalized) || 0;
            if (lastSeen && Date.now() - lastSeen > CLIENT_STALE_AFTER_MS) {
                console.log(`Session Health Check Restart: ${normalized}`);
                try {
                    sock.ws?.close?.();
                } catch (_) {}
                try {
                    sock.end?.();
                } catch (_) {}
                waClients.delete(normalized);
                clearReconnectTimer(normalized);
                scheduleReconnect(normalized, getPhoneOwner(normalized), 3000);
            }
        }
    }, HEALTH_CHECK_INTERVAL_MS);

    if (typeof interval.unref === 'function') {
        interval.unref();
    }
}

// =========================
// واتساب
// =========================
async function cleanupSession(phone) {
    const normalized = normalizePhone(phone);
    const sock = waClients.get(normalized);

    clearReconnectTimer(normalized);
    clearPairingRequest(normalized);
    clientActivity.delete(normalized);
    stoppedPairings.delete(normalized);

    if (sock) {
        try {
            await sock.logout();
        } catch (_) {}
        try {
            sock.end?.();
        } catch (_) {}
        waClients.delete(normalized);
    }

    try {
        fs.rmSync(getSessionPath(normalized), { recursive: true, force: true });
    } catch (error) {
        console.error(`Delete Session Error (${normalized}):`, error.message);
    }

    removeLinkedNumber(normalized);
}

async function handleStatusReaction(sock, phoneNumber, msg) {
    try {
        const participant = msg.key?.participant || msg.participant;
        const emoji = getPhoneEmoji(phoneNumber);

        await sock.readMessages([msg.key]);

        if (participant) {
            await sock.sendMessage(
                'status@broadcast',
                {
                    react: {
                        text: emoji,
                        key: msg.key
                    }
                },
                {
                    statusJidList: [participant]
                }
            );
        }
    } catch (error) {
        console.error(`Status Reaction Error (${phoneNumber}):`, error.message);
    }
}

async function handleIncomingMessage(sock, phoneNumber, msg) {
    try {
        if (!msg?.message || msg.key?.fromMe) return;
        const from = msg.key?.remoteJid;
        if (!from) return;

        if (from === 'status@broadcast') {
            await handleStatusReaction(sock, phoneNumber, msg);
            return;
        }

        if (from.endsWith('@g.us')) return;

        const text = textFromMessage(msg);
        if (!text) return;

        await sock.sendMessage(
            from,
            {
                text: `مرحباً! أنا بوت Golden Queen.\nرابط بوت التليجرام: ${getTelegramBotLink()}`
            },
            { quoted: msg }
        );
    } catch (error) {
        console.error(`Incoming Message Error (${phoneNumber}):`, error.message);
    }
}

async function startWhatsApp(phoneNumber, telegramCtx = null, ownerId = null) {
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) return null;

    clearReconnectTimer(normalizedPhone);
    stoppedPairings.delete(normalizedPhone);

    const existing = waClients.get(normalizedPhone);
    if (existing) {
        touchClient(normalizedPhone);
        return existing;
    }

    const sessionPath = getSessionPath(normalizedPhone);
    ensureDir(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    const requestedOwnerId = String(ownerId || telegramCtx?.from?.id || getPhoneOwner(normalizedPhone) || '');

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false
    });

    waClients.set(normalizedPhone, sock);
    touchClient(normalizedPhone);

    if (!state.creds.registered) {
        try {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            const code = await sock.requestPairingCode(normalizedPhone);
            schedulePairingTimeout(normalizedPhone, requestedOwnerId, sessionPath, sock);

            if (telegramCtx) {
                await safeReply(
                    telegramCtx,
                    `✅ كود الربط لرقم ${normalizedPhone}:\n\n\`${code}\`\n\n🔐 افتح واتساب > الأجهزة المرتبطة > ربط جهاز > ثم أدخل الكود.\n⏳ إذا تأخر إكمال الربط كثيراً سيتم إيقاف الكود تلقائياً وإشعارك برسالة.`
                );
            }
        } catch (error) {
            console.error(`Pairing Error (${normalizedPhone}):`, error);
            clearPairingRequest(normalizedPhone);
            waClients.delete(normalizedPhone);
            clientActivity.delete(normalizedPhone);
            if (telegramCtx) {
                await safeReply(telegramCtx, '❌ فشل في طلب كود الربط. تأكد من الرقم ثم حاول مرة أخرى بعد دقيقة.');
            }
            return null;
        }
    }

    sock.ev.on('creds.update', async () => {
        touchClient(normalizedPhone);
        await saveCreds();
    });

    sock.ev.on('messages.upsert', async (payload) => {
        try {
            touchClient(normalizedPhone);
            const messages = payload?.messages || [];
            for (const msg of messages) {
                await handleIncomingMessage(sock, normalizedPhone, msg);
            }
        } catch (error) {
            console.error(`messages.upsert Error (${normalizedPhone}):`, error.message);
        }
    });

    sock.ev.on('connection.update', async (update) => {
        touchClient(normalizedPhone);
        const { connection, lastDisconnect } = update;
        const pendingPair = pairingRequests.get(normalizedPhone);

        if (connection === 'open') {
            console.log(`WhatsApp Connected Successfully! ✅ ${normalizedPhone}`);
            clearReconnectTimer(normalizedPhone);

            const finalOwnerId = requestedOwnerId || getPhoneOwner(normalizedPhone);
            if (finalOwnerId) {
                addLinkedNumber(finalOwnerId, normalizedPhone);
            }

            if (pendingPair) {
                pendingPair.completed = true;
                pairingRequests.set(normalizedPhone, pendingPair);
                stoppedPairings.delete(normalizedPhone);
                await notifyTelegramUser(
                    finalOwnerId,
                    `✅ تم ربط الرقم ${normalizedPhone} بنجاح وهو الآن يعمل بإعادة اتصال ومراقبة تلقائية.\nإيموجي التفاعل الحالي: ${getPhoneEmoji(normalizedPhone)}`
                );
                clearPairingRequest(normalizedPhone);
            }
        }

        if (connection === 'close') {
            waClients.delete(normalizedPhone);
            clientActivity.delete(normalizedPhone);

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`Session Logged Out: ${normalizedPhone}`);
                const existingOwnerId = requestedOwnerId || getPhoneOwner(normalizedPhone);
                clearReconnectTimer(normalizedPhone);
                clearPairingRequest(normalizedPhone);
                stoppedPairings.delete(normalizedPhone);
                removeLinkedNumber(normalizedPhone);
                try {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                } catch (_) {}
                await notifyTelegramUser(existingOwnerId, `⚠️ تم تسجيل خروج الرقم ${normalizedPhone} من واتساب، وتم حذف الجلسة من البوت.`);
                return;
            }

            if (pendingPair?.timedOut || stoppedPairings.has(normalizedPhone)) {
                clearReconnectTimer(normalizedPhone);
                return;
            }

            if (shouldReconnect) {
                console.log(`Reconnecting WhatsApp Session: ${normalizedPhone}`);
                scheduleReconnect(normalizedPhone, requestedOwnerId || getPhoneOwner(normalizedPhone));
            }
        }
    });

    return sock;
}

async function startAllSavedSessions() {
    const phones = getAllLinkedPhones();
    for (const phone of phones) {
        try {
            await startWhatsApp(phone, null, getPhoneOwner(phone));
        } catch (error) {
            console.error(`Boot Session Error (${phone}):`, error.message);
        }
    }
}

// =========================
// تيليجرام - الواجهات العامة
// =========================
async function sendStartMessage(ctx) {
    upsertTelegramUser(ctx);
    return safeReply(ctx, buildStartMessage(ctx), getStartKeyboard());
}

bot.start(async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    await sendStartMessage(ctx);
});

bot.command('mywa', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    await safeReply(ctx, `📋 أرقامك المربوطة:\n${formatNumbersForUser(ctx.from.id)}`);
});

bot.command('unlink', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك جلسات لحذفها.');
    }

    const rows = phones.map((phone) => [Markup.button.callback(`حذف ${phone}`, `delete_${sanitizeCallbackPhone(phone)}`)]);
    await safeReply(ctx, '🗑️ اختر الرقم الذي تريد حذف جلسته:', { reply_markup: { inline_keyboard: rows } });
});

bot.command('setemoji', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط أولاً.');
    }

    if (phones.length === 1) {
        ctx.session = { step: 'wait_emoji', targetPhone: phones[0] };
        return safeReply(ctx, `😍 أرسل الآن الإيموجي الجديد للرقم ${phones[0]}`);
    }

    const rows = phones.map((phone) => [Markup.button.callback(`${phone} | ${getPhoneEmoji(phone)}`, `emoji_pick_${sanitizeCallbackPhone(phone)}`)]);
    await safeReply(ctx, '😍 اختر الرقم الذي تريد تغيير إيموجيه:', { reply_markup: { inline_keyboard: rows } });
});

bot.on('callback_query', async (ctx) => {
    upsertTelegramUser(ctx);
    const data = ctx.callbackQuery?.data || '';

    if (data !== 'check_sub' && !(await ensureSubscription(ctx))) {
        return ctx.answerCbQuery('اشترك أولاً في القناة المطلوبة', { show_alert: true });
    }

    try {
        await ctx.answerCbQuery();
    } catch (_) {}

    if (data === 'check_sub') {
        if (!(await ensureSubscription(ctx))) return;
        return sendStartMessage(ctx);
    }

    if (data === 'pair_wa') {
        ctx.session = { step: 'wait_phone' };
        return safeReply(ctx, '📱 أرسل رقم الواتساب مع مفتاح الدولة، مثال: 967771163825');
    }

    if (data === 'my_numbers') {
        return safeReply(ctx, `📋 أرقامك المربوطة:\n${formatNumbersForUser(ctx.from.id)}`);
    }

    if (data === 'change_emoji') {
        const phones = getUserPhones(ctx.from.id);
        if (!phones.length) {
            return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لتغيير الإيموجي.');
        }

        if (phones.length === 1) {
            ctx.session = { step: 'wait_emoji', targetPhone: phones[0] };
            return safeReply(ctx, `😍 أرسل الآن الإيموجي الجديد للرقم ${phones[0]}`);
        }

        const rows = phones.map((phone) => [Markup.button.callback(`${phone} | ${getPhoneEmoji(phone)}`, `emoji_pick_${sanitizeCallbackPhone(phone)}`)]);
        return safeReply(ctx, '😍 اختر الرقم الذي تريد تغيير إيموجيه:', { reply_markup: { inline_keyboard: rows } });
    }

    if (data.startsWith('emoji_pick_')) {
        const phone = normalizePhone(data.replace('emoji_pick_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        ctx.session = { step: 'wait_emoji', targetPhone: phone };
        return safeReply(ctx, `😍 أرسل الإيموجي الجديد للرقم ${phone}`);
    }

    if (data === 'delete_session') {
        const phones = getUserPhones(ctx.from.id);
        if (!phones.length) {
            return safeReply(ctx, '❌ لا يوجد لديك جلسات لحذفها.');
        }
        const rows = phones.map((phone) => [Markup.button.callback(`حذف ${phone}`, `delete_${sanitizeCallbackPhone(phone)}`)]);
        return safeReply(ctx, '🗑️ اختر الرقم الذي تريد حذف جلسته:', { reply_markup: { inline_keyboard: rows } });
    }

    if (data.startsWith('delete_')) {
        const phone = normalizePhone(data.replace('delete_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        await cleanupSession(phone);
        return safeReply(ctx, `✅ تم حذف جلسة الرقم ${phone} نهائياً.`);
    }

    if (data === 'admin_stats' && isAdmin(ctx.from.id)) {
        const usersCount = getAllUserIds().length;
        const phonesCount = getAllLinkedPhones().length;
        const adminsCount = getSettings().admins.length;
        return safeReply(
            ctx,
            `📊 إحصائيات البوت:\n\n👤 المستخدمون: ${usersCount}\n📱 الأرقام المربوطة: ${phonesCount}\n🛡️ عدد المدراء: ${adminsCount}`
        );
    }

    if (data === 'admin_setstart' && isAdmin(ctx.from.id)) {
        ctx.session = { step: 'wait_new_start_message' };
        return safeReply(ctx, '✏️ أرسل الآن رسالة /start الجديدة.\nيمكنك استخدام المتغيرات: {name} {username} {count} {emoji} {numbers}');
    }

    if (data === 'admin_setchannel' && isAdmin(ctx.from.id)) {
        ctx.session = { step: 'wait_force_channel' };
        return safeReply(ctx, '📢 أرسل يوزر القناة مثل @channel_username أو أرسل off لإلغاء الاشتراك الإجباري.');
    }

    if (data === 'admin_broadcast' && isAdmin(ctx.from.id)) {
        ctx.session = { step: 'wait_broadcast_message' };
        return safeReply(ctx, '📣 أرسل الآن الرسالة التي تريد إرسالها لجميع المستخدمين.');
    }
});

// =========================
// تيليجرام - أوامر المطور
// =========================
bot.command('admin', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    await safeReply(
        ctx,
        '🛠️ لوحة المطور:\n\n' +
            '/admin - فتح لوحة المطور\n' +
            '/stats - إحصائيات البوت\n' +
            '/setstart - تغيير رسالة /start\n' +
            '/setchannel - تفعيل أو إلغاء الاشتراك الإجباري\n' +
            '/broadcast - إرسال رسالة جماعية لكل المستخدمين\n' +
            '/admins - عرض الأدمنية\n' +
            '/addadmin 123456789 - إضافة أدمن\n' +
            '/deladmin 123456789 - حذف أدمن\n\n' +
            'متغيرات رسالة /start المدعومة: {name} {username} {count} {emoji} {numbers}',
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        Markup.button.callback('إحصائيات 📊', 'admin_stats'),
                        Markup.button.callback('تغيير /start ✏️', 'admin_setstart')
                    ],
                    [
                        Markup.button.callback('اشتراك إجباري 📢', 'admin_setchannel'),
                        Markup.button.callback('إذاعة عامة 📣', 'admin_broadcast')
                    ]
                ]
            }
        }
    );
});

bot.command('stats', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const usersCount = getAllUserIds().length;
    const phonesCount = getAllLinkedPhones().length;
    const adminsCount = getSettings().admins.length;

    await safeReply(
        ctx,
        `📊 إحصائيات البوت:\n\n👤 المستخدمون: ${usersCount}\n📱 الأرقام المربوطة: ${phonesCount}\n🛡️ عدد المدراء: ${adminsCount}`
    );
});

bot.command('admins', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const admins = getSettings().admins || [];
    await safeReply(ctx, `🛡️ قائمة الأدمنية:\n${admins.length ? admins.map((id, i) => `${i + 1}) ${id}`).join('\n') : 'لا يوجد'}`);
});

bot.command('addadmin', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const newAdminId = parts[1];
    if (!newAdminId || !/^\d+$/.test(newAdminId)) {
        return safeReply(ctx, '❌ الاستخدام الصحيح: /addadmin 123456789');
    }

    addAdmin(newAdminId);
    await safeReply(ctx, `✅ تم إضافة الأدمن ${newAdminId}`);
});

bot.command('deladmin', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const adminId = parts[1];
    if (!adminId || !/^\d+$/.test(adminId)) {
        return safeReply(ctx, '❌ الاستخدام الصحيح: /deladmin 123456789');
    }

    if (String(adminId) === String(ctx.from.id)) {
        return safeReply(ctx, '❌ لا يمكنك حذف نفسك من الأدمنية بهذا الأمر.');
    }

    removeAdmin(adminId);
    await safeReply(ctx, `✅ تم حذف الأدمن ${adminId}`);
});

bot.command('setstart', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const nextText = ctx.message.text.replace('/setstart', '').trim();
    if (!nextText) {
        ctx.session = { step: 'wait_new_start_message' };
        return safeReply(ctx, '✏️ أرسل الآن رسالة /start الجديدة.\nيمكنك استخدام المتغيرات: {name} {username} {count} {emoji} {numbers}');
    }

    const settings = getSettings();
    settings.startMessage = nextText;
    saveSettings(settings);
    await safeReply(ctx, '✅ تم تحديث رسالة /start بنجاح.');
});

bot.command('setchannel', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const value = ctx.message.text.replace('/setchannel', '').trim();
    if (!value) {
        ctx.session = { step: 'wait_force_channel' };
        return safeReply(ctx, '📢 أرسل يوزر القناة مثل @channel_username أو أرسل off لإلغاء الاشتراك الإجباري.');
    }

    const settings = getSettings();
    settings.requiredChannel = value.toLowerCase() === 'off' ? '' : value;
    saveSettings(settings);

    await safeReply(
        ctx,
        settings.requiredChannel
            ? `✅ تم تفعيل الاشتراك الإجباري على: ${settings.requiredChannel}`
            : '✅ تم إلغاء الاشتراك الإجباري.'
    );
});

bot.command('broadcast', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const text = ctx.message.text.replace('/broadcast', '').trim();
    if (!text) {
        ctx.session = { step: 'wait_broadcast_message' };
        return safeReply(ctx, '📣 أرسل الآن الرسالة التي تريد إرسالها لجميع المستخدمين.');
    }

    let success = 0;
    let failed = 0;
    const userIds = getAllUserIds();

    for (const userId of userIds) {
        try {
            await bot.telegram.sendMessage(userId, text);
            success += 1;
        } catch (error) {
            failed += 1;
            console.error(`Broadcast Error (${userId}):`, error.message);
        }
    }

    await safeReply(ctx, `✅ تمت الإذاعة الجماعية.\n\nنجح: ${success}\nفشل: ${failed}`);
});

// =========================
// تيليجرام - النصوص والحالات
// =========================
bot.on('text', async (ctx) => {
    upsertTelegramUser(ctx);

    const incomingText = String(ctx.message.text || '').trim();
    const sessionState = ctx.session?.step;

    if (!sessionState && incomingText.startsWith('/')) return;

    if (sessionState !== 'wait_new_start_message' && sessionState !== 'wait_force_channel' && sessionState !== 'wait_broadcast_message') {
        if (!(await ensureSubscription(ctx))) return;
    }

    if (sessionState === 'wait_phone') {
        const phone = normalizePhone(incomingText);
        if (!phone) {
            return safeReply(ctx, '❌ أرسل أرقام فقط مع مفتاح الدولة.');
        }

        const owner = getPhoneOwner(phone);
        if (owner && owner !== String(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الرقم مربوط بالفعل على مستخدم آخر.');
        }

        if (userOwnsPhone(ctx.from.id, phone) && waClients.has(phone)) {
            ctx.session = null;
            return safeReply(ctx, '✅ هذا الرقم مربوط لديك بالفعل ومفعل حالياً.');
        }

        await safeReply(ctx, '⏳ جاري إنشاء الجلسة وطلب كود الربط، انتظر قليلاً...');
        ctx.session = null;
        await startWhatsApp(phone, ctx, ctx.from.id);
        return;
    }

    if (sessionState === 'wait_emoji') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }

        if (!isEmojiInput(incomingText)) {
            return safeReply(ctx, '❌ أرسل إيموجي صحيح فقط مثل: 😍 أو ❤️ أو 🔥');
        }

        setPhoneEmoji(ctx.from.id, phone, incomingText);
        ctx.session = null;
        return safeReply(ctx, `✅ تم تغيير إيموجي التفاعل للرقم ${phone} إلى ${incomingText}`);
    }

    if (sessionState === 'wait_new_start_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }

        const settings = getSettings();
        settings.startMessage = incomingText;
        saveSettings(settings);
        ctx.session = null;
        return safeReply(ctx, '✅ تم تحديث رسالة /start بنجاح.');
    }

    if (sessionState === 'wait_force_channel') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }

        const settings = getSettings();
        settings.requiredChannel = incomingText.toLowerCase() === 'off' ? '' : incomingText;
        saveSettings(settings);
        ctx.session = null;

        return safeReply(
            ctx,
            settings.requiredChannel
                ? `✅ تم تفعيل الاشتراك الإجباري على: ${settings.requiredChannel}`
                : '✅ تم إلغاء الاشتراك الإجباري.'
        );
    }

    if (sessionState === 'wait_broadcast_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }

        let success = 0;
        let failed = 0;
        const userIds = getAllUserIds();

        for (const userId of userIds) {
            try {
                await bot.telegram.sendMessage(userId, incomingText);
                success += 1;
            } catch (error) {
                failed += 1;
                console.error(`Broadcast Error (${userId}):`, error.message);
            }
        }

        ctx.session = null;
        return safeReply(ctx, `✅ تمت الإذاعة الجماعية.\n\nنجح: ${success}\nفشل: ${failed}`);
    }
});

// =========================
// الموقع و Health Check
// =========================
if (USE_TELEGRAM_WEBHOOK) {
    app.use(bot.webhookCallback(TELEGRAM_WEBHOOK_PATH));
}

app.get('/', (req, res) => {
    const settings = getSettings();
    const telegramBotLink = getTelegramBotLink();
    res.send(`
        <body style="background:#121212;color:white;text-align:center;padding:50px 16px;font-family:sans-serif;direction:rtl;">
            <h1 style="color:#f39c12;">Golden Queen System</h1>
            <p style="color:#2ecc71;">الحالة: متصل ونشط ✅</p>
            <p>عدد الجلسات المحفوظة: ${getAllLinkedPhones().length}</p>
            <p>عدد المستخدمين: ${getAllUserIds().length}</p>
            <p>الاشتراك الإجباري: ${settings.requiredChannel || 'غير مفعل'}</p>
            <p>وضع التليجرام: ${USE_TELEGRAM_WEBHOOK ? 'Webhook' : 'Polling'}</p>
            <p>رابط الخدمة: <a href="${PUBLIC_BASE_URL}" style="color:#4da3ff;">${PUBLIC_BASE_URL}</a></p>
            <p>فحص الصحة: <a href="${PUBLIC_BASE_URL}/health" style="color:#4da3ff;">/health</a></p>
            ${telegramBotLink ? `<p>رابط البوت: <a href="${telegramBotLink}" style="color:#4da3ff;">${telegramBotLink}</a></p>` : ''}
        </body>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        sessions: getAllLinkedPhones().length,
        users: getAllUserIds().length,
        uptime: process.uptime(),
        mode: USE_TELEGRAM_WEBHOOK ? 'webhook' : 'polling',
        baseUrl: PUBLIC_BASE_URL,
        webhookPath: USE_TELEGRAM_WEBHOOK ? TELEGRAM_WEBHOOK_PATH : null
    });
});

async function initTelegramTransport() {
    bot.botInfo = await bot.telegram.getMe();

    if (USE_TELEGRAM_WEBHOOK) {
        await bot.telegram.setWebhook(getTelegramWebhookUrl());
        console.log(`Telegram webhook connected: ${getTelegramWebhookUrl()}`);
        return;
    }

    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    } catch (error) {
        console.error('Webhook Delete Warning:', error.message);
    }

    await bot.launch({ dropPendingUpdates: false });
    console.log('Telegram polling started successfully');
}

const server = app.listen(APP_PORT, async () => {
    console.log(`Server running on port ${APP_PORT}`);
    try {
        await initTelegramTransport();
        startSessionSupervisor();
        await startAllSavedSessions();
        console.log(`Service linked successfully to ${PUBLIC_BASE_URL}`);
        console.log(`Storage root: ${STORAGE_ROOT}`);
    } catch (error) {
        console.error('Startup Error:', error);
        process.exit(1);
    }
});

let shuttingDown = false;

async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully...`);

    for (const timer of reconnectTimers.values()) {
        clearTimeout(timer);
    }
    reconnectTimers.clear();

    for (const pending of pairingRequests.values()) {
        if (pending?.timer) {
            clearTimeout(pending.timer);
        }
    }
    pairingRequests.clear();

    try {
        if (!USE_TELEGRAM_WEBHOOK) {
            bot.stop(signal);
        }
    } catch (error) {
        console.error('Telegram Stop Warning:', error.message);
    }

    try {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) return reject(error);
                resolve();
            });
        });
    } catch (error) {
        console.error('Server Close Warning:', error.message);
    }

    process.exit(0);
}

process.once('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

process.once('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});
