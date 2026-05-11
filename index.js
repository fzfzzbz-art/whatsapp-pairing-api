require('dotenv').config();
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    Browsers, 
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const express = require('express');
const path = require('path');
const pino = require('pino');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

async function startFaresBot() {
    const sessionPath = './session';
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            // استخدام مخزن مفاتيح قابل للتخزين المؤقت لسرعة استعادة الجلسة
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'), 
        printQRInTerminal: false,
        syncFullHistory: false,
        // جعل الحساب يظهر "متصل الآن" دائماً للحفاظ على نشاط الجلسة
        markOnlineOnConnect: true,
        // إعدادات إضافية لتقليل استهلاك الذاكرة ومنع انهيار التطبيق
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(message.buttonsMessage || message.listMessage);
            if (requiresPatch) {
                message = { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, ...message } } };
            }
            return message;
        }
    });

    // حفظ بيانات الجلسة فور حدوث أي تغيير
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`انقطع الاتصال. السبب: ${statusCode}. إعادة الاتصال: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                // إعادة تشغيل تلقائية بعد 5 ثوانٍ في حال الانقطاع المفاجئ
                setTimeout(() => startFaresBot(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ الجلسة نشطة الآن والبوت متصل بالكامل');
        }
    });

    // ميزة مشاهدة الحالات والتفاعل (لإبقاء الحساب نشطاً في خوارزميات واتساب)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe || mek.key.remoteJid !== 'status@broadcast') return;
            
            await sock.readMessages([mek.key]);
            await sock.sendMessage(mek.key.remoteJid, { react: { text: '👑', key: mek.key } }, { statusJidList: [mek.key.participant] });
        } catch (e) {}
    });
}

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`سيرفر الحفاظ على الجلسة يعمل على منفذ ${PORT}`);
    startFaresBot();
});
