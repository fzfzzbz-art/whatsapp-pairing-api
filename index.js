const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    Browsers 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// تقديم واجهة المستخدم
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

// مسار طلب كود الربط
app.get('/api/get-code', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "الرقم مطلوب" });

    const phoneNumber = phone.replace(/[^0-9]/g, '');
    const sessionPath = `./auth/${phoneNumber}`;

    // تنظيف الجلسات القديمة لضمان بداية نظيفة
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
            // تعريف المتصفح كـ Chrome على Windows لضمان قبول الربط
            browser: ["Windows", "Chrome", "122.0.6261.112"], 
            // إيقاف مزامنة الرسائل القديمة لتسريع تسجيل الدخول وتجنب التعليق
            syncFullHistory: false, 
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        if (!sock.authState.creds.registered) {
            await delay(6000); // تأخير بسيط لمحاكاة سلوك بشري
            const code = await sock.requestPairingCode(phoneNumber);
            res.json({ status: true, code: code });
        }

        // حفظ بيانات تسجيل الدخول فور تحديثها
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`✅ تم الربط بنجاح للرقم: ${phoneNumber}`);
            }
        });

    } catch (error) {
        console.error("Pairing Error:", error);
        res.status(500).json({ error: "فشل في التواصل مع واتساب" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`السيرفر يعمل الآن على المنفذ ${PORT}`));
