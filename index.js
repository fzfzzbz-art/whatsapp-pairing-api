require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  settings: path.join(DATA_DIR, 'bot_settings.json'),
  users: path.join(DATA_DIR, 'bot_users.json'),
  userEmoji: path.join(DATA_DIR, 'user_emoji_settings.json'),
  linkedUsers: path.join(DATA_DIR, 'linked_whatsapp_users.json'),
  pendingPairings: path.join(DATA_DIR, 'pending_pairings.json'),
  autoReplyLog: path.join(DATA_DIR, 'auto_reply_log.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
};

const DEFAULT_AUTO_REPLY_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb73l855K3zVq2QgsH1M';
const DEFAULT_CONTACT_NUMBER = '967773987296';
const DEFAULT_SITE_BRAND_NAME = 'fares';
const DEFAULT_SITE_FOOTER = 'fares';
const DEFAULT_START_MESSAGE_TEMPLATE = '{emoji}';
const DEFAULT_WHATSAPP_BOT_MESSAGE = '👑 *GQUEEN-MINI VERIFICATION*\n\n🔑 Your Link Code: *{code}*\n\n----------------------------\n📱 *How to Link Your Device:*\n\n1️⃣ Open *WhatsApp* on your phone.\n2️⃣ Tap *Menu* (⋮) or *Settings* (⚙️).\n3️⃣ Select *Linked Devices*.\n4️⃣ Tap *Link a Device*.\n5️⃣ Use the code if prompted.';
const DEFAULT_WHATSAPP_ALIVE_MESSAGE = '*👋 I AM ALIVE NOW*';
const DEFAULT_WHATSAPP_SETTINGS_MESSAGE = '⚙️ رسالة الإعدادات';
const DEFAULT_PAIRING_SITE = 'https://whatsapp-pairing-api.onrender.com';
const DEFAULT_PAIRING_LANGUAGE = 'ar';

const BOT_TOKEN = String(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TOKEN || '').trim();
const ADMIN_ID = Number(process.env.ADMIN_ID || 7231690686);

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required in Environment variables.');
}

const PAIRING_LANGUAGE_TEXTS = {
  si: {
    button: '🇱🇰 සිංහල',
    choose: '🌐 සම්බන්ධ කිරීම සඳහා භාෂාව තෝරන්න.',
    prompt: '📞 ඔබගේ WhatsApp අංකය දැන් එවන්න.\nඋදාහරණය: 94712345678',
    invalidLocal: '❌ country code සමඟ අංකය යවන්න.',
    invalidNumber: '❌ වලංගු WhatsApp අංකයක් එවන්න.',
    processing: '⏳ Pairing code එක ඉල්ලමින්: {number}',
    success: DEFAULT_WHATSAPP_BOT_MESSAGE,
    error: '❌ Pairing code ඉල්ලන වෙලාවේ දෝෂයක් ආවා.\n{error}',
  },
  en: {
    button: '🇬🇧 English',
    choose: '🌐 Choose the pairing language.',
    prompt: '📞 Send your WhatsApp number now.\nExample: 201012345678',
    invalidLocal: '❌ Send the number in full international format with country code.',
    invalidNumber: '❌ Please send a valid WhatsApp number.',
    processing: '⏳ Requesting pairing code for: {number}',
    success: DEFAULT_WHATSAPP_BOT_MESSAGE,
    error: '❌ Failed to request the pairing code.\n{error}',
  },
  ta: {
    button: '🇮🇳 தமிழ்',
    choose: '🌐 இணைப்பு மொழியை தேர்வு செய்யவும்.',
    prompt: '📞 உங்கள் WhatsApp எண்ணை இப்போது அனுப்புங்கள்.\nஉதாரணம்: 94712345678',
    invalidLocal: '❌ நாடு குறியீட்டுடன் எண்ணை அனுப்புங்கள்.',
    invalidNumber: '❌ சரியான WhatsApp எண்ணை அனுப்புங்கள்.',
    processing: '⏳ இணைப்பு குறியீடு கோரப்படுகிறது: {number}',
    success: DEFAULT_WHATSAPP_BOT_MESSAGE,
    error: '❌ இணைப்பு குறியீட்டை கோரும்போது பிழை ஏற்பட்டது.\n{error}',
  },
  ar: {
    button: '🇸🇦 العربية',
    choose: '🌐 اختر لغة الربط.',
    prompt: '📞 أرسل رقم واتساب الآن.\nمثال: 201012345678\n(أرقام فقط أو مع + بدون مسافات)',
    invalidLocal: '❌ اكتب الرقم بصيغة دولية كاملة مع رمز الدولة.',
    invalidNumber: '❌ الرقم غير صحيح. أرسل رقم واتساب صالح.',
    processing: '⏳ جاري طلب كود الربط للرقم: {number}',
    success: DEFAULT_WHATSAPP_BOT_MESSAGE,
    error: '❌ حصل خطأ أثناء طلب كود الربط.\n{error}',
  },
};

