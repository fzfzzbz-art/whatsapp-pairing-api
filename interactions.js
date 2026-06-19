"use strict";

// دوال مساعدة لضمان عمل الكود حتى لو لم يتم تمريرها من الخارج
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractStatusMessageInfo(msg, normalizeStatusParticipantJid, extractStatusParticipant, extractStatusMessageId) {
    const participant = normalizeStatusParticipantJid(
        (typeof extractStatusParticipant === 'function' ? extractStatusParticipant(msg) : '')
        || msg?.key?.participant
        || ''
    );
    const id = String(
        (typeof extractStatusMessageId === 'function' ? extractStatusMessageId(msg) : '')
        || msg?.key?.id
        || ''
    ).trim();
    return { id, participant };
}

function isStatusBroadcastMessage(msg, normalizeWhatsAppJid) {
    const remote = typeof normalizeWhatsAppJid === 'function'
        ? normalizeWhatsAppJid(msg?.key?.remoteJid || '')
        : String(msg?.key?.remoteJid || '').trim();
    return remote === 'status@broadcast';
}

async function sendStatusReactionWithFallbacks(ctx = {}) {
    const {
        sock,
        msg,
        emoji = '❤️', // تم تبسيط الإيموجي ليؤخذ مباشرة من المعامل
        sendOptions = { statusJidList: [msg?.key?.participant] }
    } = ctx;

    const reactionKey = {
        remoteJid: 'status@broadcast',
        id: msg?.key?.id,
        participant: msg?.key?.participant,
        fromMe: false
    };

    const attempts = [
        async () => {
            await sock.sendMessage('status@broadcast', { react: { text: emoji, key: reactionKey } }, sendOptions);
        },
        async () => {
            await sock.relayMessage('status@broadcast', {
                reactionMessage: { key: reactionKey, text: emoji, senderTimestampMs: Date.now() }
            }, { ...sendOptions, statusJidList: [msg?.key?.participant] });
        }
    ];

    for (const attempt of attempts) {
        try {
            await attempt();
            return true;
        } catch (e) { continue; }
    }
    return false;
}

async function handleStatusInteraction(ctx = {}) {
    const { sock, msg, phoneNumber } = ctx;
    
    try {
        const participant = msg?.key?.participant;
        const statusMessageId = msg?.key?.id;

        if (!statusMessageId || !participant) return false;

        // 1. قراءة الحالة
        await sock.readMessages([{
            remoteJid: 'status@broadcast',
            id: statusMessageId,
            participant: participant,
            fromMe: false
        }]);

        // 2. التفاعل
        await delay(2500); // تأخير الحماية
        return await sendStatusReactionWithFallbacks({
            sock,
            msg,
            emoji: '❤️'
        });
    } catch (error) {
        console.error(`[خطأ في التفاعل التلقائي ${phoneNumber}]:`, error.message);
        return false;
    }
}

module.exports = {
    isStatusBroadcastMessage,
    extractStatusMessageInfo,
    sendStatusReactionWithFallbacks,
    handleStatusInteraction,
    delay
};
