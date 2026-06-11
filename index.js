const fs = require('fs');
const path = require('path');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const BASE_DIR = __dirname;
const SETTINGS_PATH = path.join(BASE_DIR, 'bot_settings.json');
const USER_LINKS_PATH = path.join(BASE_DIR, 'linked_numbers.json');

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required. Put it in the .env file.');
}

const ADMIN_ID = parseInteger(process.env.ADMIN_ID, 0);
const GREEN_API_BASE_URL = String(process.env.GREEN_API_BASE_URL || 'https://api.green-api.com').trim().replace(/\/+$/, '');
const GREEN_API_ID_INSTANCE = String(process.env.GREEN_API_ID_INSTANCE || '').trim();
const GREEN_API_TOKEN_INSTANCE = String(process.env.GREEN_API_TOKEN_INSTANCE || '').trim();

function getGreenApiAuthorizationUrl() {
  if (GREEN_API_ID_INSTANCE && GREEN_API_TOKEN_INSTANCE) {
    return `${GREEN_API_BASE_URL}/waInstance${GREEN_API_ID_INSTANCE}/getAuthorizationCode/${GREEN_API_TOKEN_INSTANCE}`;
  }
  return '';
}

const DEFAULT_SETTINGS = {
  current_emoji: String(process.env.CURRENT_EMOJI || '🔥').trim() || '🔥',
  auto_reply_enabled: String(process.env.AUTO_REPLY_ENABLED || 'true').toLowerCase() === 'true',
  pair_code_api_url: String(process.env.PAIR_CODE_API_URL || '').trim() || getGreenApiAuthorizationUrl(),
  pair_code_api_method: String(process.env.PAIR_CODE_API_METHOD || 'POST').trim().toUpperCase() || 'POST',
  pair_code_api_token: String(process.env.PAIR_CODE_API_TOKEN || '').trim(),
  pair_code_api_number_field: String(process.env.PAIR_CODE_API_NUMBER_FIELD || 'phoneNumber').trim() || 'phoneNumber'
};

const DEFAULT_LINKED_NUMBERS = {
  users: {},
  numbers: {}
};

const BOT_STATS = {
  startedAt: new Date(),
  totalUsers: new Set(),
  pairRequests: 0,
  pairSuccess: 0,
  pairFailed: 0
};

const ADMIN_INPUT_FIELDS = {
  set_emoji: 'current_emoji',
  set_api_url: 'pair_code_api_url',
  set_api_token: 'pair_code_api_token',
  set_api_method: 'pair_code_api_method',
  set_number_field: 'pair_code_api_number_field'
};

const userStates = new Map();

function ensureSettingsShape(source) {
  const data = { ...DEFAULT_SETTINGS, ...(source || {}) };

  data.pair_code_api_method = String(data.pair_code_api_method || 'POST').trim().toUpperCase();
  if (!['GET', 'POST'].includes(data.pair_code_api_method)) {
    data.pair_code_api_method = 'POST';
  }

  data.pair_code_api_number_field = String(data.pair_code_api_number_field || 'phoneNumber').trim() || 'phoneNumber';
  data.current_emoji = String(data.current_emoji || '🔥').trim().slice(0, 10) || '🔥';
  data.auto_reply_enabled = Boolean(data.auto_reply_enabled);
  data.pair_code_api_url = String(data.pair_code_api_url || '').trim();
  data.pair_code_api_token = String(data.pair_code_api_token || '').trim();

  return data;
}

function normalizePhoneNumber(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  return digits;
}

function normalizeEmojiValue(value, fallback = '🔥') {
  return String(value || fallback).trim().slice(0, 10) || fallback;
}

