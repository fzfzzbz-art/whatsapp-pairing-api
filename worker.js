const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");

async function startLiker(sessionId) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        // التحقق مما إذا كانت الرسالة عبارة عن "حالة/ستوري"
        if (msg.key.remoteJid === 'status@broadcast') {
            const sender = msg.key.participant;
            
            try {
                // إرسال تفاعل (إعجاب) على الستوري
                await sock.sendMessage(msg.key.remoteJid, {
                    react: {
                        text: "❤️", 
                        key: msg.key
                    }
                }, { statusJidList: [sender] });
                
                console.log(`تم التفاعل مع ستوري: ${sender}`);
            } catch (err) {
                console.error("خطأ في التفاعل:", err);
            }
        }
    });
}
