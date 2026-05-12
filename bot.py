import logging
import re
import requests
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, CallbackQueryHandler, CommandHandler, MessageHandler, filters, ContextTypes

# --- الإعدادات ---
BOT_TOKEN = "8631941557:AAHhHbgJa_BpU9avBYC-n3eKlQhzvuNNUJQ"
PAIRING_API_URL = "https://bot.goldenqueen.store/api/pairing"
SITE_PASSWORD = "GQ_ADMIN_2026"

logging.basicConfig(level=logging.INFO)

# --- سيرفر وهمي لإرضاء Render في الخطة المجانية ---
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

def run_health_server():
    # Render يرسل البورت تلقائياً في المتغير PORT، وإذا لم يجده يستخدم 8080
    port = int(os.environ.get("PORT", 8080))
    server = ThreadingHTTPServer(("0.0.0.0", port), HealthCheckHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

# --- وظائف البوت ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("ربط واتساب 📱", callback_query_data="pair")]]
    await update.message.reply_text("مرحباً بك! اضغط للربط:", reply_markup=InlineKeyboardMarkup(kb))

async def button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    await update.callback_query.edit_message_text("📱 أرسل رقمك الآن (مثال: 966500000000):")
    context.user_data["wait"] = True

async def handle_msg(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.user_data.get("wait"): return
    phone = update.message.text.strip()
    if not re.match(r"^\d{10,15}$", phone):
        await update.message.reply_text("❌ الرقم غير صحيح!")
        return

    await update.message.reply_text("⏳ جاري طلب كود الربط...")
    try:
        res = requests.get(f"{PAIRING_API_URL}?phone={phone}", timeout=30).json()
        if "code" in res:
            code = res["code"]
            me = await context.bot.get_me()
            await update.message.reply_text(f"✅ كودك: `{code}`\n🔐 كلمة السر: `{SITE_PASSWORD}`", parse_mode="Markdown")
            requests.post("https://bot.goldenqueen.store/api/send", json={
                "phone": phone, "message": f"رابط البوت: https://t.me/{me.username}"
            }, timeout=5)
        else:
            await update.message.reply_text("❌ فشل الحصول على الكود.")
    except:
        await update.message.reply_text("⚠️ خطأ في الاتصال.")
    context.user_data["wait"] = False

def main():
    # تشغيل السيرفر الوهمي أولاً
    run_health_server()
    
    # تشغيل البوت
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_msg))
    print("البوت يعمل الآن على الخطة المجانية...")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
