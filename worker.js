"use strict";

const { makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const statusHandler = require('./interactions');

function normalizeJid(jid = '') {
    return String(jid || '').replace(/:\d+(@c\.us|@s\.whatsapp\.net)/, '$1');
}

async function startSession(phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState(`./data/${phoneNumber}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSession(phoneNumber);
        } else if (connection === 'open') {
            console.log(`✅ الرقم متصل الآن [${phoneNumber}]`);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        // التحقق إذا كانت الرسالة حالة
        if (statusHandler.isStatusBroadcastMessage(msg, normalizeJid)) {
            
            // 1. المشاهدة (Read Status)
            try {
                await sock.readMessages([{
                    remoteJid: 'status@broadcast',
                    id: msg.key.id,
                    participant: msg.key.participant
                }]);
            } catch (err) {
                console.error("خطأ في المشاهدة:", err);
            }

            // 2. التفاعل (Reaction)
            // نستخدم دالة التفاعل مع تمرير المتغيرات الصحيحة
            const reacted = await statusHandler.sendStatusReactionWithFallbacks({
                sock: sock,
                msg: msg,
                emoji: '❤️',
                phoneNumber: phoneNumber
            });

            if (reacted) {
                console.log("تمت مشاهدة الحالة والتفاعل معها بنجاح");
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

module.exports = { startSession };
