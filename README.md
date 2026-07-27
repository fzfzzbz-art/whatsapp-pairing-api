# Telegram Bot — Fixed for Free Hosting

## ✅ ما الذي تم إصلاحه

المشكلة كانت: لما ترفع البوت على استضافة مجانية (Render / Railway / Koyeb / Hugging Face / إلخ)
الاستضافة **تقتل الـ worker** خلال ثوانٍ لأن البوت ما يربط HTTP port، ولا لأن
 الكود كان يحاول يشغّل خادم Node.js (companion) ما يتوفر في استضافات Python.

### التعديلات اللي صارت في `main.py`:

1. **سيرفر الصحة الآن يربط تلقائياً** على `8080` كـ fallback، يقرأ أكثر من متغير
   (`PORT`, `HTTP_PORT`, `APP_PORT`, إلخ)، وما يرجع `None` إذا ما لقى قيمة.
2. **خادم HTTP يدعم المسارات** اللي الاستضافات المجانية تستخدمها لفحص الصحة:
   `/`, `/healthz`, `/health`, `/ping`, `/alive`, `/keepalive`
3. **skip خادم Node.js المدمج** لما الاستضافة ما يكون عندها Node (أغلب الاستضافات
    المجانية Python-only). يتحول تلقائياً للـ Public Pairing API.
4. **بدون توقف عند فشل الـ companion** — لو ما اشتغل خادم Node.js يرجع للـ
   External Pairing API بدل ما يسكّر البوت.
5. **سوكت قابل لإعادة الاستخدام** (`allow_reuse_address = True`) عشان ما يعلق الـ
   bind بعد restart.
6. **fallback آمن على 8080** لو البورت الأصلي مشغول.

## 🚀 النشر على Render (أسرع طريقة مجانية)

### طريقة 1: بنقرة واحدة عبر render.yaml

1. ارفع كل محتويات هذا المجلد على GitHub repo جديد.
2. في Render اختر **New → Blueprint**، اختر الـ repo.
3. Render يقرأ `render.yaml` ويبني تلقائياً.
4. ادخل متغيرات البيئة في Dashboard (أو عدّلها في `render.yaml`).

### طريقة 2: يدوياً

1. **New → Web Service** → اختر الـ repo.
2. **Environment**: `Python`
3. **Build Command**: `pip install -r requirements.txt`
4. **Start Command**: `python main.py`
5. **Instance Type**: `Free`
6. اضف متغيرات البيئة من `.env.example`.

## 🚆 النشر على Railway

عنده `railway.json` جاهز. ارفع على GitHub ثم في Railway اختر
**New Project → Deploy from GitHub**.

## 🔑 متغيرات البيئة المهمة

| المتغير | الوصف | القيمة الموصى بها |
|---|---|---|
| `PORT` | البورت اللي الاستضافة تطلبه | `8080` |
| `DISABLE_EMBEDDED_COMPANION` | تعطيل خادم Node.js المدمج | `true` |
| `PYTHON_ONLY_HOSTING` | إشارة للاستضافة إنها Python فقط | `true` |
| `PAIR_CODE_API_URL` | API الاقتران العام | `https://bwt-lwts.onrender.com/api/pairing` |
| `BOT_TOKEN` | توكن بوت تليجرام | التوكن حقك |
| `ADMIN_ID` | ايدي المشرف | ايديك |

## 🛠️ التشغيل محلياً

```bash
pip install -r requirements.txt
cp .env.example .env
# عدّل القيم في .env
python main.py
```

## 💚 كيف تعرف البوت شغّال

بعد ما تستضيف، افتح:
`https://your-app.onrender.com/ping`

لازم يرد:
```json
{"status":"ok","service":"telegram-bot","uptime_seconds":...}
```

إذا شفت الرد هذا يعني البوت ما راح ينطرد.
بدل ما كان يرجع **404 Service Unavailable** ثم **SIGKILL**.

## 🧩 الملفات الموجودة في الحزمة

- `main.py` — البوت بعد التعديل (~ 6434 سطر)
- `requirements.txt` — المكتبات المطلوبة
- `render.yaml` — إعدادات Render
- `railway.json` — إعدادات Railway
- `Procfile` — لـ Heroku-like hosts
- `runtime.txt` — نسخة Python
- `.env.example` — مثال للمتغيرات
- `.gitignore`
