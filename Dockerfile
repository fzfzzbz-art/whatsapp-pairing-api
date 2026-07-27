# استخدام بيئة بايثون الرسمية
FROM python:3.10-slim

# تثبيت Node.js وأدوات النظام اللازمة لخادم الاقتران الداخلي
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# تحديد مجلد العمل داخل السيرفر
WORKDIR /app

# نسخ ملفات المتطلبات وتثبيتها
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# نسخ باقي ملفات المشروع إلى السيرفر
COPY . .

# أمر تشغيل البوت
CMD ["python", "main.py"]