function ensureLinkedNumbersShape(source) {
  const users = {};
  const numbers = {};
  const input = source && typeof source === 'object' ? source : {};

  if (input.users && typeof input.users === 'object' && !Array.isArray(input.users)) {
    for (const [userId, profile] of Object.entries(input.users)) {
      if (!profile || typeof profile !== 'object') {
        continue;
      }

      const linkedNumber = normalizePhoneNumber(profile.linkedNumber || profile.number || '');
      if (!linkedNumber) {
        continue;
      }

      const emoji = normalizeEmojiValue(profile.emoji, DEFAULT_SETTINGS.current_emoji);
      const linkedAt = String(profile.linkedAt || new Date().toISOString());
      const updatedAt = String(profile.updatedAt || linkedAt);

      users[String(userId)] = {
        linkedNumber,
        emoji,
        linkedAt,
        updatedAt
      };

      numbers[linkedNumber] = {
        ownerUserId: String(userId),
        emoji,
        linkedAt,
        updatedAt
      };
    }
  }

  if (input.numbers && typeof input.numbers === 'object' && !Array.isArray(input.numbers)) {
    for (const [rawNumber, profile] of Object.entries(input.numbers)) {
      if (!profile || typeof profile !== 'object') {
        continue;
      }

      const number = normalizePhoneNumber(rawNumber || profile.linkedNumber || profile.number || '');
      const ownerUserId = String(profile.ownerUserId || profile.userId || '').trim();
      if (!number || !ownerUserId) {
        continue;
      }

      const emoji = normalizeEmojiValue(profile.emoji, DEFAULT_SETTINGS.current_emoji);
      const linkedAt = String(profile.linkedAt || new Date().toISOString());
      const updatedAt = String(profile.updatedAt || linkedAt);

      numbers[number] = {
        ownerUserId,
        emoji,
        linkedAt,
        updatedAt
      };

      if (!users[ownerUserId]) {
        users[ownerUserId] = {
          linkedNumber: number,
          emoji,
          linkedAt,
          updatedAt
        };
      }
    }
  }

  return { users, numbers };
}

function loadJsonFile(filePath, fallbackFactory) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return fallbackFactory(JSON.parse(raw));
    }
  } catch (error) {
    console.error(`Failed to load ${path.basename(filePath)}:`, error.message);
  }
  return fallbackFactory({});
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadSettings() {
  return loadJsonFile(SETTINGS_PATH, ensureSettingsShape);
}

function saveSettings() {
  saveJsonFile(SETTINGS_PATH, SETTINGS);
}

function loadLinkedNumbers() {
  return loadJsonFile(USER_LINKS_PATH, ensureLinkedNumbersShape);
}

function saveLinkedNumbers() {
  saveJsonFile(USER_LINKS_PATH, LINKED_NUMBERS);
}

const SETTINGS = loadSettings();
const LINKED_NUMBERS = loadLinkedNumbers();

function ensureLinkedFilesOnDisk() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      saveSettings();
    }
    if (!fs.existsSync(USER_LINKS_PATH)) {
      saveLinkedNumbers();
    }
  } catch (error) {
    console.error('Failed to initialize data files:', error.message);
  }
}

function getUserState(userId) {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      awaitingPairNumber: false,
      awaitingUserEmoji: false,
      adminWaitingField: null
    });
  }
  return userStates.get(userId);
}

function clearInputState(state) {
  state.awaitingPairNumber = false;
  state.awaitingUserEmoji = false;
  state.adminWaitingField = null;
}

function registerUser(msgOrQuery) {
  const userId = msgOrQuery?.from?.id;
  if (userId) {
    BOT_STATS.totalUsers.add(userId);
  }
}

