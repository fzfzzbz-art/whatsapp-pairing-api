const fs = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

/*
Environment Variables (Render / Railway / VPS)
----------------------------------------------
Required:
- BOT_TOKEN                or TELEGRAM_BOT_TOKEN / TELEGRAM_TOKEN
- ADMIN_ID                 or OWNER_ID / CHAT_ID / DEVELOPER_ID

Optional:
- CURRENT_EMOJI=🔥
- AUTO_REPLY_ENABLED=true
- PAIR_CODE_API_URL=https://whatsapp-pairing-api.onrender.com
- PAIR_CODE_API_METHOD=POST
- PAIR_CODE_API_TOKEN=
- PAIR_CODE_API_NUMBER_FIELD=phoneNumber
- LINKED_NUMBER_SYNC_URL=
- LINKED_NUMBER_SYNC_METHOD=POST
- LINKED_NUMBER_SYNC_TOKEN=
- LINKED_NUMBER_SYNC_NUMBER_FIELD=phoneNumber
- LINKED_NUMBER_SYNC_EMOJI_FIELD=emoji
- LINKED_NUMBER_SYNC_AUTO_REPLY_FIELD=autoReplyEnabled
- PORT=10000
*/

const BASE_DIR = __dirname;
const SETTINGS_PATH = path.join(BASE_DIR, 'bot_settings.json');
const LINKED_NUMBERS_PATH = path.join(BASE_DIR, 'linked_numbers.json');
const DEFAULT_PAIRING_BASE_URL = 'https://whatsapp-pairing-api.onrender.com';

function readEnv(keys, fallback = '') {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    console.error(`Failed to read JSON file: ${filePath}`, error.message);
    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return defaultValue;
}

function parseNumericId(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  const normalized = String(value || '').replace(/[^\d]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function normalizePhoneNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  return digits;
}

function buildNumberVariants(raw) {
  const normalized = normalizePhoneNumber(raw);
  const variants = [];
  if (normalized) {
    variants.push(normalized);
    variants.push(`+${normalized}`);
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
    'authCode'
  ];

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findCodeInPayload(item);
      if (found) return found;
    }
    return null;
  }

  if (payload && typeof payload === 'object') {
    for (const key of keysPriority) {
      if (payload[key]) {
        return String(payload[key]).trim();
      }
    }
    for (const value of Object.values(payload)) {
      const found = findCodeInPayload(value);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload === 'string') {
    const stripped = payload.trim();
    if (!stripped) return null;

    const exactCode = stripped.match(/\b([A-Z0-9\-]{4,64})\b/i);
    if (exactCode) {
      return exactCode[1];
    }

    if (stripped.length <= 128) {
      return stripped;
    }
  }

  return null;
}

function resolveGreenAuthorizationUrl() {
  if (process.env.GREEN_API_ID_INSTANCE && process.env.GREEN_API_TOKEN_INSTANCE) {
    const base = (process.env.GREEN_API_BASE_URL || 'https://api.green-api.com').trim().replace(/\/$/, '');
    return `${base}/waInstance${process.env.GREEN_API_ID_INSTANCE}/getAuthorizationCode/${process.env.GREEN_API_TOKEN_INSTANCE}`;
  }
  return '';
}

function normalizeApiBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function buildPairingUrlCandidates(inputUrl) {
  const normalized = normalizeApiBaseUrl(inputUrl);
  if (!normalized) return [];

  try {
    const parsed = new URL(normalized);
    const cleanPath = parsed.pathname.replace(/\/$/, '');

    if (!cleanPath || cleanPath === '') {
      return [normalized];
    }

    if (cleanPath === '/') {
      const base = normalized.replace(/\/$/, '');
      return [
        base,
        `${base}/pair`,
        `${base}/pair-code`,
        `${base}/code`,
        `${base}/api/pair`,
        `${base}/api/pair-code`,
        `${base}/api/code`
      ];
    }

    return [normalized];
  } catch (_) {
    return [normalized];
  }
}

