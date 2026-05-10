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

// عرض الواجهة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// وظيفة البقاء مستيقظاً لمنع توقف سيرفر Render
function keepAlive() {
    setInterval(() => {
        const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
        if (process.env.RENDER_EXTERNAL_HOSTNAME) {
            axios.get(url).catch(() => {});
        }
    }, 4 * 60 * 1000); 
}

async function startFaresBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'), // لضمان استقرار الجلسة كما في الصور الناجحة
        syncFullHistory: false, // لمنع تعليق "جاري تسجيل الدخول"
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('حالة البوت:', connection);
    });

    // التفاعل مع الحالات بالإيموجي 💤
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        const mek = chatUpdate.messages[0];
        if (!mek.message || mek.key.fromMe) return;
        if (mek.key.remoteJid === 'status@broadcast') {
            await sock.sendMessage(mek.key.remoteJid, {
                react: { text: '💤', key: mek.key }
            }, { statusJidList: [mek.key.participant] });
        }
    });
}

// المسار الصحيح لجلب الكود من الرابط الخارجي (يحل مشكلة Route not found)
app.get('/api/pairing', async (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'الرقم مطلوب' });

    try {
        // جلب الكود من الرابط الذي حددته
        const response = await axios.get(`https://bot.goldenqueen.store/api/pairing?phone=${phone}`);
        
        // بدء تشغيل محرك البوت محلياً لاستقبال الجلسة
        startFaresBot();
        
        res.json(response.data);
    } catch (err) {
        console.error('خطأ في السيرفر الخارجي:', err.message);
        res.status(500).json({ error: 'فشل السيرفر الخارجي في الاستجابة' });
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر مستعد على المنفذ ${PORT}`);
    keepAlive();
});
