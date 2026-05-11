require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
// يوجه السيرفر لقراءة ملفات الواجهة من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

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
        const { connection, qr } = update;
        if (qr) lastQr = await QRCode.toDataURL(qr);
        if (connection === 'open' && chatId) {
            tBot.sendMessage(chatId, "✅ تم الربط بنجاح!");
        }
    });

    if (num) {
        await new Promise(r => setTimeout(r, 5000));
        return await sock.requestPairingCode(num);
    }
}

app.post('/api/pairing', async (req, res) => {
    try {
        const code = await startBot(req.body.num);
        res.json({ success: true, code });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/qr', async (req, res) => {
    if (lastQr) {
        const img = Buffer.from(lastQr.split(',')[1], 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else { res.status(404).send('QR not ready'); }
});

tBot.on('message', async (msg) => {
    if (msg.text && /^\d+$/.test(msg.text)) {
        tBot.sendMessage(msg.chat.id, "⏳ جاري توليد كود الربط...");
        const code = await startBot(msg.text, msg.chat.id);
        if (code) tBot.sendMessage(msg.chat.id, `🔐 كودك هو: ${code}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});
