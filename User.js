const mongoose = require('mongoose');

/**
 * تعريف هيكل بيانات المستخدم (User Schema)
 * هذا الملف يتحكم في كيفية تخزين بيانات المستخدمين ورصيدهم في MongoDB
 */
const UserSchema = new mongoose.Schema({
    // معرف المستخدم على تلجرام (فريد لكل مستخدم)
    telegramId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    
    // اسم المستخدم (اختياري، للمتابعة)
    username: { 
        type: String, 
        default: 'Guest' 
    },

    // رصيد النقاط (العملات)
    coins: { 
        type: Number, 
        default: 0 // يبدأ بـ 0 إلا إذا أردت إعطاء نقاط ترحيبية
    },

    // مصفوفة تحتوي على أرقام الواتساب التي ربطها هذا المستخدم
    // نستخدمها لزيادة نقاطه عندما تتفاعل أرقامه مع القنوات
    linkedNumbers: { 
        type: [String], 
        default: [] 
    },

    // تاريخ آخر مرة استلم فيها الهدية اليومية
    // نستخدمه للتحقق مما إذا كان قد مضى 24 ساعة أو تغير اليوم
    lastDailyGift: { 
        type: Date, 
        default: null 
    },

    // تاريخ إنشاء الحساب
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// تصدير الموديل لاستخدامه في index.js و worker.js
module.exports = mongoose.model('User', UserSchema);
