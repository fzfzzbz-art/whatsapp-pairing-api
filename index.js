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

    // حذف الجلسة القديمة لضمان طلب "فرش" يولد إشعاراً
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
            // تغيير الهوية إلى متصفح Chrome على Windows (الأفضل لاستقبال الإشعارات)
            browser: ["Windows", "Chrome", "122.0.6261.112"]
        });

        if (!sock.authState.creds.registered) {
            // انتظار 6 ثوانٍ قبل طلب الكود لمحاكاة سلوك حقيقي
            await delay(6000); 
            const code = await sock.requestPairingCode(phoneNumber);
            res.json({ status: true, code: code });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') console.log(`Connected: ${phoneNumber}`);
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "فشل السيرفر في جلب الكود" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
