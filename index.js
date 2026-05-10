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

let sock;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// وظيفة لمنع السيرفر من النوم (Self-Ping)
function keepAlive() {
    setInterval(() => {
        const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
        axios.get(url).catch(() => console.log('Keep-alive ping sent.'));
    }, 4 * 60 * 1000); // كل 4 دقائق
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
        // تغيير الهوية إلى متصفح مستقر جداً لتجنب الطرد
        browser: Browsers.macOS('Desktop'), 
        // إعدادات الثبات القصوى
        syncFullHistory: false, // لا تطلب الرسائل القديمة (هذا سبب الفصل الأساسي)
        maxMsgRetryCount: 3,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 20000,
        generateHighQualityLinkPreview: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('انقطع الاتصال، السبب:', reason);
            // إعادة الاتصال تلقائياً إلا إذا قمت أنت بتسجيل الخروج يدوياً
            if (reason !== DisconnectReason.loggedOut) {
                startFaresBot();
            }
        }
        if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح والرقم فعال الآن!');
        }
    });

    // التفاعل مع الحالات بالإيموجي 💤
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;

            const from = mek.key.remoteJid;

            if (from === 'status@broadcast') {
                await sock.sendMessage(from, {
                    react: { text: '💤', key: mek.key }
                }, { statusJidList: [mek.key.participant] });
            }

            // أوامر إضافية
            const body = (mek.message.conversation || mek.message.extendedTextMessage?.text || "").toLowerCase();
            if (body === 'فحص') {
                await sock.sendMessage(from, { text: '👑 بوت فارس يعمل بثبات 24/7' }, { quoted: mek });
            }
        } catch (err) {
            console.error('Error:', err);
        }
    });

    return sock;
}

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });
    try {
        await startFaresBot(true);
        // انتظار كافٍ لتجهيز المتصفح الوهمي
        await new Promise(r => setTimeout(r, 8000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ، حاول مجدداً' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startFaresBot();
    keepAlive();
});