const DEFAULT_SETTINGS = {
  current_emoji: process.env.CURRENT_EMOJI || '🔥',
  auto_reply_enabled: String(process.env.AUTO_REPLY_ENABLED || 'true').toLowerCase() === 'true',
  pair_code_api_url: String(process.env.PAIR_CODE_API_URL || '').trim() || DEFAULT_PAIRING_SITE,
  pair_code_api_method: String(process.env.PAIR_CODE_API_METHOD || 'GET').trim().toUpperCase(),
  pair_code_api_token: String(process.env.PAIR_CODE_API_TOKEN || '').trim(),
  pair_code_api_number_field: String(process.env.PAIR_CODE_API_NUMBER_FIELD || 'number').trim(),
  start_message: process.env.START_MESSAGE || DEFAULT_START_MESSAGE_TEMPLATE,
  force_sub_enabled: String(process.env.FORCE_SUB_ENABLED || 'false').toLowerCase() === 'true',
  force_sub_channel: String(process.env.FORCE_SUB_CHANNEL || '').trim(),
  force_sub_url: String(process.env.FORCE_SUB_URL || '').trim(),
  auto_reply_channel_url: String(process.env.AUTO_REPLY_CHANNEL_URL || DEFAULT_AUTO_REPLY_CHANNEL_URL).trim() || DEFAULT_AUTO_REPLY_CHANNEL_URL,
  auto_reply_message: String(process.env.AUTO_REPLY_MESSAGE || `🔗 هذا رابط القناة الخاصة بنا\n${DEFAULT_AUTO_REPLY_CHANNEL_URL}\n\n📞 رقم التواصل: ${DEFAULT_CONTACT_NUMBER}`).trim(),
  whatsapp_alive_message: String(process.env.WHATSAPP_ALIVE_MESSAGE || DEFAULT_WHATSAPP_ALIVE_MESSAGE).trim(),
  whatsapp_bot_message: String(process.env.WHATSAPP_BOT_MESSAGE || DEFAULT_WHATSAPP_BOT_MESSAGE).trim(),
  whatsapp_settings_message: String(process.env.WHATSAPP_SETTINGS_MESSAGE || DEFAULT_WHATSAPP_SETTINGS_MESSAGE).trim(),
  webhook_secret: String(process.env.WEBHOOK_SECRET || '').trim(),
};

const BOT_STATS = {
  started_at: new Date().toISOString(),
  total_users: new Set(),
  pair_requests: 0,
  pair_success: 0,
  pair_failed: 0,
};

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

let SETTINGS = { ...DEFAULT_SETTINGS, ...readJson(FILES.settings, DEFAULT_SETTINGS) };
let REGISTERED_USERS = readJson(FILES.users, []);
let USER_EMOJI_SETTINGS = readJson(FILES.userEmoji, {});
let LINKED_WHATSAPP_USERS = readJson(FILES.linkedUsers, []);
let PENDING_PAIRINGS = readJson(FILES.pendingPairings, []);
let AUTO_REPLY_LOG = readJson(FILES.autoReplyLog, []);
let SESSIONS = readJson(FILES.sessions, {});

function persistAll() {
  writeJson(FILES.settings, SETTINGS);
  writeJson(FILES.users, REGISTERED_USERS);
  writeJson(FILES.userEmoji, USER_EMOJI_SETTINGS);
  writeJson(FILES.linkedUsers, LINKED_WHATSAPP_USERS);
  writeJson(FILES.pendingPairings, PENDING_PAIRINGS);
  writeJson(FILES.autoReplyLog, AUTO_REPLY_LOG);
  writeJson(FILES.sessions, SESSIONS);
}

persistAll();

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeAsciiDigits(raw) {
  const map = {
    '٠': '0','١': '1','٢': '2','٣': '3','٤': '4','٥': '5','٦': '6','٧': '7','٨': '8','٩': '9',
    '۰': '0','۱': '1','۲': '2','۳': '3','۴': '4','۵': '5','۶': '6','۷': '7','۸': '8','۹': '9',
  };
  return String(raw || '').replace(/[٠-٩۰-۹]/g, (m) => map[m] || m);
}

function normalizePhoneNumber(raw) {
  let digits = normalizeAsciiDigits(raw).replace(/[^0-9+]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('+')) digits = digits.slice(1);
  return digits.replace(/\D/g, '');
}

function normalizePairCode(raw) {
  return String(raw || '').replace(/[^A-Za-z0-9-]/g, '').trim().toUpperCase();
}

function getPairLanguageCode(raw) {
  const code = String(raw || '').trim().toLowerCase();
  return PAIRING_LANGUAGE_TEXTS[code] ? code : DEFAULT_PAIRING_LANGUAGE;
}

function getPairLanguagePack(raw) {
  return PAIRING_LANGUAGE_TEXTS[getPairLanguageCode(raw)];
}

function saveSettings() { writeJson(FILES.settings, SETTINGS); }
function saveUsers() { writeJson(FILES.users, REGISTERED_USERS); }
function saveUserEmoji() { writeJson(FILES.userEmoji, USER_EMOJI_SETTINGS); }
function saveLinkedUsers() { writeJson(FILES.linkedUsers, LINKED_WHATSAPP_USERS); }
function savePendingPairings() { writeJson(FILES.pendingPairings, PENDING_PAIRINGS); }
function saveSessions() { writeJson(FILES.sessions, SESSIONS); }

function getUserSession(userId) {
  const key = String(userId);
  if (!SESSIONS[key]) SESSIONS[key] = {};
  return SESSIONS[key];
}

function isAdmin(userId) {
  return Number(userId) === Number(ADMIN_ID);
}

function registerUser(msg) {
  const from = msg?.from;
  if (!from) return;
  BOT_STATS.total_users.add(from.id);
  const exists = REGISTERED_USERS.some((u) => Number(u.id) === Number(from.id));
  if (!exists) {
    REGISTERED_USERS.push({
      id: from.id,
      username: from.username || '',
      full_name: [from.first_name, from.last_name].filter(Boolean).join(' ').trim(),
      joined_at: new Date().toISOString(),
    });
    saveUsers();
  }
}

function getEffectiveUserEmoji(userId) {
  return String(USER_EMOJI_SETTINGS[String(userId)] || SETTINGS.current_emoji || '🔥').trim() || '🔥';
}

