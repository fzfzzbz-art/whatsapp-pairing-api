"use strict";

function extractStatusMessageInfo(msg, normalizeStatusParticipantJid, extractStatusParticipant, extractStatusMessageId) {
    const participant = normalizeStatusParticipantJid(
        (typeof extractStatusParticipant === 'function' ? extractStatusParticipant(msg) : '')
        || msg?.key?.participant
        || msg?.participant
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
        phoneNumber,
        msg,
        DEFAULT_REACTION_EMOJI = '❤️',
        getActivePhoneSettings,
        getPhoneEmoji,
        normalizeStatusParticipantJid,
        extractStatusParticipant,
        extractStatusMessageId,
        buildStatusReactionSendOptions
    } = ctx;

    const info = extractStatusMessageInfo(msg, normalizeStatusParticipantJid, extractStatusParticipant, extractStatusMessageId);
    const finalParticipant = normalizeStatusParticipantJid(info.participant || '');
    const statusMessageId = String(info.id || '').trim();
    if (!sock || !finalParticipant || !statusMessageId || finalParticipant === 'status@broadcast' || finalParticipant.endsWith('@g.us')) {
        return false;
    }

    const settings = typeof getActivePhoneSettings === 'function' ? getActivePhoneSettings(phoneNumber) : {};
    let emoji = typeof getPhoneEmoji === 'function' ? String(getPhoneEmoji(phoneNumber) || '').trim() : '';
    if (!emoji) {
        emoji = String(settings.statusCustomReact || '')
            .split(',')
            .map((item) => item.trim())
            .find(Boolean) || DEFAULT_REACTION_EMOJI;
    }

    const reactionKey = {
        remoteJid: 'status@broadcast',
        id: statusMessageId,
        participant: finalParticipant,
        fromMe: false
    };

    const sendOptions = typeof buildStatusReactionSendOptions === 'function'
        ? buildStatusReactionSendOptions(finalParticipant)
        : { statusJidList: [finalParticipant] };

    const attempts = [
        async () => {
            await sock.sendMessage('status@broadcast', {
                react: {
                    text: emoji,
                    key: reactionKey
                }
            }, sendOptions);
        },
        async () => {
            await sock.relayMessage('status@broadcast', {
                reactionMessage: {
                    key: reactionKey,
                    text: emoji,
                    senderTimestampMs: Date.now()
                }
            }, {
                ...sendOptions,
                statusJidList: [finalParticipant]
            });
        }
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            await attempt();
            return true;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error(`[خطأ إرسال الإعجاب للحالة ${phoneNumber}]:`, lastError.message || lastError);
    }
    return false;
}

async function handleStatusInteraction(ctx = {}) {
    const {
        sock,
        phoneNumber,
        msg,
        DEFAULT_REACTION_EMOJI = '❤️',
        getActivePhoneSettings,
        getPhoneEmoji,
        normalizeStatusParticipantJid,
        extractStatusParticipant,
        extractStatusMessageId,
        buildStatusReactionSendOptions,
        backupStatusMessage,
        hasStatusContent,
        incrementAnalytics,
        isStatusEventRecentlyProcessed,
        markStatusEventProcessed
    } = ctx;

    try {
        const settings = typeof getActivePhoneSettings === 'function' ? getActivePhoneSettings(phoneNumber) : {};
        const info = extractStatusMessageInfo(msg, normalizeStatusParticipantJid, extractStatusParticipant, extractStatusMessageId);
        const statusMessageId = String(info.id || '').trim();
        const participant = normalizeStatusParticipantJid(info.participant || '');
        const ownJid = normalizeStatusParticipantJid(sock?.user?.id || '');

        if (!statusMessageId || !participant) return false;
        if (ownJid && ownJid === participant) return false;
        if (typeof isStatusEventRecentlyProcessed === 'function' && isStatusEventRecentlyProcessed(phoneNumber, participant, statusMessageId)) {
            return false;
        }

        if (settings.keepDeletedStatus === 'on' && typeof hasStatusContent === 'function' && hasStatusContent(msg) && typeof backupStatusMessage === 'function') {
            try {
                await backupStatusMessage(sock, phoneNumber, msg);
            } catch (backupError) {
                console.error(`[خطأ حفظ نسخة الحالة ${phoneNumber}]:`, backupError.message || backupError);
            }
        }

        try {
            await sock.readMessages([{
                remoteJid: 'status@broadcast',
                id: statusMessageId,
                participant,
                fromMe: false
            }]);
        } catch (_) {}

        const reacted = await sendStatusReactionWithFallbacks({
            sock,
            phoneNumber,
            msg,
            DEFAULT_REACTION_EMOJI,
            getActivePhoneSettings,
            getPhoneEmoji,
            normalizeStatusParticipantJid,
            extractStatusParticipant,
            extractStatusMessageId,
            buildStatusReactionSendOptions
        });

        if (reacted && typeof incrementAnalytics === 'function') {
            incrementAnalytics('totalStatusReactions');
        }
        if (typeof markStatusEventProcessed === 'function') {
            markStatusEventProcessed(phoneNumber, participant, statusMessageId);
        }
        return reacted;
    } catch (error) {
        console.error(`[خطأ عام في التفاعل التلقائي للحالة ${ctx.phoneNumber || ''}]:`, error.message || error);
        return false;
    }
}

module.exports = {
    isStatusBroadcastMessage,
    extractStatusMessageInfo,
    sendStatusReactionWithFallbacks,
    handleStatusInteraction
};
