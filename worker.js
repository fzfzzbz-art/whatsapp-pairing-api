"use strict";

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs'); // استدعاء مكتبة النظام للتأكد من المجلدات
const statusHandler = require('./interactions');

function normalizeJid(jid = '') {
    return String(jid || '').replace(/:\d+(@c\.us|@s\.whatsapp\.net)/, '$1');
}

async function startSession(phoneNumber) {
    // التأكد من وجود مجلد البيانات
    const sessionPath = `./data/${phoneNumber}`;
    if (!fs.existsSync('./data')){
        fs.mkdirSync('./data');
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Bot', 'Safari', '1.0.0'] // إضافة اسم متصفح لتجنب الحظر
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ انقطع الاتصال، إعادة المحاولة...`);
            if (shouldReconnect) startSession(phoneNumber);
        } else if (connection === 'open') {
            console.log(`✅ الرقم متصل الآن [${phoneNumber}]`);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || !msg.key || msg.key.fromMe) return;

        if (statusHandler.isStatusBroadcastMessage(msg, normalizeJid)) {
            try {
                // 1. المشاهدة
                await sock.readMessages([{
                    remoteJid: 'status@broadcast',
                    id: msg.key.id,
                    participant: msg.key.participant
                }]);

                // 2. التفاعل
                const reacted = await statusHandler.sendStatusReactionWithFallbacks({
                    sock: sock,
                    msg: msg,
                    emoji: '❤️',
                    phoneNumber: phoneNumber
                });

                if (reacted) console.log("تمت المشاهدة والتفاعل بنجاح");
            } catch (err) {
                console.error("خطأ أثناء معالجة الحالة:", err.message);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

module.exports = { startSession };
