const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// تقديم ملف الواجهة index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ملاحظة: العمليات الآن تتم مباشرة من المتصفح إلى رابط Golden Queen
// هذا السيرفر يعمل فقط كمضيف (Host) لموقعك

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`الموقع يعمل على المنفذ: ${PORT}`);
});
