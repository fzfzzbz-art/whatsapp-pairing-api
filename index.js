require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const fs = require('fs-extra');
const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.static('public')); // للتأكد من تحميل ملفات الـ CSS/JS

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
        
        if (qr) {
            lastQr = await QRCode.toDataURL(qr);
        }

        if (connection === 'open') {
            console.log('✅ Connected!');
            if (chatId) tBot.sendMessage(chatId, "✅ تم ربط واتساب بنجاح!");
        }
    });

    // إذا تم طلب كود إقران
    if (num) {
        try {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const code = await sock.requestPairingCode(num);
            return code;
        } catch (err) {
            console.error(err);
            return null;
        }
    }
}

// --- API Endpoints (للتعامل مع app.js) ---

app.post('/api/pairing', async (req, res) => {
    const { num } = req.body;
    if (!num) return res.status(400).json({ success: false, error: 'الرقم مطلوب' });
    
    const code = await startBot(num);
    if (code) {
        res.json({ success: true, code });
    } else {
        res.status(500).json({ success: false, error: 'فشل توليد الكود' });
    }
});

app.get('/api/qr', async (req, res) => {
    if (lastQr) {
        const base64Data = lastQr.replace(/^data:image\/png;base64,/, "");
        const img = Buffer.from(base64Data, 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else {
        res.status(404).send('QR not ready');
    }
});

// --- Telegram Commands ---

tBot.onText(/\/start/, (msg) => {
    tBot.sendMessage(msg.chat.id, "👑 مرحباً بك في Golden Queen\nأرسل رقمك مع رمز الدولة لربط الجهاز.");
});

tBot.on('message', async (msg) => {
    const text = msg.text;
    if (text && /^\d+$/.test(text)) {
        tBot.sendMessage(msg.chat.id, "⏳ جاري طلب كود الإقران...");
        const code = await startBot(text, msg.chat.id);
        if (code) tBot.sendMessage(msg.chat.id, `🔐 كود الإقران الخاص بك هو:\n\n*${code}*`, { parse_mode: 'Markdown' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});