function normalizeStartMessageTemplate(value) {
  const raw = String(value || '').replace(/\r\n/g, '\n').trim();
  return raw || DEFAULT_START_MESSAGE_TEMPLATE;
}

function renderStartMessage(userId) {
  const emoji = getEffectiveUserEmoji(userId);
  const autoReplyStatus = SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌';
  const adminText = `المطور الأساسي: ${ADMIN_ID}`;
  return normalizeStartMessageTemplate(SETTINGS.start_message)
    .replaceAll('{emoji}', emoji)
    .replaceAll('{auto_reply_status}', autoReplyStatus)
    .replaceAll('{admin_text}', adminText)
    .replaceAll('{green_status}', SETTINGS.pair_code_api_url || DEFAULT_PAIRING_SITE)
    .replaceAll('{dev_hint}', isAdmin(userId) ? 'افتح /dev' : '')
    .trim();
}

function settingsText() {
  return [
    '⚙️ إعدادات البوت',
    `🌐 API URL: ${SETTINGS.pair_code_api_url || 'غير مضبوط'}`,
    `🔁 API Method: ${SETTINGS.pair_code_api_method}`,
    `📮 حقل الرقم: ${SETTINGS.pair_code_api_number_field}`,
    `🔐 API Token: ${SETTINGS.pair_code_api_token ? 'configured' : 'not configured'}`,
    `🚫 الاشتراك الإجباري: ${SETTINGS.force_sub_enabled ? 'مفعل ✅' : 'معطل ❌'}`,
  ].join('\n');
}

function adminStatusText() {
  return [
    '🛠 لوحة المطور',
    `👥 عدد المستخدمين: ${REGISTERED_USERS.length}`,
    `📞 طلبات الربط: ${BOT_STATS.pair_requests}`,
    `✅ نجاح الربط: ${BOT_STATS.pair_success}`,
    `❌ فشل الربط: ${BOT_STATS.pair_failed}`,
    '',
    settingsText(),
  ].join('\n');
}

function whatsappMessagesText() {
  return [
    '💬 رسائل واتساب',
    `🟢 .alive: ${SETTINGS.whatsapp_alive_message.slice(0, 80)}`,
    `🤖 .bot: ${SETTINGS.whatsapp_bot_message.slice(0, 80)}`,
    `⚙️ .settings: ${SETTINGS.whatsapp_settings_message.slice(0, 80)}`,
  ].join('\n');
}

function buildMainKeyboard(userId) {
  const rows = [
    [{ text: '📞 ربط كود', callback_data: 'pair_code' }],
    [{ text: '😀 رموز الحالة', callback_data: 'user_set_emoji' }],
    [{ text: '📱 أرقامك المربوطة', callback_data: 'my_linked_numbers' }],
    [{ text: '❌ إلغاء ربط رقمك', callback_data: 'unlink_my_number' }],
    [{ text: '🔄 تحديث', callback_data: 'refresh_home' }],
  ];
  if (isAdmin(userId)) rows.push([{ text: '🛠 لوحة المطور', callback_data: 'dev_panel' }]);
  return { inline_keyboard: rows };
}

function buildPairLanguageKeyboard(mode = 'pair') {
  const prefix = mode === 'drf' ? 'drf_lang' : 'pair_lang';
  return {
    inline_keyboard: [
      [
        { text: PAIRING_LANGUAGE_TEXTS.si.button, callback_data: `${prefix}:si` },
        { text: PAIRING_LANGUAGE_TEXTS.en.button, callback_data: `${prefix}:en` },
      ],
      [
        { text: PAIRING_LANGUAGE_TEXTS.ta.button, callback_data: `${prefix}:ta` },
        { text: PAIRING_LANGUAGE_TEXTS.ar.button, callback_data: `${prefix}:ar` },
      ],
      [{ text: '🏠 الرئيسية', callback_data: 'refresh_home' }],
    ],
  };
}

function buildDevKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 الإحصائيات', callback_data: 'dev_stats' }],
      [{ text: '⚙️ الإعدادات', callback_data: 'dev_settings' }],
      [{ text: '💬 رسائل واتساب', callback_data: 'dev_whatsapp_messages' }],
      [{ text: '📝 تغيير رسالة /start', callback_data: 'dev_set_start_message' }],
      [{ text: '🚫 الاشتراك الإجباري', callback_data: 'dev_force_sub' }],
      [{ text: '📢 إرسال رسالة للجميع', callback_data: 'dev_broadcast' }],
      [{ text: '✅/❌ تفعيل الرد التلقائي', callback_data: 'dev_toggle_auto_reply' }],
      [{ text: '🔗 إعداد خدمة الربط', callback_data: 'dev_pair_api' }],
      [{ text: '🏠 رجوع للرئيسية', callback_data: 'refresh_home' }],
    ],
  };
}

function buildPairApiKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🌐 تعيين API URL', callback_data: 'dev_set_api_url' }],
      [{ text: '🔐 تعيين API Token', callback_data: 'dev_set_api_token' }],
      [{ text: '📮 اسم حقل الرقم', callback_data: 'dev_set_number_field' }],
      [{ text: '🔁 GET / POST', callback_data: 'dev_set_api_method' }],
      [{ text: '⬅️ رجوع', callback_data: 'dev_panel' }],
    ],
  };
}

function buildForceSubKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅/❌ تفعيل الاشتراك الإجباري', callback_data: 'dev_toggle_force_sub' }],
      [{ text: '📢 تعيين القناة أو المعرف', callback_data: 'dev_set_force_sub_channel' }],
      [{ text: '🔗 تعيين رابط الاشتراك', callback_data: 'dev_set_force_sub_url' }],
      [{ text: '⬅️ رجوع', callback_data: 'dev_panel' }],
    ],
  };
}

function buildWhatsappMessagesKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🟢 تغيير رسالة .alive', callback_data: 'dev_set_whatsapp_alive_message' }],
      [{ text: '🤖 تغيير رسالة .bot', callback_data: 'dev_set_whatsapp_bot_message' }],
      [{ text: '⚙️ تغيير رسالة .settings', callback_data: 'dev_set_whatsapp_settings_message' }],
      [{ text: '⬅️ رجوع', callback_data: 'dev_panel' }],
    ],
  };
}

function buildSubscriptionKeyboard() {
  const rows = [];
  const joinUrl = SETTINGS.force_sub_url || (SETTINGS.force_sub_channel ? `https://t.me/${String(SETTINGS.force_sub_channel).replace(/^@/, '')}` : '');
  if (joinUrl) rows.push([{ text: '📢 اشترك الآن', url: joinUrl }]);
  rows.push([{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]);
  rows.push([{ text: '🏠 الرئيسية', callback_data: 'refresh_home' }]);
  return { inline_keyboard: rows };
}

function buildOwnedNumbersKeyboard(userId) {
  const userIdNum = Number(userId);
  const rows = LINKED_WHATSAPP_USERS
    .filter((item) => Number(item.telegram_user_id) === userIdNum)
    .map((item) => [{ text: `❌ إلغاء ربط ${item.number}`, callback_data: `unlink_number:${item.number}` }]);
  rows.push([{ text: '🏠 الرئيسية', callback_data: 'refresh_home' }]);
  return { inline_keyboard: rows };
}

function getUserLinkedNumbers(userId) {
  return LINKED_WHATSAPP_USERS.filter((item) => Number(item.telegram_user_id) === Number(userId));
}

function upsertLinkedNumber(record) {
  const normalized = normalizePhoneNumber(record.number);
  const idx = LINKED_WHATSAPP_USERS.findIndex((item) => normalizePhoneNumber(item.number) === normalized);
  const nextRecord = {
    number: normalized,
    telegram_user_id: record.telegram_user_id,
    telegram_username: record.telegram_username || '',
    telegram_full_name: record.telegram_full_name || '',
    pair_code: record.pair_code || '',
    linked_at: record.linked_at || new Date().toISOString(),
    pair_language: record.pair_language || DEFAULT_PAIRING_LANGUAGE,
    raw_payload: record.raw_payload || null,
  };
  if (idx >= 0) LINKED_WHATSAPP_USERS[idx] = { ...LINKED_WHATSAPP_USERS[idx], ...nextRecord };
  else LINKED_WHATSAPP_USERS.push(nextRecord);
  saveLinkedUsers();
  return nextRecord;
}

function registerPendingPairing(record) {
  const normalized = normalizePhoneNumber(record.number);
  const idx = PENDING_PAIRINGS.findIndex((item) => normalizePhoneNumber(item.number) === normalized);
  const nextRecord = {
    number: normalized,
    telegram_user_id: record.telegram_user_id,
    telegram_username: record.telegram_username || '',
    telegram_full_name: record.telegram_full_name || '',
    pair_language: record.pair_language || DEFAULT_PAIRING_LANGUAGE,
    requested_at: new Date().toISOString(),
    pair_code: record.pair_code || '',
  };
  if (idx >= 0) PENDING_PAIRINGS[idx] = { ...PENDING_PAIRINGS[idx], ...nextRecord };
  else PENDING_PAIRINGS.push(nextRecord);
  savePendingPairings();
  return nextRecord;
}

function removeLinkedNumber(userId, number) {
  const normalized = normalizePhoneNumber(number);
  const before = LINKED_WHATSAPP_USERS.length;
  LINKED_WHATSAPP_USERS = LINKED_WHATSAPP_USERS.filter((item) => !(Number(item.telegram_user_id) === Number(userId) && normalizePhoneNumber(item.number) === normalized));
  if (LINKED_WHATSAPP_USERS.length !== before) {
    saveLinkedUsers();
    return true;
  }
  return false;
}

function isLikelyValidTelegramToken(value) {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(String(value || '').trim());
}

function normalizeBaseUrl(rawUrl) {
  let value = String(rawUrl || '').trim();
  if (!value) return DEFAULT_PAIRING_SITE;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value.replace(/\/+$/, '');
}

async function discoverPairingBase(apiUrl) {
  const normalized = normalizeBaseUrl(apiUrl);
  try {
    const rootUrl = normalized.replace(/\/(api\/pairing|pairing|pair)$/i, '');
    const response = await axios.get(rootUrl, {
      timeout: 20000,
      validateStatus: () => true,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const data = response.data;
    if (data && typeof data === 'object') {
      const pairingApiUrl = String(data.pairingApiUrl || data.pairApiUrl || '').trim();
      if (pairingApiUrl) return pairingApiUrl.replace(/\/+$/, '');
    }
  } catch (_) {}
  return normalized;
}

function deepFindCode(payload) {
  const stack = [payload];
  while (stack.length) {
    const current = stack.pop();
    if (current == null) continue;
    if (typeof current === 'string') {
      const match = current.match(/[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+/i) || current.match(/\b[A-Z0-9]{8,16}\b/i);
      if (match) return normalizePairCode(match[0]);
      continue;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
      continue;
    }
    if (typeof current === 'object') {
      for (const [key, value] of Object.entries(current)) {
        if (/^(code|pairingCode|pair_code|linkCode|link_code)$/i.test(key) && value != null) {
          const maybe = normalizePairCode(String(value));
          if (maybe) return maybe;
        }
        stack.push(value);
      }
    }
  }
  return '';
}

function getAuthHeaders(token) {
  const clean = String(token || '').trim();
  if (!clean) return {};
  if (/^(Bearer\s+)/i.test(clean)) return { Authorization: clean };
  return {
    Authorization: `Bearer ${clean}`,
    'x-api-key': clean,
    apikey: clean,
  };
}

async function requestPairCode(number) {
  BOT_STATS.pair_requests += 1;
  const cleanNumber = normalizePhoneNumber(number);
  if (!cleanNumber || cleanNumber.length < 8 || cleanNumber.length > 15) {
    throw new Error('الرقم غير صحيح');
  }

  const configuredBase = normalizeBaseUrl(SETTINGS.pair_code_api_url || DEFAULT_PAIRING_SITE);
  const discovered = await discoverPairingBase(configuredBase);
  const rootUrl = discovered.replace(/\/(api\/pairing|pairing|pair)$/i, '');
  const candidates = [
    discovered,
    `${rootUrl}/api/pairing`,
    `${rootUrl}/pairing`,
    `${rootUrl}/pair`,
  ].map((item) => item.replace(/([^:]\/)\/+/g, '$1'));

  const uniqueCandidates = [...new Set(candidates)];
  const methods = [...new Set([String(SETTINGS.pair_code_api_method || 'GET').toUpperCase(), 'GET', 'POST'])];
  const numberFields = [...new Set([SETTINGS.pair_code_api_number_field || 'number', 'number', 'phone', 'num', 'phoneNumber'])];
  let lastError = 'Unknown error';

  for (const endpoint of uniqueCandidates) {
    for (const method of methods) {
      for (const field of numberFields) {
        try {
          const headers = {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0',
            ...getAuthHeaders(SETTINGS.pair_code_api_token),
          };
          const payload = { [field]: cleanNumber };
          const response = method === 'POST'
            ? await axios.post(endpoint, payload, { timeout: 45000, validateStatus: () => true, headers: { 'Content-Type': 'application/json', ...headers } })
            : await axios.get(endpoint, { timeout: 45000, validateStatus: () => true, headers, params: payload });

          const body = response.data;
          const textBody = typeof body === 'string' ? body : JSON.stringify(body || {});
          const code = deepFindCode(body) || deepFindCode(textBody);
          if (response.status >= 200 && response.status < 300 && code) {
            SETTINGS.pair_code_api_url = endpoint;
            SETTINGS.pair_code_api_method = method;
            SETTINGS.pair_code_api_number_field = field;
            saveSettings();
            BOT_STATS.pair_success += 1;
            return { code, raw: body, endpoint, method, field };
          }

          lastError = typeof body === 'object' && body && body.error ? body.error : `HTTP ${response.status}`;
        } catch (error) {
          lastError = error?.response?.data?.error || error?.message || 'Request failed';
        }
      }
    }
  }

  BOT_STATS.pair_failed += 1;
  throw new Error(lastError || 'Failed to get pairing code');
}

async function isUserSubscribed(userId) {
  if (!SETTINGS.force_sub_enabled || !SETTINGS.force_sub_channel) return true;
  try {
    const member = await bot.getChatMember(SETTINGS.force_sub_channel, userId);
    return !['left', 'kicked'].includes(member.status);
  } catch {
    return true;
  }
}

async function ensureSubscription(chatId, userId) {
  if (isAdmin(userId)) return true;
  const ok = await isUserSubscribed(userId);
  if (!ok) {
    await bot.sendMessage(chatId, '🚫 لازم تشترك أولاً في القناة المطلوبة قبل استخدام البوت.\n\nبعد الاشتراك اضغط على زر تحقق من الاشتراك.', {
      reply_markup: buildSubscriptionKeyboard(),
    });
  }
  return ok;
}

async function sendHome(chatId, userId, messageId = null) {
  const text = renderStartMessage(userId);
  const options = { reply_markup: buildMainKeyboard(userId) };
  if (messageId) {
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...options });
      return;
    } catch (_) {}
  }
  await bot.sendMessage(chatId, text, options);
}

async function showOwnedNumbersPanel(chatId, userId, purpose = 'manage') {
  const items = getUserLinkedNumbers(userId);
  if (!items.length) {
    await bot.sendMessage(chatId, 'ℹ️ لا يوجد أرقام مربوطة في حسابك حالياً.', {
      reply_markup: buildMainKeyboard(userId),
    });
    return;
  }
  const lines = [purpose === 'unlink' ? '❌ اختر الرقم الذي تريد إلغاء ربطه:' : '📱 أرقامك المربوطة:'];
  items.forEach((item, i) => lines.push(`${i + 1}. ${item.number}`));
  await bot.sendMessage(chatId, lines.join('\n'), {
    reply_markup: buildOwnedNumbersKeyboard(userId),
  });
}

async function broadcastMessageToAll(text) {
  let success = 0;
  let failed = 0;
  for (const user of REGISTERED_USERS) {
    try {
      await bot.sendMessage(user.id, text, { reply_markup: buildMainKeyboard(user.id) });
      success += 1;
    } catch {
      failed += 1;
    }
  }
  return { success, failed };
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/^\/start(?:@\w+)?$/, async (msg) => {
  registerUser(msg);
  if (!(await ensureSubscription(msg.chat.id, msg.from.id))) return;
  await sendHome(msg.chat.id, msg.from.id);
});

bot.onText(/^\/menu(?:@\w+)?$/, async (msg) => {
  registerUser(msg);
  if (!(await ensureSubscription(msg.chat.id, msg.from.id))) return;
  await sendHome(msg.chat.id, msg.from.id);
});

bot.onText(/^\/emoji(?:@\w+)?$/, async (msg) => {
  registerUser(msg);
  if (!(await ensureSubscription(msg.chat.id, msg.from.id))) return;
  const session = getUserSession(msg.from.id);
  session.awaiting_emoji = true;
  session.awaiting_pair_number = false;
  session.admin_waiting_field = '';
  saveSessions();
  await bot.sendMessage(msg.chat.id, '😀 أرسل الآن الإيموجي الجديد الذي تريد حفظه.', { reply_markup: buildMainKeyboard(msg.from.id) });
});

bot.onText(/^\/help(?:@\w+)?$/, async (msg) => {
  registerUser(msg);
  let text = 'استخدم /start أو /menu لعرض الواجهة الرئيسية.\nاستخدم /ping للتأكد إن البوت شغال.\nومن الواجهة الرئيسية تقدر تربط رقمك أو تغيّر رموز الحالة.';
  if (isAdmin(msg.from.id)) text += '\nولفتح لوحة المطور استخدم /dev';
  await bot.sendMessage(msg.chat.id, text);
});

bot.onText(/^\/ping(?:@\w+)?$/, async (msg) => {
  registerUser(msg);
  if (!(await ensureSubscription(msg.chat.id, msg.from.id))) return;
  await bot.sendMessage(msg.chat.id, '✅ البوت شغال.');
});

bot.onText(/^\/dev(?:@\w+)?$/, async (msg) => {
  registerUser(msg);
  if (!isAdmin(msg.from.id)) {
    await bot.sendMessage(msg.chat.id, '⛔ هذه الأوامر للمطور فقط.');
    return;
  }
  await bot.sendMessage(msg.chat.id, adminStatusText(), { reply_markup: buildDevKeyboard() });
});

bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = String(query.data || '');
  registerUser(query.message);

  try { await bot.answerCallbackQuery(query.id); } catch (_) {}

  if (data === 'check_subscription') {
    if (await ensureSubscription(chatId, userId)) await sendHome(chatId, userId, messageId);
    return;
  }

  if (['pair_code', 'refresh_home', 'user_set_emoji', 'my_linked_numbers', 'unlink_my_number'].includes(data) || data.startsWith('pair_lang:') || data.startsWith('unlink_number:')) {
    if (!(await ensureSubscription(chatId, userId))) return;
  }

  const session = getUserSession(userId);

  if (data === 'pair_code') {
    session.awaiting_pair_number = false;
    session.awaiting_emoji = false;
    session.admin_waiting_field = '';
    session.selected_pair_language = DEFAULT_PAIRING_LANGUAGE;
    saveSessions();
    await bot.sendMessage(chatId, getPairLanguagePack(DEFAULT_PAIRING_LANGUAGE).choose, { reply_markup: buildPairLanguageKeyboard() });
    return;
  }

  if (data.startsWith('pair_lang:')) {
    const lang = getPairLanguageCode(data.split(':')[1]);
    session.selected_pair_language = lang;
    session.awaiting_pair_number = true;
    session.awaiting_emoji = false;
    session.admin_waiting_field = '';
    saveSessions();
    await bot.sendMessage(chatId, getPairLanguagePack(lang).prompt);
    return;
  }

  if (data === 'user_set_emoji') {
    session.awaiting_emoji = true;
    session.awaiting_pair_number = false;
    session.admin_waiting_field = '';
    saveSessions();
    await bot.sendMessage(chatId, '😀 أرسل الإيموجي الجديد الآن.');
    return;
  }

  if (data === 'refresh_home') {
    session.awaiting_pair_number = false;
    session.awaiting_emoji = false;
    session.admin_waiting_field = '';
    saveSessions();
    await sendHome(chatId, userId, messageId);
    return;
  }

  if (data === 'my_linked_numbers') {
    await showOwnedNumbersPanel(chatId, userId, 'manage');
    return;
  }

  if (data === 'unlink_my_number') {
    await showOwnedNumbersPanel(chatId, userId, 'unlink');
    return;
  }

  if (data.startsWith('unlink_number:')) {
    const number = normalizePhoneNumber(data.split(':')[1]);
    const removed = removeLinkedNumber(userId, number);
    await bot.sendMessage(chatId, removed ? `✅ تم إلغاء ربط الرقم ${number} من حسابك.` : '❌ هذا الرقم غير مربوط من حسابك داخل البوت.', {
      reply_markup: buildMainKeyboard(userId),
    });
    return;
  }

  if (!isAdmin(userId)) {
    await bot.sendMessage(chatId, '⛔ هذه الأوامر للمطور فقط.');
    return;
  }

  if (data === 'dev_panel' || data === 'dev_stats') {
    try {
      await bot.editMessageText(adminStatusText(), { chat_id: chatId, message_id: messageId, reply_markup: buildDevKeyboard() });
    } catch {
      await bot.sendMessage(chatId, adminStatusText(), { reply_markup: buildDevKeyboard() });
    }
    return;
  }

  if (data === 'dev_settings') {
    await bot.sendMessage(chatId, settingsText(), { reply_markup: buildDevKeyboard() });
    return;
  }

  if (data === 'dev_pair_api') {
    await bot.sendMessage(chatId, settingsText(), { reply_markup: buildPairApiKeyboard() });
    return;
  }

  if (data === 'dev_force_sub') {
    await bot.sendMessage(chatId, `🚫 الاشتراك الإجباري: ${SETTINGS.force_sub_enabled ? 'مفعل ✅' : 'معطل ❌'}\n📢 القناة: ${SETTINGS.force_sub_channel || 'غير محددة'}\n🔗 الرابط: ${SETTINGS.force_sub_url || 'غير محدد'}`, { reply_markup: buildForceSubKeyboard() });
    return;
  }

  if (data === 'dev_whatsapp_messages') {
    await bot.sendMessage(chatId, whatsappMessagesText(), { reply_markup: buildWhatsappMessagesKeyboard() });
    return;
  }

  if (data === 'dev_toggle_auto_reply') {
    SETTINGS.auto_reply_enabled = !SETTINGS.auto_reply_enabled;
    saveSettings();
    await bot.sendMessage(chatId, `تم تحديث حالة الرد التلقائي إلى: ${SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌'}\n\n${settingsText()}`, { reply_markup: buildDevKeyboard() });
    return;
  }

  if (data === 'dev_toggle_force_sub') {
    SETTINGS.force_sub_enabled = !SETTINGS.force_sub_enabled;
    saveSettings();
    await bot.sendMessage(chatId, `تم تحديث الاشتراك الإجباري إلى: ${SETTINGS.force_sub_enabled ? 'مفعل ✅' : 'معطل ❌'}`, { reply_markup: buildForceSubKeyboard() });
    return;
  }

  if (data === 'dev_broadcast') {
    session.admin_waiting_field = 'broadcast_message';
    saveSessions();
    await bot.sendMessage(chatId, '📢 أرسل الآن الرسالة التي تريد إرسالها لكل المستخدمين.');
    return;
  }

  if (data === 'dev_set_start_message') {
    session.admin_waiting_field = 'set_start_message';
    saveSessions();
    await bot.sendMessage(chatId, '📝 أرسل الآن رسالة /start الجديدة بالكامل.\nالمتغيرات المتاحة: {emoji} {auto_reply_status} {admin_text} {green_status} {dev_hint}');
    return;
  }

  if (['dev_set_api_url', 'dev_set_api_token', 'dev_set_number_field', 'dev_set_api_method', 'dev_set_force_sub_channel', 'dev_set_force_sub_url', 'dev_set_whatsapp_alive_message', 'dev_set_whatsapp_bot_message', 'dev_set_whatsapp_settings_message'].includes(data)) {
    const field = data.replace('dev_', '');
    session.admin_waiting_field = field;
    saveSessions();
    const prompts = {
      set_api_url: '🌐 أرسل رابط خدمة الربط الجديد الآن.',
      set_api_token: '🔐 أرسل API Token الجديد الآن.',
      set_number_field: '📮 أرسل اسم حقل الرقم المطلوب، مثال: number أو phone.',
      set_api_method: '🔁 أرسل طريقة الطلب: GET أو POST',
      set_force_sub_channel: '📢 أرسل يوزر القناة أو الـ ID.',
      set_force_sub_url: '🔗 أرسل رابط الاشتراك.',
      set_whatsapp_alive_message: '🟢 أرسل الآن نص رسالة .alive الجديدة.',
      set_whatsapp_bot_message: '🤖 أرسل الآن نص رسالة .bot الجديدة.',
      set_whatsapp_settings_message: '⚙️ أرسل الآن نص رسالة .settings الجديدة.',
    };
    await bot.sendMessage(chatId, prompts[field] || 'أرسل القيمة الجديدة الآن.');
    return;
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || /^\//.test(msg.text.trim())) return;
  registerUser(msg);
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const session = getUserSession(userId);

  if (session.admin_waiting_field && isAdmin(userId)) {
    const field = session.admin_waiting_field;

    if (field === 'broadcast_message') {
      session.admin_waiting_field = '';
      saveSessions();
      await bot.sendMessage(chatId, '⏳ جاري إرسال الرسالة لكل المستخدمين...');
      const result = await broadcastMessageToAll(text);
      await bot.sendMessage(chatId, `✅ انتهى الإرسال الجماعي.\nنجح الإرسال إلى: ${result.success}\nفشل الإرسال إلى: ${result.failed}`, { reply_markup: buildDevKeyboard() });
      return;
    }

    let value = text;
    if (field === 'set_api_method') {
      value = text.toUpperCase();
      if (!['GET', 'POST'].includes(value)) {
        await bot.sendMessage(chatId, '❌ القيمة لازم تكون GET أو POST فقط.');
        return;
      }
      SETTINGS.pair_code_api_method = value;
    } else if (field === 'set_api_url') {
      if (!/^https?:\/\//i.test(text)) {
        await bot.sendMessage(chatId, '❌ لازم الرابط يبدأ بـ http:// أو https://');
        return;
      }
      SETTINGS.pair_code_api_url = text.trim();
    } else if (field === 'set_api_token') {
      SETTINGS.pair_code_api_token = text.trim();
    } else if (field === 'set_number_field') {
      SETTINGS.pair_code_api_number_field = text.trim();
    } else if (field === 'set_start_message') {
      SETTINGS.start_message = normalizeStartMessageTemplate(text);
    } else if (field === 'set_force_sub_channel') {
      SETTINGS.force_sub_channel = text.trim();
    } else if (field === 'set_force_sub_url') {
      SETTINGS.force_sub_url = text.trim();
    } else if (field === 'set_whatsapp_alive_message') {
      SETTINGS.whatsapp_alive_message = text.trim();
    } else if (field === 'set_whatsapp_bot_message') {
      SETTINGS.whatsapp_bot_message = text.trim();
    } else if (field === 'set_whatsapp_settings_message') {
      SETTINGS.whatsapp_settings_message = text.trim();
    }

    saveSettings();
    session.admin_waiting_field = '';
    saveSessions();
    await bot.sendMessage(chatId, '✅ تم حفظ الإعداد بنجاح.', { reply_markup: buildDevKeyboard() });
    return;
  }

  if (!isAdmin(userId) && !(await ensureSubscription(chatId, userId))) return;

  if (session.awaiting_emoji) {
    const emoji = text.slice(0, 16).trim();
    USER_EMOJI_SETTINGS[String(userId)] = emoji;
    saveUserEmoji();
    session.awaiting_emoji = false;
    saveSessions();
    await bot.sendMessage(chatId, `✅ تم حفظ الإيموجي الجديد: ${emoji}`, { reply_markup: buildMainKeyboard(userId) });
    return;
  }

  if (session.awaiting_pair_number) {
    const lang = getPairLanguagePack(session.selected_pair_language || DEFAULT_PAIRING_LANGUAGE);
    if (text.startsWith('0') && !text.startsWith('00')) {
      await bot.sendMessage(chatId, lang.invalidLocal);
      return;
    }

    const number = normalizePhoneNumber(text);
    if (!number || number.length < 8 || number.length > 15) {
      await bot.sendMessage(chatId, lang.invalidNumber);
      return;
    }

    session.awaiting_pair_number = false;
    saveSessions();
    await bot.sendMessage(chatId, lang.processing.replace('{number}', number));

    try {
      const result = await requestPairCode(number);
      const payload = {
        number,
        telegram_user_id: userId,
        telegram_username: msg.from.username || '',
        telegram_full_name: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ').trim(),
        pair_language: session.selected_pair_language || DEFAULT_PAIRING_LANGUAGE,
        pair_code: result.code,
      };
      registerPendingPairing(payload);
      upsertLinkedNumber({ ...payload, raw_payload: result.raw, linked_at: new Date().toISOString() });

      const successText = (SETTINGS.whatsapp_bot_message || DEFAULT_WHATSAPP_BOT_MESSAGE).replaceAll('{code}', result.code);
      await bot.sendMessage(chatId, successText, { parse_mode: 'Markdown', reply_markup: buildMainKeyboard(userId) });
    } catch (error) {
      await bot.sendMessage(chatId, lang.error.replace('{error}', error.message || String(error)), { reply_markup: buildMainKeyboard(userId) });
    }
    return;
  }

  for (const trigger of ['تغيير ايموجي الحاله', 'تغيير إيموجي الحاله', 'تغيير ايموجي الحالة', 'تغيير إيموجي الحالة', 'غير الايموجي', 'غيّر الايموجي', 'غير الإيموجي', 'غيّر الإيموجي']) {
    if (text === trigger) {
      session.awaiting_emoji = true;
      saveSessions();
      await bot.sendMessage(chatId, '😀 أرسل الإيموجي الجديد الآن.');
      return;
    }
  }
});

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/', async (_req, res) => {
  const rootUrl = normalizeBaseUrl(SETTINGS.pair_code_api_url || DEFAULT_PAIRING_SITE).replace(/\/(api\/pairing|pairing|pair)$/i, '');
  res.json({
    ok: true,
    service: 'telegram-whatsapp-pairing-bot-js',
    startedAt: BOT_STATS.started_at,
    site: rootUrl,
    pairingApiUrl: `${rootUrl}/api/pairing`,
    qrApiUrl: `${rootUrl}/api/qr`,
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'telegram-bot',
    startedAt: BOT_STATS.started_at,
    users: REGISTERED_USERS.length,
    pairRequests: BOT_STATS.pair_requests,
    pairSuccess: BOT_STATS.pair_success,
    pairFailed: BOT_STATS.pair_failed,
  });
});