const DEFAULT_SETTINGS = {
  current_emoji: readEnv(['CURRENT_EMOJI'], '🔥'),
  auto_reply_enabled: parseBoolean(readEnv(['AUTO_REPLY_ENABLED'], 'true'), true),
  pair_code_api_url: readEnv(['PAIR_CODE_API_URL'], resolveGreenAuthorizationUrl() || DEFAULT_PAIRING_BASE_URL),
  pair_code_api_method: readEnv(['PAIR_CODE_API_METHOD'], 'POST').toUpperCase(),
  pair_code_api_token: readEnv(['PAIR_CODE_API_TOKEN', 'API_TOKEN'], ''),
  pair_code_api_number_field: readEnv(['PAIR_CODE_API_NUMBER_FIELD'], 'phoneNumber'),
  linked_number_sync_url: readEnv(['LINKED_NUMBER_SYNC_URL'], ''),
  linked_number_sync_method: readEnv(['LINKED_NUMBER_SYNC_METHOD'], 'POST').toUpperCase(),
  linked_number_sync_token: readEnv(['LINKED_NUMBER_SYNC_TOKEN'], ''),
  linked_number_sync_number_field: readEnv(['LINKED_NUMBER_SYNC_NUMBER_FIELD'], 'phoneNumber'),
  linked_number_sync_emoji_field: readEnv(['LINKED_NUMBER_SYNC_EMOJI_FIELD'], 'emoji'),
  linked_number_sync_auto_reply_field: readEnv(['LINKED_NUMBER_SYNC_AUTO_REPLY_FIELD'], 'autoReplyEnabled')
};

function sanitizeSettings(input) {
  const data = { ...DEFAULT_SETTINGS, ...(input || {}) };
  data.pair_code_api_url = normalizeApiBaseUrl(data.pair_code_api_url || DEFAULT_PAIRING_BASE_URL);
  data.linked_number_sync_url = normalizeApiBaseUrl(data.linked_number_sync_url || '');
  data.pair_code_api_method = ['GET', 'POST'].includes(String(data.pair_code_api_method || '').toUpperCase())
    ? String(data.pair_code_api_method).toUpperCase()
    : 'POST';
  data.linked_number_sync_method = ['GET', 'POST'].includes(String(data.linked_number_sync_method || '').toUpperCase())
    ? String(data.linked_number_sync_method).toUpperCase()
    : 'POST';
  data.current_emoji = String(data.current_emoji || '🔥').slice(0, 10) || '🔥';
  data.auto_reply_enabled = parseBoolean(data.auto_reply_enabled, true);
  data.pair_code_api_number_field = String(data.pair_code_api_number_field || 'phoneNumber').trim() || 'phoneNumber';
  data.linked_number_sync_number_field = String(data.linked_number_sync_number_field || 'phoneNumber').trim() || 'phoneNumber';
  data.linked_number_sync_emoji_field = String(data.linked_number_sync_emoji_field || 'emoji').trim() || 'emoji';
  data.linked_number_sync_auto_reply_field = String(data.linked_number_sync_auto_reply_field || 'autoReplyEnabled').trim() || 'autoReplyEnabled';
  data.pair_code_api_token = String(data.pair_code_api_token || '').trim();
  data.linked_number_sync_token = String(data.linked_number_sync_token || '').trim();
  return data;
}

let SETTINGS = sanitizeSettings(safeReadJson(SETTINGS_PATH, DEFAULT_SETTINGS));

function saveSettings() {
  safeWriteJson(SETTINGS_PATH, SETTINGS);
}

function loadLinkedNumbers() {
  const data = safeReadJson(LINKED_NUMBERS_PATH, { linked_numbers: [] });
  if (!Array.isArray(data.linked_numbers)) {
    return { linked_numbers: [] };
  }
  return {
    linked_numbers: data.linked_numbers.map((item) => ({
      number: normalizePhoneNumber(item.number),
      linked_at: item.linked_at || new Date().toISOString(),
      last_sync_at: item.last_sync_at || null,
      last_sync_status: item.last_sync_status || 'pending',
      settings: {
        current_emoji: item?.settings?.current_emoji || SETTINGS.current_emoji,
        auto_reply_enabled: parseBoolean(item?.settings?.auto_reply_enabled, SETTINGS.auto_reply_enabled)
      }
    })).filter((item) => item.number)
  };
}

let LINKED_NUMBERS = loadLinkedNumbers();

function saveLinkedNumbers() {
  safeWriteJson(LINKED_NUMBERS_PATH, LINKED_NUMBERS);
}

function upsertLinkedNumber(number) {
  const normalized = normalizePhoneNumber(number);
  if (!normalized) return null;

  let existing = LINKED_NUMBERS.linked_numbers.find((item) => item.number === normalized);
  if (!existing) {
    existing = {
      number: normalized,
      linked_at: new Date().toISOString(),
      last_sync_at: null,
      last_sync_status: 'pending',
      settings: {
        current_emoji: SETTINGS.current_emoji,
        auto_reply_enabled: SETTINGS.auto_reply_enabled
      }
    };
    LINKED_NUMBERS.linked_numbers.unshift(existing);
  } else {
    existing.settings.current_emoji = SETTINGS.current_emoji;
    existing.settings.auto_reply_enabled = SETTINGS.auto_reply_enabled;
  }

  saveLinkedNumbers();
  return existing;
}

