'use strict';

function normalizeBasicJid(jid = '') {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

function normalizeDigits(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function uniq(list = []) {
    return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
}

function isDirectUserJid(jid = '') {
    const normalized = normalizeBasicJid(jid);
    return normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@lid');
}

function pushUniqueTarget(set, value) {
    const normalized = normalizeBasicJid(value);
    if (!normalized || normalized === 'status@broadcast' || normalized.endsWith('@g.us') || normalized.includes('@newsletter')) {
        return;
    }

    if (isDirectUserJid(normalized)) {
        set.add(normalized);
        return;
    }

    const phone = normalizeDigits(normalized);
    if (phone) {
        set.add(`${phone}@s.whatsapp.net`);
    }
}

function expandDirectTargets(candidates = []) {
    const directTargets = new Set();

    for (const value of Array.isArray(candidates) ? candidates : [candidates]) {
        pushUniqueTarget(directTargets, value);
    }

    return Array.from(directTargets);
}

function buildStatusJidListVariants(targets = []) {
    const normalizedTargets = uniq(targets.map(normalizeBasicJid).filter(isDirectUserJid));
    const pnTargets = normalizedTargets.filter((item) => item.endsWith('@s.whatsapp.net'));
    const lidTargets = normalizedTargets.filter((item) => item.endsWith('@lid'));

    const variants = [];
    const push = (items = []) => {
        const normalized = uniq(items.map(normalizeBasicJid).filter(isDirectUserJid));
        if (!normalized.length) return;
        const key = normalized.join('|');
        if (!variants.some((variant) => variant.__key === key)) {
            variants.push({ __key: key, value: normalized });
        }
    };

    for (const item of normalizedTargets) push([item]);
    if (pnTargets.length) push(pnTargets);
    if (lidTargets.length) push(lidTargets);
    push(normalizedTargets);

    return variants.map((variant) => variant.value);
}

function buildReactionKeyVariants(msg, targets = []) {
    const baseId = String(msg?.key?.id || '').trim();
    if (!baseId) return [];

    const variants = [];
    const seen = new Set();
    const push = (key) => {
        if (!key?.id) return;
        const normalized = {
            ...(msg?.key || {}),
            ...(key || {}),
            id: String(key.id || baseId).trim(),
            remoteJid: normalizeBasicJid(key.remoteJid || 'status@broadcast') || 'status@broadcast',
            participant: normalizeBasicJid(key.participant || ''),
            fromMe: false
        };
        const signature = `${normalized.id}|${normalized.remoteJid}|${normalized.participant || ''}`;
        if (seen.has(signature)) return;
        seen.add(signature);
        variants.push(normalized);
    };

    push({ ...(msg?.key || {}), id: baseId, remoteJid: msg?.key?.remoteJid || 'status@broadcast', participant: msg?.key?.participant || msg?.participant });
    push({ ...(msg?.key || {}), id: baseId, remoteJid: 'status@broadcast', participant: msg?.key?.participant || msg?.participant });

    for (const participant of uniq(targets.map(normalizeBasicJid).filter(Boolean))) {
        push({ ...(msg?.key || {}), id: baseId, remoteJid: 'status@broadcast', participant });
        push({ ...(msg?.key || {}), id: baseId, remoteJid: msg?.key?.remoteJid || 'status@broadcast', participant });
    }

    return variants.filter((item) => item.id);
}

async function tryReadStatus(sock, keyVariants = []) {
    if (!sock || typeof sock.readMessages !== 'function') return;
    for (const key of keyVariants) {
        try {
            await sock.readMessages([key]);
            return;
        } catch (_) {}
    }
}

async function sendRobustStatusReaction({ sock, msg, emoji, candidates = [], delayFn = null }) {
    if (!sock || !msg?.key?.id || !String(emoji || '').trim()) {
        return { ok: false, error: 'missing_input' };
    }

    const emojiText = String(emoji || '').trim();
    const targets = expandDirectTargets(candidates);
    const keyVariants = buildReactionKeyVariants(msg, [msg?.key?.participant, msg?.participant, ...targets]);
    if (!keyVariants.length) {
        return { ok: false, error: 'missing_targets' };
    }

    const jidListVariants = buildStatusJidListVariants(targets.length ? targets : [msg?.key?.participant, msg?.participant]);
    const optionVariants = [];
    const seenOptions = new Set();
    const pushOptions = (options = {}) => {
        const normalized = {
            ...(options || {})
        };
        if (Array.isArray(normalized.statusJidList)) {
            normalized.statusJidList = uniq(normalized.statusJidList.map(normalizeBasicJid).filter(isDirectUserJid));
            if (!normalized.statusJidList.length) delete normalized.statusJidList;
        }
        const signature = JSON.stringify(normalized);
        if (seenOptions.has(signature)) return;
        seenOptions.add(signature);
        optionVariants.push(normalized);
    };

    for (const jidList of jidListVariants) {
        pushOptions({ broadcast: true, statusJidList: jidList });
        pushOptions({ statusJidList: jidList });
    }
    pushOptions({ broadcast: true });
    pushOptions({});

    const attempts = [];

    for (const key of keyVariants) {
        for (const options of optionVariants) {
            attempts.push({
                mode: 'status-broadcast',
                participant: key.participant || msg?.key?.participant || msg?.participant || '',
                options,
                keyVariants: [key],
                send: async () => sock.sendMessage('status@broadcast', { react: { text: emojiText, key } }, options)
            });
        }
    }

    for (const key of keyVariants.filter((item) => isDirectUserJid(item.participant))) {
        attempts.push({
            mode: 'direct-chat',
            participant: key.participant,
            options: {},
            keyVariants: [key],
            send: async () => sock.sendMessage(key.participant, { react: { text: emojiText, key } })
        });
    }

    let lastError = null;
    for (const attempt of attempts) {
        try {
            if (typeof delayFn === 'function') {
                await delayFn(150);
            }
            await attempt.send();
            await tryReadStatus(sock, attempt.keyVariants);
            return {
                ok: true,
                mode: attempt.mode,
                participant: attempt.participant,
                options: attempt.options
            };
        } catch (error) {
            lastError = error;
        }
    }

    return {
        ok: false,
        error: lastError || new Error('status_reaction_failed')
    };
}

module.exports = {
    expandDirectTargets,
    buildStatusJidListVariants,
    buildReactionKeyVariants,
    sendRobustStatusReaction
};
