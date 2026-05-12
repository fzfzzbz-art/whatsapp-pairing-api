const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    Browsers, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const { Telegraf, session } = require('telegraf');
const pino = require('pino');
const express = require('express');
const http = require('http');

// --- الإعدادات ---
const BOT_TOKEN = '8631941557:AAHhHbgJa_BpU9avBYC-n3eKlQhzvuNNUJQ';
const SITE_PASSWORD = 'GQ_ADMIN_2026';

const app = express();
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// --- تشغيل الواتساب (Baileys) ---
async function startWhatsApp(phoneNumber, telegramCtx) {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    // طلب كود الربط إذا كان الرقم موجوداً
    if (phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                await telegramCtx.reply(`✅ كود الربط الخاص بك هو:\n\n \`${code}\` \n\n🔐 كلمة سر الموقع: \`${SITE_PASSWORD}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                await telegramCtx.reply('❌ فشل طلب الكود، تأكد من الرقم.');
            }
        }, 3000);
    }

    // التفاعل مع الحالات والرسائل (بدون توقف)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;

        // 1. التفاعل التلقائي مع الحالات (Auto View Status)
        if (from === 'status@broadcast') {
            await sock.readMessages([msg.key]); // قراءة الحالة
            await sock.sendMessage(from, { react: { text: '💤', key: msg.key } }, { statusJidList: [msg.key.participant] });
            return;
        }

        // 2. الرد التلقائي برابط البوت
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (text) {
            await sock.sendMessage(from, { text: `مرحباً! أنا بوت Golden Queen.\nرابط بوت التليجرام الخاص بي: https://t.me/${bot.botInfo.username}` }, { quoted: msg });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp(); // إعادة الاتصال تلقائياً
        } else if (connection === 'open') {
            console.log('WhatsApp Connection Opened! ✅');
        }
    });

    return sock;
}

// --- أوامر بوت تليجرام ---
bot.start((ctx) => {
    ctx.reply('مرحباً بك في نظام Golden Queen المتكامل!\nاضغط للربط بالواتساب:', {
        reply_markup: { inline_keyboard: [[{ text: 'ربط واتساب 📱', callback_data: 'pair_wa' }]] }
    });
});

bot.on('callback_query', async (ctx) => {
    if (ctx.callbackQuery.data === 'pair_wa') {
        ctx.session = { step: 'wait_phone' };
        await ctx.answerCbQuery();
        await ctx.reply('📱 أرسل رقمك الآن (مثال: 967771163825):');
    }
});

bot.on('text', async (ctx) => {
    if (ctx.session?.step === 'wait_phone') {
        const phone = ctx.message.text.trim();
        if (!/^\d+$/.test(phone)) return ctx.reply('❌ أرسل أرقاماً فقط.');
        
        await ctx.reply('⏳ جاري إنشاء جلسة وطلب الكود من واتساب...');
        startWhatsApp(phone, ctx);
        ctx.session.step = null;
    }
});

// --- واجهة الموقع و Health Check ---
app.get('/', (req, res) => res.send('<h1>Golden Queen System is Online ✅</h1>'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startWhatsApp(); // تشغيل الجلسة المحفوظة عند بدء التشغيل
    bot.launch();
});
