const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// قراءة التوكن من متغيرات البيئة
const BOT_TOKEN = process.env.BOT_TOKEN; 

if (!BOT_TOKEN) {
    console.error("خطأ: لم يتم العثور على BOT_TOKEN في متغيرات البيئة!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// واجهة الموقع
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>WhatsApp Pairing System</title></head>
            <body style="font-family: Arial; text-align: center; padding-top: 50px; background-color: #f4f4f9;">
                <h1 style="color: #2c3e50;">نظام ربط الواتساب - Golden Queen</h1>
                <p>البوت يعمل الآن ومستعد لاستقبال طلبات الاقتران عبر التلجرام.</p>
                <div style="margin-top: 20px; color: #27ae60; font-weight: bold;">● الحالة: متصل الآن</div>
            </body>
        </html>
    `);
});

bot.start((ctx) => {
    ctx.reply(`مرحباً بك في بوت الربط التلقائي 🤖\n\nيمكنك الآن ربط رقمك بالضغط على الزر أدناه للحصول على كود الاقتران.`,
        Markup.inlineKeyboard([
            [Markup.button.url('إبدأ الاقتران الآن', 'https://whatsapp-pairing-api.onrender.com')]
        ])
    );
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    bot.launch().catch(err => console.error("فشل تشغيل البوت:", err));
});
