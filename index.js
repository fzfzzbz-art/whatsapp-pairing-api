const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require('pino');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// تشغيل الواجهة
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.post('/api/pairing', async (req, res) => {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "يرجى إدخال الرقم" });

    const phoneNumber = phone.replace(/[^0-9]/g, '');

    try {
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phoneNumber}`);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            // التعديل الأهم: تعريف المتصفح لضمان قبول الكود
            browser: ["Chrome (Linux)", "", ""] 
        });

        if (!sock.authState.creds.registered) {
            // انتظار قصير ليتصل السيرفر بواتساب قبل طلب الكود
            await delay(3000); 
            const code = await sock.requestPairingCode(phoneNumber);
            
            res.json({
                status: true,
                pairing_code: code
            });
        } else {
            res.json({ status: false, message: "الرقم مرتبط بالفعل" });
        }

        sock.ev.on('creds.update', saveCreds);

        // إنهاء الجلسة إذا لم يتم الربط خلال 3 دقائق لتوفير الموارد
        setTimeout(() => {
            sock.logout().catch(() => {});
        }, 180000);

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, error: "فشل السيرفر في توليد الكود" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
