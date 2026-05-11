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
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json());

// ربط المجلد العام لعرض الواجهة (HTML/JS/CSS)
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
let sock;
let lastQr = null;

async function startFaresBot(num = null) {
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
        browser: Browsers.ubuntu('Chrome'), // تحسين التوافق لضمان وصول الإشعار
        printQRInTerminal: false,
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
        if (connection === 'open') {
            console.log("✅ تم الاتصال بنجاح والجلسة نشطة");
        }
    });

    // ميزة مشاهدة الحالات والتفاعل التلقائي لإبقاء الجلسة نشطة
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe || mek.key.remoteJid !== 'status@broadcast') return;
            
            await sock.readMessages([mek.key]); // مشاهدة تلقائية
            await sock.sendMessage(mek.key.remoteJid, { 
                react: { text: '👑', key: mek.key } 
            }, { statusJidList: [mek.key.participant] });
        } catch (e) {}
    });

    // معالجة طلب كود الإقران من الواجهة
    if (num) {
        await new Promise(r => setTimeout(r, 3000));
        return await sock.requestPairingCode(num.replace(/[^0-9]/g, ''));
    }
}

// مسارات الـ API للواجهة
app.post('/api/pairing', async (req, res) => {
    try {
        const code = await startFaresBot(req.body.num);
        if (code) res.json({ success: true, code });
        else res.status(500).json({ success: false });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/qr', async (req, res) => {
    if (lastQr) {
        const img = Buffer.from(lastQr.split(',')[1], 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else { res.status(404).send('QR Not Ready'); }
});

// تشغيل السيرفر وعرض الواجهة
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`سيرفر Golden Queen يعمل على الرابط: http://localhost:${PORT}`);
    startFaresBot(); // بدء تشغيل البوت عند تشغيل السيرفر
});
