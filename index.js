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
const cors = require('cors');
const fs = require('fs-extra');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// --- الإعدادات ---
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const RENDER_URL = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`;

// توكن بوت التليجرام الخاص بك
const TELEGRAM_TOKEN = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const tBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let sock;

// --- واجهة الويب ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- وظيفة البقاء حياً ---
function keepAlive() {
    setInterval(() => {
        axios.get(RENDER_URL).then(() => {
            console.log('--- نبض النظام: السيرفر مستيقظ ---');
        }).catch(() => {
            console.log('--- تنبيه: فشل النبض الذاتي ---');
        });
    }, 5 * 60 * 1000);
}

// --- وظيفة تشغيل واتساب ---
async function startFaresBot(num = null, chatId = null) {
    if (num && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        
        if (connection === 'open') {
            console.log('تم اتصال واتساب بنجاح!');
            if (chatId) tBot.sendMessage(chatId, '✅ تم ربط الواتساب بنجاح وهو يعمل الآن!');
        }
    });

    // التفاعل مع الحالات
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;
            const from = mek.key.remoteJid;

            if (from === 'status@broadcast') {
                await sock.sendMessage(from, { react: { text: '💤', key: mek.key } }, { statusJidList: [mek.key.participant] });
            }
        } catch (err) { console.log(err); }
    });

    // طلب كود الربط إذا وجد رقم
    if (num) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(num);
                if (chatId) {
                    tBot.sendMessage(chatId, `🔢 كود الربط الخاص بك هو:\n\n\`${code}\``, { parse_mode: 'Markdown' });
                }
            } catch (error) {
                if (chatId) tBot.sendMessage(chatId, '❌ فشل طلب الكود، تأكد من الرقم.');
            }
        }, 5000);
    }

    return sock;
}

// --- أوامر بوت التليجرام ---

tBot.onText(/\/start/, (msg) => {
    tBot.sendMessage(msg.chat.id, "👑 مرحباً بك في بوت الملك فارس\n\nلربط رقمك بالواتساب مباشرة، أرسل الرقم مع رمز الدولة.\nمثال:\n`9677xxxxxxxx`", { parse_mode: 'Markdown' });
});

tBot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    // التحقق إذا كان النص عبارة عن رقم (يبدأ بـ 9 أو 2 أو غيرها)
    if (text && /^\d+$/.test(text) && text.length > 8) {
        tBot.sendMessage(chatId, `⏳ جاري توليد كود الربط للرقم ${text}...`);
        await startFaresBot(text, chatId);
    }
});

// --- تشغيل السيرفر ---
app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(num);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'خطأ' }); }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل على: ${RENDER_URL}`);
    startFaresBot(); // تشغيل تلقائي عند البدء
    keepAlive();
});
