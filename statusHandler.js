// statusHandler.js
module.exports = async (sock, msg) => {
    if (msg.key.remoteJid === 'status@broadcast') {
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                react: {
                    text: '❤️',
                    key: msg.key
                }
            }, { statusJidList: [msg.key.participant] });
            console.log('تم التفاعل مع الحالة بنجاح');
        } catch (err) {
            console.error('خطأ في وضع الإيموجي:', err);
        }
    }
};