function isAdmin(msgOrQuery) {
  return Boolean(ADMIN_ID && msgOrQuery?.from?.id === ADMIN_ID);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLinkedProfile(userId) {
  return LINKED_NUMBERS.users[String(userId)] || null;
}

function getNumberProfile(number) {
  const normalized = normalizePhoneNumber(number);
  return normalized ? LINKED_NUMBERS.numbers[normalized] || null : null;
}

function getEffectiveEmojiForUser(userId) {
  const profile = getLinkedProfile(userId);
  return profile?.emoji || SETTINGS.current_emoji;
}

function unlinkPreviousNumberForUser(userId, exceptNumber = '') {
  const profile = getLinkedProfile(userId);
  if (!profile?.linkedNumber) {
    return;
  }

  const previousNumber = normalizePhoneNumber(profile.linkedNumber);
  const keepNumber = normalizePhoneNumber(exceptNumber);
  if (!previousNumber || previousNumber === keepNumber) {
    return;
  }

  const numberProfile = getNumberProfile(previousNumber);
  if (numberProfile && String(numberProfile.ownerUserId) === String(userId)) {
    delete LINKED_NUMBERS.numbers[previousNumber];
  }
}

function linkNumberToUser(userId, number) {
  const normalizedUserId = String(userId);
  const normalizedNumber = normalizePhoneNumber(number);
  if (!normalizedNumber) {
    throw new Error('الرقم غير صالح للربط.');
  }

  const existingNumberProfile = getNumberProfile(normalizedNumber);
  if (existingNumberProfile && String(existingNumberProfile.ownerUserId) !== normalizedUserId) {
    throw new Error('هذا الرقم مرتبط بالفعل مع مستخدم آخر، ولا يمكن تعديل إيموجيه إلا من جلسته الخاصة.');
  }

  unlinkPreviousNumberForUser(normalizedUserId, normalizedNumber);

  const existingUserProfile = getLinkedProfile(normalizedUserId);
  const existingEmoji = existingUserProfile?.emoji || existingNumberProfile?.emoji || SETTINGS.current_emoji;
  const linkedAt = existingUserProfile?.linkedNumber === normalizedNumber
    ? existingUserProfile.linkedAt
    : new Date().toISOString();
  const updatedAt = new Date().toISOString();

  LINKED_NUMBERS.users[normalizedUserId] = {
    linkedNumber: normalizedNumber,
    emoji: normalizeEmojiValue(existingEmoji, SETTINGS.current_emoji),
    linkedAt,
    updatedAt
  };

  LINKED_NUMBERS.numbers[normalizedNumber] = {
    ownerUserId: normalizedUserId,
    emoji: normalizeEmojiValue(existingEmoji, SETTINGS.current_emoji),
    linkedAt,
    updatedAt
  };

  saveLinkedNumbers();
  return LINKED_NUMBERS.users[normalizedUserId];
}

function updateEmojiForLinkedUser(userId, emoji) {
  const normalizedUserId = String(userId);
  const profile = getLinkedProfile(normalizedUserId);
  if (!profile?.linkedNumber) {
    throw new Error('لا يوجد رقم مربوط لهذا المستخدم بعد.');
  }

  const normalizedEmoji = normalizeEmojiValue(emoji, SETTINGS.current_emoji);
  const updatedAt = new Date().toISOString();

  LINKED_NUMBERS.users[normalizedUserId] = {
    ...profile,
    emoji: normalizedEmoji,
    updatedAt
  };

  LINKED_NUMBERS.numbers[profile.linkedNumber] = {
    ownerUserId: normalizedUserId,
    emoji: normalizedEmoji,
    linkedAt: profile.linkedAt || updatedAt,
    updatedAt
  };

  saveLinkedNumbers();
  return LINKED_NUMBERS.users[normalizedUserId];
}

function buildMainKeyboard(admin = false) {
  const inline_keyboard = [
    [{ text: '📞 ربط كود', callback_data: 'pair_code' }],
    [{ text: '😀 تغيير إيموجي رقمي', callback_data: 'user_change_emoji' }],
    [{ text: '📱 رقمي المربوط', callback_data: 'my_linked_number' }],
    [{ text: '🔄 تحديث', callback_data: 'refresh_home' }]
  ];

  if (admin) {
    inline_keyboard.push([{ text: '🛠 لوحة المطور', callback_data: 'dev_panel' }]);
  }

  return { inline_keyboard };
}

function buildDevKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 الإحصائيات', callback_data: 'dev_stats' }],
      [{ text: '⚙️ الإعدادات', callback_data: 'dev_settings' }],
      [{ text: '✅/❌ تفعيل الرد التلقائي', callback_data: 'dev_toggle_auto_reply' }],
      [{ text: '😀 تغيير الإيموجي الافتراضي', callback_data: 'dev_set_emoji' }],
      [{ text: '🔗 إعداد خدمة الربط', callback_data: 'dev_pair_api' }],
      [{ text: '🏠 رجوع للرئيسية', callback_data: 'refresh_home' }]
    ]
  };
}

function buildPairApiKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🌐 تعيين API URL', callback_data: 'dev_set_api_url' }],
      [{ text: '🔐 تعيين API Token', callback_data: 'dev_set_api_token' }],
      [{ text: '📮 اسم حقل الرقم', callback_data: 'dev_set_number_field' }],
      [{ text: '🔁 GET / POST', callback_data: 'dev_set_api_method' }],
      [{ text: '⬅️ رجوع', callback_data: 'dev_panel' }]
    ]
  };
}

