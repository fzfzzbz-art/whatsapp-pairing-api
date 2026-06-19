const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { sendRobustStatusReaction } = require('./statusHelper');
const statusHandler = require('./interactions');

function normalizeJid(jid = '') {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

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
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSession(phoneNumber);
        } else if (connection === 'open') {
            console.log(`✅ الرقم [${phoneNumber}] متصل الآن.`);
        }
    });
sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    // هنا يتم التأكد إذا كانت الرسالة حالة
    if (statusHandler.isStatusBroadcastMessage(msg, normalizeJid)) {
        
        // 1. المشاهدة (Read Status)
        await sock.readMessages([{
            remoteJid: 'status@broadcast',
            id: msg.key.id,
            participant: msg.key.participant
        }]);
        
        // 2. التفاعل (Reaction)
        await statusHandler.sendStatusReactionWithFallbacks({
            sock,
            msg,
            emoji: '❤️' // يمكنك تغيير الإيموجي من هنا
        });
        
        console.log("تمت مشاهدة الحالة والتفاعل معها");
    }
});

    
