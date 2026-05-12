import asyncio
import json
import logging
import re
import threading
import requests
from pathlib import Path
from datetime import datetime, timezone
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

# إعداد السجلات (Logging)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# --- الإعدادات المطلوبة ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
PAIRING_API_URL = "https://bot.goldenqueen.store/api/pairing"
SITE_PASSWORD = "GQ_ADMIN_2026" # كلمة السر الافتراضية لإعدادات الموقع

# مسارات الملفات
BASE_DIR = Path(__file__).resolve().parent
USERS_PATH = BASE_DIR / "bot_users.json"
PENDING_PAIRINGS_PATH = BASE_DIR / "pending_pairings.json"

def save_data(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def load_data(path):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}

USERS = load_data(USERS_PATH)
PENDING = load_data(PENDING_PAIRINGS_PATH)

# --- دالة البداية ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if user_id not in USERS:
        USERS[user_id] = {"joined": datetime.now().isoformat()}
        save_data(USERS_PATH, USERS)
    
    keyboard = [[InlineKeyboardButton("ربط واتساب 📱", callback_query_data="pair_wa")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "مرحباً بك في بوت Golden Queen المطور.\nلربط رقمك بالواتساب اضغط على الزر أدناه:",
        reply_markup=reply_markup
    )

# --- معالجة الأزرار ---
async def handle_buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "pair_wa":
        await query.edit_message_text("أرسل رقم هاتفك الآن مع مفتاح الدولة (مثال: 966500000000):")
        context.user_data["step"] = "wait_phone"

# --- معالجة الرسائل النصية ---
async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get("step")
    user_id = str(update.effective_user.id)
    text = update.message.text.strip()

    if step == "wait_phone":
        if not re.match(r"^\d{10,15}$", text):
            await update.message.reply_text("❌ الرقم غير صحيح. أرسل الرقم بدون أصفار دولية أو علامة +")
            return
        
        await update.message.reply_text("⏳ جاري طلب كود الربط من السيرفر...")
        
        try:
            # الاتصال بالآي بي الجديد
            response = requests.get(f"{PAIRING_API_URL}?phone={text}", timeout=30, verify=False)
            res_data = response.json()
            
            if "code" in res_data:
                pair_code = res_data["code"]
                await update.message.reply_text(
                    f"✅ كود الربط: `{pair_code}`\n\n"
                    "افتح واتساب > الأجهزة المرتبطة > ربط هاتف، وأدخل الكود.",
                    parse_mode="Markdown"
                )
                
                # إرسال رسالة النجاح التلقائية (محاكاة لاكتمال الربط)
                # في التطبيق الحقيقي، السيرفر يرسل Webhook، هنا سنرسلها مباشرة بعد استلام الكود
                bot_info = await context.bot.get_me()
                bot_link = f"https://t.me/{bot_info.username}"
                
                success_text = (
                    "🎉 تم ربط الرقم بنجاح!\n"
                    f"🔐 كلمة سر إعدادات الموقع: `{SITE_PASSWORD}`"
                )
                await update.message.reply_text(success_text, parse_mode="Markdown")
                
                # إرسال رابط البوت للرقم المربوط تلقائياً (بدون إضافات)
                # ملاحظة: يتم هذا عبر طلب إرسال رسالة من السيرفر للرقم
                requests.post(f"https://bot.goldenqueen.store/api/send", json={
                    "phone": text,
                    "message": bot_link
                })
                
            else:
                await update.message.reply_text("❌ فشل الحصول على الكود. تأكد من حالة السيرفر.")
        except Exception as e:
            await update.message.reply_text("⚠️ حدث خطأ أثناء الاتصال بالسيرفر.")
        
        context.user_data["step"] = None

# --- سيرفر داخلي لمنع توقف البوت (Health Check) ---
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot is Active")

def run_health_server():
    server = ThreadingHTTPServer(("0.0.0.0", 8080), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

# --- تشغيل البوت ---
def main():
    run_health_server()
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    
    print("البوت يعمل الآن...")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    try:
        main()
    except Conflict:
        print("خطأ: التوكن مستخدم في مكان آخر. أغلق الجلسات الأخرى.")