function welcomeText(msgOrQuery) {
  const admin = isAdmin(msgOrQuery);
  const userId = msgOrQuery?.from?.id;
  const userEmoji = userId ? getEffectiveEmojiForUser(userId) : SETTINGS.current_emoji;
  const linkedProfile = userId ? getLinkedProfile(userId) : null;
  const autoReplyStatus = SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌';
  const devHint = admin ? '\n🛠 عندك صلاحية لوحة المطور.' : '';
  const adminText = ADMIN_ID ? `👑 المطور الأساسي: <code>${escapeHtml(ADMIN_ID)}</code>` : '👑 المطور الأساسي غير مضبوط بعد';
  const greenStatus = resolvePairCodeApiUrl() ? '\n🟢 خدمة الربط جاهزة' : '\n🟡 خدمة الربط غير مكتملة الإعداد';
  const linkedText = linkedProfile?.linkedNumber
    ? `📱 رقمك المربوط: <code>${escapeHtml(linkedProfile.linkedNumber)}</code>\n😀 إيموجي رقمك: ${escapeHtml(linkedProfile.emoji)}`
    : '📱 لا يوجد رقم مربوط حالياً\n😀 سيتم استخدام الإيموجي الافتراضي بعد الربط';

  return [
    '👋 مرحباً بك!',
    `${escapeHtml(userEmoji)} الإيموجي النشط لك الآن: ${escapeHtml(userEmoji)}`,
    linkedText,
    `📨 حالة الرد التلقائي: ${autoReplyStatus}`,
    adminText + greenStatus + devHint
  ].join('\n');
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function adminStatusText() {
  const tokenStatus = SETTINGS.pair_code_api_token || GREEN_API_TOKEN_INSTANCE ? 'مضبوط ✅' : 'غير مضبوط ❌';
  const autoReplyStatus = SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌';
  return [
    '🛠 <b>لوحة المطور</b>',
    '',
    `👑 <b>Admin ID:</b> <code>${escapeHtml(ADMIN_ID || 'not-set')}</code>`,
    `⏱ <b>مدة التشغيل:</b> <code>${formatDuration(Date.now() - BOT_STATS.startedAt.getTime())}</code>`,
    `👥 <b>عدد المستخدمين:</b> <code>${BOT_STATS.totalUsers.size}</code>`,
    `📞 <b>طلبات الربط:</b> <code>${BOT_STATS.pairRequests}</code>`,
    `✅ <b>نجاح الربط:</b> <code>${BOT_STATS.pairSuccess}</code>`,
    `❌ <b>فشل الربط:</b> <code>${BOT_STATS.pairFailed}</code>`,
    `😀 <b>الإيموجي الافتراضي:</b> <code>${escapeHtml(SETTINGS.current_emoji)}</code>`,
    `🔗 <b>الأرقام المربوطة:</b> <code>${Object.keys(LINKED_NUMBERS.numbers).length}</code>`,
    `📨 <b>الرد التلقائي:</b> ${autoReplyStatus}`,
    `🌐 <b>API URL:</b> <code>${escapeHtml(resolvePairCodeApiUrl() || 'غير مضبوط')}</code>`,
    `🔁 <b>API Method:</b> <code>${escapeHtml(SETTINGS.pair_code_api_method)}</code>`,
    `📮 <b>اسم حقل الرقم:</b> <code>${escapeHtml(SETTINGS.pair_code_api_number_field)}</code>`,
    `🔐 <b>API Token:</b> ${tokenStatus}`
  ].join('\n');
}

function settingsText() {
  return [
    '⚙️ <b>إعدادات البوت الحالية</b>',
    '',
    `😀 الإيموجي الافتراضي: <code>${escapeHtml(SETTINGS.current_emoji)}</code>`,
    `📨 الرد التلقائي: <code>${SETTINGS.auto_reply_enabled ? 'true' : 'false'}</code>`,
    `🌐 API URL: <code>${escapeHtml(resolvePairCodeApiUrl() || 'غير مضبوط')}</code>`,
    `🔁 API Method: <code>${escapeHtml(SETTINGS.pair_code_api_method)}</code>`,
    `📮 حقل الرقم: <code>${escapeHtml(SETTINGS.pair_code_api_number_field)}</code>`,
    `🔐 API Token: <code>${SETTINGS.pair_code_api_token || GREEN_API_TOKEN_INSTANCE ? 'configured' : 'not configured'}</code>`,
    `🔗 الملفات الخاصة بالربط: <code>${escapeHtml(path.basename(USER_LINKS_PATH))}</code>`
  ].join('\n');
}

function buildNumberVariants(raw) {
  const normalized = normalizePhoneNumber(raw);
  const variants = [];
  if (normalized) {
    variants.push(normalized);
    variants.push(`+${normalized}`);
    variants.push(`00${normalized}`);
  }
  return [...new Set(variants.filter(Boolean))];
}

function findCodeInPayload(payload) {
  const keysPriority = [
    'pair_code',
    'pairing_code',
    'pairingCode',
    'code',
    'link_code',
    'linkCode',
    'authorizationCode',
    'authCode',
    'message'
  ];

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const key of keysPriority) {
      const value = payload[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    for (const value of Object.values(payload)) {
      const found = findCodeInPayload(value);
      if (found) {
        return found;
      }
    }
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findCodeInPayload(item);
      if (found) {
        return found;
      }
    }
  }

  if (typeof payload === 'string') {
    const stripped = payload.trim();
    if (stripped && stripped.length <= 128) {
      return stripped;
    }
  }

  return null;
}