function buildAuthHeaders(token) {
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-api-key'] = token;
  }
  return headers;
}

async function syncSingleLinkedNumber(numberRecord) {
  if (!SETTINGS.linked_number_sync_url) {
    numberRecord.last_sync_status = 'local-only';
    numberRecord.last_sync_at = new Date().toISOString();
    saveLinkedNumbers();
    return { ok: true, mode: 'local-only' };
  }

  const payload = {
    [SETTINGS.linked_number_sync_number_field]: Number(numberRecord.number),
    [SETTINGS.linked_number_sync_emoji_field]: SETTINGS.current_emoji,
    [SETTINGS.linked_number_sync_auto_reply_field]: SETTINGS.auto_reply_enabled
  };

  const headers = buildAuthHeaders(SETTINGS.linked_number_sync_token);

  try {
    if (SETTINGS.linked_number_sync_method === 'GET') {
      await axios.get(SETTINGS.linked_number_sync_url, {
        params: payload,
        headers,
        timeout: 45000
      });
    } else {
      await axios.post(SETTINGS.linked_number_sync_url, payload, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        timeout: 45000
      });
    }

    numberRecord.settings.current_emoji = SETTINGS.current_emoji;
    numberRecord.settings.auto_reply_enabled = SETTINGS.auto_reply_enabled;
    numberRecord.last_sync_status = 'success';
    numberRecord.last_sync_at = new Date().toISOString();
    saveLinkedNumbers();
    return { ok: true, mode: 'remote' };
  } catch (error) {
    numberRecord.last_sync_status = `failed: ${error.message}`;
    numberRecord.last_sync_at = new Date().toISOString();
    saveLinkedNumbers();
    throw error;
  }
}

async function propagateSettingsToLinkedNumbers() {
  const results = [];
  for (const item of LINKED_NUMBERS.linked_numbers) {
    item.settings.current_emoji = SETTINGS.current_emoji;
    item.settings.auto_reply_enabled = SETTINGS.auto_reply_enabled;
    try {
      const result = await syncSingleLinkedNumber(item);
      results.push({ number: item.number, ok: true, mode: result.mode });
    } catch (error) {
      results.push({ number: item.number, ok: false, error: error.message });
    }
  }
  saveLinkedNumbers();
  return results;
}

function resolvePairCodeApiUrl() {
  return SETTINGS.pair_code_api_url || resolveGreenAuthorizationUrl() || DEFAULT_PAIRING_BASE_URL;
}

async function requestPairCode(number) {
  const configuredUrl = resolvePairCodeApiUrl();
  if (!configuredUrl) {
    throw new Error('خدمة الربط غير مضبوطة. أضف بيانات الربط في Environment Variables أو من داخل لوحة المطور.');
  }

  const candidateUrls = [...new Set(buildPairingUrlCandidates(configuredUrl))];
  const numberVariants = buildNumberVariants(number);
  let lastError = null;

  for (const apiUrl of candidateUrls) {
    for (const numberVariant of numberVariants) {
      const normalizedNumber = normalizePhoneNumber(numberVariant);
      const headers = buildAuthHeaders(SETTINGS.pair_code_api_token);
      const payload = {
        [SETTINGS.pair_code_api_number_field]: Number(normalizedNumber)
      };

      try {
        let response;
        if (SETTINGS.pair_code_api_method === 'GET') {
          response = await axios.get(apiUrl, {
            params: payload,
            headers,
            timeout: 45000,
            validateStatus: () => true
          });
        } else {
          response = await axios.post(apiUrl, payload, {
            headers: { ...headers, 'Content-Type': 'application/json' },
            timeout: 45000,
            validateStatus: () => true
          });
        }

        if (response.status >= 400) {
          lastError = new Error(`HTTP ${response.status} from ${apiUrl}`);
          continue;
        }

        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('application/json')) {
          const code = findCodeInPayload(response.data);
          if (code) return code;
          lastError = new Error(`لم يتم العثور على كود ربط في استجابة الخدمة للرابط ${apiUrl}`);
          continue;
        }

        const textResponse = typeof response.data === 'string' ? response.data.trim() : '';
        if (textResponse) {
          const code = findCodeInPayload(textResponse);
          if (code) return code;
          return textResponse;
        }

        lastError = new Error(`الاستجابة فارغة من ${apiUrl}`);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw new Error(`فشل استخراج كود الربط. آخر خطأ: ${lastError ? lastError.message : 'Unknown error'}`);
}

const BOT_TOKEN = readEnv(['BOT_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_TOKEN'], '');
const ADMIN_ID = parseNumericId(readEnv(['ADMIN_ID', 'OWNER_ID', 'CHAT_ID', 'DEVELOPER_ID'], '0'));

let bot = null;
let BOT_DISABLED_REASON = '';

if (!BOT_TOKEN) {
  BOT_DISABLED_REASON = 'BOT_TOKEN is required in Environment Variables.';
} else if (!Number.isInteger(ADMIN_ID) || ADMIN_ID <= 0) {
  BOT_DISABLED_REASON = 'ADMIN_ID must be a valid Telegram numeric ID in Environment Variables.';
} else {
  bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  });
}

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
  set_number_field: 'pair_code_api_number_field',
  set_sync_url: 'linked_number_sync_url',
  set_sync_token: 'linked_number_sync_token',
  set_sync_method: 'linked_number_sync_method'
};

