const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, Browsers, disconnectReason } = require("@whiskeysockets/baileys");
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
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            // إضافة إعدادات لمنع قطع الاتصال المفاجئ
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        if (!sock.authState.creds.registered) {
            await delay(5000); 
            const code = await sock.requestPairingCode(phoneNumber);
            res.json({ status: true, code: code });
        }

        // أهم جزء: حفظ الجلسة فور اكتمالها
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('✅ تم تسجيل الدخول بنجاح!');
            }
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
                console.log('❌ انقطع الاتصال، السبب:', lastDisconnect?.error);
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "فشل في تسجيل الدخول" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`السيرفر يعمل على المنفذ ${PORT}`));
