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

// تشغيل واجهة الموقع من مجلد public
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
        browser: Browsers.ubuntu('Chrome'), // لضمان استقرار الربط
        printQRInTerminal: false,
        markOnlineOnConnect: true, // يظهر رقمك "متصل" دائماً
        syncFullHistory: false
    });

    // حفظ بيانات الجلسة فوراً
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) lastQr = await QRCode.toDataURL(qr);
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('انقطع الاتصال، جاري إعادة المحاولة:', shouldReconnect);
            if (shouldReconnect) setTimeout(() => startFaresBot(), 5000);
        }
        
        if (connection === 'open') {
            console.log('✅ تم فتح الاتصال بنجاح! الجلسة نشطة الآن.');
        }
    });

    // ⚡ كود التفاعلات التلقائية (مشاهدة وتفاعل مع الحالات) ⚡
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe || mek.key.remoteJid !== 'status@broadcast') return;
            
            const sender = mek.key.participant || mek.key.remoteJid;

            // 1. مشاهدة الحالة تلقائياً
            await sock.readMessages([mek.key]);
            
            // 2. التفاعل بالإيموجي (👑)
            await sock.sendMessage(mek.key.remoteJid, { 
                react: { text: '👑', key: mek.key } 
            }, { statusJidList: [sender] });

            console.log(`✨ تم التفاعل مع حالة: ${sender}`);
        } catch (e) {
            console.error('خطأ في التفاعل:', e);
        }
    });

    // معالجة طلب كود الربط
    if (num) {
        await new Promise(r => setTimeout(r, 5000));
        return await sock.requestPairingCode(num.replace(/[^0-9]/g, ''));
    }
}

// APIs الموقع
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

// توجيه كافة الطلبات لفتح الواجهة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن على المنفذ: ${PORT}`);
    startFaresBot();
});
