'use strict';

// دالة مساعدة لتحويل الرقم إلى الصيغة المطلوبة
function normalizeBasicJid(jid = '') {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

// الدالة الأساسية لإرسال التفاعل بنظام التكرار والمحاولات
async function sendRobustStatusReaction({ sock, msg, emoji }) {
    if (!sock || !msg?.key?.id || !emoji) {
        return { ok: false, error: 'missing_input' };
    }

    const participant = msg.key.participant || msg.key.remoteJid;
    const key = {
        remoteJid: 'status@broadcast',
        id: msg.key.id,
        participant: participant,
        fromMe: false
    };

    try {
        // محاولة إرسال التفاعل (القلب الأحمر)
        await sock.sendMessage('status@broadcast', {
            react: {
                text: emoji,
                key: key
            }
        }, { statusJidList: [participant] });

        return { ok: true };
    } catch (error) {
        return { ok: false, error: error };
    }
}

module.exports = { sendRobustStatusReaction };