const userState = new Map();

function getUserState(userId) {
  if (!userState.has(userId)) {
    userState.set(userId, {
      awaitingPairNumber: false,
      adminWaitingField: null
    });
  }
  return userState.get(userId);
}

function registerUser(msg) {
  if (msg?.from?.id) {
    BOT_STATS.totalUsers.add(msg.from.id);
  }
}

function isAdmin(msg) {
  return Boolean(msg?.from?.id && msg.from.id === ADMIN_ID);
}

function buildMainKeyboard(admin = false) {
  const inline_keyboard = [
    [{ text: '📞 ربط كود', callback_data: 'pair_code' }],
    [{ text: '🔄 تحديث', callback_data: 'refresh_home' }]
  ];

  if (admin) {
    inline_keyboard.push([{ text: '🛠 لوحة المطور', callback_data: 'dev_panel' }]);
  }

  return { reply_markup: { inline_keyboard } };
}

function buildDevKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 الإحصائيات', callback_data: 'dev_stats' }],
        [{ text: '⚙️ الإعدادات', callback_data: 'dev_settings' }],
        [{ text: '📱 الأرقام المربوطة', callback_data: 'dev_linked_numbers' }],
        [{ text: '🔁 مزامنة الأرقام', callback_data: 'dev_sync_linked' }],
        [{ text: '✅/❌ تفعيل الرد التلقائي', callback_data: 'dev_toggle_auto_reply' }],
        [{ text: '😀 تغيير الإيموجي', callback_data: 'dev_set_emoji' }],
        [{ text: '🔗 إعداد خدمة الربط', callback_data: 'dev_pair_api' }],
        [{ text: '🌍 إعداد مزامنة الرقم', callback_data: 'dev_sync_api' }],
        [{ text: '🏠 رجوع للرئيسية', callback_data: 'refresh_home' }]
      ]
    }
  };
}

function buildPairApiKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌐 تعيين API URL', callback_data: 'dev_set_api_url' }],
        [{ text: '🔐 تعيين API Token', callback_data: 'dev_set_api_token' }],
        [{ text: '📮 اسم حقل الرقم', callback_data: 'dev_set_number_field' }],
        [{ text: '🔁 GET / POST', callback_data: 'dev_set_api_method' }],
        [{ text: '⬅️ رجوع', callback_data: 'dev_panel' }]
      ]
    }
  };
}

function buildSyncApiKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌐 رابط مزامنة الرقم', callback_data: 'dev_set_sync_url' }],
        [{ text: '🔐 توكن مزامنة الرقم', callback_data: 'dev_set_sync_token' }],
        [{ text: '🔁 GET / POST', callback_data: 'dev_set_sync_method' }],
        [{ text: '⬅️ رجوع', callback_data: 'dev_panel' }]
      ]
    }
  };
}

