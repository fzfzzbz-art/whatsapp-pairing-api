const fs = require('fs');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = String(rawLine || '').trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = line.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      process.env[key] = value.replace(/\\n/g, '\n');
    }
  } catch (error) {
    console.error('Failed to load .env file:', error.message);
  }
}

async function httpRequest({ method = 'GET', url, headers = {}, query, data, timeout = 45000 }) {
  const finalUrl = new URL(url);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      finalUrl.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const normalizedHeaders = { ...headers };
    let body;

    if (data !== undefined) {
      body = typeof data === 'string' ? data : JSON.stringify(data);
      const hasContentType = Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === 'content-type');
      if (!hasContentType) {
        normalizedHeaders['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(finalUrl, {
      method,
      headers: normalizedHeaders,
      body,
      signal: controller.signal
    });

    const text = await response.text();
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    let parsed = text;

    if (contentType.includes('application/json')) {
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = text;
      }
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: parsed,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

function stringifyPayload(payload) {
  if (payload === undefined || payload === null) {
    return '';
  }
  if (typeof payload === 'string') {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

class TelegramBot extends EventEmitter {
  constructor(token, options = {}) {
    super();
    this.token = token;
    this.textHandlers = [];
    this.offset = 0;
    this.pollingTimeout = Number(options?.polling?.params?.timeout || 30);
    this.isPolling = false;
    this.stopped = false;

    if (options.polling !== false) {
      this.startPolling().catch((error) => {
        this.emit('polling_error', error);
      });
    }
  }

  onText(regex, handler) {
    this.textHandlers.push({ regex, handler });
  }

  async apiCall(method, params = {}) {
    const response = await httpRequest({
      method: 'POST',
      url: `https://api.telegram.org/bot${this.token}/${method}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      data: params,
      timeout: 60000
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Telegram API HTTP ${response.status}: ${stringifyPayload(response.data || response.text)}`);
    }

    if (!response.data || response.data.ok !== true) {
      const description = response.data?.description || response.text || 'Unknown Telegram API error';
      throw new Error(String(description));
    }

    return response.data.result;
  }

  async sendMessage(chatId, text, options = {}) {
    return this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      ...options
    });
  }

  async editMessageText(text, options = {}) {
    return this.apiCall('editMessageText', {
      text,
      ...options
    });
  }

  async answerCallbackQuery(callbackQueryId, options = {}) {
    return this.apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...options
    });
  }

  async setMyCommands(commands) {
    return this.apiCall('setMyCommands', { commands });
  }

  async getUpdates() {
    return this.apiCall('getUpdates', {
      offset: this.offset,
      timeout: this.pollingTimeout,
      allowed_updates: ['message', 'callback_query']
    });
  }

  async emitAsync(eventName, payload) {
    const listeners = this.listeners(eventName);
    for (const listener of listeners) {
      await listener(payload);
    }
  }

  async dispatchMessage(message) {
    if (typeof message?.text === 'string') {
      for (const { regex, handler } of this.textHandlers) {
        regex.lastIndex = 0;
        const match = regex.exec(message.text);
        if (match) {
          await handler(message, match);
        }
      }
    }

    await this.emitAsync('message', message);
  }

  async dispatchUpdate(update) {
    if (update.callback_query) {
      await this.emitAsync('callback_query', update.callback_query);
    }

    if (update.message) {
      await this.dispatchMessage(update.message);
    }
  }

  async startPolling() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    while (!this.stopped) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          this.offset = Math.max(this.offset, Number(update.update_id || 0) + 1);
          await this.dispatchUpdate(update);
        }
      } catch (error) {
        this.emit('polling_error', error);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    this.isPolling = false;
  }

  stopPolling() {
    this.stopped = true;
  }
}

