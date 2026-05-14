const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = "https://whatsapp-pairing-api.onrender.com"; // رابط الـ API الخاص بك

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// واجهة الموقع
app.get('/', (req, res) => {
    res.send('<h1 style="text-align:center;">Bot is Running...</h1>');
});

// رسالة الترحيب والأزرار
bot.start((ctx) => {
    ctx.reply(`مرحباً بك في بوت الربط التلقائي 🤖\n\nأرسل رقمك الآن مع رمز الدولة (مثال: 967771163825) للحصول على كود الاقتران مباشرة.`,
        Markup.keyboard([
            ['ربط واتساب 📱', 'أرقامي المربوطة 📋'],
            ['تفاعل الحالات ✨', 'إدارة الرسائل ⚙️'],
            ['تحديث الاشتراك ✅', 'حذف جلسة 🗑️']
        ]).resize()
    );
});

// التعامل مع إرسال الرقم
bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    // التحقق إذا كان النص عبارة عن رقم هاتف (أرقام فقط وطول مناسب)
    if (/^\d{8,15}$/.test(text)) {
        const msg = await ctx.reply("⏳ جاري توليد كود الاقتران، يرجى الانتظار...");

        try {
            // طلب كود الاقتران من الـ API الخاص بك
            // ملاحظة: المسار /code و البرامتر number يعتمد على تصميم الـ API الخاص بك
            const response = await axios.get(`${API_URL}/code?number=${text}`);
            const pairingCode = response.data.code; 

            if (pairingCode) {
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, 
                    `✅ تم توليد كود الاقتران لرقمك: ${text}\n\nالكود هو: \`${pairingCode}\`\n\nقم بنسخ الكود وضعه في الواتساب (الأجهزة المرتبطة -> ربط باستخدام رقم الهاتف).`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                throw new Error("لم يتم إرجاع كود");
            }
        } catch (error) {
            console.error(error);
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, 
                "❌ عذراً، حدث خطأ أثناء الاتصال بسيرفر الاقتران. تأكد من أن الرقم صحيح أو حاول لاحقاً."
            );
        }
    } else if (text === 'ربط واتساب 📱') {
        ctx.reply("حسناً، أرسل رقم الهاتف الذي تريد ربطه الآن.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    bot.launch();
});
