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
        // تحديث المتصفح إلى macOS لضمان وصول إشعار الربط فوراً
        browser: Browsers.macOS('Desktop'), 
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false
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
            console.log('✅ السيرفر متصل والجلسة مفعلة');
        }
    });

    // ⚡ التفاعل التلقائي (المشاهدة + الإعجاب 👑) ⚡
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe || mek.key.remoteJid !== 'status@broadcast') return;
            
            const sender = mek.key.participant || mek.key.remoteJid;

            // 1. قراءة الحالة
            await sock.readMessages([mek.key]);

            // 2. إرسال الإعجاب (تأكد من وجود sender في المصفوفة لضمان وصوله)
            await sock.sendMessage(
                'status@broadcast', 
                { react: { text: '👑', key: mek.key } }, 
                { statusJidList: [sender] } 
            );
        } catch (e) {
            console.error('خطأ في التفاعل:', e);
        }
    });

    // معالجة طلب الكود
    if (num) {
        // ننتظر قليلاً لضمان استقرار الاتصال قبل طلب الكود
        await new Promise(r => setTimeout(r, 6000));
        try {
            let code = await sock.requestPairingCode(num.replace(/[^0-9]/g, ''));
            return code;
        } catch (err) {
            console.error('فشل طلب الكود:', err);
            return null;
        }
    }
}

// APIs
app.post('/api/pairing', async (req, res) => {
    try {
        const code = await startFaresBot(req.body.num);
        if (code) res.json({ success: true, code });
        else res.status(500).json({ success: false, error: 'تعذر طلب الكود' });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/qr', async (req, res) => {
    if (lastQr) {
        const img = Buffer.from(lastQr.split(',')[1], 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else { res.status(404).send('QR Not Ready'); }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    startFaresBot();
});
