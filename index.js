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

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';
const RENDER_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`; // جلب رابط موقعك تلقائياً

let sock;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// وظيفة البقاء حياً: تمنع السيرفر من النوم
function keepAlive() {
    setInterval(() => {
        axios.get(RENDER_URL).then(() => {
            console.log('--- نبض النظام: السيرفر مستيقظ ---');
        }).catch(() => {
            console.log('--- تنبيه: فشل النبض الذاتي ---');
        });
    }, 5 * 60 * 1000); // كل 5 دقائق
}

async function startFaresBot(clearSession = false) {
    if (clearSession && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'), // المتصفح الذي نجح في الربط سابقاً
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('جاري إعادة الاتصال التلقائي...');
                startFaresBot();
            }
        }
        console.log('حالة الاتصال:', connection);
    });

    // التفاعل مع الحالات والأوامر
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;

            const from = mek.key.remoteJid;

            // التفاعل التلقائي مع الحالات بالإيموجي 💤
            if (from === 'status@broadcast') {
                const participant = mek.key.participant;
                await sock.sendMessage(from, {
                    react: { text: '💤', key: mek.key }
                }, { statusJidList: [participant] });
            }

            // أمر الفحص
            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            if (body.toLowerCase() === 'فحص') {
                await sock.sendMessage(from, { text: '✅ النظام يعمل 24/7 والتفاعل مفعل.' }, { quoted: mek });
            }
        } catch (err) {
            console.log('خطأ في المعالجة:', err);
        }
    });

    return sock;
}

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        await new Promise(r => setTimeout(r, 5000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في توليد الكود' });
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ: ${PORT}`);
    startFaresBot();
    keepAlive(); // تشغيل ميزة البقاء مستيقظاً
});
