const { Telegraf, session } = require('telegraf');
const axios = require('axios');
const http = require('http');

// --- الإعدادات ---
const BOT_TOKEN = '8631941557:AAHhHbgJa_BpU9avBYC-n3eKlQhzvuNNUJQ';
// تم تحديث الرابط لموقعك الجديد
const PAIRING_API = 'https://whatsapp-pairing-api.onrender.com/api/pairing';
const SITE_PASSWORD = 'GQ_ADMIN_2026';

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// --- إضافة واجهة ربط للمتصفح (HTML Interface) ---
const port = process.env.PORT || 8080;
http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <title>واجهة ربط جولدن كوين</title>
                <style>
                    body { font-family: sans-serif; background: #121212; color: white; text-align: center; padding-top: 50px; }
                    .card { background: #1e1e1e; padding: 20px; border-radius: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                    h1 { color: #f39c12; }
                    .status { color: #2ecc71; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Golden Queen API</h1>
                    <p>الحالة: <span class="status">متصل ونشط ✅</span></p>
                    <p>هذا الرابط مخصص لربط البوت بالسيرفر.</p>
                    <small>2026 © جميع الحقوق محفوظة لـ فارس التميمي</small>
                </div>
            </body>
            </html>
        `);
    } else {
        res.writeHead(404);
        res.end();
    }
}).listen(port, () => {
    console.log(`Server & Web Interface running on port ${port}`);
});

// --- أوامر البوت ---
bot.start((ctx) => {
    ctx.reply('مرحباً بك في بوت جولدن كوين (Node.js)!\nاضغط على الزر لربط واتساب بموقعك الجديد:', {
        reply_markup: {
            inline_keyboard: [[{ text: 'ربط واتساب 📱', callback_data: 'pair_wa' }]]
        }
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
    const state = ctx.session || {};
    if (state.step === 'wait_phone') {
        const phone = ctx.message.text.trim();
        
        if (!/^\d+$/.test(phone)) {
            return ctx.reply('❌ أرسل أرقاماً فقط بدون مسافات.');
        }

        await ctx.reply('⏳ جاري طلب كود الربط من موقعك الجديد...');

        try {
            // طلب الكود من موقعك الجديد مباشرة
            const response = await axios.get(`${PAIRING_API}?phone=${phone}`, { timeout: 15000 });
            
            if (response.data && response.data.code) {
                await ctx.reply(`✅ كود الربط: \`${response.data.code}\`\n🔐 كلمة السر: \`${SITE_PASSWORD}\``, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply('⚠️ السيرفر استجاب ولكن لم يرسل كوداً. تأكد من إعدادات الموقع.');
            }
        } catch (error) {
            console.error('API Error:', error.message);
            await ctx.reply('❌ فشل الاتصال بموقعك الجديد. تأكد أن الموقع يعمل وغير متوقف.');
        }
        ctx.session.step = null;
    }
});

bot.launch();