function startHealthServer() {
  const port = Number.parseInt(String(process.env.PORT || '').trim(), 10);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = parsedUrl.pathname || '/';

      if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
        return sendJson(res, 200, { ok: true, service: 'telegram-bot', timestamp: new Date().toISOString() });
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === LOCAL_PAIRING_PAGE_ROUTE)) {
        return sendHtml(res, 200, buildLandingPageHtml());
      }

      if (req.method === 'GET' && pathname === '/settings') {
        return sendHtml(res, 200, buildSettingsPageHtml());
      }

      if (req.method === 'POST' && pathname === '/api/login') {
        const body = await parseRequestBody(req);
        const authorized = isSiteAuthorized(req, body, parsedUrl);
        return sendJson(res, authorized ? 200 : 401, { success: authorized, requiresPassword: Boolean(SITE_PASSWORD), message: authorized ? 'تم تسجيل الدخول بنجاح' : 'كلمة المرور غير صحيحة' });
      }

      if (req.method === 'GET' && pathname === '/api/settings/load') {
        return sendJson(res, 200, {
          success: true,
          requiresPassword: Boolean(SITE_PASSWORD),
          settings: buildSerializableSettings(),
          pairing: buildPairingApiDescriptor()
        });
      }

      if (req.method === 'POST' && pathname === '/api/settings/save') {
        const body = await parseRequestBody(req);
        if (!isSiteAuthorized(req, body, parsedUrl)) {
          return sendJson(res, 401, { success: false, error: 'كلمة المرور غير صحيحة' });
        }

        const patch = {};
        if (body.current_emoji !== undefined) patch.current_emoji = normalizeEmojiValue(body.current_emoji, SETTINGS.current_emoji);
        if (body.auto_reply_enabled !== undefined) patch.auto_reply_enabled = toBoolean(body.auto_reply_enabled, SETTINGS.auto_reply_enabled);
        if (body.pair_code_api_url !== undefined) patch.pair_code_api_url = sanitizePairCodeApiUrl(body.pair_code_api_url);
        if (body.pair_code_api_method !== undefined) patch.pair_code_api_method = String(body.pair_code_api_method || 'POST').trim().toUpperCase() === 'GET' ? 'GET' : 'POST';
        if (body.pair_code_api_token !== undefined) patch.pair_code_api_token = String(body.pair_code_api_token || '').trim();
        if (body.pair_code_api_number_field !== undefined) patch.pair_code_api_number_field = String(body.pair_code_api_number_field || 'phone').trim() || 'phone';

        Object.assign(SETTINGS, ensureSettingsShape({ ...SETTINGS, ...patch }));
        saveSettings();

        return sendJson(res, 200, { success: true, settings: buildSerializableSettings(), pairing: buildPairingApiDescriptor() });
      }

      if (req.method === 'GET' && pathname === LOCAL_PAIRING_API_ROUTE) {
        return sendJson(res, 200, { success: true, ...buildPairingApiDescriptor() });
      }

      if (req.method === 'POST' && (pathname === LOCAL_PAIRING_API_ROUTE || pathname === ALT_LOCAL_PAIRING_API_ROUTE)) {
        const body = await parseRequestBody(req);
        const phone = normalizePhoneNumber(body.phone || body.num || body.phoneNumber || body.number || '');
        if (!phone || phone.length < 8 || phone.length > 15) {
          return sendJson(res, 400, { success: false, error: 'رقم غير صالح' });
        }

        try {
          const code = await requestPairCode(phone, { skipSelfApi: true });
          return sendJson(res, 200, { success: true, phone, num: phone, code });
        } catch (error) {
          return sendJson(res, 500, { success: false, error: String(error?.message || 'فشل إنشاء كود الربط') });
        }
      }

      return sendJson(res, 404, { success: false, error: 'Not found' });
    } catch (error) {
      console.error('HTTP server error:', error);
      return sendJson(res, 500, { success: false, error: String(error?.message || 'Internal server error') });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`HTTP server listening on port ${port}`);
    const publicOrigin = getPrimaryPublicOrigin();
    if (publicOrigin) {
      console.log(`Public landing page: ${publicOrigin}/`);
      console.log(`Public pairing API: ${publicOrigin}${LOCAL_PAIRING_API_ROUTE}`);
    }
  });

  return server;
}

loadEnvFile(path.join(__dirname, '.env'));

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
const SITE_PASSWORD = String(process.env.SITE_PASSWORD || '').trim();
const GREEN_API_BASE_URL = String(process.env.GREEN_API_BASE_URL || 'https://api.green-api.com').trim().replace(/\/+$/, '');
const GREEN_API_ID_INSTANCE = String(process.env.GREEN_API_ID_INSTANCE || '').trim();
const GREEN_API_TOKEN_INSTANCE = String(process.env.GREEN_API_TOKEN_INSTANCE || '').trim();
const LOCAL_PAIRING_ENABLED = String(process.env.LOCAL_PAIRING_ENABLED || 'true').trim().toLowerCase() !== 'false';
const PAIRING_REQUEST_DELAY_MS = Math.max(parseInteger(process.env.PAIRING_REQUEST_DELAY_MS, 2500), 1500);
const PAIRING_TTL_MS = Math.max(parseInteger(process.env.PAIRING_TTL_MS, 300000), 30000);
const CONNECTED_PAIRING_CLEANUP_MS = Math.max(parseInteger(process.env.CONNECTED_PAIRING_CLEANUP_MS, 120000), 15000);
const SESSIONS_DIR = path.join(BASE_DIR, 'wa_sessions');
const LOCAL_PAIRING_PAGE_ROUTE = '/pair';
const LOCAL_PAIRING_API_ROUTE = '/api/pairing';
const ALT_LOCAL_PAIRING_API_ROUTE = '/api/pair';
const activePairingPromises = new Map();
const localPairingSessions = new Map();
let cachedBaileysLoader = null;

function getGreenApiAuthorizationUrl() {
  if (GREEN_API_ID_INSTANCE && GREEN_API_TOKEN_INSTANCE) {
    return `${GREEN_API_BASE_URL}/waInstance${GREEN_API_ID_INSTANCE}/getAuthorizationCode/${GREEN_API_TOKEN_INSTANCE}`;
  }
  return '';
}

function normalizeHttpUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch (error) {
    return null;
  }
}

function looksLikeGreenApiAuthorizationUrl(value) {
  return /\/waInstance[^/]+\/getAuthorizationCode\/[^/?#]+$/i.test(normalizeHttpUrl(value));
}

function getBotPublicOriginCandidates() {
  const rawCandidates = [
    process.env.RAILWAY_STATIC_URL,
    process.env.PUBLIC_URL,
    process.env.APP_URL,
    process.env.BASE_URL,
    process.env.URL
  ];

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    rawCandidates.push(`https://${String(process.env.RAILWAY_PUBLIC_DOMAIN).trim()}`);
  }

  return Array.from(new Set(rawCandidates.map(normalizeHttpUrl).filter(Boolean)));
}

