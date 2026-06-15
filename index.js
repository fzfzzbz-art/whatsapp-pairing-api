/**
 * WhatsApp Pairing Telegram Bot - Clean JS Rewrite
 *
 * Environment Variables (Render / Railway / VPS):
 * BOT_TOKEN=123456:TELEGRAM_BOT_TOKEN_HERE
 * ADMIN_ID=123456789
 * PORT=3000
 * CURRENT_EMOJI=🔥
 * START_MESSAGE={emoji}
 * SITE_BRAND_NAME=بوت الملك فارس
 * PAIRING_SITE_BASE_URL=https://whatsapp-pairing-api-production-8d35.up.railway.app/api/pairing
 * PAIRING_API_URL=https://whatsapp-pairing-api-production-8d35.up.railway.app/api/pairing
 * QR_API_URL=https://whatsapp-pairing-api-production-8d35.up.railway.app/api/pairing
 * PAIRING_API_METHOD=POST
 * PAIRING_API_NUMBER_FIELD=num
 * PAIRING_API_TOKEN=
 * WEBHOOK_SECRET=
 * LOG_LEVEL=info
 * SELF_TEST=0
 * SELF_TEST_REAL_PAIRING=0
 * SELF_TEST_NUMBER=967771234567
 *
 * Start Commands:
 * node whatsapp_all_in_one_fixed.js
 *
 * Optional API Self Test Command:
 * SELF_TEST=1 SELF_TEST_NUMBER=967771234567 node whatsapp_all_in_one_fixed.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

if (typeof fetch !== 'function') {
  throw new Error('This file requires Node.js 18+ because fetch() must be available globally.');
}

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const ENV_PATH = path.join(BASE_DIR, '.env');
const SETTINGS_PATH = path.join(DATA_DIR, 'bot_settings.json');
const USERS_PATH = path.join(DATA_DIR, 'bot_users.json');
const LINKED_PATH = path.join(DATA_DIR, 'linked_whatsapp_users.json');
const PENDING_PATH = path.join(DATA_DIR, 'pending_pairings.json');
const STATE_PATH = path.join(DATA_DIR, 'runtime_state.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(ENV_PATH);

const ARABIC_DIGIT_MAP = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function normalizeAsciiDigits(value) {
  return String(value || '').replace(/[٠-٩۰-۹]/g, (char) => ARABIC_DIGIT_MAP[char] || char);
}

function normalizePhoneNumber(value) {
  let normalized = normalizeAsciiDigits(value).trim();
  normalized = normalized.replace(/^\+/, '');
  normalized = normalized.replace(/^00/, '');
  normalized = normalized.replace(/[^0-9]/g, '');
  if (normalized.startsWith('0') && normalized.length >= 10) {
    normalized = `94${normalized.slice(1)}`;
  }
  return normalized;
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return structuredClone(fallback);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function structuredClone(value) {
  return JSON.parse(JSON.stringify(value));
}

const DEFAULT_SETTINGS = {
  currentEmoji: process.env.CURRENT_EMOJI || '🔥',
  startMessage: process.env.START_MESSAGE || '{emoji}',
  siteBrandName: process.env.SITE_BRAND_NAME || 'بوت الملك فارس',
  pairingSiteBaseUrl: (process.env.PAIRING_SITE_BASE_URL || 'https://whatsapp-pairing-api-production-8d35.up.railway.app/api/pairing').replace(/\/$/, ''),
  pairingApiUrl: (process.env.PAIRING_API_URL || 'https://whatsapp-pairing-api-production-8d35.up.railway.app/api/pairing').trim(),
  qrApiUrl: (process.env.QR_API_URL || 'https://whatsapp-pairing-api-production-8d35.up.railway.app/api/pairing').trim(),
  pairingApiMethod: (process.env.PAIRING_API_METHOD || 'POST').toUpperCase().trim(),
  pairingApiNumberField: (process.env.PAIRING_API_NUMBER_FIELD || 'num').trim(),
  pairingApiToken: (process.env.PAIRING_API_TOKEN || '').trim(),
  webhookSecret: (process.env.WEBHOOK_SECRET || '').trim(),
  autoReplyEnabled: true,
};

const SETTINGS = Object.assign({}, DEFAULT_SETTINGS, readJson(SETTINGS_PATH, DEFAULT_SETTINGS));
const USERS = readJson(USERS_PATH, {});
const LINKED_USERS = readJson(LINKED_PATH, {});
const PENDING_PAIRINGS = readJson(PENDING_PATH, {});
const RUNTIME_STATE = readJson(STATE_PATH, { lastUpdateId: 0, startedAt: nowIso() });

function saveSettings() { writeJson(SETTINGS_PATH, SETTINGS); }
function saveUsers() { writeJson(USERS_PATH, USERS); }
function saveLinkedUsers() { writeJson(LINKED_PATH, LINKED_USERS); }
function savePendingPairings() { writeJson(PENDING_PATH, PENDING_PAIRINGS); }
function saveRuntimeState() { writeJson(STATE_PATH, RUNTIME_STATE); }

const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const LOG_LEVEL = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const SELF_TEST = String(process.env.SELF_TEST || '0') === '1';
const SELF_TEST_REAL_PAIRING = String(process.env.SELF_TEST_REAL_PAIRING || '0') === '1';
const SELF_TEST_NUMBER = String(process.env.SELF_TEST_NUMBER || '967771234567').trim();

const TELEGRAM_API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

function log(level, ...args) {
  const weights = { error: 0, warn: 1, info: 2, debug: 3 };
  const current = weights[LOG_LEVEL] ?? 2;
  const target = weights[level] ?? 2;
  if (target <= current) {
    const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    method(`[${new Date().toISOString()}] [${level.toUpperCase()}]`, ...args);
  }
}

function ensureBotTokenRequired() {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN is required. Add it in Environment Variables, not inside the file.');
  }
}

function ensureAbsoluteUrl(input, fallback) {
  try {
    return new URL(String(input || '').trim()).toString();
  } catch {
    return String(fallback || '').trim();
  }
}

function refreshDerivedUrls() {
  SETTINGS.pairingSiteBaseUrl = ensureAbsoluteUrl(
    SETTINGS.pairingSiteBaseUrl,
    DEFAULT_SETTINGS.pairingSiteBaseUrl,
  ).replace(/\/$/, '');

  SETTINGS.pairingApiUrl = ensureAbsoluteUrl(
    SETTINGS.pairingApiUrl || `${SETTINGS.pairingSiteBaseUrl}/api/pairing`,
    `${SETTINGS.pairingSiteBaseUrl}/api/pairing`,
  );

  SETTINGS.qrApiUrl = ensureAbsoluteUrl(
    SETTINGS.qrApiUrl || `${SETTINGS.pairingSiteBaseUrl}/api/qr`,
    `${SETTINGS.pairingSiteBaseUrl}/api/qr`,
  );

  SETTINGS.pairingApiMethod = ['GET', 'POST'].includes(String(SETTINGS.pairingApiMethod || '').toUpperCase())
    ? String(SETTINGS.pairingApiMethod || '').toUpperCase()
    : 'POST';

  SETTINGS.pairingApiNumberField = String(SETTINGS.pairingApiNumberField || 'num').trim() || 'num';
}

refreshDerivedUrls();
saveSettings();

function getUser(userId) {
  const key = String(userId);
  if (!USERS[key]) {
    USERS[key] = {
      id: key,
      username: '',
      firstName: '',
      lastName: '',
      language: 'ar',
      emoji: SETTINGS.currentEmoji,
      awaiting: null,
      lastNumber: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    saveUsers();
  }
  return USERS[key];
}

function registerUser(messageOrQuery) {
  const actor = messageOrQuery?.from || messageOrQuery?.message?.from || null;
  if (!actor?.id) return null;
  const user = getUser(actor.id);
  user.username = actor.username || user.username || '';
  user.firstName = actor.first_name || user.firstName || '';
  user.lastName = actor.last_name || user.lastName || '';
  user.updatedAt = nowIso();
  saveUsers();
  return user;
}

function getChatIdFromUpdate(update) {
  if (update?.message?.chat?.id) return update.message.chat.id;
  if (update?.callback_query?.message?.chat?.id) return update.callback_query.message.chat.id;
  return null;
}

function buildMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🔗 طلب كود ربط', callback_data: 'pair_request' },
        { text: '📷 رابط QR', url: SETTINGS.qrApiUrl },
      ],
      [
        { text: '📱 أرقامي المرتبطة', callback_data: 'my_numbers' },
        { text: '⚙️ الإعدادات', callback_data: 'settings' },
      ],
      [
        { text: '🌐 موقع الربط', url: SETTINGS.pairingSiteBaseUrl },
      ],
    ],
  };
}

function buildSettingsKeyboard(user) {
  return {
    inline_keyboard: [
      [
        { text: `😀 الإيموجي الحالي: ${user?.emoji || SETTINGS.currentEmoji}`, callback_data: 'change_emoji' },
      ],
      [
        { text: '🔙 رجوع', callback_data: 'back_main' },
      ],
    ],
  };
}

function renderStartMessage(user) {
  const emoji = user?.emoji || SETTINGS.currentEmoji || '🔥';
  const template = String(SETTINGS.startMessage || '{emoji}');
  return `${template.replace(/\{emoji\}/g, emoji)}

أرسل رقم واتساب بصيغة دولية للحصول على كود الربط.
مثال:
967771234567`;
}

function buildPairingInstructions(number, code) {
  return [
    '✅ تم إنشاء كود الربط بنجاح',
    `📞 الرقم: ${number}`,
    `🔑 الكود: ${code}`,
    '',
    'طريقة الربط:',
    '1) افتح واتساب',
    '2) ادخل على الأجهزة المرتبطة',
    '3) اختر ربط جهاز',
    '4) أدخل الكود الظاهر لك',
  ].join('\n');
}

function buildMyNumbersText(userId) {
  const records = Object.values(LINKED_USERS).filter((entry) => String(entry.userId) === String(userId));
  if (!records.length) {
    return '📭 لا يوجد لديك أرقام محفوظة حتى الآن.';
  }

  const lines = ['📱 أرقامك المرتبطة:'];
  for (const item of records) {
    lines.push(`• ${item.number} — ${item.status || 'pending'}${item.code ? ` — ${item.code}` : ''}`);
  }
  return lines.join('\n');
}

function inferCallbackChatId(callbackQuery) {
  return callbackQuery?.message?.chat?.id || callbackQuery?.from?.id || null;
}

async function telegramApi(method, payload = {}) {
  ensureBotTokenRequired();
  const url = `${TELEGRAM_API_BASE}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = safeJsonParse(text, null);

  if (!response.ok || !data?.ok) {
    const description = data?.description || `Telegram API error (${response.status})`;
    throw new Error(description);
  }

  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...extra,
  });
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return telegramApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...extra,
  });
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  return telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || undefined,
    show_alert: false,
  });
}

async function sendPhoto(chatId, photoUrl, caption = '', extra = {}) {
  return telegramApi('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'Markdown',
    ...extra,
  });
}

async function setMyCommands() {
  try {
    await telegramApi('setMyCommands', {
      commands: [
        { command: 'start', description: 'بدء تشغيل البوت' },
        { command: 'menu', description: 'فتح القائمة الرئيسية' },
        { command: 'pair', description: 'طلب كود ربط' },
        { command: 'numbers', description: 'عرض أرقامي المرتبطة' },
        { command: 'ping', description: 'فحص الحالة' },
        { command: 'help', description: 'المساعدة' },
      ],
    });
  } catch (error) {
    log('warn', 'setMyCommands failed:', error.message);
  }
}

function buildPairHeaders() {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Node.js Telegram Bot)',
  };

  const token = String(SETTINGS.pairingApiToken || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-API-Key'] = token;
  }
  return headers;
}

function buildPairAttempts(number) {
  const normalized = normalizePhoneNumber(number);
  const methods = [];
  const methodCandidates = [
    SETTINGS.pairingApiMethod,
    'POST',
    'GET',
  ];
  for (const item of methodCandidates) {
    const upper = String(item || '').toUpperCase().trim();
    if (['GET', 'POST'].includes(upper) && !methods.includes(upper)) methods.push(upper);
  }

  const fields = [];
  const fieldCandidates = [
    SETTINGS.pairingApiNumberField,
    'num',
    'phone',
    'number',
    'phoneNumber',
  ];
  for (const item of fieldCandidates) {
    const clean = String(item || '').trim();
    if (clean && !fields.includes(clean)) fields.push(clean);
  }

  return { normalized, methods, fields };
}

function isPlausiblePairCode(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(text) && /[A-Z]/.test(text);
}

function extractPairCode(payload) {
  if (!payload) return null;

  if (typeof payload === 'string') {
    const upper = payload.toUpperCase();
    const contextual = upper.match(/(?:PAIR(?:ING)?\s*CODE|CODE|OTP|رمز|كود)[^A-Z0-9]{0,12}([A-Z0-9]{6,12})/i);
    if (contextual?.[1] && isPlausiblePairCode(contextual[1])) {
      return contextual[1].toUpperCase();
    }

    const trimmed = upper.trim();
    if (isPlausiblePairCode(trimmed)) {
      return trimmed;
    }

    return null;
  }

  if (typeof payload === 'object') {
    const candidates = [
      payload.code,
      payload.pairingCode,
      payload.pair_code,
      payload.linkCode,
      payload.link_code,
      payload.data?.code,
      payload.data?.pairingCode,
      payload.data?.pair_code,
      payload.result?.code,
      payload.result?.pairingCode,
      payload.result?.pair_code,
      payload.message,
      payload.error,
    ];

    for (const candidate of candidates) {
      const found = extractPairCode(candidate);
      if (found) return found;
    }
  }

  return null;
}

async function callPairingApi(number) {
  refreshDerivedUrls();

  const { normalized, methods, fields } = buildPairAttempts(number);
  if (!normalized || normalized.length < 10) {
    throw new Error('الرقم غير صالح. أرسل الرقم بصيغة دولية كاملة.');
  }

  let lastError = null;

  for (const method of methods) {
    for (const field of fields) {
      const payload = { [field]: normalized };
      const headers = buildPairHeaders();

      try {
        let response;
        if (method === 'GET') {
          const url = new URL(SETTINGS.pairingApiUrl);
          url.searchParams.set(field, normalized);
          response = await fetch(url, { method: 'GET', headers });
        } else {
          response = await fetch(SETTINGS.pairingApiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });
        }

        const text = await response.text();
        const json = safeJsonParse(text, null);
        const data = json || text;

        if (!response.ok) {
          const msg = json?.error || json?.message || `HTTP ${response.status}`;
          lastError = new Error(msg);
          continue;
        }

        const code = extractPairCode(data);
        if (code) {
          SETTINGS.pairingApiMethod = method;
          SETTINGS.pairingApiNumberField = field;
          saveSettings();
          return {
            success: true,
            number: normalized,
            code,
            raw: data,
          };
        }

        if (json?.success === false) {
          lastError = new Error(json.error || json.message || 'فشل الحصول على كود الربط.');
          continue;
        }

        lastError = new Error('الخدمة استجابت بدون كود ربط.');
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError || new Error('تعذر الوصول إلى خدمة الربط.');
}

function saveLinkedRecord(userId, number, code, raw) {
  LINKED_USERS[number] = {
    number,
    code,
    userId: String(userId),
    status: 'code_sent',
    raw,
    updatedAt: nowIso(),
    createdAt: LINKED_USERS[number]?.createdAt || nowIso(),
  };
  saveLinkedUsers();

  PENDING_PAIRINGS[number] = {
    number,
    userId: String(userId),
    code,
    updatedAt: nowIso(),
  };
  savePendingPairings();
}

async function processNumberRequest(userId, chatId, rawNumber) {
  const user = getUser(userId);
  const number = normalizePhoneNumber(rawNumber);

  if (!number || number.length < 10) {
    await sendMessage(chatId, '❌ الرقم غير صالح. أرسله بصيغة دولية مثل:\n`967771234567`');
    return;
  }

  user.awaiting = null;
  user.lastNumber = number;
  user.updatedAt = nowIso();
  saveUsers();

  const waitingMsg = await sendMessage(chatId, '⏳ جاري طلب كود الربط، انتظر لحظة...');

  try {
    const result = await callPairingApi(number);
    saveLinkedRecord(userId, result.number, result.code, result.raw);

    await editMessage(
      chatId,
      waitingMsg.message_id,
      buildPairingInstructions(result.number, result.code),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 فتح موقع الربط', url: SETTINGS.pairingSiteBaseUrl },
              { text: '📷 QR', url: SETTINGS.qrApiUrl },
            ],
            [
              { text: '📱 أرقامي', callback_data: 'my_numbers' },
              { text: '🔙 القائمة', callback_data: 'back_main' },
            ],
          ],
        },
      },
    );
  } catch (error) {
    const message = `❌ فشل الحصول على كود الربط\n\nالسبب: ${error.message || 'خطأ غير معروف'}`;
    try {
      await editMessage(chatId, waitingMsg.message_id, message, {
        reply_markup: {
          inline_keyboard: [[{ text: '🔁 إعادة المحاولة', callback_data: 'pair_request' }]],
        },
      });
    } catch {
      await sendMessage(chatId, message);
    }
  }
}

function parseCommand(text) {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith('/')) return { command: '', arg: '' };
  const [commandPart, ...rest] = normalized.split(/\s+/);
  const command = commandPart.split('@')[0].toLowerCase();
  const arg = rest.join(' ').trim();
  return { command, arg };
}

async function handleStart(chatId, user) {
  await sendMessage(chatId, renderStartMessage(user), {
    reply_markup: buildMainKeyboard(),
  });
}

async function handleHelp(chatId) {
  await sendMessage(
    chatId,
    [
      'الأوامر المتاحة:',
      '/start - بدء البوت',
      '/menu - القائمة الرئيسية',
      '/pair 967771234567 - طلب كود ربط',
      '/numbers - عرض الأرقام المحفوظة',
      '/ping - فحص الحالة',
      '/help - المساعدة',
      '',
      'يمكنك أيضًا إرسال رقم واتساب مباشرة بدون أي أمر.',
    ].join('\n'),
    { reply_markup: buildMainKeyboard() },
  );
}

async function handlePing(chatId) {
  await sendMessage(chatId, `✅ البوت يعمل بشكل طبيعي\n🕒 الوقت: ${nowIso()}\n🌐 الموقع: ${SETTINGS.pairingSiteBaseUrl}`);
}

async function handleSettings(chatId, user) {
  await sendMessage(chatId, `⚙️ الإعدادات الحالية\n\n😀 الإيموجي: ${user.emoji || SETTINGS.currentEmoji}\n🌐 API: ${SETTINGS.pairingApiUrl}`, {
    reply_markup: buildSettingsKeyboard(user),
  });
}

async function handleCallbackQuery(callbackQuery) {
  const user = registerUser(callbackQuery);
  const chatId = inferCallbackChatId(callbackQuery);
  const data = String(callbackQuery?.data || '');

  try {
    if (data === 'pair_request') {
      user.awaiting = 'phone';
      user.updatedAt = nowIso();
      saveUsers();
      await answerCallbackQuery(callbackQuery.id, 'أرسل رقم واتساب الآن');
      await sendMessage(chatId, '📞 أرسل رقم واتساب بصيغة دولية للحصول على كود الربط.\nمثال:\n`967771234567`');
      return;
    }

    if (data === 'my_numbers') {
      await answerCallbackQuery(callbackQuery.id, 'تم فتح قائمة الأرقام');
      await sendMessage(chatId, buildMyNumbersText(user.id), {
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 القائمة', callback_data: 'back_main' }]],
        },
      });
      return;
    }

    if (data === 'settings') {
      await answerCallbackQuery(callbackQuery.id, 'تم فتح الإعدادات');
      await handleSettings(chatId, user);
      return;
    }

    if (data === 'change_emoji') {
      user.awaiting = 'emoji';
      user.updatedAt = nowIso();
      saveUsers();
      await answerCallbackQuery(callbackQuery.id, 'أرسل الإيموجي الجديد');
      await sendMessage(chatId, '😀 أرسل الإيموجي الجديد الآن.');
      return;
    }

    if (data === 'back_main') {
      await answerCallbackQuery(callbackQuery.id, 'رجوع');
      await handleStart(chatId, user);
      return;
    }

    await answerCallbackQuery(callbackQuery.id, 'أمر غير معروف');
  } catch (error) {
    log('error', 'handleCallbackQuery failed:', error);
    try {
      await answerCallbackQuery(callbackQuery.id, 'حدث خطأ');
    } catch {}
  }
}

async function handleTextMessage(message) {
  const user = registerUser(message);
  if (!message?.text) return;
  const text = String(message.text || '').trim();
  const chatId = message.chat.id;
  const { command, arg } = parseCommand(text);

  if (command === '/start' || command === '/menu') {
    await handleStart(chatId, user);
    return;
  }

  if (command === '/help') {
    await handleHelp(chatId);
    return;
  }

  if (command === '/ping') {
    await handlePing(chatId);
    return;
  }

  if (command === '/numbers') {
    await sendMessage(chatId, buildMyNumbersText(user.id), {
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 القائمة', callback_data: 'back_main' }]],
      },
    });
    return;
  }

  if (command === '/pair') {
    const input = arg || '';
    if (!input) {
      user.awaiting = 'phone';
      user.updatedAt = nowIso();
      saveUsers();
      await sendMessage(chatId, '📞 أرسل رقم واتساب بصيغة دولية.\nمثال:\n`967771234567`');
      return;
    }
    await processNumberRequest(user.id, chatId, input);
    return;
  }

  if (user.awaiting === 'emoji') {
    user.emoji = text.slice(0, 16);
    user.awaiting = null;
    user.updatedAt = nowIso();
    saveUsers();
    await sendMessage(chatId, `✅ تم تحديث الإيموجي إلى: ${user.emoji}`, {
      reply_markup: buildSettingsKeyboard(user),
    });
    return;
  }

  if (user.awaiting === 'phone') {
    await processNumberRequest(user.id, chatId, text);
    return;
  }

  const normalized = normalizePhoneNumber(text);
  if (normalized.length >= 10) {
    await processNumberRequest(user.id, chatId, normalized);
    return;
  }

  await sendMessage(chatId, '❌ لم أفهم الرسالة. أرسل رقم واتساب أو استخدم /help', {
    reply_markup: buildMainKeyboard(),
  });
}

async function handleUpdate(update) {
  try {
    if (update?.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    if (update?.message?.text) {
      await handleTextMessage(update.message);
    }
  } catch (error) {
    log('error', 'handleUpdate failed:', error.message || error);
    const chatId = getChatIdFromUpdate(update);
    if (chatId) {
      try {
        await sendMessage(chatId, `❌ حدث خطأ أثناء تنفيذ الطلب\n\n${error.message || 'Unknown error'}`);
      } catch (sendError) {
        log('error', 'Failed sending error message:', sendError.message || sendError);
      }
    }
  }
}

async function pollTelegram() {
  ensureBotTokenRequired();
  log('info', 'Telegram polling started.');

  while (true) {
    try {
      const result = await telegramApi('getUpdates', {
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
        offset: Number(RUNTIME_STATE.lastUpdateId || 0),
      });

      for (const update of result || []) {
        RUNTIME_STATE.lastUpdateId = Number(update.update_id) + 1;
        saveRuntimeState();
        await handleUpdate(update);
      }
    } catch (error) {
      log('error', 'Polling error:', error.message || error);
      await sleep(3000);
    }
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function writeJsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function extractNumberFromPayload(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return normalizePhoneNumber(payload);
  if (typeof payload === 'object') {
    const candidates = [
      payload.number,
      payload.phone,
      payload.num,
      payload.msisdn,
      payload.jid,
      payload.chatId,
      payload.sender,
      payload.data?.number,
      payload.data?.phone,
      payload.result?.number,
      payload.result?.phone,
    ];

    for (const candidate of candidates) {
      const found = normalizePhoneNumber(candidate);
      if (found) return found;
    }

    for (const value of Object.values(payload)) {
      const found = extractNumberFromPayload(value);
      if (found) return found;
    }
  }
  return '';
}

async function processWebhookPayload(payload) {
  const number = extractNumberFromPayload(payload);
  const code = extractPairCode(payload);

  if (!number) return { handled: false, reason: 'missing_number' };

  const linked = LINKED_USERS[number] || PENDING_PAIRINGS[number];
  if (!linked?.userId) {
    LINKED_USERS[number] = {
      number,
      userId: '',
      status: 'webhook_received',
      raw: payload,
      updatedAt: nowIso(),
      createdAt: LINKED_USERS[number]?.createdAt || nowIso(),
    };
    saveLinkedUsers();
    return { handled: true, reason: 'stored_without_user', number };
  }

  LINKED_USERS[number] = {
    ...(LINKED_USERS[number] || {}),
    number,
    userId: linked.userId,
    code: code || LINKED_USERS[number]?.code || linked.code || '',
    status: payload?.success === false ? 'failed' : 'linked',
    raw: payload,
    updatedAt: nowIso(),
    createdAt: LINKED_USERS[number]?.createdAt || nowIso(),
  };
  saveLinkedUsers();

  delete PENDING_PAIRINGS[number];
  savePendingPairings();

  if (BOT_TOKEN && linked.userId) {
    const text = [
      '✅ تم استلام تحديث جديد من خدمة الربط',
      `📞 الرقم: ${number}`,
      code ? `🔑 الكود/المرجع: ${code}` : null,
      `📌 الحالة: ${LINKED_USERS[number].status}`,
    ].filter(Boolean).join('\n');

    try {
      await sendMessage(linked.userId, text, {
        reply_markup: {
          inline_keyboard: [[{ text: '📱 أرقامي', callback_data: 'my_numbers' }]],
        },
      });
    } catch (error) {
      log('warn', 'Failed to notify linked user from webhook:', error.message || error);
    }
  }

  return { handled: true, reason: 'linked_user_notified', number, code };
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && reqUrl.pathname === '/') {
      writeJsonResponse(res, 200, {
        ok: true,
        service: 'telegram-whatsapp-pairing-bot',
        startedAt: RUNTIME_STATE.startedAt,
        site: SETTINGS.pairingSiteBaseUrl,
        pairingApiUrl: SETTINGS.pairingApiUrl,
        qrApiUrl: SETTINGS.qrApiUrl,
      });
      return;
    }

    if (req.method === 'GET' && reqUrl.pathname === '/health') {
      writeJsonResponse(res, 200, {
        ok: true,
        uptimeSeconds: Math.floor(process.uptime()),
        time: nowIso(),
      });
      return;
    }

    if (req.method === 'POST' && ['/webhook', '/pairing/webhook', '/green-api/webhook'].includes(reqUrl.pathname)) {
      const expected = String(SETTINGS.webhookSecret || '').trim();
      const provided = String(
        req.headers['x-webhook-secret'] ||
        req.headers['x-api-key'] ||
        String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
        '',
      ).trim();

      if (expected && expected !== provided) {
        writeJsonResponse(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      try {
        const rawBody = await readRequestBody(req);
        const payload = rawBody ? safeJsonParse(rawBody, null) : {};
        if (!payload || typeof payload !== 'object') {
          writeJsonResponse(res, 400, { ok: false, error: 'Invalid JSON payload' });
          return;
        }

        const result = await processWebhookPayload(payload);
        writeJsonResponse(res, 202, { ok: true, result });
      } catch (error) {
        writeJsonResponse(res, 500, { ok: false, error: error.message || 'Internal server error' });
      }
      return;
    }

    writeJsonResponse(res, 404, { ok: false, error: 'Not Found' });
  });

  server.listen(PORT, '0.0.0.0', () => {
    log('info', `HTTP server listening on 0.0.0.0:${PORT}`);
  });

  return server;
}

async function selfTest() {
  log('info', 'Running self test...');
  refreshDerivedUrls();

  const metaUrl = new URL(SETTINGS.pairingApiUrl);
  metaUrl.searchParams.set('num', SELF_TEST_NUMBER);
  const metaResponse = await fetch(metaUrl, {
    method: 'GET',
    headers: buildPairHeaders(),
  });
  const metaText = await metaResponse.text();
  const metaJson = safeJsonParse(metaText, {});

  const summary = {
    ok: metaResponse.ok,
    test: 'pairing_api_metadata',
    pairingApiUrl: SETTINGS.pairingApiUrl,
    status: metaResponse.status,
    methods: metaJson?.methods || [],
    requestFields: metaJson?.requestFields || [],
  };

  if (SELF_TEST_REAL_PAIRING) {
    const result = await callPairingApi(SELF_TEST_NUMBER);
    summary.realPairing = {
      number: result.number,
      code: result.code,
    };
    log('info', 'Real pairing self test success:', result);
  }

  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  refreshDerivedUrls();

  if (SELF_TEST) {
    await selfTest();
    return;
  }

  ensureBotTokenRequired();
  await setMyCommands();
  startHttpServer();
  await pollTelegram();
}

process.on('SIGINT', () => {
  log('warn', 'SIGINT received. Exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('warn', 'SIGTERM received. Exiting...');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  log('error', 'Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception:', error);
});

main().catch((error) => {
  log('error', error.message || error);
  process.exit(1);
});
