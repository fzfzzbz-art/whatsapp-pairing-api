const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    coins: { type: Number, default: 0 }, // رصيد النقاط
    linkedNumbers: [String], // الأرقام المرتبطة بهذا الحساب
});

module.exports = mongoose.model('User', UserSchema);