function isAllowedSelfServicePath(pathname) {
  const normalizedPath = normalizeHttpUrl(pathname || '/') || '/';
  return [
    /^\/api\/pair(?:ing)?$/i,
    /^\/pair$/i,
    /^\/settings$/i,
    /^\/api\/settings\/(?:load|save)$/i,
    /^\/api\/login$/i
  ].some((pattern) => pattern.test(normalizedPath));
}

function looksLikeSelfOrHealthUrl(value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized || looksLikeGreenApiAuthorizationUrl(normalized)) {
    return false;
  }

  const parsed = tryParseUrl(normalized);
  if (!parsed) {
    return false;
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  const pathname = normalizeHttpUrl(parsed.pathname || '/') || '/';

  if (getBotPublicOriginCandidates().includes(origin) && !isAllowedSelfServicePath(pathname)) {
    return true;
  }

  if (/(^|\/)(health|healthz|status|ping|metrics)(\/|$)/i.test(pathname)) {
    return true;
  }

  if (/railway\.(app|internal)$/i.test(parsed.hostname) && !/getAuthorizationCode/i.test(pathname) && !isAllowedSelfServicePath(pathname)) {
    return true;
  }

  return false;
}

function isLocalPairingApiUrl(value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return false;
  }

  if ([LOCAL_PAIRING_API_ROUTE, ALT_LOCAL_PAIRING_API_ROUTE].includes(normalized)) {
    return true;
  }

  const parsed = tryParseUrl(normalized);
  if (!parsed) {
    return false;
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  const pathname = normalizeHttpUrl(parsed.pathname || '/') || '/';
  return getBotPublicOriginCandidates().includes(origin) && [LOCAL_PAIRING_API_ROUTE, ALT_LOCAL_PAIRING_API_ROUTE].includes(pathname);
}

function getPrimaryPublicOrigin() {
  return getBotPublicOriginCandidates()[0] || '';
}

function buildLocalPairingApiUrl() {
  const origin = getPrimaryPublicOrigin();
  return origin ? `${origin}${LOCAL_PAIRING_API_ROUTE}` : '';
}

function buildLocalPairingPageUrl() {
  const origin = getPrimaryPublicOrigin();
  return origin ? `${origin}${LOCAL_PAIRING_PAGE_ROUTE}` : '';
}

function sanitizePairCodeApiUrl(value) {
  const normalized = normalizeHttpUrl(value);
  const fallbackUrl = buildLocalPairingApiUrl() || getGreenApiAuthorizationUrl();

  if (!normalized) {
    return fallbackUrl;
  }

  if (looksLikeGreenApiAuthorizationUrl(normalized) || isLocalPairingApiUrl(normalized)) {
    return normalized;
  }

  const parsed = tryParseUrl(normalized);
  if (parsed) {
    const pathname = normalizeHttpUrl(parsed.pathname || '/');

    if (/\/waInstance[^/]+\/getAuthorizationCode$/i.test(pathname) && GREEN_API_TOKEN_INSTANCE) {
      return `${normalized}/${GREEN_API_TOKEN_INSTANCE}`;
    }

    if (/green-api\.com$/i.test(parsed.hostname) && getGreenApiAuthorizationUrl()) {
      return getGreenApiAuthorizationUrl();
    }
  }

  if (looksLikeSelfOrHealthUrl(normalized) && fallbackUrl) {
    return fallbackUrl;
  }

  return normalized;
}

function uniqueNonEmptyValues(values) {
  return Array.from(new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean)));
}

function getPairCodeApiCandidates() {
  return uniqueNonEmptyValues([
    sanitizePairCodeApiUrl(SETTINGS?.pair_code_api_url),
    sanitizePairCodeApiUrl(process.env.PAIR_CODE_API_URL),
    getGreenApiAuthorizationUrl()
  ]).filter((url) => !isLocalPairingApiUrl(url));
}

function getPairCodeMethodCandidates() {
  return uniqueNonEmptyValues([
    String(SETTINGS?.pair_code_api_method || '').toUpperCase(),
    String(process.env.PAIR_CODE_API_METHOD || '').toUpperCase(),
    'POST',
    'GET'
  ]).filter((method) => method === 'POST' || method === 'GET');
}

function getPairCodeNumberFieldCandidates() {
  return uniqueNonEmptyValues([
    SETTINGS?.pair_code_api_number_field,
    process.env.PAIR_CODE_API_NUMBER_FIELD,
    'phone',
    'num',
    'phoneNumber',
    'number'
  ]);
}


function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  const body = String(html || '');
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function parseRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return JSON.parse(raw);
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }

  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
}

function getSiteSecret(req, body = {}, parsedUrl = null) {
  return String(
    body.password
    || body.site_password
    || req.headers['x-site-password']
    || req.headers.authorization?.replace(/^Bearer\s+/i, '')
    || parsedUrl?.searchParams?.get('password')
    || ''
  ).trim();
}

