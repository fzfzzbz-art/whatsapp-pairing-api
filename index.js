require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './session';

let sock;

// عرض واجهة المستخدم index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

async function startFaresBot(clearSession = false) {
    if (clearSession && fs.existsSync(SESSION_DIR)) {
        await fs.emptyDir(SESSION_DIR);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'), 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startFaresBot();
        }
        console.log('حالة البوت حالياً:', connection);
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const from = mek.key.remoteJid;
            const body = mek.message.conversation || 
                         mek.message.extendedTextMessage?.text || 
                         mek.message.imageMessage?.caption || "";
            const command = body.toLowerCase().trim();

            if (command === 'فحص' || command === 'test') {
                await sock.sendMessage(from, { text: '✅ بوت الملك فارس يعمل بنجاح!' }, { quoted: mek });
            }
            if (command === 'فارس') {
                await sock.sendMessage(from, { text: '👑 نعم يا ملك، أنا في الخدمة. اطلب ما تشاء!' }, { quoted: mek });
            }
            if (command === 'الاوامر' || command === 'الأوامر') {
                const menu = `👑 *قائمة أوامر بوت الملك فارس* 👑\n\n` +
                             `• *فارس*: للترحيب.\n` +
                             `• *فحص*: للتأكد من اتصال البوت.\n` +
                             `• *الوقت*: لمعرفة وقت السيرفر.\n` +
                             `• *موقعي*: رابط بوابة الربط الخاصة بك.`;
                await sock.sendMessage(from, { text: menu }, { quoted: mek });
            }
        } catch (err) {
            console.log('Error in messages:', err);
        }
    });

    return sock;
}

app.post('/api/pairing', async (req, res) => {
    const num = req.body.num;
    if (!num) return res.status(400).json({ error: 'الرقم مطلوب' });

    try {
        await startFaresBot(true);
        await new Promise(resolve => setTimeout(resolve, 5000));
        const code = await sock.requestPairingCode(num);
        res.json({ success: true, code });
    } catch (err) {
        console.error('Pairing Error:', err);
        res.status(500).json({ error: 'حدث خطأ في استخراج الكود' });
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`);
    startFaresBot();
});
