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
    // التأكد من وجود مجلد الجلسة
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
        browser: Browsers.macOS('Safari'),
        printQRInTerminal: false,
        syncFullHistory: false
    });

    // حفظ التغييرات فوراً لحل مشكلة "جاري تسجيل الدخول"
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) lastQr = await QRCode.toDataURL(qr);

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('تم إغلاق الاتصال، جاري إعادة المحاولة:', shouldReconnect);
            if (shouldReconnect) startFaresBot();
        }
        
        if (connection === 'open') {
            console.log('✅ تم فتح الاتصال بنجاح!');
            if (chatId) tBot.sendMessage(chatId, "✅ تم ربط الواتساب بنجاح وهو يعمل الآن!");
        }
    });

    // تفاعل الحالات
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
        try {
            await new Promise(r => setTimeout(r, 6000)); // وقت إضافي لتهيئة السيرفر
            const code = await sock.requestPairingCode(num.replace(/[^0-9]/g, ''));
            return code;
        } catch (error) {
            console.error('خطأ في طلب الكود:', error);
            return null;
        }
    }
}

// APIs
app.post('/api/pairing', async (req, res) => {
    try {
        const code = await startFaresBot(req.body.num);
        if (code) res.json({ success: true, code });
        else res.status(500).json({ success: false, error: 'فشل توليد الكود' });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/qr', async (req, res) => {
    if (lastQr) {
        const img = Buffer.from(lastQr.split(',')[1], 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else { res.status(404).send('QR not ready'); }
});

// Telegram
tBot.on('message', async (msg) => {
    const text = msg.text;
    if (text && /^\d+$/.test(text) && text.length > 8) {
        tBot.sendMessage(msg.chat.id, "⏳ جاري توليد كود الربط...");
        const code = await startFaresBot(text, msg.chat.id);
        if (code) tBot.sendMessage(msg.chat.id, `🔐 كود الربط الخاص بك هو: \n\n ${code}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startFaresBot();
});
