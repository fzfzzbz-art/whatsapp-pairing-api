module.exports = async (sock, msg) => {
    // التأكد من أن الرسالة هي حالة (Status)
    if (msg.key.remoteJid === 'status@broadcast') {
        const participant = msg.key.participant || msg.participant;
        
        // 1. إرسال إشعار القراءة (Read Status) - هذا ضروري ليظهر البوت كمشاهد
        await sock.readMessages([msg.key]);

        // 2. تأخير بسيط (Delay) لضمان تسجيل المشاهدة قبل التفاعل
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. وضع الإعجاب (Reaction)
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                react: {
                    text: '💤',
                    key: msg.key
                }
            }, { statusJidList: [participant] });
            console.log('تمت المشاهدة ووضع الإعجاب بنجاح');
        } catch (err) {
            console.error('فشل في وضع الإعجاب:', err);
        }
    }
};
