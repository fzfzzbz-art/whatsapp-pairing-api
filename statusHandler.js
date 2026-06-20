'use strict';

const { markStatusAsViewed, resolveStatusContext, normalizeStatusParticipantJid } = require('./statusView');
const { sendStatusReaction } = require('./statusReact');

const processedEvents = new Map();
const DEFAULT_DEDUPE_TTL_MS = 30000;

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLogPayload(message, attributes = {}) {
  return JSON.stringify({
    message,
    severity: 'info',
    attributes: {
      level: 'info',
      timestamp: new Date().toISOString(),
      ...attributes
    }
  });
}

function info(logger, message, attributes = {}) {
  const payload = buildLogPayload(message, attributes);
  if (logger && typeof logger.info === 'function') {
    logger.info(payload);
    return;
  }
  console.log(payload);
}

function warn(logger, message, attributes = {}) {
  const payload = buildLogPayload(message, attributes);
  if (logger && typeof logger.warn === 'function') {
    logger.warn(payload);
    return;
  }
  console.warn(payload);
}

function buildDedupeKey(phoneNumber, participant, messageId) {
  const phone = normalizePhone(phoneNumber);
  const owner = normalizeStatusParticipantJid(participant) || 'unknown';
  const id = String(messageId || '').trim();
  if (!id) return '';
  return `${phone}::${owner}::${id}`;
}

function pruneProcessedEvents() {
  const now = Date.now();
  for (const [key, expiresAt] of processedEvents.entries()) {
    if (Number(expiresAt || 0) <= now) processedEvents.delete(key);
  }
}

function hasRecentlyProcessed(phoneNumber, participant, messageId) {
  pruneProcessedEvents();
  const key = buildDedupeKey(phoneNumber, participant, messageId);
  if (!key) return false;
  const expiresAt = Number(processedEvents.get(key) || 0);
  if (!expiresAt || expiresAt <= Date.now()) {
    processedEvents.delete(key);
    return false;
  }
  return true;
}

function markProcessed(phoneNumber, participant, messageId, ttlMs = DEFAULT_DEDUPE_TTL_MS) {
  const key = buildDedupeKey(phoneNumber, participant, messageId);
  if (!key) return false;
  processedEvents.set(key, Date.now() + Math.max(1000, Number(ttlMs) || DEFAULT_DEDUPE_TTL_MS));
  return true;
}

function resolveSettings(context = {}) {
  if (typeof context.getSettings === 'function') {
    try {
      const settings = context.getSettings();
      if (settings && typeof settings === 'object') return settings;
    } catch (_) {}
  }
  return context.settings && typeof context.settings === 'object' ? context.settings : {};
}

async function safeBackup(context, sock, phoneNumber, msg) {
  if (typeof context.backupStatus !== 'function') return;
  try {
    await context.backupStatus(sock, phoneNumber, msg);
  } catch (error) {
    const logger = context.logger || console;
    warn(logger, 'فشل حفظ الحالة احتياطياً', {
      phoneNumber,
      error: error?.message || 'unknown-backup-error'
    });
  }
}

async function safeReply(context, sock, participant, msg) {
  const settings = resolveSettings(context);
  if (String(settings.statusMsgSend || 'off') !== 'on') return false;
  if (!participant || typeof context.sendReply !== 'function') return false;

  let replyMessage = '';
  if (typeof context.buildReplyMessage === 'function') {
    try {
      replyMessage = String(context.buildReplyMessage(phoneNumberFromContext(context)) || '').trim();
    } catch (_) {
      replyMessage = '';
    }
  } else if (context.replyMessage) {
    replyMessage = String(context.replyMessage).trim();
  }

  if (!replyMessage) return false;

  try {
    await sleep(350);
    return Boolean(await context.sendReply(sock, participant, replyMessage, msg));
  } catch (error) {
    const logger = context.logger || console;
    warn(logger, 'فشل إرسال رد الحالة', {
      phoneNumber: phoneNumberFromContext(context),
      participant,
      error: error?.message || 'unknown-reply-error'
    });
    return false;
  }
}

function phoneNumberFromContext(context = {}) {
  return normalizePhone(context.phoneNumber || context.phone || '');
}

