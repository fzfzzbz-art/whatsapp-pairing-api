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

// تقديم الواجهة
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// وظيفة منع السيرفر من النوم على Render
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

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'), // نفس المتصفح الذي أظهر نجاح الربط في الصور
        syncFullHistory: false, // لضمان عدم الفصل التلقائي عند الدخول
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('حالة البوت حالياً:', connection);
    });

    // --- التفاعل التلقائي مع الحالات بالإيموجي 💤 ---
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;

            const from = mek.key.remoteJid;

            // التفاعل مع الحالات
            if (from === 'status@broadcast') {
                await sock.sendMessage(from, {
                    react: { text: '💤', key: mek.key }
                }, { statusJidList: [mek.key.participant] });
                console.log('✅ تم التفاعل مع حالة جديدة بالإيموجي 💤');
            }

            // أوامر البوت
            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            if (body.toLowerCase() === 'فحص') {
                await sock.sendMessage(from, { text: '✅ بوت الملك فارس متصل 24/7 والتفاعل مفعل.' }, { quoted: mek });
            }
        } catch (err) {
            console.log('Error:', err);
        }
    });
}

// واجهة API لربط موقعك بالرابط الخارجي الذي طلبته
app.get('/api/get-pairing', async (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'الرقم مطلوب' });

    try {
        // الاتصال بالرابط الخارجي لجلب الكود
        const response = await axios.get(`https://bot.goldenqueen.store/api/pairing?phone=${phone}`);
        
        // تشغيل البوت محلياً لبدء استقبال الجلسة فور الربط
        if (!sock) startFaresBot();
        
        res.json(response.data);
    } catch (err) {
        console.error('API Error:', err.message);
        res.status(500).json({ error: 'فشل السيرفر الخارجي في الاستجابة' });
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`);
    startFaresBot();
    keepAlive();
});
