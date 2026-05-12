const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');

// --- الإعدادات ---
const BOT_TOKEN = '8631941557:AAHhHbgJa_BpU9avBYC-n3eKlQhzvuNNUJQ';
const PAIRING_API = 'https://bot.goldenqueen.store/api/pairing';
const SITE_PASSWORD = 'GQ_ADMIN_2026';

const bot = new Telegraf(BOT_TOKEN);

// --- سيرفر وهمي لتجنب إغلاق Render للبوت ---
const port = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
}).listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
});

// --- وظائف البوت ---
bot.start((ctx) => {
    ctx.reply('مرحباً بك في بوت Golden Queen!\nاضغط على الزر لربط واتساب الخاص بك:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'ربط واتساب 📱', callback_data: 'pair_wa' }]
            ]
        }
    });
});

bot.on('callback_query', async (ctx) => {
    if (ctx.callbackQuery.data === 'pair_wa') {
        await ctx.answerCbQuery();
        await ctx.editMessageText('📱 أرسل رقم هاتفك الآن مع مفتاح الدولة (مثال: 966500000000):');
        ctx.session = { step: 'wait_phone' };
    }
});

bot.on('text', async (ctx) => {
    if (ctx.session?.step === 'wait_phone') {
        const phone = ctx.message.text.trim();
        
        if (!/^\d{10,15}$/.test(phone)) {
            return ctx.reply('❌ الرقم غير صحيح! أرسل أرقاماً فقط.');
        }

        ctx.reply('⏳ جاري طلب كود الربط من السيرفر...');

        try {
            const response = await axios.get(`${PAIRING_API}?phone=${phone}`);
            const data = response.data;

            if (data.code) {
                await ctx.reply(`✅ كود الربط: \`${data.code}\`\n🔐 كلمة سر الموقع: \`${SITE_PASSWORD}\``, { parse_mode: 'Markdown' });
                
                // إرسال الرابط للرقم تلقائياً (اختياري)
                axios.post('https://bot.goldenqueen.store/api/send', {
                    phone: phone,
                    message: `رابط البوت: https://t.me/${ctx.botInfo.username}`
                }).catch(() => {});
            } else {
                ctx.reply('❌ فشل الحصول على الكود من السيرفر.');
            }
        } catch (error) {
            ctx.reply('⚠️ خطأ في الاتصال بالسيرفر.');
        }
        ctx.session.step = null;
    }
});

bot.launch();
console.log('Bot is polling for updates...');

// إيقاف آمن
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
