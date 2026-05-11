require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const tBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let sock;
let lastQr = null;

async function startBot(num = null, chatId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Safari'),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) lastQr = await QRCode.toDataURL(qr);

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
        
        if (connection === 'open') {
            if (chatId) tBot.sendMessage(chatId, "✅ تم ربط الواتساب بنجاح وهو يعمل الآن!");
        }
    });

    // تفاعل تلقائي مع الحالات
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;
            if (mek.key.remoteJid === 'status@broadcast') {
                await sock.sendMessage(mek.key.remoteJid, { react: { text: '💤', key: mek.key } }, { statusJidList: [mek.key.participant] });
            }
        } catch (e) {}
    });

    if (num) {
        await new Promise(r => setTimeout(r, 5000));
        return await sock.requestPairingCode(num);
    }
}

// --- APIs ---
app.post('/api/pairing', async (req, res) => {
    try {
        const code = await startBot(req.body.num);
        res.json({ success: true, code });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/qr', async (req, res) => {
    if (lastQr) {
        const img = Buffer.from(lastQr.split(',')[1], 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else {
        res.status(404).send('QR not ready');
    }
});

// --- Telegram Commands ---
tBot.onText(/\/start/, (msg) => {
    tBot.sendMessage(msg.chat.id, "👑 مرحباً بك في بوابة الملك فارس\n\nأرسل رقم هاتفك مع رمز الدولة (مثال: 9677xxxxxxxx) وسأرسل لك كود الربط فوراً.");
});

tBot.on('message', async (msg) => {
    if (msg.text && /^\d+$/.test(msg.text) && msg.text.length > 8) {
        tBot.sendMessage(msg.chat.id, "⏳ جاري توليد كود الربط...");
        const code = await startBot(msg.text, msg.chat.id);
        if (code) tBot.sendMessage(msg.chat.id, `🔐 كود الربط الخاص بك هو:\n\n*${code}*`, { parse_mode: 'Markdown' });
    }
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    startBot();
});