function welcomeText(admin = false) {
  const autoReplyStatus = SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌';
  const devHint = admin ? '\n🛠 عندك صلاحية لوحة المطور.' : '';
  const syncHint = SETTINGS.linked_number_sync_url ? '\n🌍 مزامنة الأرقام مفعلة' : '\n📦 مزامنة الأرقام محلية فقط';
  return [
    '👋 مرحباً بك!',
    `${SETTINGS.current_emoji} الإيموجي الحالي: ${SETTINGS.current_emoji}`,
    `📨 حالة الرد التلقائي: ${autoReplyStatus}`,
    `👑 المطور الأساسي: ${ADMIN_ID}`,
    `📱 عدد الأرقام المربوطة: ${LINKED_NUMBERS.linked_numbers.length}`,
    SETTINGS.pair_code_api_url ? '🟢 خدمة الربط جاهزة' : '🟡 خدمة الربط غير مكتملة',
    syncHint,
    devHint
  ].join('\n');
}

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function adminStatusText() {
  const uptime = formatUptime(Date.now() - BOT_STATS.startedAt.getTime());
  const autoReplyStatus = SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌';
  const tokenStatus = SETTINGS.pair_code_api_token ? 'مضبوط ✅' : 'غير مضبوط ❌';
  const syncMode = SETTINGS.linked_number_sync_url ? 'خارجي + محلي' : 'محلي فقط';

  return [
    '🛠 لوحة المطور',
    '',
    `👑 Admin ID: ${ADMIN_ID}`,
    `⏱ مدة التشغيل: ${uptime}`,
    `👥 عدد المستخدمين: ${BOT_STATS.totalUsers.size}`,
    `📞 طلبات الربط: ${BOT_STATS.pairRequests}`,
    `✅ نجاح الربط: ${BOT_STATS.pairSuccess}`,
    `❌ فشل الربط: ${BOT_STATS.pairFailed}`,
    `📱 الأرقام المربوطة: ${LINKED_NUMBERS.linked_numbers.length}`,
    `😀 الإيموجي: ${SETTINGS.current_emoji}`,
    `📨 الرد التلقائي: ${autoReplyStatus}`,
    `🌐 API URL: ${SETTINGS.pair_code_api_url || 'غير مضبوط'}`,
    `🔁 API Method: ${SETTINGS.pair_code_api_method}`,
    `📮 حقل الرقم: ${SETTINGS.pair_code_api_number_field}`,
    `🔐 API Token: ${tokenStatus}`,
    `🌍 مزامنة الأرقام: ${syncMode}`
  ].join('\n');
}

function settingsText() {
  return [
    '⚙️ إعدادات البوت الحالية',
    '',
    `😀 الإيموجي: ${SETTINGS.current_emoji}`,
    `📨 الرد التلقائي: ${SETTINGS.auto_reply_enabled}`,
    `🌐 API URL: ${SETTINGS.pair_code_api_url || 'غير مضبوط'}`,
    `🔁 API Method: ${SETTINGS.pair_code_api_method}`,
    `📮 حقل الرقم: ${SETTINGS.pair_code_api_number_field}`,
    `🔐 API Token: ${SETTINGS.pair_code_api_token ? 'configured' : 'not configured'}`,
    `🌍 Sync URL: ${SETTINGS.linked_number_sync_url || 'غير مضبوط'}`,
    `🔁 Sync Method: ${SETTINGS.linked_number_sync_method}`,
    `🔐 Sync Token: ${SETTINGS.linked_number_sync_token ? 'configured' : 'not configured'}`
  ].join('\n');
}

function linkedNumbersText() {
  if (!LINKED_NUMBERS.linked_numbers.length) {
    return '📱 لا يوجد أرقام مربوطة حالياً.';
  }

  const preview = LINKED_NUMBERS.linked_numbers.slice(0, 20).map((item, index) => {
    const masked = item.number.length > 4 ? `${item.number.slice(0, 4)}***${item.number.slice(-3)}` : item.number;
    return `${index + 1}. ${masked} | emoji: ${item.settings.current_emoji} | auto-reply: ${item.settings.auto_reply_enabled} | sync: ${item.last_sync_status}`;
  });

  return ['📱 الأرقام المربوطة', '', ...preview].join('\n');
}

async function sendHome(chatId, msg) {
  return bot.sendMessage(chatId, welcomeText(isAdmin(msg)), buildMainKeyboard(isAdmin(msg)));
}

async function editOrSendHome(query) {
  const msg = query.message;
  try {
    await bot.editMessageText(welcomeText(isAdmin(msg)), {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      ...buildMainKeyboard(isAdmin(msg))
    });
  } catch (_) {
    await sendHome(msg.chat.id, msg);
  }
}