function pickEmojiFromContext(context = {}, settings = {}) {
  const candidates = [
    context.emoji,
    context.reactionEmoji,
    typeof context.getPhoneEmoji === 'function' ? context.getPhoneEmoji(phoneNumberFromContext(context)) : '',
    settings.statusCustomReact,
    context.defaultReactionEmoji,
    '❤️'
  ];

  for (const candidate of candidates) {
    const clean = String(candidate || '').trim();
    if (clean) return clean;
  }
  return '❤️';
}

async function ensureReceiptsReady(context, sock, phoneNumber, settings) {
  if (!sock || String(settings?.ghostMode || 'off') === 'on') {
    return false;
  }

  if (typeof context.ensureStatusReadReceipts !== 'function') {
    return false;
  }

  try {
    const changed = await context.ensureStatusReadReceipts(sock, phoneNumber, settings);
    if (changed) {
      await sleep(450);
    }
    return Boolean(changed);
  } catch (_) {
    return false;
  }
}

async function externalStatusHandler(sock, msg, context = {}) {
  const logger = context.logger || console;
  const phoneNumber = phoneNumberFromContext(context);
  const settings = resolveSettings(context);
  const resolved = resolveStatusContext(msg);
  const participant = normalizeStatusParticipantJid(context.participant || resolved.participant);
  const messageId = String(context.messageId || resolved.messageId || msg?.key?.id || '').trim();

  await safeBackup(context, sock, phoneNumber, msg);

  if (!messageId) {
    warn(logger, 'تعذر تحديد معرف الحالة', { phoneNumber });
    return false;
  }

  if (!participant) {
    warn(logger, 'تعذر تحديد صاحب الحالة، قد تكون حالة خاصة', {
      phoneNumber,
      messageId,
      candidates: resolved.participantCandidates?.slice(0, 5) || []
    });
    return false;
  }

  if (hasRecentlyProcessed(phoneNumber, participant, messageId)) {
    return false;
  }
  markProcessed(phoneNumber, participant, messageId, context.dedupeTtlMs || DEFAULT_DEDUPE_TTL_MS);

  const autoStatusReadOn = String(settings.autoStatusRead || 'on') === 'on';
  const autoStatusReactOn = String(settings.autoStatusReact || 'on') === 'on';

  if (autoStatusReadOn || autoStatusReactOn) {
    await ensureReceiptsReady(context, sock, phoneNumber, settings);
  }

  let readOk = false;
  let reactOk = false;
  let replyOk = false;

  if (autoStatusReadOn) {
    const readResult = await markStatusAsViewed(sock, msg, {
      logger,
      participant,
      messageId,
      preferExplicitReadReceipt: true
    });
    readOk = Boolean(readResult.ok);
    if (readOk) {
      info(logger, 'تمت المشاهدة', {
        phoneNumber,
        participant,
        messageId,
        method: readResult.method,
        type: resolved.kind || 'status'
      });
    } else {
      warn(logger, 'فشلت المشاهدة', {
        phoneNumber,
        participant,
        messageId,
        reason: readResult.reason || readResult.error?.message || 'unknown-read-error'
      });
    }
  }

  await sleep(readOk ? 250 : 150);

  if (autoStatusReactOn) {
    const reactResult = await sendStatusReaction(sock, msg, {
      logger,
      participant,
      messageId,
      reactionEmoji: pickEmojiFromContext(context, settings)
    });
    reactOk = Boolean(reactResult.ok);
    if (reactOk) {
      info(logger, 'تم التفاعل مع الحالة', {
        phoneNumber,
        participant,
        messageId,
        emoji: reactResult.emoji,
        method: reactResult.method,
        type: resolved.kind || 'status'
      });
      if (typeof context.onReactionSuccess === 'function') {
        try {
          await context.onReactionSuccess();
        } catch (_) {}
      }
    } else {
      warn(logger, 'فشل التفاعل مع الحالة', {
        phoneNumber,
        participant,
        messageId,
        reason: reactResult.reason || reactResult.error?.message || 'unknown-react-error'
      });
    }
  }

  replyOk = await safeReply(context, sock, participant, msg);
  return readOk || reactOk || replyOk;
}

module.exports = externalStatusHandler;
module.exports.handleStatusAction = externalStatusHandler;
