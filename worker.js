const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');

// مخزن مؤقت لحفظ إعدادات المستخدمين (يمكنك استبداله بقاعدة بيانات لاحقاً)
// الإعدادات الافتراضية لكل رقم
let userSettings = {}; 

async function startSession(phoneNumber) {
    // تحديد مسار الجلسة بناءً على رقم الهاتف لضمان الاستقلالية
    const sessionPath = `./sessions/${phoneNumber}`;
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' })
    });

    // حفظ التحديثات في ملف الجلسة الخاص بهذا الرقم
    sock.ev.on('creds.update', saveCreds);

    // متابعة حالة الاتصال
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`اتصال الرقم ${phoneNumber} انقطع. إعادة الاتصال: ${shouldReconnect}`);
            if (shouldReconnect) startSession(phoneNumber);
        } else if (connection === 'open') {
            console.log(`✅ الرقم ${phoneNumber} متصل الآن وجاهز للتفاعل.`);
        }
    });

    // الاستماع للحالات (Stories) والتفاعل معها
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid !== 'status@broadcast') return;

        const sender = msg.key.participant;
        
        // جلب إعدادات هذا الرقم تحديداً (مثل الإيموجي المختار)
        // إذا لم يحدد إيموجي، نستخدم القلب كافتراضي
        const settings = userSettings[phoneNumber] || { emoji: "❤️", active: true };

        if (settings.active) {
            try {
                // تأخير بسيط لتجنب الحظر (Simulating human behavior)
                await delay(2000); 

                await sock.sendMessage(msg.key.remoteJid, {
                    react: {
                        text: settings.emoji, 
                        key: msg.key
                    }
                }, { statusJidList: [sender] });

                console.log(`[${phoneNumber}] تم التفاعل بـ ${settings.emoji} على حالة ${sender}`);
            } catch (err) {
                console.error(`خطأ في تفاعل الرقم ${phoneNumber}:`, err);
            }
        }
    });

    return sock;
}

// وظيفة لتحديث إعدادات رقم معين من البوت (تستدعى من index.js)
function updateUserSettings(phoneNumber, newEmoji) {
    if (!userSettings[phoneNumber]) userSettings[phoneNumber] = {};
    userSettings[phoneNumber].emoji = newEmoji;
    console.log(`تم تحديث إيموجي الرقم ${phoneNumber} إلى ${newEmoji}`);
}

module.exports = { startSession, updateUserSettings };