if (bot) {
  bot.onText(/^\/start(?:@\w+)?(?:\s.*)?$/i, async (msg) => {
    registerUser(msg);
    await sendHome(msg.chat.id, msg);
  });

  bot.onText(/^\/menu(?:@\w+)?$/i, async (msg) => {
    registerUser(msg);
    await sendHome(msg.chat.id, msg);
  });

  bot.onText(/^\/help(?:@\w+)?$/i, async (msg) => {
    registerUser(msg);
    let text = 'استخدم /start أو /menu لعرض الواجهة الرئيسية.\nاستخدم /ping للتأكد إن البوت شغال.';
    if (isAdmin(msg)) {
      text += '\nولفتح لوحة المطور استخدم /dev';
    }
    await bot.sendMessage(msg.chat.id, text);
  });

  bot.onText(/^\/ping(?:@\w+)?$/i, async (msg) => {
    registerUser(msg);
    await bot.sendMessage(msg.chat.id, '✅ البوت شغال.');
  });

  bot.onText(/^\/dev(?:@\w+)?$/i, async (msg) => {
    registerUser(msg);
    if (!isAdmin(msg)) {
      await bot.sendMessage(msg.chat.id, '⛔ هذه الواجهة للمطور فقط.');
      return;
    }

    await bot.sendMessage(msg.chat.id, adminStatusText(), buildDevKeyboard());
  });

  bot.on('callback_query', async (query) => {
    const msg = query.message;
    if (!msg) return;

    registerUser(msg);
    const state = getUserState(query.from.id);

    try {
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error('Failed to answer callback query', error.message);
    }

    if (query.data === 'pair_code') {
      state.awaitingPairNumber = true;
      state.adminWaitingField = null;
      await bot.sendMessage(
        msg.chat.id,
        '📞 الربط باستخدام كود الاقتران\nمن فضلك أرسل رقم هاتفك في الواتساب مع رمز الدولة.\n\nمثال: 201012345678\n(أرسل الأرقام فقط بدون علامة + أو مسافات)'
      );
      return;
    }

    if (query.data === 'refresh_home') {
      state.awaitingPairNumber = false;
      state.adminWaitingField = null;
      await editOrSendHome(query);
      return;
    }

    if (!isAdmin(msg)) {
      await bot.sendMessage(msg.chat.id, '⛔ هذه الأوامر للمطور فقط.');
      return;
    }

    if (query.data === 'dev_panel' || query.data === 'dev_stats') {
      await bot.editMessageText(adminStatusText(), {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        ...buildDevKeyboard()
      });
      return;
    }

    if (query.data === 'dev_settings') {
      await bot.editMessageText(settingsText(), {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        ...buildDevKeyboard()
      });
      return;
    }

    if (query.data === 'dev_linked_numbers') {
      await bot.editMessageText(linkedNumbersText(), {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        ...buildDevKeyboard()
      });
      return;
    }

    if (query.data === 'dev_sync_linked') {
      if (!LINKED_NUMBERS.linked_numbers.length) {
        await bot.sendMessage(msg.chat.id, '📱 لا يوجد أي رقم مربوط حتى يتم مزامنته.');
        return;
      }

      await bot.sendMessage(msg.chat.id, '⏳ جاري مزامنة إعدادات الأرقام المربوطة...');
      const results = await propagateSettingsToLinkedNumbers();
      const successCount = results.filter((item) => item.ok).length;
      const failCount = results.length - successCount;
      await bot.sendMessage(
        msg.chat.id,
        `✅ تمت المزامنة.\nنجاح: ${successCount}\nفشل: ${failCount}\n\n${linkedNumbersText()}`,
        buildDevKeyboard()
      );
      return;
    }

    if (query.data === 'dev_toggle_auto_reply') {
      SETTINGS.auto_reply_enabled = !SETTINGS.auto_reply_enabled;
      saveSettings();
      const results = await propagateSettingsToLinkedNumbers();
      const failed = results.filter((item) => !item.ok).length;
      const status = SETTINGS.auto_reply_enabled ? 'مفعل ✅' : 'معطل ❌';
      await bot.editMessageText(
        `تم تحديث حالة الرد التلقائي إلى: ${status}\nتم تطبيق الإعداد على ${LINKED_NUMBERS.linked_numbers.length} رقم مربوط${failed ? `\nفشل مزامنة ${failed} رقم` : ''}\n\n${settingsText()}`,
        {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          ...buildDevKeyboard()
        }
      );
      return;
    }

    if (query.data === 'dev_set_emoji') {
      state.adminWaitingField = 'set_emoji';
      await bot.sendMessage(msg.chat.id, '😀 أرسل الإيموجي الجديد الآن.');
      return;
    }

    if (query.data === 'dev_pair_api') {
      await bot.editMessageText('🔗 إعداد خدمة الربط\n\nمن هنا تقدر تغيّر رابط الخدمة، التوكن، اسم حقل الرقم، وطريقة الإرسال.', {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        ...buildPairApiKeyboard()
      });
      return;
    }

    if (query.data === 'dev_sync_api') {
      await bot.editMessageText('🌍 إعداد مزامنة الرقم\n\nإذا ضبطت رابط المزامنة، أي تغيير من داخل البوت مثل الإيموجي أو الرد التلقائي يتم تطبيقه تلقائياً على كل رقم مربوط.', {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        ...buildSyncApiKeyboard()
      });
      return;
    }

    if (['dev_set_api_url', 'dev_set_api_token', 'dev_set_number_field', 'dev_set_api_method', 'dev_set_sync_url', 'dev_set_sync_token', 'dev_set_sync_method'].includes(query.data)) {
      state.adminWaitingField = query.data.replace('dev_', '');
      const prompts = {
        dev_set_api_url: '🌐 أرسل رابط خدمة الربط الجديد الآن.',
        dev_set_api_token: '🔐 أرسل API Token الجديد الآن.',
        dev_set_number_field: '📮 أرسل اسم حقل الرقم المطلوب، مثال: number أو phoneNumber.',
        dev_set_api_method: '🔁 أرسل طريقة الطلب: GET أو POST',
        dev_set_sync_url: '🌍 أرسل رابط مزامنة الأرقام الآن.',
        dev_set_sync_token: '🔐 أرسل توكن مزامنة الأرقام الآن.',
        dev_set_sync_method: '🔁 أرسل طريقة مزامنة الأرقام: GET أو POST'
      };
      await bot.sendMessage(msg.chat.id, prompts[query.data]);
    }
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) {
      return;
    }

    registerUser(msg);
    const state = getUserState(msg.from.id);
    const text = msg.text.trim();

    if (state.adminWaitingField && isAdmin(msg)) {
      const fieldName = ADMIN_INPUT_FIELDS[state.adminWaitingField];
      if (!fieldName) {
        state.adminWaitingField = null;
        await bot.sendMessage(msg.chat.id, '⚠️ لم يتم التعرف على العملية المطلوبة.');
        return;
      }

      let value = text;

      if (state.adminWaitingField === 'set_api_method' || state.adminWaitingField === 'set_sync_method') {
        value = text.toUpperCase().trim();
        if (!['GET', 'POST'].includes(value)) {
          await bot.sendMessage(msg.chat.id, '❌ القيمة لازم تكون GET أو POST فقط.');
          return;
        }
      } else if (state.adminWaitingField === 'set_emoji') {
        value = text.slice(0, 10);
      } else if (state.adminWaitingField === 'set_number_field') {
        value = text.trim();
        if (!value) {
          await bot.sendMessage(msg.chat.id, '❌ اسم الحقل لا يمكن أن يكون فارغ.');
          return;
        }
      } else if (['set_api_url', 'set_sync_url'].includes(state.adminWaitingField)) {
        value = normalizeApiBaseUrl(text);
        if (value && !/^https?:\/\//i.test(value)) {
          await bot.sendMessage(msg.chat.id, '❌ لازم الرابط يبدأ بـ http:// أو https://');
          return;
        }
      }

      SETTINGS[fieldName] = value;
      SETTINGS = sanitizeSettings(SETTINGS);
      saveSettings();
      state.adminWaitingField = null;

      let extraText = '';
      if (fieldName === 'current_emoji' || fieldName === 'auto_reply_enabled' || fieldName.startsWith('linked_number_sync_')) {
        const results = await propagateSettingsToLinkedNumbers();
        const failed = results.filter((item) => !item.ok).length;
        extraText = `\n\n📱 تم تحديث ${LINKED_NUMBERS.linked_numbers.length} رقم مربوط${failed ? ` مع فشل مزامنة ${failed} رقم` : ''}`;
      }

      await bot.sendMessage(msg.chat.id, `✅ تم حفظ الإعداد بنجاح.${extraText}\n\n${settingsText()}`, buildDevKeyboard());
      return;
    }

    if (!state.awaitingPairNumber) {
      if (SETTINGS.auto_reply_enabled) {
        await bot.sendMessage(msg.chat.id, 'أهلاً بك 👋\nاستخدم /start أو /menu لعرض الواجهة الرئيسية.', buildMainKeyboard(isAdmin(msg)));
      }
      return;
    }

    const rawText = text;
    const number = normalizePhoneNumber(rawText);

    if (rawText.startsWith('0') && !rawText.startsWith('00')) {
      await bot.sendMessage(msg.chat.id, '❌ اكتب الرقم بصيغة دولية كاملة مع رمز الدولة، وليس بصيغة محلية تبدأ بـ 0.\nمثال صحيح: 201012345678');
      return;
    }

    if (!number || number.length < 8 || number.length > 15) {
      await bot.sendMessage(msg.chat.id, '❌ الرقم غير صحيح.\nأرسل الرقم بصيغة دولية مثل: 201012345678');
      return;
    }

    state.awaitingPairNumber = false;
    BOT_STATS.pairRequests += 1;

    await bot.sendMessage(msg.chat.id, `⏳ جاري طلب الكود: ${number}`);

    try {
      const code = await requestPairCode(number);
      BOT_STATS.pairSuccess += 1;
      upsertLinkedNumber(number);

      let syncNote = '📦 تم حفظ الرقم محلياً داخل البوت.';
      try {
        const record = LINKED_NUMBERS.linked_numbers.find((item) => item.number === number);
        if (record) {
          const syncResult = await syncSingleLinkedNumber(record);
          syncNote = syncResult.mode === 'remote'
            ? '🌍 تم مزامنة إعدادات الرقم مع خدمة الربط الخارجية.'
            : '📦 تم حفظ الرقم محلياً داخل البوت.';
        }
      } catch (syncError) {
        syncNote = `⚠️ تم حفظ الرقم محلياً لكن فشلت المزامنة الخارجية: ${syncError.message}`;
      }

      await bot.sendMessage(
        msg.chat.id,
        `✅ تم استخراج كود الربط بنجاح\n\n🔐 الكود: ${code}\n\nافتح واتساب > الأجهزة المرتبطة > ربط جهاز > إدخال الكود.\n${syncNote}`,
        buildMainKeyboard(isAdmin(msg))
      );
    } catch (error) {
      BOT_STATS.pairFailed += 1;
      console.error('Failed to get pair code for', number, error.message);
      await bot.sendMessage(
        msg.chat.id,
        `❌ حصل خطأ أثناء طلب كود الربط.\nلازم تضبط خدمة الربط بالكامل في Environment Variables أو من لوحة المطور.\nتفاصيل الخطأ: ${error.message}`,
        buildMainKeyboard(isAdmin(msg))
      );
    }
  });

  bot.on('polling_error', (error) => {
    console.error('Polling error:', error?.response?.body || error?.message || error);
  });

  bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error?.response?.body || error?.message || error);
  });

  bot.getMe()
    .then((me) => {
      console.log(`Telegram bot logged in as @${me.username}`);
    })
    .catch((error) => {
      console.error('Failed to call getMe:', error?.response?.body || error?.message || error);
    });

  bot.setMyCommands([
    { command: 'start', description: 'تشغيل البوت' },
    { command: 'menu', description: 'عرض القائمة الرئيسية' },
    { command: 'help', description: 'المساعدة' },
    { command: 'ping', description: 'فحص البوت' },
    { command: 'dev', description: 'لوحة المطور' }
  ]).catch((error) => {
    console.error('Failed to set bot commands', error?.response?.body || error?.message || error);
  });
}

const PORT = Number(process.env.PORT || 10000);
const healthServer = http.createServer((req, res) => {
  const body = {
    ok: true,
    service: 'telegram-pair-bot',
    bot_enabled: Boolean(bot),
    bot_status: bot ? 'running' : 'disabled',
    reason: bot ? null : BOT_DISABLED_REASON,
    linked_numbers: LINKED_NUMBERS.linked_numbers.length,
    uptime_seconds: Math.floor(process.uptime()),
    pair_code_api_url: SETTINGS.pair_code_api_url || null,
    pair_code_api_method: SETTINGS.pair_code_api_method,
    admin_id_configured: Boolean(ADMIN_ID)
  };

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
});

healthServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server listening on port ${PORT}`);
  if (bot) {
    console.log('Telegram bot is running...');
  } else {
    console.warn(`Telegram bot is disabled: ${BOT_DISABLED_REASON}`);
  }
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

if (!SETTINGS.pair_code_api_url) {
  console.warn('Pairing API is not configured yet.');
}
