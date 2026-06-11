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

function expandDirectTargets(candidates = []) {
    const directTargets = new Set();

    for (const value of Array.isArray(candidates) ? candidates : [candidates]) {
        const normalized = normalizeBasicJid(value);
        if (!normalized || normalized === 'status@broadcast' || normalized.endsWith('@g.us') || normalized.includes('@newsletter')) {
            continue;
        }

        if (normalized.endsWith('@s.whatsapp.net')) {
            directTargets.add(normalized);
            const phone = normalizeDigits(normalized);
            if (phone) directTargets.add(`${phone}@lid`);
            continue;
        }

        if (normalized.endsWith('@lid')) {
            directTargets.add(normalized);
            const phone = normalizeDigits(normalized);
            if (phone) directTargets.add(`${phone}@s.whatsapp.net`);
            continue;
        }

        const phone = normalizeDigits(normalized);
        if (phone) {
            directTargets.add(`${phone}@s.whatsapp.net`);
            directTargets.add(`${phone}@lid`);
        }
    }

    return Array.from(directTargets);
}

function buildStatusJidListVariants(targets = []) {
    const normalizedTargets = uniq(targets.map(normalizeBasicJid));
    const pnTargets = normalizedTargets.filter((item) => item.endsWith('@s.whatsapp.net'));
    const lidTargets = normalizedTargets.filter((item) => item.endsWith('@lid'));

    const variants = [];
    const push = (items = []) => {
        const normalized = uniq(items.map(normalizeBasicJid));
        if (!normalized.length) return;
        const key = normalized.join('|');
        if (!variants.some((variant) => variant.__key === key)) {
            variants.push({ __key: key, value: normalized });
        }
    };

    for (const item of pnTargets) push([item]);
    for (const item of lidTargets) push([item]);
    for (const item of normalizedTargets) push([item]);
    push(pnTargets);
    push(lidTargets);
    push(normalizedTargets);

    return variants.map((variant) => variant.value);
}

function buildReactionKeyVariants(msg, targets = []) {
    const baseId = String(msg?.key?.id || '').trim();
    if (!baseId) return [];

    return uniq(targets).map((participant) => ({
        ...(msg?.key || {}),
        id: baseId,
        remoteJid: 'status@broadcast',
        participant: normalizeBasicJid(participant),
        fromMe: false
    })).filter((item) => item.id && item.participant);
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

    const targets = expandDirectTargets(candidates);
    const keyVariants = buildReactionKeyVariants(msg, targets);
    if (!keyVariants.length) {
        return { ok: false, error: 'missing_targets' };
    }

    const jidListVariants = buildStatusJidListVariants(targets);
    const optionVariants = [];
    const seenOptions = new Set();
    const pushOptions = (options = {}) => {
        const normalized = {
            ...(options || {})
        };
        if (Array.isArray(normalized.statusJidList)) {
            normalized.statusJidList = uniq(normalized.statusJidList.map(normalizeBasicJid));
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
                participant: key.participant,
                send: async () => sock.sendMessage('status@broadcast', { react: { text: emoji, key } }, options),
                keyVariants: [key]
            });
        }
    }

    for (const key of keyVariants) {
        attempts.push({
            mode: 'direct-chat',
            participant: key.participant,
            send: async () => sock.sendMessage(key.participant, { react: { text: emoji, key } }),
            keyVariants: [key]
        });
    }

    let lastError = null;
    for (const attempt of attempts) {
        try {
            if (typeof delayFn === 'function') {
                await delayFn(120);
            }
            await attempt.send();
            await tryReadStatus(sock, attempt.keyVariants);
            return {
                ok: true,
                mode: attempt.mode,
                participant: attempt.participant
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