function isSiteAuthorized(req, body = {}, parsedUrl = null) {
  if (!SITE_PASSWORD) {
    return true;
  }
  return getSiteSecret(req, body, parsedUrl) === SITE_PASSWORD;
}

function buildSerializableSettings() {
  return {
    current_emoji: SETTINGS.current_emoji,
    auto_reply_enabled: SETTINGS.auto_reply_enabled,
    pair_code_api_url: SETTINGS.pair_code_api_url || buildLocalPairingApiUrl(),
    pair_code_api_method: SETTINGS.pair_code_api_method,
    pair_code_api_token: SETTINGS.pair_code_api_token ? 'configured' : '',
    pair_code_api_number_field: SETTINGS.pair_code_api_number_field
  };
}

function buildPairingApiDescriptor() {
  return {
    endpoint: resolvePairCodeApiUrl() || LOCAL_PAIRING_API_ROUTE,
    route: LOCAL_PAIRING_API_ROUTE,
    page: buildLocalPairingPageUrl() || LOCAL_PAIRING_PAGE_ROUTE,
    methods: ['GET', 'POST'],
    requestFields: ['phone', 'num', 'phoneNumber', 'number'],
    requestExample: { phone: '201012345678' },
    localPairingEnabled: LOCAL_PAIRING_ENABLED,
    publicOrigin: getPrimaryPublicOrigin() || null
  };
}

