import asyncio
import json
import logging
import re
import threading
import requests
from pathlib import Path
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from telegram.error import Conflict

# --- الإعدادات النهائية ---
# التوكن الجديد الذي أرسلته
BOT_TOKEN = "8631941557:AAHhHbgJa_BpU9avBYC-n3eKlQhzvuNNUJQ"
# رابط السيرفر الجديد
PAIRING_API_URL = "https://bot.goldenqueen.store/api/pairing"
# كلمة السر لإعدادات الموقع
SITE_PASSWORD = "GQ_ADMIN_2026"

# إعداد السجلات
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# مسارات الملفات
BASE_DIR = Path(__file__).resolve().parent
USERS_PATH = BASE_DIR / "bot_users.json"

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def load_json(path):
    if path.exists():
        try: return json.loads(path.read_text(encoding="utf-8"))
        except: return {}
    return {}

USERS = load_json(USERS_PATH)

# --- دالة البداية ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if user_id not in USERS:
        USERS[user_id] = {"joined": datetime.now().isoformat()}
        save_json(USERS_PATH, USERS)
    
    keyboard = [[InlineKeyboardButton("ربط واتساب 📱", callback_query_data="pair_wa")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "مرحباً بك في بوت Golden Queen.\nلربط رقمك بالواتساب اضغط على الزر أدناه:",
        reply_markup=reply_markup
    )

# --- معالجة الأزرار ---
async def handle_buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "pair_wa":
        await query.edit_message_text("📱 أرسل رقم هاتفك الآن مع مفتاح الدولة (مثال: 966500000000):")
        context.user_data["step"] = "wait_phone"

# --- معالجة الرسائل النصية ---
async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get("step")
    text = update.message.text.strip()

    if step == "wait_phone":
        if not re.match(r"^\d{10,15}$", text):
            await update.message.reply_text("❌ الرقم غير صحيح! أرسل أرقاماً فقط.")
            return
        
        await update.message.reply_text("⏳ جاري طلب كود الربط...")
        
        try:
            # طلب كود الربط من السيرفر
            response = requests.get(f"{PAIRING_API_URL}?phone={text}", timeout=30, verify=False)
            res_data = response.json()
            
            if "code" in res_data:
                pair_code = res_data["code"]
                bot_info = await context.bot.get_me()
                bot_link = f"https://t.me/{bot_info.username}"

                # 1. إرسال الكود للمستخدم
                await update.message.reply_text(
                    f"✅ كود الربط: `{pair_code}`\n\nأدخل الكود في واتساب > الأجهزة المرتبطة.",
                    parse_mode="Markdown"
                )
                
                # 2. إرسال كلمة السر فوراً
                await update.message.reply_text(
                    f"🎉 طلب الربط تم!\n🔐 كلمة سر الموقع: `{SITE_PASSWORD}`",
                    parse_mode="Markdown"
                )

                # 3. إرسال رابط البوت للرقم المربوط تلقائياً
                requests.post(f"https://bot.goldenqueen.store/api/send", json={
                    "phone": text,
                    "message": f"رابط البوت الخاص بك: {bot_link}"
                }, timeout=5)
                
            else:
                await update.message.reply_text("❌ فشل الحصول على الكود من السيرفر.")
        except:
            await update.message.reply_text("⚠️ حدث خطأ في الاتصال بالسيرفر.")
        
        context.user_data["step"] = None

# --- سيرفر لتفادي إغلاق Render للبوت (Health Check) ---
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot is Live")

def run_health_server():
    try:
        server = ThreadingHTTPServer(("0.0.0.0", 8080), HealthHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
    except: pass

# --- التشغيل ---
def main():
    run_health_server()
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    
    print("البوت يعمل الآن بالتوكن الجديد...")
    try:
        app.run_polling(drop_pending_updates=True)
    except Conflict:
        print("خطأ: التوكن مستخدم في مكان آخر!")

if __name__ == "__main__":
    main()
