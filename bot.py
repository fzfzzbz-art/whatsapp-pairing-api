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

# --- الإعدادات المطلوبة ---
BOT_TOKEN = "8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I"
PAIRING_API_URL = "https://bot.goldenqueen.store/api/pairing"
SITE_PASSWORD = "GQ_ADMIN_2026"  # كلمة السر التي ستصل للمستخدم تلقائياً

# مسارات ملفات البيانات
BASE_DIR = Path(__file__).resolve().parent
USERS_PATH = BASE_DIR / "bot_users.json"

# إعداد السجلات (Logging)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def load_json(path):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except:
            return {}
    return {}

USERS = load_json(USERS_PATH)

# --- دالة الترحيب /start ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if user_id not in USERS:
        USERS[user_id] = {"joined": datetime.now().isoformat()}
        save_json(USERS_PATH, USERS)
    
    keyboard = [[InlineKeyboardButton("ربط واتساب 📱", callback_query_data="pair_wa")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "👋 مرحباً بك في بوت Golden Queen المطور.\n\n"
        "هذا البوت يتيح لك ربط رقمك بالواتساب بسهولة.\n"
        "اضغط على الزر أدناه للبدء:",
        reply_markup=reply_markup
    )

# --- معالجة الأزرار ---
async def handle_buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "pair_wa":
        await query.edit_message_text("📱 من فضلك أرسل رقم هاتفك الآن مع مفتاح الدولة\nمثال: `966500000000`", parse_mode="Markdown")
        context.user_data["step"] = "wait_phone"

# --- معالجة الرسائل النصية والربط ---
async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get("step")
    user_id = str(update.effective_user.id)
    text = update.message.text.strip()

    if step == "wait_phone":
        # التحقق من أن المدخل أرقام فقط وطولها منطقي
        if not re.match(r"^\d{10,15}$", text):
            await update.message.reply_text("❌ الرقم غير صحيح! أرسل الرقم كأرقام فقط بدون أصفار دولية أو علامة +")
            return
        
        await update.message.reply_text("⏳ جاري الاتصال بالسيرفر لطلب كود الربط...")
        
        try:
            # طلب كود الربط من API
            response = requests.get(f"{PAIRING_API_URL}?phone={text}", timeout=30, verify=False)
            res_data = response.json()
            
            if "code" in res_data:
                pair_code = res_data["code"]
                bot_info = await context.bot.get_me()
                bot_link = f"https://t.me/{bot_info.username}"

                # 1. إرسال الكود للمستخدم في التليجرام
                await update.message.reply_text(
                    f"✅ كود الربط الخاص بك هو: `{pair_code}`\n\n"
                    "خطوات الربط:\n"
                    "1️⃣ افتح الواتساب في هاتفك.\n"
                    "2️⃣ اختر (الأجهزة المرتبطة).\n"
                    "3️⃣ اختر (ربط هاتف برقم الهاتف).\n"
                    "4️⃣ أدخل الكود المذكور أعلاه.",
                    parse_mode="Markdown"
                )
                
                # 2. إرسال رسالة النجاح التلقائية للمستخدم في التليجرام
                success_msg = (
                    "🎉 تم استلام طلب الربط بنجاح!\n\n"
                    f"🔐 كلمة سر إعدادات الموقع الخاصة بك هي:\n`{SITE_PASSWORD}`\n\n"
                    "سيتم تفعيل الخدمة على رقمك فور إدخال الكود في الواتساب."
                )
                await update.message.reply_text(success_msg, parse_mode="Markdown")

                # 3. إرسال رابط البوت إلى الرقم المربوط (واتساب)
                # ملاحظة: هذا الطلب يفترض أن السيرفر يدعم إرسال رسالة ترحيبية للرقم
                try:
                    requests.post(f"https://bot.goldenqueen.store/api/send", json={
                        "phone": text,
                        "message": f"تم ربط رقمك بنجاح في بوت جولدن كوين\nرابط البوت: {bot_link}"
                    }, timeout=5)
                except:
                    pass # تخطي في حال لم يكن السيرفر مهيأ للإرسال الفوري
                
            else:
                await update.message.reply_text("❌ فشل الحصول على الكود. ربما الرقم مربوط مسبقاً أو السيرفر لا يستجيب.")
        
        except Exception as e:
            logger.error(f"Error: {e}")
            await update.message.reply_text("⚠️ حدث خطأ فني أثناء الاتصال بالسيرفر. حاول مرة أخرى لاحقاً.")
        
        context.user_data["step"] = None

# --- سيرفر لفحص الحالة (لمنع توقف البوت في الاستضافات) ---
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Golden Queen Bot is Running...")

def run_health_server():
    server = ThreadingHTTPServer(("0.0.0.0", 8080), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

# --- تشغيل البوت الأساسي ---
def main():
    # تشغيل سيرفر الـ Health Check
    run_health_server()
    
    # بناء تطبيق البوت
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    
    # إضافة المعالجات
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    
    print("--- البوت بدأ العمل الآن بنجاح ---")
    
    try:
        app.run_polling(drop_pending_updates=True)
    except Conflict:
        print("❌ خطأ: التوكن يعمل في مكان آخر. تأكد من إغلاق أي نسخة قديمة.")

if __name__ == "__main__":
    main()
