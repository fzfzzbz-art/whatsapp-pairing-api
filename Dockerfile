FROM node:20-slim

# تثبيت المتطلبات الأساسية
# libatomic1 هو الاسم الصحيح في Debian/Ubuntu (وليس libatomic)
RUN apt-get update && apt-get install -y \
    libatomic1 \
    python3 \
    make \
    g++ \
    git \
    curl \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# نسخ ملفات package أولاً للاستفادة من Docker layer cache
COPY package*.json ./

# تثبيت الحزم
RUN npm install --legacy-peer-deps

# نسخ باقي الملفات
COPY . .

# إنشاء مجلد الجلسات
RUN mkdir -p sessions

EXPOSE 8080

CMD ["node", "index.js"]
