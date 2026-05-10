const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require('pino');
const path = require('path');

const app = express();
app.use(express.json());

// عرض ملف الواجهة index.html عند فتح الرابط الرئيسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.post('/api/pairing', async (req, res) => {
    let { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: "يرجى تزويد رقم الهاتف" });
    }

    phone = phone.replace(/[^0-9]/g, '');

    try {
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);

        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false
        });

        if (!sock.authState.creds.registered) {
            await delay(1500); 
            const code = await sock.requestPairingCode(phone);
            
            res.json({
                status: true,
                pairing_code: code
            });
        } else {
            res.json({ status: false, message: "الرقم مرتبط مسبقاً" });
        }

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "حدث خطأ في السيرفر" });
    }
});

// استخدام المنفذ (Port) الذي يحدده Render تلقائياً
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن على المنفذ: ${PORT}`);
});
