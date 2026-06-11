const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { sendRobustStatusReaction } = require('./statusHelper');

function normalizeJid(jid = '') {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

async function startSession(phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phoneNumber}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSession(phoneNumber);
        } else if (connection === 'open') {
            console.log(`✅ الرقم [${phoneNumber}] متصل الآن.`);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m?.messages?.[0];
        if (!msg?.message) return;
        if (normalizeJid(msg?.key?.remoteJid) !== 'status@broadcast') return;
        if (msg?.key?.fromMe) return;

        const participant = normalizeJid(msg?.key?.participant || msg?.participant || '');
        if (!participant) return;

        try {
            await delay(2500);
            const result = await sendRobustStatusReaction({
                sock,
                msg,
                emoji: '❤️',
                candidates: [participant],
                delayFn: delay
            });

            if (!result?.ok) {
                console.error(`فشل التفاعل مع حالة ${participant}:`, result?.error?.message || result?.error || 'unknown_error');
            }
        } catch (err) {
            console.error(`خطأ في تفاعل الرقم ${phoneNumber}:`, err?.message || err);
        }
    });
}

module.exports = { startSession };
