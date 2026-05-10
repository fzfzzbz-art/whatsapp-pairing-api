const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
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

    // تنظيف الجلسات القديمة لضمان طلب كود جديد
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
            // تعريف متصفح Mac لضمان وصول الإشعار فوراً
            browser: ["Mac OS", "Chrome", "124.0.6367.118"] 
        });

        if (!sock.authState.creds.registered) {
            await delay(3000); 
            const code = await sock.requestPairingCode(phoneNumber);
            
            res.json({ status: true, code: code });
        }

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "فشل في توليد الكود" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
