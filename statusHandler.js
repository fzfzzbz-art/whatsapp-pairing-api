module.exports = async (sock, msg) => {
    // التأكد من أن الرسالة هي حالة
    if (msg.key.remoteJid !== 'status@broadcast') return;

    // تحسين تحديد المشارك (صاحب الحالة)
    const participant = msg.key.participant || msg.participant;
    if (!participant) {
        console.log("تعذر تحديد صاحب الحالة، قد تكون حالة خاصة.");
    }

    try {
        // 1. المشاهدة - (نقلنا التأخير قبل المشاهدة لضمان استقرار واتساب)
        await new Promise(resolve => setTimeout(resolve, 2000));
        await sock.readMessages([msg.key]);
        console.log("تمت المشاهدة");

        // 2. الإعجاب
        if (participant) {
            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '💙', key: msg.key }
            }, { statusJidList: [participant] });
            console.log("تم الإعجاب");
        }
    } catch (err) {
        console.error("خطأ في معالجة الحالة:", err);
    }
};
