const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require('pino');

const app = express();
app.use(express.json());

// مخزن مؤقت للجلسات (يفضل استخدام قاعدة بيانات في الإنتاج)
const sessions = new Map();

app.post('/api/pairing', async (req, res) => {
    let { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: "يرجى تزويد رقم الهاتف مع رمز الدولة" });
    }

    // تنظيف الرقم من أي إضافات مثل + أو مسافات
    phone = phone.replace(/[^0-9]/g, '');

    try {
        // إنشاء مسار فريد لكل جلسة بناءً على رقم الهاتف
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);

        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }), // لإخفاء سجلات النظام الكثيرة
            printQRInTerminal: false
        });

        // إذا لم يكن الرقم مسجلاً مسبقاً، نطلب كود الربط
        if (!sock.authState.creds.registered) {
            // تأخير بسيط لضمان استقرار الاتصال بالخادم
            await delay(1500); 
            const code = await sock.requestPairingCode(phone);
            
            // الرد بالكود للواجهة الأمامية
            res.json({
                status: true,
                pairing_code: code,
                message: "أدخل هذا الكود في هاتفك (الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف)"
            });
        } else {
            res.json({ status: false, message: "هذا الرقم مرتبط بالفعل" });
        }

        // حفظ التغييرات في الجلسة
        sock.ev.on('creds.update', saveCreds);

        // مراقبة حالة الاتصال
        sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`تم ربط الرقم ${phone} بنجاح!`);
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "حدث خطأ أثناء توليد الكود" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});
