const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();

// إعدادات الوصول (CORS)
app.use(cors({
    origin: 'https://whatsapp-pairing-api.onrender.com', // رابط مشروعك
    methods: ['GET', 'POST']
}));
app.use(express.json());

// تشغيل الواجهة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.post('/api/pairing', async (req, res) => {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "الرقم مطلوب" });

    const phoneNumber = phone.replace(/[^0-9]/g, '');
    const sessionPath = `./sessions/${phoneNumber}`;

    // تنظيف الجلسة القديمة لضمان طلب كود جديد تماماً
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
            // تعريف المتصفح كـ Chrome على نظام Linux لزيادة موثوقية الإشعار
            browser: ["Chrome (Linux)", "", ""] 
        });

        if (!sock.authState.creds.registered) {
            await delay(3000); // وقت إضافي لضمان استقرار الاتصال بخوادم واتساب
            const code = await sock.requestPairingCode(phoneNumber);
            
            return res.json({
                status: true,
                pairing_code: code
            });
        } else {
            return res.json({ status: false, message: "هذا الرقم مربوط بالفعل" });
        }

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error("Pairing Error:", error);
        res.status(500).json({ status: false, error: "فشل في توليد الكود" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is Live on port ${PORT}`));
