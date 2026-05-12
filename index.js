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
async function startWhatsApp(phoneNumber = null, telegramCtx = null) {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        // تحديث الهوية لمتصفح Chrome لضمان قبول كود الربط من قبل واتساب
        browser: Browsers.ubuntu('Chrome'), 
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    // طلب كود الربط عند إرسال رقم هاتف جديد
    if (phoneNumber && !sock.authState.creds.registered) {
        // تأخير بسيط لضمان استقرار الجلسة قبل طلب الكود
        await new Promise(resolve => setTimeout(resolve, 7000));
        try {
            let code = await sock.requestPairingCode(phoneNumber);
            if (telegramCtx) {
                await telegramCtx.reply(`✅ كود الربط الخاص بك هو:\n\n \`${code}\` \n\n🔐 استخدم هذا الكود الآن في واتساب (الأجهزة المرتبطة).\n⚠️ ملاحظة: استخدم الكود الأخير فقط.`);
            }
        } catch (err) {
            console.error('Pairing Error:', err);
            if (telegramCtx) await telegramCtx.reply('❌ فشل طلب الكود. يرجى المحاولة مرة أخرى بعد دقيقة.');
        }
    }

    // إدارة الأحداث (الرسائل والحالات)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;

        // 1. التفاعل التلقائي مع الحالات (Auto-View Status)
        if (from === 'status@broadcast') {
            await sock.readMessages([msg.key]); // مشاهدة الحالة
            // وضع تفاعل "💤" على الحالة
            await sock.sendMessage(from, { react: { text: '💤', key: msg.key } }, { statusJidList: [msg.key.participant] });
            return;
        }

        // 2. رد تلقائي بسيط (اختياري)
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (text && !from.endsWith('@g.us')) { // الرد في الخاص فقط
             await sock.sendMessage(from, { text: `مرحباً! أنا بوت Golden Queen.\nرابط بوت التليجرام: https://t.me/${bot.botInfo.username}` }, { quoted: msg });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp(); // إعادة الاتصال التلقائي
        } else if (connection === 'open') {
            console.log('WhatsApp Connected Successfully! ✅');
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
        await ctx.reply('📱 أرسل رقمك الآن مع مفتاح الدولة (مثال: 967771163825):');
    }
});

bot.on('text', async (ctx) => {
    if (ctx.session?.step === 'wait_phone') {
        const phone = ctx.message.text.trim().replace('+', '');
        if (!/^\d+$/.test(phone)) return ctx.reply('❌ يرجى إرسال أرقام فقط.');
        
        await ctx.reply('⏳ جاري إنشاء الجلسة وطلب الكود، انتظر لحظة...');
        startWhatsApp(phone, ctx);
        ctx.session.step = null;
    }
});

// --- واجهة الموقع و Health Check لـ Render ---
app.get('/', (req, res) => {
    res.send(`
        <body style="background:#121212;color:white;text-align:center;padding-top:50px;font-family:sans-serif;">
            <h1 style="color:#f39c12;">Golden Queen System</h1>
            <p style="color:#2ecc71;">الحالة: متصل ونشط ✅</p>
        </body>
    `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startWhatsApp(); // تشغيل الجلسات المحفوظة عند البدء
    bot.launch();
});
