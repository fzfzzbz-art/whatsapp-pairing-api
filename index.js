const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require('pino');
const path = require('path');
const cors = require('cors');

const app = express();

// تفعيل CORS للسماح بالطلبات من المتصفح
app.use(cors());
app.use(express.json());

// تشغيل الواجهة عند فتح الرابط الرئيسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

// نقطة النهاية (API) لتوليد كود الربط
app.post('/api/pairing', async (req, res) => {
    let { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: "يرجى إدخال رقم الهاتف" });
    }

    // تنظيف الرقم
    const phoneNumber = phone.replace(/[^0-9]/g, '');

    try {
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phoneNumber}`);

        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false
        });

        if (!sock.authState.creds.registered) {
            // انتظار بسيط لضمان استقرار السوكيت
            await delay(3000); 
            const code = await sock.requestPairingCode(phoneNumber);
            
            return res.json({
                status: true,
                pairing_code: code
            });
        } else {
            return res.json({ status: false, message: "هذا الرقم مربوط مسبقاً بجلسة نشطة" });
        }

        // حفظ التغييرات
        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error("Error in pairing:", error);
        res.status(500).json({ status: false, error: "فشل في توليد الكود" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
