async function startReactions(sock) {
    // هذا المعالج سيقوم بالمشاهدة والتفاعل معاً
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.key.remoteJid === 'status@broadcast') {
            
            // 1. المشاهدة التلقائية (Mark as Read)
            await sock.readMessages([msg.key]);
            console.log(`👀 تمت مشاهدة الحالة: ${msg.key.id}`);

            // 2. التأخير قبل التفاعل
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 3. التفاعل
            try {
                await sock.sendMessage(msg.key.participant, { 
                    react: { text: '❤️', key: msg.key } 
                }, { statusJidList: [msg.key.participant] });
                console.log(`✅ تم التفاعل مع الحالة: ${msg.key.id}`);
            } catch (err) {
                console.error(`❌ فشل التفاعل: ${err.message}`);
            }
        }
    });
}