function buildLandingPageHtml() {
  const pairingInfo = buildPairingApiDescriptor();
  const currentEndpoint = escapeHtml(pairingInfo.endpoint || LOCAL_PAIRING_API_ROUTE);
  const currentPage = escapeHtml(pairingInfo.page || LOCAL_PAIRING_PAGE_ROUTE);
  const publicOrigin = escapeHtml(pairingInfo.publicOrigin || 'غير محدد');
  const localStatus = LOCAL_PAIRING_ENABLED ? 'مفعل' : 'معطل';
  const autoReplyStatus = SETTINGS.auto_reply_enabled ? 'مفعل' : 'معطل';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>موقع ربط واتساب</title>
  <style>
    :root { --bg:#0d1117; --card:#161b22; --muted:#8b949e; --text:#e6edf3; --accent:#f0b34a; --accent2:#2f81f7; --border:#30363d; --ok:#238636; --danger:#da3633; }
    *{box-sizing:border-box} body{margin:0;font-family:Tahoma,Arial,sans-serif;background:linear-gradient(180deg,#0d1117,#111827);color:var(--text)}
    .wrap{max-width:880px;margin:0 auto;padding:24px} .card{background:rgba(22,27,34,.96);border:1px solid var(--border);border-radius:18px;padding:22px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
    .hero{display:grid;gap:16px;margin-bottom:18px} .title{font-size:30px;font-weight:700;margin:0} .muted{color:var(--muted);line-height:1.8}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:18px 0}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(47,129,247,.12);color:#9ecbff;border:1px solid rgba(47,129,247,.22)}
    .row{display:flex;gap:10px;flex-wrap:wrap}.info{background:#0f141b;border:1px solid var(--border);border-radius:14px;padding:14px}.label{font-size:12px;color:var(--muted);margin-bottom:6px}.value{font-size:14px;word-break:break-word}
    input,button{width:100%;border-radius:12px;border:1px solid var(--border);padding:14px 16px;font-size:15px} input{background:#0d1117;color:var(--text)} button{background:linear-gradient(135deg,var(--accent),#d18c19);color:#111;font-weight:700;cursor:pointer}
    button.secondary{background:#1f2937;color:var(--text)} pre{white-space:pre-wrap;background:#0d1117;border:1px solid var(--border);padding:14px;border-radius:12px;min-height:58px}
    a{color:#9ecbff;text-decoration:none} .foot{margin-top:14px;font-size:13px;color:var(--muted)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero card">
      <div class="badge">تم إصلاح موقع الربط داخل الملف</div>
      <h1 class="title">موقع ربط واتساب + API</h1>
      <div class="muted">هذه الصفحة حلت مشكلة ظهور JSON فقط في الصفحة الرئيسية، وصارت توفر واجهة جاهزة لطلب كود الربط وعرض حالة الخدمة ونقطة API الصحيحة.</div>
      <div class="grid">
        <div class="info"><div class="label">رابط الصفحة</div><div class="value"><a href="${currentPage}">${currentPage}</a></div></div>
        <div class="info"><div class="label">رابط API</div><div class="value"><code>${currentEndpoint}</code></div></div>
        <div class="info"><div class="label">الأصل العام</div><div class="value">${publicOrigin}</div></div>
        <div class="info"><div class="label">الربط المحلي</div><div class="value">${escapeHtml(localStatus)}</div></div>
        <div class="info"><div class="label">الرد التلقائي</div><div class="value">${escapeHtml(autoReplyStatus)}</div></div>
        <div class="info"><div class="label">الإيموجي الافتراضي</div><div class="value">${escapeHtml(SETTINGS.current_emoji)}</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <h2 style="margin-top:0">طلب كود الربط</h2>
      <div class="muted">أدخل الرقم بصيغة دولية بدون + أو مسافات، مثال: <b>201012345678</b></div>
      <div class="row" style="margin-top:14px">
        <input id="phone" placeholder="201012345678" />
        <button id="pairBtn">استخراج الكود</button>
      </div>
      <pre id="result">النتيجة ستظهر هنا...</pre>
    </div>

    <div class="card">
      <h2 style="margin-top:0">روابط الإدارة</h2>
      <div class="row">
        <button class="secondary" onclick="location.href='/settings'">فتح صفحة الإعدادات</button>
        <button class="secondary" onclick="window.open('${currentEndpoint}','_blank')">عرض وصف API</button>
      </div>
      <div class="foot">نقاط الطلب المدعومة: <code>phone</code> و <code>num</code> و <code>phoneNumber</code> و <code>number</code>.</div>
    </div>
  </div>
  <script>
    const btn = document.getElementById('pairBtn');
    const phoneInput = document.getElementById('phone');
    const result = document.getElementById('result');
    btn.addEventListener('click', async () => {
      const phone = String(phoneInput.value || '').replace(/\D/g, '');
      if (!phone) {
        result.textContent = 'اكتب الرقم أولاً.';
        return;
      }
      btn.disabled = true;
      result.textContent = 'جاري طلب كود الربط...';
      try {
        const response = await fetch('${LOCAL_PAIRING_API_ROUTE}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await response.json();
        result.textContent = data.success ? ('✅ الرقم: ' + data.phone + '\n🔐 الكود: ' + data.code) : ('❌ ' + (data.error || 'فشل غير معروف'));
      } catch (error) {
        result.textContent = '❌ ' + (error.message || error);
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function buildSettingsPageHtml() {
  const requiresPassword = SITE_PASSWORD ? 'نعم' : 'لا';
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>إعدادات موقع الربط</title>
  <style>
    body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#0d1117;color:#e6edf3;padding:24px} .wrap{max-width:760px;margin:0 auto}
    .card{background:#161b22;border:1px solid #30363d;border-radius:18px;padding:22px}.grid{display:grid;gap:12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    input,select,button{width:100%;border-radius:12px;border:1px solid #30363d;padding:14px 16px;background:#0d1117;color:#e6edf3} button{background:#f0b34a;color:#111;font-weight:700;cursor:pointer}
    .muted{color:#8b949e;line-height:1.8} pre{white-space:pre-wrap;background:#0d1117;border:1px solid #30363d;padding:14px;border-radius:12px}
    @media(max-width:700px){.row{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap card">
    <h1 style="margin-top:0">إعدادات الموقع</h1>
    <div class="muted">من هنا تقدر تعدل إعدادات الربط بدون الرجوع للملف. الحماية بكلمة المرور مطلوبة: <b>${requiresPassword}</b></div>
    <div class="grid" style="margin-top:16px">
      <input id="password" type="password" placeholder="كلمة مرور الموقع إن وجدت" />
      <div class="row">
        <input id="emoji" placeholder="الإيموجي الحالي" />
        <select id="autoReply"><option value="true">تفعيل الرد التلقائي</option><option value="false">إيقاف الرد التلقائي</option></select>
      </div>
      <input id="apiUrl" placeholder="PAIR_CODE_API_URL" />
      <div class="row">
        <select id="apiMethod"><option value="POST">POST</option><option value="GET">GET</option></select>
        <input id="numberField" placeholder="اسم حقل الرقم" />
      </div>
      <input id="apiToken" placeholder="PAIR_CODE_API_TOKEN (اختياري)" />
      <div class="row">
        <button id="loadBtn" type="button">تحميل الإعدادات</button>
        <button id="saveBtn" type="button">حفظ الإعدادات</button>
      </div>
      <pre id="out">جاهز</pre>
    </div>
  </div>
  <script>
    const out = document.getElementById('out');
    const fields = {
      password: document.getElementById('password'),
      emoji: document.getElementById('emoji'),
      autoReply: document.getElementById('autoReply'),
      apiUrl: document.getElementById('apiUrl'),
      apiMethod: document.getElementById('apiMethod'),
      apiToken: document.getElementById('apiToken'),
      numberField: document.getElementById('numberField')
    };

    async function loadSettings() {
      out.textContent = 'جاري تحميل الإعدادات...';
      const response = await fetch('/api/settings/load');
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'فشل التحميل');
      fields.emoji.value = data.settings.current_emoji || '';
      fields.autoReply.value = String(Boolean(data.settings.auto_reply_enabled));
      fields.apiUrl.value = data.pairing.endpoint || data.settings.pair_code_api_url || '';
      fields.apiMethod.value = data.settings.pair_code_api_method || 'POST';
      fields.numberField.value = data.settings.pair_code_api_number_field || 'phone';
      fields.apiToken.value = '';
      out.textContent = JSON.stringify(data, null, 2);
    }

    async function saveSettings() {
      out.textContent = 'جاري الحفظ...';
      const response = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: fields.password.value,
          current_emoji: fields.emoji.value,
          auto_reply_enabled: fields.autoReply.value,
          pair_code_api_url: fields.apiUrl.value,
          pair_code_api_method: fields.apiMethod.value,
          pair_code_api_token: fields.apiToken.value,
          pair_code_api_number_field: fields.numberField.value
        })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'فشل الحفظ');
      out.textContent = JSON.stringify(data, null, 2);
    }

    document.getElementById('loadBtn').addEventListener('click', () => loadSettings().catch((error) => out.textContent = '❌ ' + (error.message || error)));
    document.getElementById('saveBtn').addEventListener('click', () => saveSettings().catch((error) => out.textContent = '❌ ' + (error.message || error)));
    loadSettings().catch((error) => out.textContent = '❌ ' + (error.message || error));
  </script>
</body>
</html>`;
}

async function getBaileysModules() {
  if (!cachedBaileysLoader) {
    cachedBaileysLoader = (async () => {
      let pinoFactory = null;
      try {
        pinoFactory = require('pino');
      } catch (_) {
        pinoFactory = null;
      }

      try {
        const baileys = require('@whiskeysockets/baileys');
        return { ...baileys, pinoFactory };
      } catch (error) {
        throw new Error('الحزمة @whiskeysockets/baileys غير مثبتة. ثبّت dependencies المرفقة ثم أعد التشغيل.');
      }
    })();
  }
  return cachedBaileysLoader;
}

function getSessionPath(phone) {
  return path.join(SESSIONS_DIR, phone);
}

function closeSocketQuietly(sock) {
  if (!sock) {
    return;
  }

  try { sock.ws?.close?.(); } catch (_) {}
  try { sock.end?.(); } catch (_) {}
}

function isPermanentDisconnect(lastDisconnect = null, DisconnectReason = {}) {
  const statusCode = Number(lastDisconnect?.error?.output?.statusCode || 0);
  const rawMessage = String(
    lastDisconnect?.error?.data
    || lastDisconnect?.error?.message
    || lastDisconnect?.error?.output?.payload?.message
    || ''
  ).toLowerCase();

  if (statusCode === Number(DisconnectReason?.loggedOut || 401)) {
    return true;
  }

  if ([401, 403, 405].includes(statusCode)) {
    return true;
  }

  return /(logged\s*out|device\s*removed|forbidden|banned|blocked|not-authorized|not authorized|session\s*expired|replaced)/i.test(rawMessage);
}

async function cleanupLocalPairingSession(phone, removeFiles = false) {
  const key = normalizePhoneNumber(phone);
  const session = localPairingSessions.get(key);
  if (session?.timeout) {
    clearTimeout(session.timeout);
  }

  localPairingSessions.delete(key);
  closeSocketQuietly(session?.sock);

  if (removeFiles) {
    try {
      fs.rmSync(getSessionPath(key), { recursive: true, force: true });
    } catch (_) {}
  }
}

function scheduleLocalPairingCleanup(phone, removeFiles = true, delayMs = PAIRING_TTL_MS) {
  const key = normalizePhoneNumber(phone);
  const session = localPairingSessions.get(key);
  if (!session) {
    return;
  }

  if (session.timeout) {
    clearTimeout(session.timeout);
  }

  session.timeout = setTimeout(() => {
    cleanupLocalPairingSession(key, removeFiles).catch((error) => {
      console.error('Failed to cleanup local pairing session:', error.message);
    });
  }, Math.max(1000, Number(delayMs) || PAIRING_TTL_MS));

  if (typeof session.timeout?.unref === 'function') {
    session.timeout.unref();
  }
}

async function requestPairCodeLocally(number) {
  const phone = normalizePhoneNumber(number);
  if (!LOCAL_PAIRING_ENABLED) {
    throw new Error('خدمة الربط المحلي معطلة من متغيرات البيئة.');
  }

  if (!phone) {
    throw new Error('رقم غير صالح.');
  }

  if (activePairingPromises.has(phone)) {
    return activePairingPromises.get(phone);
  }

  const promise = (async () => {
    await cleanupLocalPairingSession(phone, true);
    ensureDir(SESSIONS_DIR);
    ensureDir(getSessionPath(phone));

    const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, pinoFactory } = await getBaileysModules();
    const { state, saveCreds } = await useMultiFileAuthState(getSessionPath(phone));
    const logger = typeof pinoFactory === 'function' ? pinoFactory({ level: 'silent' }) : undefined;

    const sessionState = {
      sock: null,
      createdAt: Date.now(),
      timeout: null,
      completed: false,
      requestedCode: false,
      restarting: false,
      readyPromise: null,
      readyResolve: null,
      readyReject: null
    };
    localPairingSessions.set(phone, sessionState);

    const createReadyPromise = () => {
      if (!sessionState.readyPromise) {
        sessionState.readyPromise = new Promise((resolve, reject) => {
          sessionState.readyResolve = resolve;
          sessionState.readyReject = reject;
        });
      }
      return sessionState.readyPromise;
    };

    const resolveReady = () => {
      if (typeof sessionState.readyResolve === 'function') {
        sessionState.readyResolve();
      }
      sessionState.readyPromise = null;
      sessionState.readyResolve = null;
      sessionState.readyReject = null;
    };

    const rejectReady = (error) => {
      if (typeof sessionState.readyReject === 'function') {
        sessionState.readyReject(error instanceof Error ? error : new Error(String(error || 'Unknown error')));
      }
      sessionState.readyPromise = null;
      sessionState.readyResolve = null;
      sessionState.readyReject = null;
    };

    const createSocket = () => {
      const sock = makeWASocket({
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.macOS('Google Chrome'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false
      });

      sessionState.sock = sock;
      sock.ev.setMaxListeners?.(0);
      sock.ws?.setMaxListeners?.(0);

      sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (error) {
          console.error('Failed to save pairing credentials for %s:', phone, error.message);
        }
      });

      sock.ev.on('connection.update', async (update = {}) => {
        const connection = update.connection;
        const session = localPairingSessions.get(phone);
        if (!session || session.sock !== sock) {
          return;
        }

        const statusCode = Number(update?.lastDisconnect?.error?.output?.statusCode || 0);

        if ((connection === 'connecting' || !!update.qr) && !state?.creds?.registered) {
          resolveReady();
        }

        if (connection === 'open') {
          session.completed = true;
          session.restarting = false;
          resolveReady();
          try {
            await saveCreds();
          } catch (error) {
            console.error('Failed to persist open pairing session for %s:', phone, error.message);
          }
          scheduleLocalPairingCleanup(phone, false, CONNECTED_PAIRING_CLEANUP_MS);
          return;
        }

        if (connection === 'close') {
          if (statusCode === Number(DisconnectReason?.restartRequired || 515) && !session.completed) {
            session.restarting = true;
            closeSocketQuietly(sock);
            setTimeout(() => {
              const latestSession = localPairingSessions.get(phone);
              if (!latestSession || latestSession.sock !== sock || latestSession.completed) {
                return;
              }
              createSocket();
            }, 1200);
            return;
          }

          if (isPermanentDisconnect(update.lastDisconnect, DisconnectReason)) {
            rejectReady(new Error('واتساب رفض الجلسة أو أنهى الربط. احذف أي جهاز قديم وحاول مرة ثانية.'));
            scheduleLocalPairingCleanup(phone, true, 1000);
            return;
          }

          if (session.completed) {
            scheduleLocalPairingCleanup(phone, false, Math.min(CONNECTED_PAIRING_CLEANUP_MS, 30000));
            return;
          }

          rejectReady(new Error('انقطع الاتصال أثناء تجهيز جلسة الربط. حاول مرة ثانية.'));
          scheduleLocalPairingCleanup(phone, true, PAIRING_TTL_MS);
        }
      });

      return sock;
    };

    createReadyPromise();
    createSocket();

    const readyTimeout = setTimeout(() => {
      rejectReady(new Error('انتهت مهلة تجهيز جلسة الربط. حاول مرة ثانية.'));
    }, Math.max(PAIRING_REQUEST_DELAY_MS * 4, 45000));

    if (typeof readyTimeout?.unref === 'function') {
      readyTimeout.unref();
    }

    try {
      await createReadyPromise();
    } finally {
      clearTimeout(readyTimeout);
    }

    if (state?.creds?.registered) {
      await cleanupLocalPairingSession(phone, true);
      throw new Error('هذا الرقم مربوط بالفعل أو توجد له جلسة محفوظة. احذف الجلسة القديمة ثم أعد المحاولة.');
    }

    if (!sessionState.sock?.requestPairingCode) {
      throw new Error('تعذر إنشاء جلسة الربط.');
    }

    const code = await sessionState.sock.requestPairingCode(phone);
    sessionState.requestedCode = true;
    scheduleLocalPairingCleanup(phone, true, PAIRING_TTL_MS);
    return code;
  })();

  activePairingPromises.set(phone, promise);
  try {
    return await promise;
  } catch (error) {
    await cleanupLocalPairingSession(phone, true);
    throw error;
  } finally {
    activePairingPromises.delete(phone);
  }
}

const DEFAULT_SETTINGS = {
  current_emoji: String(process.env.CURRENT_EMOJI || '🔥').trim() || '🔥',
  auto_reply_enabled: String(process.env.AUTO_REPLY_ENABLED || 'true').toLowerCase() === 'true',
  pair_code_api_url: sanitizePairCodeApiUrl(process.env.PAIR_CODE_API_URL || buildLocalPairingApiUrl()),
  pair_code_api_method: String(process.env.PAIR_CODE_API_METHOD || 'POST').trim().toUpperCase() || 'POST',
  pair_code_api_token: String(process.env.PAIR_CODE_API_TOKEN || '').trim(),
  pair_code_api_number_field: String(process.env.PAIR_CODE_API_NUMBER_FIELD || 'phone').trim() || 'phone'
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
  data.pair_code_api_url = sanitizePairCodeApiUrl(data.pair_code_api_url);
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

function extractValueByKnownKeys(payload, keysPriority) {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractValueByKnownKeys(item, keysPriority);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  for (const key of keysPriority) {
    const value = payload[key];
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    const nested = extractValueByKnownKeys(value, keysPriority);
    if (nested) {
      return nested;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = extractValueByKnownKeys(value, keysPriority);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function findCodeInPayload(payload) {
  return extractValueByKnownKeys(payload, [
    'pair_code',
    'pairing_code',
    'pairingCode',
    'pairCode',
    'code',
    'link_code',
    'linkCode',
    'authorizationCode',
    'authCode'
  ]);
}

function findErrorMessageInPayload(payload) {
  return extractValueByKnownKeys(payload, [
    'message',
    'error',
    'details',
    'description',
    'reason'
  ]);
}

function resolvePairCodeApiUrl() {
  return sanitizePairCodeApiUrl(SETTINGS?.pair_code_api_url) || buildLocalPairingApiUrl() || getPairCodeApiCandidates()[0] || '';
}

async function requestPairCodeViaExternalApi(number, options = {}) {
  const excludedUrls = new Set((options.excludeUrls || []).map((item) => normalizeHttpUrl(item)).filter(Boolean));
  const apiUrls = getPairCodeApiCandidates().filter((item) => !excludedUrls.has(normalizeHttpUrl(item)));
  if (!apiUrls.length) {
    throw new Error('لا يوجد API خارجي صالح للربط حالياً.');
  }

  let lastError = null;
  const methods = getPairCodeMethodCandidates();
  const numberFields = getPairCodeNumberFieldCandidates();

  for (const apiUrl of apiUrls) {
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
      const phoneValue = Number.isSafeInteger(Number(cleanNumber)) ? Number(cleanNumber) : cleanNumber;

      for (const method of methods) {
        for (const numberField of numberFields) {
          const payload = {
            [numberField]: phoneValue
          };

          try {
            const response = await httpRequest({
              method,
              url: apiUrl,
              timeout: 45000,
              headers: {
                ...headers,
                ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
              },
              query: method === 'GET' ? payload : undefined,
              data: method === 'POST' ? payload : undefined
            });

            if (response.status < 200 || response.status >= 300) {
              lastError = new Error(`HTTP ${response.status}: ${stringifyPayload(response.data || response.text)}`);
              continue;
            }

            const contentType = String(response.headers['content-type'] || '').toLowerCase();
            if (contentType.includes('application/json')) {
              const data = response.data;

              if (data && typeof data === 'object' && data.ok === true && data.service === 'telegram-bot') {
                lastError = new Error('تم إرسال الطلب إلى health check أو الصفحة الرئيسية بدل endpoint الربط الصحيح.');
                continue;
              }

              if (data && typeof data === 'object' && (data.status === false || data.success === false)) {
                const errorText = findErrorMessageInPayload(data)
                  || 'تعذّر الحصول على كود الربط من الخدمة الخارجية.';
                lastError = new Error(errorText);
                continue;
              }

              const code = findCodeInPayload(data);
              if (code) {
                if (SETTINGS.pair_code_api_url !== apiUrl) {
                  SETTINGS.pair_code_api_url = apiUrl;
                  saveSettings();
                }
                if (SETTINGS.pair_code_api_method !== method) {
                  SETTINGS.pair_code_api_method = method;
                  saveSettings();
                }
                if (SETTINGS.pair_code_api_number_field !== numberField) {
                  SETTINGS.pair_code_api_number_field = numberField;
                  saveSettings();
                }
                return code;
              }

              const errorText = findErrorMessageInPayload(data);
              lastError = new Error(errorText || `استجابة JSON لا تحتوي على حقل كود صالح للرقم ${numberVariant}`);
              continue;
            }

            const textResponse = typeof response.data === 'string'
              ? response.data.trim()
              : stringifyPayload(response.data || '').trim();

            if (textResponse && textResponse.length <= 64 && !/[{}<>\n\r]/.test(textResponse)) {
              if (SETTINGS.pair_code_api_url !== apiUrl) {
                SETTINGS.pair_code_api_url = apiUrl;
                saveSettings();
              }
              if (SETTINGS.pair_code_api_method !== method) {
                SETTINGS.pair_code_api_method = method;
                saveSettings();
              }
              if (SETTINGS.pair_code_api_number_field !== numberField) {
                SETTINGS.pair_code_api_number_field = numberField;
                saveSettings();
              }
              return textResponse;
            }

            lastError = new Error(`الاستجابة لا تحتوي على كود صالح للرقم ${numberVariant}`);
          } catch (error) {
            const message = error?.name === 'AbortError'
              ? 'انتهت مهلة الاتصال بخدمة الربط.'
              : (error?.message || 'Unknown error');
            lastError = new Error(message);
          }
        }
      }
    }
  }

  throw new Error(`فشل استخراج كود الربط من API خارجي. آخر خطأ: ${lastError?.message || 'Unknown error'}`);
}

async function requestPairCode(number, options = {}) {
  const phone = normalizePhoneNumber(number);
  let localError = null;

  if (!options.skipLocal && LOCAL_PAIRING_ENABLED) {
    try {
      return await requestPairCodeLocally(phone);
    } catch (error) {
      localError = error;
      console.error('Local pairing failed for %s:', phone, error.message);
    }
  }

  try {
    return await requestPairCodeViaExternalApi(phone, {
      excludeUrls: options.skipSelfApi ? [buildLocalPairingApiUrl(), LOCAL_PAIRING_API_ROUTE, ALT_LOCAL_PAIRING_API_ROUTE] : []
    });
  } catch (externalError) {
    if (localError) {
      throw new Error(`فشل الربط المحلي: ${localError.message} | وفشل الربط الخارجي: ${externalError.message}`);
    }
    throw externalError;
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
      value = sanitizePairCodeApiUrl(value);
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
  startHealthServer();

  if (!resolvePairCodeApiUrl() && !LOCAL_PAIRING_ENABLED) {
    console.warn('Warning: no pairing service is configured yet.');
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
