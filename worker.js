const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require('pino');

async function startSession(phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phoneNumber}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSession(phoneNumber);
        } else if (connection === 'open') {
            console.log(`✅ الرقم [${phoneNumber}] متصل الآن.`);
        }
    });

    // التفاعل التلقائي (نظام الشبح)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid !== 'status@broadcast') return;

        try {
            await delay(3000); // تأخير بسيط للأمان
            
            // إرسال التفاعل دون إرسال "تمت المشاهدة" (Ghost Mode)
            await sock.sendMessage(msg.key.remoteJid, {
                react: {
                    text: "❤️", // يمكنك جعل هذا الإيموجي متغيراً لكل مستخدم
                    key: msg.key
                }
            }, { statusJidList: [msg.key.participant] });

        } catch (err) {
            console.error(`خطأ في تفاعل الرقم ${phoneNumber}`);
        }
    });
}

module.exports = { startSession };
