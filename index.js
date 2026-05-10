const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios'); // أضفنا مكتبة axios لجلب البيانات

const app = express();
app.use(cors());
app.use(express.json());

// عرض الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// المسار الوسيط لجلب الكود من السيرفر الخارجي
app.get('/api/get-code', async (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: "الرقم مطلوب" });

    try {
        // الطلب يذهب من سيرفرك إلى سيرفر جولدن كوين
        const response = await axios.get(`https://bot.goldenqueen.store/api/pairing?phone=${phone}`);
        
        // إرسال النتيجة كما هي لموقعك
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching from API:", error.message);
        res.status(500).json({ error: "فشل السيرفر الخارجي في الاستجابة" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
