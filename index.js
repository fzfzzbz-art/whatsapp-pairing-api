const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
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
            printQRInTerminal: false,
            // تعديل المتصفح ليكون أكثر استقراراً
            browser: Browsers.macOS("Desktop"), 
            syncFullHistory: false,
            // إعدادات البقاء حياً لمنع التوقف على Render
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: undefined
        });

        if (!sock.authState.creds.registered) {
            await delay(5000); 
            const code = await sock.requestPairingCode(phoneNumber);
            res.json({ status: true, code: code });
        }

        sock.ev.on('creds.update', saveCreds);

        // مراقبة الاتصال لضمان إتمام عملية تسجيل الدخول
        sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`تم الربط بنجاح للرقم: ${phoneNumber}`);
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