function resolvePairCodeApiUrl() {
  return SETTINGS.pair_code_api_url || getGreenApiAuthorizationUrl();
}

async function requestPairCode(number) {
  const apiUrl = resolvePairCodeApiUrl();
  if (!apiUrl) {
    throw new Error('خدمة الربط غير مضبوطة. أضف معلومات Green API داخل ملف .env أو من لوحة المطور.');
  }

  let lastError = null;

  for (const numberVariant of buildNumberVariants(number)) {
    const headers = {
      Accept: 'application/json'
    };

    const token = SETTINGS.pair_code_api_token || GREEN_API_TOKEN_INSTANCE;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers['x-api-key'] = token;
    }

    const cleanNumber = normalizePhoneNumber(numberVariant);
    const payload = {
      [SETTINGS.pair_code_api_number_field]: Number.isSafeInteger(Number(cleanNumber)) ? Number(cleanNumber) : cleanNumber
    };

    try {
      const method = SETTINGS.pair_code_api_method === 'GET' ? 'get' : 'post';
      const response = await axios({
        method,
        url: apiUrl,
        timeout: 45000,
        headers: {
          ...headers,
          ...(method === 'post' ? { 'Content-Type': 'application/json' } : {})
        },
        params: method === 'get' ? payload : undefined,
        data: method === 'post' ? payload : undefined,
        validateStatus: () => true
      });

      if (response.status < 200 || response.status >= 300) {
        lastError = new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
        continue;
      }

      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const code = findCodeInPayload(response.data);
        if (code) {
          return code;
        }
        lastError = new Error(`لم يتم العثور على كود داخل الاستجابة للرقم ${numberVariant}`);
        continue;
      }

      const text = typeof response.data === 'string'
        ? response.data.trim()
        : JSON.stringify(response.data || '').trim();

      if (text) {
        return text;
      }

      lastError = new Error(`الاستجابة فارغة للرقم ${numberVariant}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`فشل استخراج كود الربط. آخر خطأ: ${lastError?.message || 'Unknown error'}`);
}

async function safeEditMessageText(bot, chatId, messageId, text, options) {
  try {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...options });
  } catch (error) {
    if (String(error.message || '').includes('message is not modified')) {
      return;
    }
    throw error;
  }
}

function linkedNumberInfoText(userId) {
  const profile = getLinkedProfile(userId);
  if (!profile?.linkedNumber) {
    return [
      '📱 لا يوجد رقم مربوط حالياً.',
      'استخدم زر "📞 ربط كود" ثم أرسل رقمك بصيغة دولية.',
      `😀 الإيموجي الافتراضي الحالي: ${escapeHtml(SETTINGS.current_emoji)}`
    ].join('\n');
  }

  return [
    '📱 <b>بيانات رقمك المربوط</b>',
    '',
    `☎️ الرقم: <code>${escapeHtml(profile.linkedNumber)}</code>`,
    `😀 الإيموجي الخاص به: ${escapeHtml(profile.emoji)}`,
    `🕒 تاريخ الربط: <code>${escapeHtml(profile.linkedAt || '-')}</code>`,
    'ℹ️ أي تغيير للإيموجي من جلستك سيُطبق على هذا الرقم فقط.'
  ].join('\n');
}

async function handleStartLike(bot, msg) {
  registerUser(msg);
  const state = getUserState(msg.from.id);
  clearInputState(state);
  await bot.sendMessage(msg.chat.id, welcomeText(msg), {
    parse_mode: 'HTML',
    reply_markup: buildMainKeyboard(isAdmin(msg))
  });
}

async function handleDevCommand(bot, msg) {
  registerUser(msg);
  if (!isAdmin(msg)) {
    await bot.sendMessage(msg.chat.id, '⛔ هذه الواجهة للمطور فقط.');
    return;
  }

  await bot.sendMessage(msg.chat.id, adminStatusText(), {
    parse_mode: 'HTML',
    reply_markup: buildDevKeyboard()
  });
}

async function handleEmojiCommand(bot, msg) {
  registerUser(msg);
  const state = getUserState(msg.from.id);
  const profile = getLinkedProfile(msg.from.id);

  if (!profile?.linkedNumber) {
    clearInputState(state);
    await bot.sendMessage(msg.chat.id,
      '❌ لا يوجد رقم مربوط في جلستك حالياً.\nابدأ أولاً من زر "📞 ربط كود" ثم بعد نجاح الربط يمكنك تغيير إيموجي رقمك فقط.',
      {
        reply_markup: buildMainKeyboard(isAdmin(msg))
      }
    );
    return;
  }

  clearInputState(state);
  state.awaitingUserEmoji = true;
  await bot.sendMessage(msg.chat.id,
    `😀 أرسل الإيموجي الجديد الآن لرقمك المربوط <code>${escapeHtml(profile.linkedNumber)}</code>.`,
    { parse_mode: 'HTML' }
  );
}

async function handleCallback(bot, query) {
  registerUser(query);
  const userId = query.from.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const state = getUserState(userId);

  await bot.answerCallbackQuery(query.id);

  if (!chatId || !messageId) {
    return;
  }

  if (query.data === 'pair_code') {
    clearInputState(state);
    state.awaitingPairNumber = true;
    await bot.sendMessage(chatId,
      '📞 الربط باستخدام كود الاقتران\nمن فضلك أرسل رقم هاتفك في الواتساب مع رمز الدولة.\n\nمثال: 201012345678\n(أرسل الأرقام فقط بدون علامة + أو مسافات)'
    );
    return;
  }

  if (query.data === 'user_change_emoji') {
    const profile = getLinkedProfile(userId);
    if (!profile?.linkedNumber) {
      clearInputState(state);
      await bot.sendMessage(chatId,
        '❌ لا يوجد رقم مربوط في جلستك حتى الآن.\nاربط رقمك أولاً من زر "📞 ربط كود" وبعدها غيّر الإيموجي الخاص بهذا الرقم فقط.'
      );
      return;
    }

    clearInputState(state);
    state.awaitingUserEmoji = true;
    await bot.sendMessage(chatId,
      `😀 أرسل الإيموجي الجديد الآن لرقمك المربوط <code>${escapeHtml(profile.linkedNumber)}</code>.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (query.data === 'my_linked_number') {
    clearInputState(state);
    await bot.sendMessage(chatId, linkedNumberInfoText(userId), {
      parse_mode: 'HTML',
      reply_markup: buildMainKeyboard(isAdmin(query))
    });
    return;
  }

  if (query.data === 'refresh_home') {
    clearInputState(state);
    await safeEditMessageText(bot, chatId, messageId, welcomeText(query), {
      parse_mode: 'HTML',
      reply_markup: buildMainKeyboard(isAdmin(query))
    });
    return;
  }

  if (!isAdmin(query)) {
    await bot.sendMessage(chatId, '⛔ هذه الأوامر للمطور فقط.');
    return;
  }

  if (query.data === 'dev_panel' || query.data === 'dev_stats') {
    await safeEditMessageText(bot, chatId, messageId, adminStatusText(), {
      parse_mode: 'HTML',
      reply_markup: buildDevKeyboard()
    });
    return;
  }

  if (query.data === 'dev_settings') {
    await safeEditMessageText(bot, chatId, messageId, settingsText(), {
      parse_mode: 'HTML',
      reply_markup: buildDevKeyboard()
    });
    return;
  }

  if (query.data === 'dev_toggle_auto_reply') {
    SETTINGS.auto_reply_enabled = !SETTINGS.auto_reply_enabled;
    saveSettings();
    const status = SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌';
    await safeEditMessageText(bot, chatId, messageId, `تم تحديث حالة الرد التلقائي إلى: ${status}\n\n${settingsText()}`, {
      parse_mode: 'HTML',
      reply_markup: buildDevKeyboard()
    });
    return;
  }

  if (query.data === 'dev_set_emoji') {
    clearInputState(state);
    state.adminWaitingField = 'set_emoji';
    await bot.sendMessage(chatId, '😀 أرسل الإيموجي الافتراضي الجديد الآن.');
    return;
  }

  if (query.data === 'dev_pair_api') {
    await safeEditMessageText(bot, chatId, messageId,
      '🔗 <b>إعداد خدمة الربط</b>\n\nمن هنا تقدر تغيّر رابط الخدمة، التوكن، اسم حقل الرقم، وطريقة الإرسال.',
      {
        parse_mode: 'HTML',
        reply_markup: buildPairApiKeyboard()
      }
    );
    return;
  }

  if (['dev_set_api_url', 'dev_set_api_token', 'dev_set_number_field', 'dev_set_api_method'].includes(query.data)) {
    clearInputState(state);
    state.adminWaitingField = query.data.replace('dev_', '');
    const prompts = {
      dev_set_api_url: '🌐 أرسل رابط خدمة الربط الجديد الآن.',
      dev_set_api_token: '🔐 أرسل API Token الجديد الآن.',
      dev_set_number_field: '📮 أرسل اسم حقل الرقم المطلوب، مثال: number أو phoneNumber.',
      dev_set_api_method: '🔁 أرسل طريقة الطلب: GET أو POST'
    };
    await bot.sendMessage(chatId, prompts[query.data]);
  }
}

async function handleText(bot, msg) {
  if (!msg.text || msg.text.startsWith('/')) {
    return;
  }

  registerUser(msg);
  const userId = msg.from.id;
  const state = getUserState(userId);
  const text = msg.text.trim();

  if (state.adminWaitingField && isAdmin(msg)) {
    const fieldName = ADMIN_INPUT_FIELDS[state.adminWaitingField];

    if (!fieldName) {
      clearInputState(state);
      await bot.sendMessage(msg.chat.id, '⚠️ لم يتم التعرف على العملية المطلوبة.');
      return;
    }

    let value = text;

    if (state.adminWaitingField === 'set_api_method') {
      value = text.toUpperCase().trim();
      if (!['GET', 'POST'].includes(value)) {
        await bot.sendMessage(msg.chat.id, '❌ القيمة لازم تكون GET أو POST فقط.');
        return;
      }
    } else if (state.adminWaitingField === 'set_emoji') {
      value = normalizeEmojiValue(text, SETTINGS.current_emoji);
    } else if (state.adminWaitingField === 'set_number_field') {
      value = text.trim();
      if (!value) {
        await bot.sendMessage(msg.chat.id, '❌ اسم الحقل لا يمكن أن يكون فارغ.');
        return;
      }
    } else if (state.adminWaitingField === 'set_api_url') {
      value = text.trim();
      if (value && !/^https?:\/\//i.test(value)) {
        await bot.sendMessage(msg.chat.id, '❌ لازم الرابط يبدأ بـ http:// أو https://');
        return;
      }
    }

    SETTINGS[fieldName] = value;
    saveSettings();
    clearInputState(state);

    await bot.sendMessage(msg.chat.id, `✅ تم حفظ الإعداد بنجاح.\n\n${settingsText()}`, {
      parse_mode: 'HTML',
      reply_markup: buildDevKeyboard()
    });
    return;
  }

  if (state.awaitingUserEmoji) {
    try {
      const profile = updateEmojiForLinkedUser(userId, text);
      clearInputState(state);
      await bot.sendMessage(msg.chat.id,
        `✅ تم تغيير إيموجي رقمك بنجاح.\n\n📱 الرقم: <code>${escapeHtml(profile.linkedNumber)}</code>\n😀 الإيموجي الجديد: ${escapeHtml(profile.emoji)}\n\nهذا التغيير يخص رقمك المربوط فقط.`,
        {
          parse_mode: 'HTML',
          reply_markup: buildMainKeyboard(isAdmin(msg))
        }
      );
    } catch (error) {
      clearInputState(state);
      await bot.sendMessage(msg.chat.id,
        `❌ تعذر تحديث الإيموجي: ${escapeHtml(error.message || 'Unknown error')}`,
        {
          parse_mode: 'HTML',
          reply_markup: buildMainKeyboard(isAdmin(msg))
        }
      );
    }
    return;
  }

  if (!state.awaitingPairNumber) {
    if (SETTINGS.auto_reply_enabled) {
      await bot.sendMessage(msg.chat.id, 'أهلاً بك 👋\nاستخدم /start أو /menu لعرض الواجهة الرئيسية.', {
        reply_markup: buildMainKeyboard(isAdmin(msg))
      });
    }
    return;
  }

  const rawText = text;
  const number = normalizePhoneNumber(rawText);

  if (rawText.startsWith('0') && !rawText.startsWith('00')) {
    await bot.sendMessage(msg.chat.id,
      '❌ اكتب الرقم بصيغة دولية كاملة مع رمز الدولة، وليس بصيغة محلية تبدأ بـ 0.\nمثال صحيح: 201012345678'
    );
    return;
  }

  if (!number || number.length < 8 || number.length > 15) {
    await bot.sendMessage(msg.chat.id,
      '❌ الرقم غير صحيح.\nأرسل الرقم بصيغة دولية مثل: 201012345678'
    );
    return;
  }

  BOT_STATS.pairRequests += 1;
  await bot.sendMessage(msg.chat.id, `⏳ جاري طلب كود الربط للرقم: <code>${escapeHtml(number)}</code>`, { parse_mode: 'HTML' });

  try {
    const code = await requestPairCode(number);
    const profile = linkNumberToUser(userId, number);
    BOT_STATS.pairSuccess += 1;
    clearInputState(state);

    await bot.sendMessage(msg.chat.id,
      `✅ تم استخراج كود الربط بنجاح\n\n📱 الرقم المربوط في جلستك: <code>${escapeHtml(profile.linkedNumber)}</code>\n🔐 الكود: <code>${escapeHtml(code)}</code>\n😀 الإيموجي الحالي لهذا الرقم: ${escapeHtml(profile.emoji)}\n\nافتح واتساب > الأجهزة المرتبطة > ربط جهاز > إدخال الكود.\nبعد إكمال الربط يمكنك استخدام زر تغيير الإيموجي، وسيتم تطبيقه على رقمك هذا فقط.`,
      {
        parse_mode: 'HTML',
        reply_markup: buildMainKeyboard(isAdmin(msg))
      }
    );
  } catch (error) {
    BOT_STATS.pairFailed += 1;
    clearInputState(state);
    console.error('Failed to get pair code for %s:', number, error.message);
    await bot.sendMessage(msg.chat.id,
      `❌ حصل خطأ أثناء طلب كود الربط.\nلازم تضبط خدمة الربط بالكامل في ملف .env أو من لوحة المطور.\nتفاصيل الخطأ: ${escapeHtml(error.message || 'Unknown error')}`,
      {
        parse_mode: 'HTML',
        reply_markup: buildMainKeyboard(isAdmin(msg))
      }
    );
  }
}

async function bootstrap() {
  ensureLinkedFilesOnDisk();

  if (!resolvePairCodeApiUrl()) {
    console.warn('Warning: pairing API is not configured yet.');
  }

  const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      params: {
        timeout: 30
      }
    }
  });

  bot.onText(/^\/start(?:@\w+)?$/, async (msg) => {
    await handleStartLike(bot, msg);
  });

  bot.onText(/^\/menu(?:@\w+)?$/, async (msg) => {
    await handleStartLike(bot, msg);
  });

  bot.onText(/^\/help(?:@\w+)?$/, async (msg) => {
    registerUser(msg);
    let text = 'استخدم /start أو /menu لعرض الواجهة الرئيسية.\nاستخدم /ping للتأكد إن البوت شغال.\nاستخدم /emoji لتغيير إيموجي الرقم المربوط في جلستك.';
    if (isAdmin(msg)) {
      text += '\nولفتح لوحة المطور استخدم /dev';
    }
    await bot.sendMessage(msg.chat.id, text, {
      reply_markup: buildMainKeyboard(isAdmin(msg))
    });
  });

  bot.onText(/^\/ping(?:@\w+)?$/, async (msg) => {
    registerUser(msg);
    await bot.sendMessage(msg.chat.id, '✅ البوت شغال.');
  });

  bot.onText(/^\/emoji(?:@\w+)?$/, async (msg) => {
    await handleEmojiCommand(bot, msg);
  });

  bot.onText(/^\/dev(?:@\w+)?$/, async (msg) => {
    await handleDevCommand(bot, msg);
  });

  bot.on('callback_query', async (query) => {
    try {
      await handleCallback(bot, query);
    } catch (error) {
      console.error('Callback error:', error);
      if (query.message?.chat?.id) {
        await bot.sendMessage(query.message.chat.id, '❌ حدث خطأ أثناء تنفيذ الطلب.');
      }
    }
  });

  bot.on('message', async (msg) => {
    try {
      await handleText(bot, msg);
    } catch (error) {
      console.error('Message handler error:', error);
      await bot.sendMessage(msg.chat.id, '❌ حدث خطأ غير متوقع أثناء معالجة الرسالة.');
    }
  });

  bot.on('polling_error', (error) => {
    const message = String(error?.message || error || 'Unknown polling error');
    console.error('Polling error:', message);
    if (message.includes('409') || message.toLowerCase().includes('terminated by other getupdates request')) {
      console.error('Another bot instance is already running with the same token.');
      process.exit(1);
    }
  });

  try {
    await bot.setMyCommands([
      { command: 'start', description: 'تشغيل البوت' },
      { command: 'menu', description: 'عرض القائمة الرئيسية' },
      { command: 'emoji', description: 'تغيير إيموجي الرقم المربوط' },
      { command: 'help', description: 'المساعدة' },
      { command: 'ping', description: 'فحص البوت' },
      { command: 'dev', description: 'لوحة المطور' }
    ]);
  } catch (error) {
    console.error('Failed to set bot commands:', error.message);
  }

  console.log('Telegram bot started successfully.');
}

bootstrap().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
