require('dotenv').config();
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    Browsers, 
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const express = require('express');
const path = require('path');
const pino = require('pino');
const cors = require('cors');
const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const tBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let sock;
let lastQr = null;

async function startFaresBot(num = null, chatId = null) {
    const sessionPath = './session';
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: true 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) lastQr = await QRCode.toDataURL(qr);
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startFaresBot(), 5000);
        }
        if (connection === 'open' && chatId) {
            tBot.sendMessage(chatId, "✅ تم الربط بنجاح! ميزة مشاهدة الحالات والتفاعل مفعلة.");
        }
    });

    // ميزة الحالات
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;
            if (mek.key.remoteJid === 'status@broadcast') {
                const sender = mek.key.participant || mek.key.remoteJid;
                await sock.readMessages([mek.key]); // مشاهدة تلقائية
                await sock.sendMessage(mek.key.remoteJid, { 
                    react: { text: '👑', key: mek.key } // تفاعل تلقائي
                }, { statusJidList: [sender] });
            }
        } catch (e) {}
    });

    if (num) {
        await new Promise(r => setTimeout(r, 7000));
        return await sock.requestPairingCode(num.replace(/[^0-9]/g, ''));
    }
}

app.post('/api/pairing', async (req, res) => {
    try {
        const code = await startFaresBot(req.body.num);
        res.json({ success: true, code });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/qr', async (req, res) => {
    if (lastQr) {
        const img = Buffer.from(lastQr.split(',')[1], 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else { res.status(404).send('Not Ready'); }
});

tBot.on('message', async (msg) => {
    if (msg.text && /^\d+$/.test(msg.text)) {
        tBot.sendMessage(msg.chat.id, "⏳ جاري الربط...");
        const code = await startFaresBot(msg.text, msg.chat.id);
        if (code) tBot.sendMessage(msg.chat.id, `🔐 كودك هو: ${code}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startFaresBot();
});