app.post('/webhook', async (req, res) => {
  try {
    if (SETTINGS.webhook_secret) {
      const sent = String(req.headers['x-webhook-secret'] || req.query.secret || '').trim();
      if (sent !== SETTINGS.webhook_secret) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }

    const payload = req.body || {};
    const number = normalizePhoneNumber(payload.number || payload.phone || payload.msisdn || payload.jid || '');
    const code = normalizePairCode(payload.code || payload.pairingCode || payload.pair_code || '');
    const userId = Number(payload.telegram_user_id || payload.telegramid || payload.user_id || payload.chat_id || 0) || null;

    if (number) {
      const existingPending = PENDING_PAIRINGS.find((item) => normalizePhoneNumber(item.number) === number);
      const effectiveUserId = userId || existingPending?.telegram_user_id || null;
      if (effectiveUserId) {
        const linked = upsertLinkedNumber({
          number,
          telegram_user_id: effectiveUserId,
          telegram_username: existingPending?.telegram_username || '',
          telegram_full_name: existingPending?.telegram_full_name || '',
          pair_code: code || existingPending?.pair_code || '',
          pair_language: existingPending?.pair_language || DEFAULT_PAIRING_LANGUAGE,
          raw_payload: payload,
          linked_at: new Date().toISOString(),
        });
        try {
          await bot.sendMessage(effectiveUserId, `✅ تم تأكيد ربط الرقم ${linked.number} بنجاح داخل البوت.`, {
            reply_markup: buildMainKeyboard(effectiveUserId),
          });
        } catch (_) {}
      }
    }

    return res.status(202).json({ ok: true, status: 'accepted' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Webhook failure' });
  }
});

const PORT = Number(process.env.PORT || 10000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bot server running on port ${PORT}`);
  console.log(`Admin ID: ${ADMIN_ID}`);
  console.log(`Pairing base URL: ${SETTINGS.pair_code_api_url}`);
  console.log(`BOT_TOKEN valid: ${isLikelyValidTelegramToken(BOT_TOKEN) ? 'yes' : 'check token value'}`);
});

bot.setMyCommands([
  { command: 'start', description: 'تشغيل البوت' },
  { command: 'menu', description: 'عرض القائمة الرئيسية' },
  { command: 'help', description: 'المساعدة' },
  { command: 'ping', description: 'فحص البوت' },
  { command: 'dev', description: 'لوحة المطور' },
]).catch(() => {});
