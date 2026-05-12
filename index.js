const { Telegraf, session } = require('telegraf');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = '8631941557:AAHhHbgJa_BpU9avBYC-n3eKlQhzvuNNUJQ';
const PAIRING_API = 'https://bot.goldenqueen.store/api/pairing';
const SITE_PASSWORD = 'GQ_ADMIN_2026';

const bot = new Telegraf(BOT_TOKEN);

// استخدام الـ session لتخزين حالة المستخدم
bot.use(session());

// سيرفر الـ Health Check للخطة المجانية
const port = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot Active');
}).listen(port);

bot.start((ctx) => {
    ctx.reply('مرحباً بك في بوت Golden Queen!\nاضغط على الزر لربط واتساب الخاص بك:', {
        reply_markup: {
            inline_keyboard: [[{ text: 'ربط واتساب 📱', callback_data: 'pair_wa' }]]
        }
    });
});

bot.on('callback_query', async (ctx) => {
    if (ctx.callbackQuery.data === 'pair_wa') {
        ctx.session = { step: 'wait_phone' };
        await ctx.answerCbQuery();
        await ctx.reply('📱 أرسل رقم هاتفك الآن مع مفتاح الدولة (مثال: 966500000000):');
    }
});

bot.on('text', async (ctx) => {
    const state = ctx.session || {};
    if (state.step === 'wait_phone') {
        const phone = ctx.message.text.trim();
        
        if (!/^\d+$/.test(phone)) {
            return ctx.reply('❌ يرجى إرسال أرقام فقط.');
        }

        await ctx.reply('⏳ جاري طلب كود الربط من السيرفر، انتظر لحظة...');

        try {
            // طلب الكود باستخدام axios مع timeout
            const response = await axios.get(`${PAIRING_API}?phone=${phone}`, { timeout: 20000 });
            
            if (response.data && response.data.code) {
                const pairCode = response.data.code;
                await ctx.reply(`✅ كود الربط الخاص بك هو: \n\n \`${pairCode}\` \n\n🔐 كلمة سر الموقع: \`${SITE_PASSWORD}\``, { parse_mode: 'Markdown' });
                
                // محاولة إرسال الرابط للرقم (اختياري)
                axios.post('https://bot.goldenqueen.store/api/send', {
                    phone: phone,
                    message: `تم الربط بنجاح! رابط البوت: https://t.me/${ctx.botInfo.username}`
                }).catch(() => {});
            } else {
                await ctx.reply('❌ السيرفر لم يرسل كوداً حالياً. تأكد من أن الموقع يعمل.');
            }
        } catch (error) {
            console.error('API Error:', error.message);
            await ctx.reply('⚠️ حدث خطأ في الاتصال بالسيرفر المسؤول عن الكود.');
        }
        ctx.session.step = null;
    }
});

bot.launch().then(() => console.log('Bot is running...'));
