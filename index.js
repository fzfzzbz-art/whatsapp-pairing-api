const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    Browsers,
    delay
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.get('/api/get-code', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "الرقم مطلوب" });

    const phoneNumber = phone.replace(/[^0-9]/g, '');
    const sessionPath = `./auth/${phoneNumber}`;

    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            // محاكاة نفس المتصفح الذي نجح معك (Safari على Mac)
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false, // مهم جداً لتجنب التعليق
            qrTimeout: 40000,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0
        });

        if (!sock.authState.creds.registered) {
            await delay(3000); 
            const code = await sock.requestPairingCode(phoneNumber);
            // إرسال الكود فوراً للمتصفح دون انتظار انتهاء الربط
            res.json({ status: true, code: code });
        }

        // معالجة تسجيل الدخول في الخلفية لضمان عدم تعليق السيرفر
        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`Successfully linked: ${phoneNumber}`);
            }
        });

    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(500).json({ error: "فشل في النظام" });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on ${PORT}`));
