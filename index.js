 const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    delay,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const { Telegraf, session, Markup } = require('telegraf');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
let sendRobustStatusReaction;
try {
    ({ sendRobustStatusReaction } = require('./statusHelper'));
} catch (_) {
    ({ sendRobustStatusReaction } = require('./status-reaction-fix'));
}

// =========================
// الإعدادات الأساسية
// =========================
const APP_PORT = Number(process.env.PORT || 8080);
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
const DEFAULT_REACTION_EMOJI = '❤️';
let reactionEmoji = DEFAULT_REACTION_EMOJI;
const BRAND_NAME = 'بوت الملك فارس';
const BRAND_IMAGE_TEXT = 'بوت الملك فارس';
const DEFAULT_BOT_LINK = 'https://t.me/Faresw_bot';
const DEVELOPER_DISPLAY_NAME = '◥ ツفارس ツ ◤ ⁪⁬⁮⁮⁮ ⁪⁬⁮⁮⁮';
const DEVELOPER_USERNAME = 'P_n_ij';
const DEVELOPER_PROFILE_LINK = 'https://t.me/P_n_ij';
const DEVELOPER_CHANNEL_NAME = 'تحديثات بوت الواتس';
const DEVELOPER_CHANNEL_LINK = 'https://t.me/fz_z_Z';
const DEVELOPER_WHATSAPP_NUMBER = String(process.env.DEVELOPER_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const DEVELOPER_WHATSAPP_LINK = DEVELOPER_WHATSAPP_NUMBER ? `https://wa.me/${DEVELOPER_WHATSAPP_NUMBER}` : '';
const SETTINGS_IMAGE_URL = 'https://www.genspark.ai/api/files/s/CLggRDjS';
const WHATSAPP_CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb8jjfWCRs1sVz0x1w3v';
const DAILY_GIFT_POINTS = 300;
const DAILY_GIFT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const POINTS_PER_LIKE_PACKAGE = 30;
const LIKES_PER_POINTS_PACKAGE = 500;
const MAX_AUTO_REPLIES = 10;
const MAX_GLOBAL_AUTO_REPLIES = 50;
const MAX_WA_ABOUT_LENGTH = 139;
const PROFILE_CUSTOM_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PHONE_SETTINGS_AUTH_TTL_MS = Number(process.env.PHONE_SETTINGS_AUTH_TTL_MS || 15 * 60 * 1000);
const STATUS_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEPLOYMENT_BASE_URL = 'https://whatsapp-pairing-api-production.up.railway.app';
const DEFAULT_PUBLIC_BASE_URL = process.env.DEFAULT_PUBLIC_BASE_URL || DEPLOYMENT_BASE_URL;
const DEFAULT_SITE_INFO_TEXT = 'تم تنظيف هذه النسخة: لا توجد أرقام تواصل ثابتة داخل الملف.';
const SITE_ENDPOINTS = {
    target_site_base_url: DEPLOYMENT_BASE_URL,
    target_settings_page_url: `${DEPLOYMENT_BASE_URL}/settings`,
    target_site_login_api_url: `${DEPLOYMENT_BASE_URL}/api/login`,
    target_site_settings_load_api_url: `${DEPLOYMENT_BASE_URL}/api/settings/load`,
    target_site_settings_save_api_url: `${DEPLOYMENT_BASE_URL}/api/settings/save`,
    green_api_base_url: 'https://api.green-api.com',
    target_pairing_api_url: `${DEPLOYMENT_BASE_URL}/api/pairing`
};
const SITE_SETTINGS_FIELD_LABELS = {
    name: 'اسم البوت',
    ownerNumber: 'رقم التواصل',
    ownername: 'اسم المالك',
    description: 'المعلومات التعريفية',
    from: 'الموقع',
    age: 'العمر',
    prefix: 'البادئة',
    footer2: 'الفوتر',
    mode: 'الوضع',
    antiBad: 'مكافحة الكلمات السيئة',
    antiLink: 'مكافحة الروابط',
    autoRecording: 'تسجيل تلقائي',
    autoTyping: 'كتابة تلقائية',
    alwaysOnline: 'دائمًا أونلاين',
    autoStatusRead: 'مشاهدة الحالة تلقائيًا',
    autoStatusReact: 'التفاعل مع الحالة تلقائيًا',
    statusReactionNotice: 'إظهار التفاعل لصاحب الرقم',
    keepDeletedStatus: 'حفظ الحالة عند حذفها',
    ghostMode: 'تفعيل الشبح',
    autoPrivateReact: 'التفاعل التلقائي للخاص',
    autoRead: 'قراءة تلقائية',
    autoBlock: 'حظر تلقائي',
    autoReact: 'تفاعل تلقائي',
    autoVoice: 'صوت تلقائي',
    antiDelete: 'مكافحة الحذف',
    sendDeleteTo: 'إرسال المحذوف إلى',
    antiCall: 'مكافحة الاتصال',
    excludeCallNumbers: 'أرقام مستثناة من منع الاتصالات',
    statusMsgSend: 'إرسال رسالة على الحالة',
    statusMsgType: 'نوع رسالة الحالة',
    customMsg: 'رسالة الحالة المخصصة',
    menu: 'صورة المنيو',
    alive: 'صورة alive',
    owner: 'صورة المالك',
    statusCustomReact: 'رموز تعبيرية للحالة (10 كحد أقصى)',
    antiBug: 'مكافحة البق',
    antiBot: 'مكافحة البوت',
    antiBotAction: 'إجراء مكافحة البوت',
    gaGroupJid: 'معرف الجروب',
    gaTimezone: 'المنطقة الزمنية',
    gaCloseTime: 'وقت الإغلاق',
    gaOpenTime: 'وقت الفتح',
    customAutoReplies: 'الردود التلقائية المخصصة',
    autoSave: 'الحفظ التلقائي',
    language: 'اللغة',
    antiViewOnce: 'منع العرض لمرة واحدة',
    antiLinkList: 'الروابط المحظورة',
    antiBadWords: 'الكلمات المحظورة',
    antiMention: 'منع المنشن',
    antiEdit: 'منع تعديل الرسائل',
    antiAction: 'إجراء الحماية',
    antiWarnCount: 'عدد التحذيرات',
    autoReactScope: 'نطاق التفاعل التلقائي',
    aiReplyScope: 'نطاق الرد الذكي',
    aliveMsg: 'رسالة alive',
    voiceFooter: 'رابط الفوتر الصوتي'
};
const DEFAULT_SITE_SETTINGS_PAYLOAD = {
    name: 'fares',
    from: 'Yemen',
    age: '24',
    prefix: '.',
    footer2: 'fares',
    mode: 'private',
    antiBad: 'off',
    antiLink: 'off',
    autoRecording: 'off',
    autoTyping: 'off',
    alwaysOnline: 'on',
    autoStatusRead: 'on',
    autoStatusReact: 'on',
    statusReactionNotice: 'off',
    keepDeletedStatus: 'off',
    ghostMode: 'off',
    autoRead: 'off',
    autoPrivateReact: 'off',
    autoBlock: 'off',
    autoReact: 'off',
    autoVoice: 'off',
    antiDelete: 'off',
    sendDeleteTo: 'owner',
    antiCall: 'off',
    excludeCallNumbers: '',
    statusMsgSend: 'off',
    statusMsgType: 'default',
    customMsg: DEFAULT_SITE_INFO_TEXT,
    ownerNumber: '',
    ownername: 'fares',
    description: DEFAULT_SITE_INFO_TEXT,
    gaGroupJid: '',
    gaTimezone: 'Asia/Colombo',
    gaCloseTime: '15:00',
    gaOpenTime: '05:00',
    menu: SETTINGS_IMAGE_URL,
    alive: SETTINGS_IMAGE_URL,
    owner: SETTINGS_IMAGE_URL,
    statusCustomReact: '❤️',
    antiBug: 'off',
    antiBot: 'off',
    antiBotAction: 'delete',
    language: 'arabic',
    antiViewOnce: 'off',
    antiLinkList: 'wa.me,whatsapp.com',
    antiBadWords: 'huththa,ponna',
    antiMention: 'off',
    antiEdit: 'inbox',
    antiAction: 'wern',
    antiWarnCount: '3',
    autoReactScope: 'inbox',
    aiReplyScope: 'inbox',
    aliveMsg: '❖ *alive now*',
    voiceFooter: 'https://github.com/monetheistmd/WEB_DATABASE/raw/main/AUD-20251229-WA0034.mp3'
};
const DEFAULT_PHONE_SETTINGS = {
    ...DEFAULT_SITE_SETTINGS_PAYLOAD,
    customAutoReplies: '',
    autoSave: 'off'
};
const IMPORTED_REDQUEEN_PHONE = '';
const IMPORTED_REDQUEEN_PASSWORD = '';
const IMPORTED_REDQUEEN_PHONE_SETTINGS = {
    ...DEFAULT_PHONE_SETTINGS,
    name: 'MONEY HEIST MD',
    ownername: 'MONEY HEIST MD',
    ownerNumber: IMPORTED_REDQUEEN_PHONE,
    from: 'SRI LANKA',
    age: '24',
    prefix: '*',
    footer2: 'MONEY HEIST MD',
    description: 'Imported from Red Queen mini bot settings',
    mode: 'public',
    alwaysOnline: 'on',
    antiCall: 'off',
    antiDelete: 'inbox',
    sendDeleteTo: 'owner',
    antiLink: 'off',
    antiBad: 'off',
    antiBot: 'off',
    autoStatusRead: 'on',
    autoStatusReact: 'on',
    statusReactionNotice: 'off',
    autoPrivateReact: 'off',
    keepDeletedStatus: 'off',
    statusCustomReact: '❤️',
    menu: SETTINGS_IMAGE_URL,
    alive: SETTINGS_IMAGE_URL,
    owner: SETTINGS_IMAGE_URL,
    language: 'arabic',
    antiViewOnce: 'off',
    antiLinkList: 'wa.me,whatsapp.com',
    antiBadWords: 'huththa,ponna',
    antiMention: 'off',
    antiEdit: 'inbox',
    antiAction: 'wern',
    antiWarnCount: '3',
    autoReactScope: 'inbox',
    aiReplyScope: 'inbox',
    aliveMsg: '❖ *alive now money heist md*',
    voiceFooter: 'https://github.com/monetheistmd/WEB_DATABASE/raw/main/AUD-20251229-WA0034.mp3'
};

function getImportedPhoneSettingsSeed(phone) {
    return normalizePhone(phone) === IMPORTED_REDQUEEN_PHONE
        ? JSON.parse(JSON.stringify(IMPORTED_REDQUEEN_PHONE_SETTINGS))
        : null;
}

function getImportedPhoneSettingsPassword(phone) {
    return normalizePhone(phone) === IMPORTED_REDQUEEN_PHONE ? IMPORTED_REDQUEEN_PASSWORD : '';
}

const PHONE_SETTINGS_SECTIONS = [
    {
        key: 'general',
        label: 'الإعدادات العامة',
        fields: ['name', 'ownername', 'ownerNumber', 'description', 'from', 'age', 'prefix', 'footer2', 'mode']
    },
    {
        key: 'automation',
        label: 'الحالة والخيارات التلقائية',
        fields: ['autoStatusRead', 'autoStatusReact', 'statusReactionNotice', 'autoPrivateReact', 'ghostMode', 'alwaysOnline', 'autoRecording', 'autoTyping', 'autoRead', 'statusMsgSend', 'statusMsgType', 'customMsg', 'statusCustomReact']
    },
    {
        key: 'protection',
        label: 'الحماية والسلوك',
        fields: ['antiBad', 'antiLink', 'antiDelete', 'sendDeleteTo', 'antiCall', 'excludeCallNumbers', 'antiBug', 'antiBot', 'antiBotAction', 'autoBlock', 'autoVoice']
    },
    {
        key: 'media',
        label: 'الوسائط والصور',
        fields: ['menu', 'alive', 'owner']
    },
    {
        key: 'group',
        label: 'الجروب والمتقدم',
        fields: ['gaGroupJid', 'gaTimezone', 'gaOpenTime', 'gaCloseTime']
    },
    {
        key: 'redqueen',
        label: 'إعدادات Red Queen',
        fields: ['language', 'antiViewOnce', 'antiLinkList', 'antiBadWords', 'antiMention', 'antiEdit', 'antiAction', 'antiWarnCount', 'autoReactScope', 'aiReplyScope', 'aliveMsg', 'voiceFooter']
    }
];
const PHONE_SETTINGS_TOGGLE_FIELDS = new Set([
    'antiBad', 'antiLink', 'autoRecording', 'autoTyping', 'alwaysOnline', 'autoStatusRead', 'autoStatusReact',
    'statusReactionNotice', 'autoPrivateReact', 'ghostMode', 'autoRead', 'autoBlock', 'autoVoice', 'antiCall', 'statusMsgSend', 'antiBug', 'antiBot', 'antiMention'
]);
const PHONE_SETTINGS_SELECT_OPTIONS = {
    mode: [
        { value: 'public', label: 'عام' },
        { value: 'private', label: 'خاص' },
        { value: 'inbox', label: 'خاص/خاص فقط' },
        { value: 'group', label: 'المجموعات' },
        { value: 'admin', label: 'الأدمن فقط' }
    ],
    antiDelete: [
        { value: 'off', label: 'إيقاف' },
        { value: 'inbox', label: 'الخاص' },
        { value: 'group', label: 'المجموعات' },
        { value: 'all', label: 'الكل' }
    ],
    sendDeleteTo: [
        { value: 'owner', label: 'إلى المالك' },
        { value: 'same', label: 'إلى نفس الشات' }
    ],
    statusMsgType: [
        { value: 'default', label: 'افتراضي' },
        { value: 'custom', label: 'مخصص' }
    ],
    antiBotAction: [
        { value: 'delete', label: 'حذف الرسائل' },
        { value: 'delete+kick', label: 'حذف + طرد' }
    ],
    language: [
        { value: 'english', label: 'English' },
        { value: 'sinhala', label: 'Sinhala' },
        { value: 'arabic', label: 'العربية' }
    ],
    antiViewOnce: [
        { value: 'off', label: 'إيقاف' },
        { value: 'all', label: 'الكل' }
    ],
    antiEdit: [
        { value: 'off', label: 'إيقاف' },
        { value: 'inbox', label: 'الخاص' },
        { value: 'group', label: 'المجموعات' },
        { value: 'all', label: 'الكل' }
    ],
    antiAction: [
        { value: 'delete', label: 'حذف' },
        { value: 'wern', label: 'تحذير' },
        { value: 'kick', label: 'طرد' }
    ],
    autoReactScope: [
        { value: 'off', label: 'إيقاف' },
        { value: 'all', label: 'الكل' },
        { value: 'group', label: 'المجموعات' },
        { value: 'inbox', label: 'الخاص' }
    ],
    aiReplyScope: [
        { value: 'off', label: 'إيقاف' },
        { value: 'all', label: 'الكل' },
        { value: 'group', label: 'المجموعات' },
        { value: 'inbox', label: 'الخاص' }
    ]
};
const PHONE_SETTINGS_EDIT_HINTS = {
    name: 'أرسل اسم البوت الجديد الآن. الحد الأقصى 15 حرف.',
    ownername: 'أرسل اسم المالك الجديد الآن. الحد الأقصى 40 حرف.',
    ownerNumber: 'أرسل رقم التواصل مع مفتاح الدولة، أرقام فقط.',
    description: 'أرسل الوصف أو المعلومات التعريفية الجديدة.',
    from: 'أرسل اسم البلد أو الموقع.',
    age: 'أرسل العمر كرقم فقط.',
    prefix: 'أرسل البادئة الجديدة مثل . أو #',
    footer2: 'أرسل الفوتر الجديد.',
    customMsg: 'أرسل رسالة الحالة المخصصة الجديدة.',
    statusCustomReact: 'أرسل الإيموجيات مفصولة بمسافة أو فاصلة، بحد أقصى 10 إيموجيات.',
    excludeCallNumbers: 'أرسل الأرقام المستثناة مفصولة بمسافة أو فاصلة.',
    menu: 'أرسل رابط صورة المنيو المباشر.',
    alive: 'أرسل رابط صورة alive المباشر.',
    owner: 'أرسل رابط صورة المالك المباشر.',
    gaGroupJid: 'أرسل معرف الجروب.',
    gaTimezone: 'أرسل المنطقة الزمنية مثل Asia/Aden أو Asia/Riyadh.',
    gaOpenTime: 'أرسل وقت الفتح بصيغة HH:MM',
    gaCloseTime: 'أرسل وقت الإغلاق بصيغة HH:MM',
    antiLinkList: 'أرسل الروابط أو الدومينات المحظورة مفصولة بفواصل.',
    antiBadWords: 'أرسل الكلمات المحظورة مفصولة بفواصل أو أسطر.',
    antiWarnCount: 'أرسل عدد التحذيرات قبل تنفيذ الإجراء.',
    aliveMsg: 'أرسل رسالة alive الجديدة.',
    voiceFooter: 'أرسل رابط الملف الصوتي المباشر (MP3) للفوتر.',
    language: 'اختر اللغة من القائمة.',
    antiViewOnce: 'اختر نمط منع العرض لمرة واحدة من القائمة.',
    antiEdit: 'اختر نمط منع التعديل من القائمة.',
    antiAction: 'اختر الإجراء المناسب من القائمة.',
    autoReactScope: 'اختر نطاق التفاعل التلقائي من القائمة.',
    aiReplyScope: 'اختر نطاق الرد الذكي من القائمة.'
};
const SETTINGS_PAGE_HTML = Buffer.from('PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CiAgPG1ldGEgY2hhcnNldD0iVVRGLTgiIC8+CiAgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAiIC8+CiAgPHRpdGxlPtio2YjYqiDYp9mE2YXZhNmDINmB2KfYsdizIOKAlCDZhNmI2K3YqSDYp9mE2KXYudiv2KfYr9in2Ko8L3RpdGxlPgogIDxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSIgLz4KICA8bGluayByZWw9InByZWNvbm5lY3QiIGhyZWY9Imh0dHBzOi8vZm9udHMuZ3N0YXRpYy5jb20iIGNyb3Nzb3JpZ2luIC8+CiAgPGxpbmsgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1TeW5lOndnaHRANDAwOzYwMDs3MDA7ODAwJmZhbWlseT1ETStTYW5zOndnaHRAMzAwOzQwMDs1MDAmZmFtaWx5PUpldEJyYWlucytNb25vOndnaHRANDAwOzYwMCZkaXNwbGF5PXN3YXAiIHJlbD0ic3R5bGVzaGVldCIgLz4KICA8c2NyaXB0IHNyYz0iaHR0cHM6Ly91bnBrZy5jb20vcmVhY3RAMTgvdW1kL3JlYWN0LnByb2R1Y3Rpb24ubWluLmpzIj48L3NjcmlwdD4KICA8c2NyaXB0IHNyYz0iaHR0cHM6Ly91bnBrZy5jb20vcmVhY3QtZG9tQDE4L3VtZC9yZWFjdC1kb20ucHJvZHVjdGlvbi5taW4uanMiPjwvc2NyaXB0PgogIDxzY3JpcHQgc3JjPSJodHRwczovL3VucGtnLmNvbS9AYmFiZWwvc3RhbmRhbG9uZS9iYWJlbC5taW4uanMiPjwvc2NyaXB0PgogIDxzY3JpcHQgc3JjPSJodHRwczovL2Nkbi50YWlsd2luZGNzcy5jb20iPjwvc2NyaXB0PgogIDxzdHlsZT4KICAgIDpyb290IHsKICAgICAgLS1iZzojMGQwZDEyOyAtLWJnMjojMTMxMzFjOyAtLWNhcmQ6cmdiYSgyNiwyNiwzOSwwLjk1KTsKICAgICAgLS1ib3JkZXI6cmdiYSgyNTUsMjU1LDI1NSwwLjA3KTsgLS1ib3JkZXItYWNjZW50OnJnYmEoMjEyLDE2MCw4NSwwLjM1KTsKICAgICAgLS1nb2xkOiNkNGEwNTU7IC0tZ29sZC1saWdodDojZjBjODgwOyAtLXJvc2U6I2U4Njk3YTsgLS1yb3NlLWxpZ2h0OiNmNWEwYWM7CiAgICAgIC0tdGV4dDojZjBlYWY1OyAtLW11dGVkOiM4YTg0OWE7IC0tZmFpbnQ6IzRhNDQ2MDsKICAgICAgLS1jOiMwMGQyZmY7IC0tYzI6IzNhN2JkNTsKICAgIH0KICAgICosICo6OmJlZm9yZSwgKjo6YWZ0ZXIgeyBib3gtc2l6aW5nOmJvcmRlci1ib3g7IG1hcmdpbjowOyBwYWRkaW5nOjA7IH0KICAgIGh0bWwgeyBzY3JvbGwtYmVoYXZpb3I6c21vb3RoOyB9CiAgICBib2R5IHsKICAgICAgYmFja2dyb3VuZDp2YXIoLS1iZyk7IGNvbG9yOnZhcigtLXRleHQpOwogICAgICBmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjsKICAgICAgb3ZlcmZsb3cteDpoaWRkZW47IG1pbi1oZWlnaHQ6MTAwdmg7CiAgICB9CiAgICBib2R5OjpiZWZvcmUgewogICAgICBjb250ZW50OicnOyBwb3NpdGlvbjpmaXhlZDsgaW5zZXQ6MDsKICAgICAgYmFja2dyb3VuZDoKICAgICAgICByYWRpYWwtZ3JhZGllbnQoZWxsaXBzZSA2MCUgNDAlIGF0IDE1JSA1JSwgIHJnYmEoMCwyMTAsMjU1LDAuMDUpICAwJSwgdHJhbnNwYXJlbnQgNjAlKSwKICAgICAgICByYWRpYWwtZ3JhZGllbnQoZWxsaXBzZSA1MCUgMzUlIGF0IDg1JSA4NSUsIHJnYmEoMjEyLDE2MCw4NSwwLjA2KSAwJSwgdHJhbnNwYXJlbnQgNjAlKSwKICAgICAgICBsaW5lYXItZ3JhZGllbnQocmdiYSgwLDIxMCwyNTUsMC4wMTUpIDFweCwgdHJhbnNwYXJlbnQgMXB4KSwKICAgICAgICBsaW5lYXItZ3JhZGllbnQoOTBkZWcscmdiYSgwLDIxMCwyNTUsMC4wMTUpIDFweCwgdHJhbnNwYXJlbnQgMXB4KTsKICAgICAgYmFja2dyb3VuZC1zaXplOjEwMCUgMTAwJSwgMTAwJSAxMDAlLCA2MHB4IDYwcHgsIDYwcHggNjBweDsKICAgICAgcG9pbnRlci1ldmVudHM6bm9uZTsgei1pbmRleDowOwogICAgfQogICAgYm9keTo6YWZ0ZXIgewogICAgICBjb250ZW50OicnOyBwb3NpdGlvbjpmaXhlZDsgbGVmdDowOyB0b3A6MDsgd2lkdGg6MTAwJTsgaGVpZ2h0OjJweDsKICAgICAgYmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsIHRyYW5zcGFyZW50IDAlLCB2YXIoLS1nb2xkKSAzMCUsIHZhcigtLWMpIDUwJSwgdmFyKC0tZ29sZCkgNzAlLCB0cmFuc3BhcmVudCAxMDAlKTsKICAgICAgYm94LXNoYWRvdzowIDAgMTZweCAzcHggcmdiYSgyMTIsMTYwLDg1LDAuNSk7CiAgICAgIGFuaW1hdGlvbjpsYXNlciA4cyBlYXNlLWluLW91dCBpbmZpbml0ZTsKICAgICAgei1pbmRleDo5OTk4OyBwb2ludGVyLWV2ZW50czpub25lOwogICAgfQogICAgQGtleWZyYW1lcyBsYXNlciB7IDAlLDEwMCV7dG9wOi01JTtvcGFjaXR5OjB9IDUle29wYWNpdHk6MX0gOTUle29wYWNpdHk6MX0gNTAle3RvcDoxMDUlfSB9CgogICAgaDEsaDIsaDMgeyBmb250LWZhbWlseTonU3luZScsc2Fucy1zZXJpZjsgfQogICAgY29kZSwubW9ubyB7IGZvbnQtZmFtaWx5OidKZXRCcmFpbnMgTW9ubycsbW9ub3NwYWNlOyB9CgogICAgLmdsYXNzIHsKICAgICAgYmFja2dyb3VuZDp2YXIoLS1jYXJkKTsgYmFja2Ryb3AtZmlsdGVyOmJsdXIoMjBweCk7CiAgICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTsgYm9yZGVyLXJhZGl1czoyNHB4OwogICAgICBwb3NpdGlvbjpyZWxhdGl2ZTsgb3ZlcmZsb3c6aGlkZGVuOwogICAgfQogICAgLmdsYXNzOjpiZWZvcmUgewogICAgICBjb250ZW50OicnOyBwb3NpdGlvbjphYnNvbHV0ZTsgaW5zZXQ6MDsKICAgICAgYmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLHJnYmEoMjU1LDI1NSwyNTUsMC4wMykgMCUsdHJhbnNwYXJlbnQgNjAlKTsKICAgICAgcG9pbnRlci1ldmVudHM6bm9uZTsgYm9yZGVyLXJhZGl1czppbmhlcml0OwogICAgfQogICAgLmdsYXNzOmhvdmVyIHsgYm9yZGVyLWNvbG9yOnZhcigtLWJvcmRlci1hY2NlbnQpOyB9CgogICAgLmlucCB7CiAgICAgIGJhY2tncm91bmQ6cmdiYSgxMywxMywxOCwwLjgpOwogICAgICBib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4wOSk7CiAgICAgIGJvcmRlci1yYWRpdXM6MTJweDsgcGFkZGluZzoxMXB4IDE0cHg7CiAgICAgIHdpZHRoOjEwMCU7IG91dGxpbmU6bm9uZTsgY29sb3I6dmFyKC0tdGV4dCk7CiAgICAgIGZvbnQtc2l6ZToxM3B4OyBmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjsKICAgICAgdHJhbnNpdGlvbjpib3JkZXItY29sb3IgMC4yNXMsIGJveC1zaGFkb3cgMC4yNXM7CiAgICB9CiAgICAuaW5wOmZvY3VzIHsgYm9yZGVyLWNvbG9yOnZhcigtLWdvbGQpOyBib3gtc2hhZG93OjAgMCAwIDNweCByZ2JhKDIxMiwxNjAsODUsMC4xMik7IH0KICAgIC5pbnA6OnBsYWNlaG9sZGVyIHsgY29sb3I6dmFyKC0tZmFpbnQpOyB9CiAgICAuaW5wOmRpc2FibGVkIHsgb3BhY2l0eTowLjU7IGN1cnNvcjpub3QtYWxsb3dlZDsgfQogICAgc2VsZWN0LmlucCBvcHRpb24geyBiYWNrZ3JvdW5kOiMxMzEzMWM7IH0KICAgIC5pbnAtZXJyb3IgeyBib3JkZXItY29sb3I6I2VmNDQ0NCAhaW1wb3J0YW50OyB9CiAgICAuaW5wLWVycm9yOmZvY3VzIHsgYm94LXNoYWRvdzowIDAgMCAzcHggcmdiYSgyMzksNjgsNjgsMC4xMikgIWltcG9ydGFudDsgfQoKICAgIC50b2dnbGUtd3JhcCB7CiAgICAgIHdpZHRoOjUwcHg7IGhlaWdodDoyNnB4OyBib3JkZXItcmFkaXVzOjk5cHg7CiAgICAgIHBvc2l0aW9uOnJlbGF0aXZlOyBjdXJzb3I6cG9pbnRlcjsgdHJhbnNpdGlvbjpiYWNrZ3JvdW5kIDAuMzVzOyBmbGV4LXNocmluazowOwogICAgfQogICAgLnRvZ2dsZS13cmFwLm9uICB7IGJhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLHZhcigtLWdvbGQpLCNiODg1M2EpOyBib3gtc2hhZG93OjAgMCAxMHB4IHJnYmEoMjEyLDE2MCw4NSwwLjQpOyB9CiAgICAudG9nZ2xlLXdyYXAub2ZmIHsgYmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LDAuMDkpOyB9CiAgICAudG9nZ2xlLXRodW1iIHsKICAgICAgd2lkdGg6MjBweDsgaGVpZ2h0OjIwcHg7IGJhY2tncm91bmQ6d2hpdGU7IGJvcmRlci1yYWRpdXM6NTAlOwogICAgICBwb3NpdGlvbjphYnNvbHV0ZTsgdG9wOjNweDsgdHJhbnNpdGlvbjpsZWZ0IDAuMzVzIGN1YmljLWJlemllciguNCwwLC4yLDEpOwogICAgICBib3gtc2hhZG93OjAgMXB4IDRweCByZ2JhKDAsMCwwLDAuNCk7CiAgICB9CiAgICAudG9nZ2xlLXdyYXAub24gIC50b2dnbGUtdGh1bWIgeyBsZWZ0OjI3cHg7IH0KICAgIC50b2dnbGUtd3JhcC5vZmYgLnRvZ2dsZS10aHVtYiB7IGxlZnQ6M3B4OyB9CgogICAgLnN0cmlwZSB7IHBvc2l0aW9uOmFic29sdXRlOyB0b3A6MDsgbGVmdDowOyB3aWR0aDo0cHg7IGhlaWdodDoxMDAlOyBib3JkZXItcmFkaXVzOjI0cHggMCAwIDI0cHg7IH0KICAgIEBrZXlmcmFtZXMgZmFkZVVwIHsgZnJvbXtvcGFjaXR5OjA7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoMjBweCl9IHRve29wYWNpdHk6MTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgwKX0gfQogICAgLmZhZGUtdXAgeyBhbmltYXRpb246ZmFkZVVwIDAuNTVzIGVhc2Utb3V0IGZvcndhcmRzOyB9CiAgICAuZGVsYXktMSB7IGFuaW1hdGlvbi1kZWxheTowLjFzOyBvcGFjaXR5OjA7IH0KICAgIC5kZWxheS0yIHsgYW5pbWF0aW9uLWRlbGF5OjAuMnM7IG9wYWNpdHk6MDsgfQogICAgLmRlbGF5LTMgeyBhbmltYXRpb24tZGVsYXk6MC4zczsgb3BhY2l0eTowOyB9CiAgICAuZGVsYXktNCB7IGFuaW1hdGlvbi1kZWxheTowLjRzOyBvcGFjaXR5OjA7IH0KICAgIC5kZWxheS01IHsgYW5pbWF0aW9uLWRlbGF5OjAuNXM7IG9wYWNpdHk6MDsgfQoKICAgIC5sYW5nLW92ZXJsYXkgewogICAgICBwb3NpdGlvbjpmaXhlZDsgaW5zZXQ6MDsKICAgICAgYmFja2dyb3VuZDpyYWRpYWwtZ3JhZGllbnQoZWxsaXBzZSBhdCBjZW50ZXIsICMwYTEwMjAgMCUsIHZhcigtLWJnKSAxMDAlKTsKICAgICAgei1pbmRleDoxMDAwMDsgZGlzcGxheTpmbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGp1c3RpZnktY29udGVudDpjZW50ZXI7CiAgICB9CiAgICAubGFuZy1idG4gewogICAgICBwYWRkaW5nOjE0cHggMjBweDsgYm9yZGVyLXJhZGl1czoxNnB4OwogICAgICBmb250LWZhbWlseTonU3luZScsc2Fucy1zZXJpZjsgZm9udC13ZWlnaHQ6NzAwOyBmb250LXNpemU6MTVweDsKICAgICAgYm9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpOyBjdXJzb3I6cG9pbnRlcjsKICAgICAgdHJhbnNpdGlvbjp0cmFuc2Zvcm0gMC4ycywgYm94LXNoYWRvdyAwLjJzLCBib3JkZXItY29sb3IgMC4yczsKICAgICAgZGlzcGxheTpmbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDoxMnB4OwogICAgfQogICAgLmxhbmctYnRuOmhvdmVyIHsgdHJhbnNmb3JtOnRyYW5zbGF0ZVkoLTJweCk7IGJvcmRlci1jb2xvcjp2YXIoLS1ib3JkZXItYWNjZW50KTsgfQogICAgLmxhbmctYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTpzY2FsZSgwLjk2KTsgfQoKICAgIC5zcGluIHsKICAgICAgd2lkdGg6MTZweDsgaGVpZ2h0OjE2cHg7CiAgICAgIGJvcmRlcjoycHggc29saWQgdmFyKC0tZ29sZCk7IGJvcmRlci1ib3R0b20tY29sb3I6dHJhbnNwYXJlbnQ7CiAgICAgIGJvcmRlci1yYWRpdXM6NTAlOyBhbmltYXRpb246c3BpbkFuaW0gMC44cyBsaW5lYXIgaW5maW5pdGU7IGRpc3BsYXk6aW5saW5lLWJsb2NrOwogICAgfQogICAgQGtleWZyYW1lcyBzcGluQW5pbSB7IHRve3RyYW5zZm9ybTpyb3RhdGUoMzYwZGVnKX0gfQoKICAgIEBrZXlmcmFtZXMgdG9hc3RJbiB7CiAgICAgIGZyb217b3BhY2l0eTowO3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpIHRyYW5zbGF0ZVkoLTIwcHgpIHNjYWxlKDAuOSl9CiAgICAgIHRvICB7b3BhY2l0eToxO3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpIHRyYW5zbGF0ZVkoMCkgICAgIHNjYWxlKDEpfQogICAgfQogICAgLnRvYXN0LWFuaW0geyBhbmltYXRpb246dG9hc3RJbiAwLjM1cyBjdWJpYy1iZXppZXIoLjQsMCwuMiwxKSBmb3J3YXJkczsgfQoKICAgIC5zZWMtbGFiZWwgewogICAgICBmb250LWZhbWlseTonU3luZScsc2Fucy1zZXJpZjsgZm9udC13ZWlnaHQ6NzAwOyBmb250LXNpemU6MTFweDsKICAgICAgbGV0dGVyLXNwYWNpbmc6MC4xNWVtOyB0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7CiAgICAgIGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBnYXA6OHB4OwogICAgfQogICAgLnRvZ2dsZS1yb3cgewogICAgICBkaXNwbGF5OmZsZXg7IGp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczpjZW50ZXI7CiAgICAgIGJhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwwLjAzKTsgYm9yZGVyOjFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDUpOwogICAgICBwYWRkaW5nOjEycHggMTZweDsgYm9yZGVyLXJhZGl1czoxNHB4OyB0cmFuc2l0aW9uOmJhY2tncm91bmQgMC4ycywgYm9yZGVyLWNvbG9yIDAuMnM7CiAgICB9CiAgICAudG9nZ2xlLXJvdzpob3ZlciB7IGJhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwwLjA1KTsgYm9yZGVyLWNvbG9yOnZhcigtLWJvcmRlci1hY2NlbnQpOyB9CgogICAgLnJ0bCB7IGRpcmVjdGlvbjpydGw7IH0KCiAgICAuc2F2ZS1idG4gewogICAgICBiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxMzVkZWcsdmFyKC0tZ29sZCkgMCUsI2I4ODUzYSAxMDAlKTsKICAgICAgYm9yZGVyLXJhZGl1czoyMHB4OyBmb250LWZhbWlseTonU3luZScsc2Fucy1zZXJpZjsKICAgICAgZm9udC13ZWlnaHQ6ODAwOyBmb250LXNpemU6MTVweDsgbGV0dGVyLXNwYWNpbmc6MC4wNWVtOwogICAgICBwYWRkaW5nOjE2cHggMzZweDsgYm9yZGVyOm5vbmU7IGN1cnNvcjpwb2ludGVyOyBjb2xvcjojMGQwZDBkOwogICAgICBkaXNwbGF5OmZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgZ2FwOjEwcHg7CiAgICAgIGJveC1zaGFkb3c6MCA4cHggMzJweCByZ2JhKDIxMiwxNjAsODUsMC40KSwgMCAwIDAgMXB4IHJnYmEoMjU1LDI1NSwyNTUsMC4wOCk7CiAgICAgIHRyYW5zaXRpb246dHJhbnNmb3JtIDAuMnMsIGJveC1zaGFkb3cgMC4yczsKICAgIH0KICAgIC5zYXZlLWJ0bjpob3ZlciAgeyB0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMnB4KTsgYm94LXNoYWRvdzowIDEycHggNDBweCByZ2JhKDIxMiwxNjAsODUsMC41NSk7IH0KICAgIC5zYXZlLWJ0bjphY3RpdmUgeyB0cmFuc2Zvcm06c2NhbGUoMC45Nyk7IH0KCiAgICAuaW1nLXNsb3QgewogICAgICB3aWR0aDoxMDAlOyBhc3BlY3QtcmF0aW86MTYvOTsgYm9yZGVyLXJhZGl1czoxNHB4OyBvdmVyZmxvdzpoaWRkZW47CiAgICAgIGJhY2tncm91bmQ6cmdiYSgwLDAsMCwwLjMpOyBib3JkZXI6MXB4IGRhc2hlZCByZ2JhKDI1NSwyNTUsMjU1LDAuMSk7CiAgICAgIGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyOwogICAgfQogICAgLmltZy1zbG90IGltZyB7IHdpZHRoOjEwMCU7IGhlaWdodDoxMDAlOyBvYmplY3QtZml0OmNvdmVyOyB9CgogICAgLnVwbG9hZC1sYmwgewogICAgICBkaXNwbGF5OmZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsganVzdGlmeS1jb250ZW50OmNlbnRlcjsgZ2FwOjhweDsKICAgICAgcGFkZGluZzoxMHB4OyBiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsMC4wNCk7CiAgICAgIGJvcmRlcjoxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA4KTsgYm9yZGVyLXJhZGl1czoxMnB4OyBjdXJzb3I6cG9pbnRlcjsKICAgICAgZm9udC1zaXplOjExcHg7IGZvbnQtd2VpZ2h0OjcwMDsgbGV0dGVyLXNwYWNpbmc6MC4xZW07IHRleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTsKICAgICAgY29sb3I6Izk0YTNiODsgdHJhbnNpdGlvbjpiYWNrZ3JvdW5kIDAuMnMsIGJvcmRlci1jb2xvciAwLjJzLCBjb2xvciAwLjJzOwogICAgfQogICAgLnVwbG9hZC1sYmw6aG92ZXIgeyBiYWNrZ3JvdW5kOnJnYmEoMjEyLDE2MCw4NSwwLjEpOyBib3JkZXItY29sb3I6dmFyKC0tYm9yZGVyLWFjY2VudCk7IGNvbG9yOnZhcigtLWdvbGQpOyB9CgogICAgLmFwcC1iYWRnZSB7CiAgICAgIGJhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1nb2xkKSwjYjg4NTNhKTsKICAgICAgcGFkZGluZzo0cHggMTJweDsgYm9yZGVyLXJhZGl1czozMHB4OyBmb250LXNpemU6MTFweDsKICAgICAgZm9udC13ZWlnaHQ6NzAwOyBsZXR0ZXItc3BhY2luZzowLjA1ZW07IGNvbG9yOiMwZDBkMGQ7CiAgICAgIGRpc3BsYXk6aW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgZ2FwOjZweDsKICAgICAgYm94LXNoYWRvdzowIDJweCA4cHggcmdiYSgyMTIsMTYwLDg1LDAuMzUpOwogICAgfQoKICAgIC52YWxpZGF0aW9uLWhpbnQgewogICAgICBmb250LXNpemU6MTBweDsgbWFyZ2luLXRvcDo0cHg7CiAgICAgIGRpc3BsYXk6ZmxleDsganVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47CiAgICB9CiAgICAuZXJyb3ItdGV4dCAgeyBjb2xvcjojZWY0NDQ0OyB9CiAgICAuaGludC10ZXh0ICAgeyBjb2xvcjp2YXIoLS1mYWludCk7IH0KICAgIC5jb3VudGVyICAgICB7IGNvbG9yOnZhcigtLWZhaW50KTsgfQoKICAgIC8qIGVtb2ppIHBpY2tlciBzdHlsZXMgLSBPTkUgRU1PSkkgQVQgQSBUSU1FICovCiAgICAuZW1vamktZ3JpZCB7CiAgICAgIGRpc3BsYXk6IGZsZXg7CiAgICAgIGZsZXgtd3JhcDogd3JhcDsKICAgICAgZ2FwOiAxMHB4OwogICAgICBtYXJnaW4tdG9wOiAxMnB4OwogICAgICBwYWRkaW5nOiAxMHB4IDA7CiAgICB9CiAgICAuZW1vamktb3B0aW9uIHsKICAgICAgZm9udC1zaXplOiAyNnB4OwogICAgICBjdXJzb3I6IHBvaW50ZXI7CiAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE1cyBlYXNlLCBmaWx0ZXIgMC4xczsKICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsMjU1LDI1NSwwLjAzKTsKICAgICAgd2lkdGg6IDUwcHg7CiAgICAgIGhlaWdodDogNTBweDsKICAgICAgZGlzcGxheTogZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7CiAgICAgIGJvcmRlci1yYWRpdXM6IDE4cHg7CiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4wNik7CiAgICB9CiAgICAuZW1vamktb3B0aW9uOmhvdmVyIHsgdHJhbnNmb3JtOiBzY2FsZSgxLjEyKTsgYmFja2dyb3VuZDogcmdiYSgyMTIsMTYwLDg1LDAuMik7IGJvcmRlci1jb2xvcjogdmFyKC0tYm9yZGVyLWFjY2VudCk7IH0KICAgIC5lbW9qaS1yZW1vdmUgewogICAgICBiYWNrZ3JvdW5kOiByZ2JhKDIzOSw2OCw2OCwwLjEpOwogICAgICBmb250LXNpemU6IDE0cHg7CiAgICAgIGNvbG9yOiAjZjg3MTcxOwogICAgICB3aWR0aDogYXV0bzsKICAgICAgcGFkZGluZzogMCAxMnB4OwogICAgICBnYXA6IDZweDsKICAgICAgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsKICAgIH0KICAgIC5lbW9qaS1yZW1vdmU6aG92ZXIgeyBiYWNrZ3JvdW5kOiByZ2JhKDIzOSw2OCw2OCwwLjI1KTsgdHJhbnNmb3JtOiBzY2FsZSgxLjAyKTsgfQogICAgLmVtb2ppLWFkZC1idG4gewogICAgICBiYWNrZ3JvdW5kOiByZ2JhKDIxMiwxNjAsODUsMC4xNSk7CiAgICAgIGJvcmRlcjogMXB4IGRhc2hlZCB2YXIoLS1nb2xkKTsKICAgICAgZm9udC1zaXplOiAyMHB4OwogICAgICB3aWR0aDogNTBweDsKICAgICAgaGVpZ2h0OiA1MHB4OwogICAgICBkaXNwbGF5OiBmbGV4OwogICAgICBhbGlnbi1pdGVtczogY2VudGVyOwogICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsKICAgICAgYm9yZGVyLXJhZGl1czogMThweDsKICAgICAgY3Vyc29yOiBwb2ludGVyOwogICAgICBmb250LXdlaWdodDogYm9sZDsKICAgICAgY29sb3I6IHZhcigtLWdvbGQpOwogICAgICB0cmFuc2l0aW9uOiAwLjJzOwogICAgfQogICAgLmVtb2ppLWFkZC1idG46aG92ZXIgeyBiYWNrZ3JvdW5kOiByZ2JhKDIxMiwxNjAsODUsMC4zKTsgdHJhbnNmb3JtOiBzY2FsZSgxLjAzKTsgfQogICAgLmlubGluZS1lbW9qaS1pbnB1dCB7CiAgICAgIGRpc3BsYXk6IGZsZXg7CiAgICAgIGdhcDogOHB4OwogICAgICBhbGlnbi1pdGVtczogY2VudGVyOwogICAgICBtYXJnaW4tdG9wOiAxMHB4OwogICAgfQogIDwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CjxkaXYgaWQ9InJvb3QiPjwvZGl2Pgo8c3ZnIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3R5bGU9ImRpc3BsYXk6bm9uZSI+CiAgPHN5bWJvbCBpZD0iaWMtdXNlciIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cGF0aCBkPSJNMjAgMjF2LTJhNCA0IDAgMCAwLTQtNEg4YTQgNCAwIDAgMC00IDR2MiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLWxvY2siIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PHJlY3QgeD0iMyIgeT0iMTEiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxMSIgcng9IjIiLz48cGF0aCBkPSJNNyAxMVY3YTUgNSAwIDAgMSAxMCAwdjQiLz48L3N5bWJvbD4KICA8c3ltYm9sIGlkPSJpYy1jcHUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjkiIHk9IjkiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiLz48bGluZSB4MT0iOSIgeTE9IjEiIHgyPSI5IiB5Mj0iNCIvPjxsaW5lIHgxPSIxNSIgeTE9IjEiIHgyPSIxNSIgeTI9IjQiLz48bGluZSB4MT0iOSIgeTE9IjIwIiB4Mj0iOSIgeTI9IjIzIi8+PGxpbmUgeDE9IjE1IiB5MT0iMjAiIHgyPSIxNSIgeTI9IjIzIi8+PGxpbmUgeDE9IjIwIiB5MT0iOSIgeDI9IjIzIiB5Mj0iOSIvPjxsaW5lIHgxPSIyMCIgeTE9IjE0IiB4Mj0iMjMiIHkyPSIxNCIvPjxsaW5lIHgxPSIxIiB5MT0iOSIgeDI9IjQiIHkyPSI5Ii8+PGxpbmUgeDE9IjEiIHkxPSIxNCIgeDI9IjQiIHkyPSIxNCIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLXphcCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cG9seWdvbiBwb2ludHM9IjEzIDIgMyAxNCAxMiAxNCAxMSAyMiAyMSAxMCAxMiAxMCAxMyAyIi8+PC9zeW1ib2w+CiAgPHN5bWJvbCBpZD0iaWMtaW1hZ2UiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLXBob25lLW9mZiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cGF0aCBkPSJNMTAuNjggMTMuMzFhMTYgMTYgMCAwIDAgMy40MSAyLjZsMS4yNy0xLjI3YTIgMiAwIDAgMSAyLjExLS40NWMxLjEyLjQ1IDIuMy43OCAzLjUzLjk4YTIgMiAwIDAgMSAxLjY3IDEuOTh2My4wNWEyIDIgMCAwIDEtMi4xOCAyQTE5Ljc5IDE5Ljc5IDAgMCAxIDIuMTUgNS41IDIgMiAwIDAgMSA0LjEyIDMuMzJoMy4wNWEyIDIgMCAwIDEgMiAxLjY3Yy4yIDEuMjMuNTMgMi40MS45OCAzLjUzYTIgMiAwIDAgMS0uNDUgMi4xMUw4LjQzIDExLjlhMTYgMTYgMCAwIDAgMi42MSAzLjQxIi8+PGxpbmUgeDE9IjIzIiB5MT0iMSIgeDI9IjEiIHkyPSIyMyIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLXRyYXNoLTIiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PHBvbHlsaW5lIHBvaW50cz0iMyA2IDUgNiAyMSA2Ii8+PHBhdGggZD0iTTE5IDZsLTEgMTRhMiAyIDAgMCAxLTIgMkg4YTIgMiAwIDAgMS0yLTJMNSA2Ii8+PHBhdGggZD0iTTEwIDExdjYiLz48cGF0aCBkPSJNMTQgMTF2NiIvPjxwYXRoIGQ9Ik05IDZWNGExIDEgMCAwIDEgMS0xaDRhMSAxIDAgMCAxIDEgMXYyIi8+PC9zeW1ib2w+CiAgPHN5bWJvbCBpZD0iaWMtY2xvY2siIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cG9seWxpbmUgcG9pbnRzPSIxMiA2IDEyIDEyIDE2IDE0Ii8+PC9zeW1ib2w+CiAgPHN5bWJvbCBpZD0iaWMtc2F2ZSIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cGF0aCBkPSJNMTkgMjFINWEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmgxMWw1IDV2MTFhMiAyIDAgMCAxLTIgMnoiLz48cG9seWxpbmUgcG9pbnRzPSIxNyAyMSAxNyAxMyA3IDEzIDcgMjEiLz48cG9seWxpbmUgcG9pbnRzPSI3IDMgNyA4IDE1IDgiLz48L3N5bWJvbD4KICA8c3ltYm9sIGlkPSJpYy1pbmZvIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PGxpbmUgeDE9IjEyIiB5MT0iMTYiIHgyPSIxMiIgeTI9IjEyIi8+PGxpbmUgeDE9IjEyIiB5MT0iOCIgeDI9IjEyLjAxIiB5Mj0iOCIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLWxvZy1vdXQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTkgMjFINWEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmg0Ii8+PHBvbHlsaW5lIHBvaW50cz0iMTYgMTcgMjEgMTIgMTYgNyIvPjxsaW5lIHgxPSIyMSIgeTE9IjEyIiB4Mj0iOSIgeTI9IjEyIi8+PC9zeW1ib2w+CiAgPHN5bWJvbCBpZD0iaWMtdXBsb2FkIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiPjxwb2x5bGluZSBwb2ludHM9IjE2IDE2IDEyIDEyIDggMTYiLz48bGluZSB4MT0iMTIiIHkxPSIxMiIgeDI9IjEyIiB5Mj0iMjEiLz48cGF0aCBkPSJNMjAuMzkgMTguMzlBNSA1IDAgMCAwIDE4IDloLTEuMjZBOCA4IDAgMSAwIDMgMTYuMyIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLW1lc3NhZ2UiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTIxIDE1YTIgMiAwIDAgMS0yIDJIN2wtNCA0VjVhMiAyIDAgMCAxIDItMmgxNGEyIDIgMCAwIDEgMiAyeiIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLWdsb2JlIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PGxpbmUgeDE9IjIiIHkxPSIxMiIgeDI9IjIyIiB5Mj0iMTIiLz48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMCAxNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiLz48L3N5bWJvbD4KICA8c3ltYm9sIGlkPSJpYy1zbWFydHBob25lIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiPjxyZWN0IHg9IjUiIHk9IjIiIHdpZHRoPSIxNCIgaGVpZ2h0PSIyMCIgcng9IjIiIHJ5PSIyIi8+PGxpbmUgeDE9IjEyIiB5MT0iMTgiIHgyPSIxMi4wMSIgeTI9IjE4Ii8+PC9zeW1ib2w+CiAgPHN5bWJvbCBpZD0iaWMtYnVnIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Im04IDIgMS44OCAxLjg4Ii8+PHBhdGggZD0iTTE0LjEyIDMuODggMTYgMiIvPjxwYXRoIGQ9Ik05IDcuMTN2LTFhMy4wMDMgMy4wMDMgMCAxIDEgNiAwdjEiLz48cGF0aCBkPSJNMTIgMjBjLTMuMyAwLTYtMi43LTYtNnYtM2E0IDQgMCAwIDEgNC00aDRhNCA0IDAgMCAxIDQgNHYzYzAgMy4zLTIuNyA2LTYgNnoiLz48cGF0aCBkPSJNMTIgMjB2LTkiLz48cGF0aCBkPSJNNi41MyA5QzQuNiA4LjggMyA3LjEgMyA1Ii8+PHBhdGggZD0iTTYgMTNIMiIvPjxwYXRoIGQ9Ik0zIDIxYzAtMi4xIDEuNy0zLjkgMy44LTQiLz48cGF0aCBkPSJNMjAuOTcgNWMwIDIuMS0xLjYgMy44LTMuNSA0Ii8+PHBhdGggZD0iTTIyIDEzaC00Ii8+PHBhdGggZD0iTTE3LjIgMTdjMi4xLjEgMy44IDEuOSAzLjggNCIvPjwvc3ltYm9sPgogIDxzeW1ib2wgaWQ9ImljLXJvYm90IiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiPjxyZWN0IHg9IjMiIHk9IjExIiB3aWR0aD0iMTgiIGhlaWdodD0iMTEiIHJ4PSIyIi8+PHBhdGggZD0iTTcgMTFWN2E1IDUgMCAwIDEgMTAgMHY0Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSI4IiByPSIxIi8+PGNpcmNsZSBjeD0iOCIgY3k9IjE1IiByPSIxIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNSIgcj0iMSIvPjwvc3ltYm9sPgo8L3N2Zz4KPHNjcmlwdCB0eXBlPSJ0ZXh0L2JhYmVsIj4KY29uc3QgeyB1c2VTdGF0ZSwgdXNlRWZmZWN0LCB1c2VDYWxsYmFjaywgdXNlUmVmIH0gPSBSZWFjdDsKY29uc3QgQVBJID0geyBsb2dpbjogJy9hcGkvbG9naW4nLCBzYXZlU2V0dDogJy9hcGkvc2V0dGluZ3Mvc2F2ZScsIGxvYWRTZXR0OiAnL2FwaS9zZXR0aW5ncy9sb2FkJywgdXBsb2FkOiAnL2FwaS9pbWFnZS91cGxvYWQnIH07CmNvbnN0IEJSQU5EX1BBTkVMX05BTUUgPSAn2KjZiNiqINin2YTZhdmE2YMg2YHYp9ix2LMnOwpjb25zdCBERUZBVUxUX0JSQU5EX0lNQUdFID0gKCgpID0+IHsKICBjb25zdCBzdmcgPSBgCjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHZpZXdCb3g9IjAgMCAxMjgwIDcyMCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwZDBkMTIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSI1NSUiIHN0b3AtY29sb3I9IiMxYTEyMjQiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMmYxYzEwIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJhY2NlbnQiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2YwYzg4MCIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNkNGEwNTUiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxyZWN0IHdpZHRoPSIxMjgwIiBoZWlnaHQ9IjcyMCIgZmlsbD0idXJsKCNiZykiIHJ4PSI0MCIvPgogIDxjaXJjbGUgY3g9IjE4MCIgY3k9IjExMCIgcj0iMTcwIiBmaWxsPSJyZ2JhKDIxMiwxNjAsODUsMC4xNCkiLz4KICA8Y2lyY2xlIGN4PSIxMTIwIiBjeT0iNjIwIiByPSIyMTAiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz4KICA8cmVjdCB4PSI3MCIgeT0iNzAiIHdpZHRoPSIxMTQwIiBoZWlnaHQ9IjU4MCIgcng9IjM0IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDQpIiBzdHJva2U9InJnYmEoMjQwLDIwMCwxMjgsMC4zMikiIHN0cm9rZS13aWR0aD0iMyIvPgogIDx0ZXh0IHg9IjY0MCIgeT0iMzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9Ijg2IiBmb250LWZhbWlseT0iQXJpYWwsIFRhaG9tYSwgc2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0idXJsKCNhY2NlbnQpIj7YqNmI2Kog2KfZhNmF2YTZgyDZgdin2LHYszwvdGV4dD4KICA8dGV4dCB4PSI2NDAiIHk9IjM5MiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIzNiIgZm9udC1mYW1pbHk9IkFyaWFsLCBUYWhvbWEsIHNhbnMtc2VyaWYiIGZpbGw9IiNmNGU3Y2YiPldoYXRzQXBwIFNldHRpbmdzIFBhbmVsPC90ZXh0PgogIDx0ZXh0IHg9IjY0MCIgeT0iNDU0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjI4IiBmb250LWZhbWlseT0iQXJpYWwsIFRhaG9tYSwgc2Fucy1zZXJpZiIgZmlsbD0iI2Q5YzJhMiI+2KjZiNiqINin2YTZhdmE2YMg2YHYp9ix2LMgdmlzdWFsIGJhbm5lcjwvdGV4dD4KPC9zdmc+YC50cmltKCk7CiAgcmV0dXJuIGBkYXRhOmltYWdlL3N2Zyt4bWw7Y2hhcnNldD1VVEYtOCwke2VuY29kZVVSSUNvbXBvbmVudChzdmcpfWA7Cn0pKCk7CmFzeW5jIGZ1bmN0aW9uIGFwaVBvc3QoZW5kcG9pbnQsIHBheWxvYWRPYmopIHsKICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChlbmRwb2ludCwgeyBtZXRob2Q6ICdQT1NUJywgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sIGJvZHk6IEpTT04uc3RyaW5naWZ5KHBheWxvYWRPYmopIH0pOwogIGlmICghcmVzLm9rKSB7IGNvbnN0IGVyciA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7IHRocm93IG5ldyBFcnJvcihlcnIuZXJyb3IgfHwgZXJyLm1lc3NhZ2UgfHwgYEhUVFAgJHtyZXMuc3RhdHVzfWApOyB9CiAgcmV0dXJuIHJlcy5qc29uKCk7Cn0KYXN5bmMgZnVuY3Rpb24gYXBpR2V0KGVuZHBvaW50LCBwYXlsb2FkT2JqKSB7IGNvbnN0IHFzID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhwYXlsb2FkT2JqKS50b1N0cmluZygpOyBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgJHtlbmRwb2ludH0/JHtxc31gKTsgaWYgKCFyZXMub2spIHsgY29uc3QgZXJyID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKTsgdGhyb3cgbmV3IEVycm9yKGVyci5lcnJvciB8fCBlcnIubWVzc2FnZSB8fCBgSFRUUCAke3Jlcy5zdGF0dXN9YCk7IH0gcmV0dXJuIHJlcy5qc29uKCk7IH0KY29uc3QgVCA9IHsKICBlbjogeyBzZWw6J1NlbGVjdCBMYW5ndWFnZScsIGxvZ2luOidBZG1pbiBMb2dpbicsIG51bTonT3duZXIgTnVtYmVyJywgcGFzczonUGFzc3dvcmQnLCBhdXRoOidTaWduIEluJywgcHdIOiJGb3Jnb3QgcGFzc3dvcmQ/IFR5cGUgJy5zZXR0aW5ncyciLCBzYXZlOidTYXZlIFNldHRpbmdzJywgbm90aWNlOifimqEgU2V0dGluZ3MgdGFrZSB+MyBtaW51dGVzIHRvIGFjdGl2YXRlLicsIGJhc2ljOidCYXNpYyBJbmZvJywgc3lzOidTeXN0ZW0gQXV0b21hdGlvbicsIGdyb3VwOidHcm91cCBBdXRvbWF0aW9uJywgbG9nb3M6J0xvZ29zJywgc3RhdHVzOidTdGF0dXMgTWVzc2FnZScsIGNhbGxzOidDYWxsIENvbnRyb2wnLCBkZWxldGU6J0FudGktRGVsZXRlJywgb2s6J1NldHRpbmdzIFNhdmVkISDinIUnLCBsb2dvdXQ6J0xvZ291dCcsIHVwbG9hZGluZzonVXBsb2FkaW5n4oCmJywgZ2FsbGVyeTonVXBsb2FkIEltYWdlJywgYXBwSWQ6J0FQUCBJRCcsIGRldGVjdGVkOidEZXRlY3RlZCcsIG51bWJlcnNPbmx5OidOdW1iZXJzIG9ubHknLCBtYXhDaGFyczonTWF4aW11bSAxNSBjaGFyYWN0ZXJzJywgYWdlSGludDonTWF4IDIgZGlnaXRzJywgYWdlRXJyb3I6JzEtOTknLCBwcmVmaXhIaW50OidTeW1ib2xzIG9ubHknLCBwcmVmaXhFcnJvcjonT25seSBzeW1ib2xzIGFsbG93ZWQnLCBjaGFyczonY2hhcmFjdGVycycsIGVtb2ppVGl0bGU6J1N0YXR1cyBSZWFjdGlvbiBFbW9qaXMgKG1heCAxMCknLCBlbW9qaVBsYWNlaG9sZGVyOidUeXBlIE9ORSBlbW9qaScsIGFudGlCdWc6J0FudGkgQnVnJywgYW50aUJvdDonQW50aSBCb3QnLCBhY3Rpb25EZWxldGU6J0RlbGV0ZScsIGFjdGlvbktpY2s6J0RlbGV0ZStLaWNrJyB9LAogIHNpOiB7IHNlbDon4La34LeP4LeC4LeP4LeAJywgbG9naW46J+C2h+C2qeC3iuC2uOC3kuC2seC3iiDgtrTgt5Lgt4Dgt5Lgt4Pgt5TgtrgnLCBudW06J093bmVyIOC2heC2guC2muC2uicsIHBhc3M6J+C2uOC3lOC2u+C2tOC2r+C2uicsIGF1dGg6J+C2tOC3kuC3gOC3kuC3g+C3meC2seC3iuC2sScsIHB3SDoi4La44LeU4La74La04Lav4La6IOC2heC2uOC2reC2muC2rz8iLCBzYXZlOifgt4Pgt5Tgtrvgtprgt5LgtrHgt4rgtrEnLCBub3RpY2U6J+KaoSDgt4Dgt5LgtrHgt4/gtqngt5IgM+C2muC3iiDgtpzgtq3gt4Dgt5ouJywgYmFzaWM6J+C2uOC3luC2veC3kuC2micsIHN5czon4LeD4LeK4LeA4La64LaC4Laa4LeK4oCN4La74LeT4La6JywgZ3JvdXA6J+C3g+C2uOC3luC3hCcsIGxvZ29zOifgtr3gt53gtpzgt50nLCBzdGF0dXM6J+C3g+C3iuC2p+C3muC2p+C3g+C3iicsIGNhbGxzOifgtofgtrjgtq3gt5Tgtrjgt4onLCBkZWxldGU6J+C2qeC3kuC2veC3k+C2p+C3iicsIG9rOifgt4Pgt5Tgtrvgt5Dgtprgt5Tgtqvgt48hIOKchScsIGxvZ291dDon4La04LeS4Lan4LeA4LeZ4Lax4LeK4LaxJywgdXBsb2FkaW5nOifgtovgtqngt5Tgtpzgtq0g4Laa4La74La44LeS4Lax4LeK4oCmJywgZ2FsbGVyeTon4Lah4LeP4La64LeP4La74LeW4La0JywgYXBwSWQ6J+C2uuC3meC2r+C3lOC2uOC3iiDgtoXgtoLgtprgtronLCBkZXRlY3RlZDon4LeE4La44LeU4LeA4LeS4La6JywgbnVtYmVyc09ubHk6J+C2ieC2veC2muC3iuC2muC2uOC3iiDgtrTgtrjgtqvgtrrgt5InLCBtYXhDaGFyczon4LaF4Laa4LeU4La74LeUIDE1JywgYWdlSGludDon4LaF4LaC4LaaIDInLCBhZ2VFcnJvcjonMS05OScsIHByZWZpeEhpbnQ6J+C3g+C2guC2muC3muC2rSDgtrTgtrjgtqvgtrrgt5InLCBwcmVmaXhFcnJvcjon4LeD4LaC4Laa4Lea4LatIOC2tOC2uOC2q+C2muC3iicsIGNoYXJzOifgtoXgtprgt5Tgtrvgt5QnLCBlbW9qaVRpdGxlOifgt4Pgt4rgtqfgt5rgtqfgt4Pgt4og4LaJ4La44Led4Lai4LeSICjgtovgtrTgtrvgt5LgtrggMTApJywgZW1vamlQbGFjZWhvbGRlcjon4LaR4LaaIOC2ieC2uOC3neC2ouC3kuC2uuC2muC3iicsIGFudGlCdWc6J+C2h+C2seC3iuC2p+C3kiDgtrbgtpzgt4onLCBhbnRpQm90OifgtofgtrHgt4rgtqfgt5Ig4La24Lec4Lan4LeKJywgYWN0aW9uRGVsZXRlOifgtrjgtprgtrHgt4rgtrEnLCBhY3Rpb25LaWNrOifgtrjgtprgt48g4Laa4La04Lax4LeK4LaxJyB9LAogIHRhOiB7IHNlbDon4K6u4K+K4K604K6/JywgbG9naW46J+CuqOCuv+CusOCvjeCuteCuvuCulSDgrongrrPgr43grqjgr4HgrrTgr4jgrrXgr4EnLCBudW06J+CuieCusOCuv+CuruCviOCur+CuvuCus+CusOCvjSDgro7grqPgr40nLCBwYXNzOifgrpXgrp/grrXgr4Hgrprgr43grprgr4rgrrLgr40nLCBhdXRoOifgrongrrPgr43grqjgr4HgrrTgr4jgrpUnLCBwd0g6IuCuleCun+CuteCvgeCumuCvjeCumuCviuCusuCvjSDgrq7grrHgrqjgr43grqTgrr7grrLgr40gLnNldHRpbmdzIiwgc2F2ZTon4K6a4K+H4K6u4K6/4K6V4K+N4K6V4K614K+B4K6u4K+NJywgbm90aWNlOifimqEgMyDgrqjgrr/grq7grr/grp/grpngr43grpXgrrPgrr/grrLgr40g4K6a4K+G4K6v4K6y4K+N4K6q4K6f4K+B4K6u4K+NLicsIGJhc2ljOifgroXgrp/grr/grqrgr43grqrgrp/gr4gnLCBzeXM6J+CupOCuvuCuqeCuv+Cur+CumeCvjeCuleCuvycsIGdyb3VwOifgrpXgr4HgrrTgr4EnLCBsb2dvczon4K6y4K+L4K6V4K+L4K6V4K+N4K6V4K6z4K+NJywgc3RhdHVzOifgrqjgrr/grrLgr4gg4K6a4K+G4K6v4K+N4K6k4K6/JywgY2FsbHM6J+CuheCutOCviOCuquCvjeCuquCvgScsIGRlbGV0ZTon4K6o4K+A4K6V4K+N4K6V4K6y4K+NJywgb2s6J+CumuCvh+CuruCuv+CuleCvjeCuleCuquCvjeCuquCun+CvjeCun+CupOCvgSEg4pyFJywgbG9nb3V0OifgrrXgr4bgrrPgrr/grq/gr4fgrrHgr4EnLCB1cGxvYWRpbmc6J+CuquCupOCuv+CuteCvh+CuseCvjeCuseCvgeCuleCuv+CuseCupOCvgeKApicsIGdhbGxlcnk6J+CuquCun+CuruCvjScsIGFwcElkOifgrqrgrq/grqngr43grqrgrr7grp/gr43grp/gr4Eg4K6Q4K6f4K6/JywgZGV0ZWN0ZWQ6J+CuleCuo+CvjeCun+CvgeCuquCuv+Cun+Cuv+CuleCvjeCuleCuquCvjeCuquCun+CvjeCun+CupOCvgScsIG51bWJlcnNPbmx5Oifgro7grqPgr43grpXgrrPgr40g4K6u4K6f4K+N4K6f4K+B4K6u4K+NJywgbWF4Q2hhcnM6JzE1IOCujuCutOCvgeCupOCvjeCupOCvgeCuleCvjeCuleCus+CvjScsIGFnZUhpbnQ6JzIg4K6H4K6y4K6V4K+N4K6V4K6Z4K+N4K6V4K6z4K+NJywgYWdlRXJyb3I6JzEtOTknLCBwcmVmaXhIaW50OifgrpXgr4HgrrHgrr/grq/gr4Dgrp/gr4HgrpXgrrPgr40g4K6u4K6f4K+N4K6f4K+B4K6u4K+NJywgcHJlZml4RXJyb3I6J+CuleCvgeCuseCuv+Cur+CvgOCun+CvgeCuleCus+CvjSDgrq7grp/gr43grp/gr4Hgrq7gr40nLCBjaGFyczon4K6O4K604K+B4K6k4K+N4K6k4K+B4K6V4K+N4K6V4K6z4K+NJywgZW1vamlUaXRsZTon4K644K+N4K6f4K+H4K6f4K+N4K6f4K644K+NIOCujuCuruCvi+CunOCuv+CuleCus+CvjSAo4K6F4K6k4K6/4K6V4K6q4K6f4K+N4K6a4K6u4K+NIDEwKScsIGVtb2ppUGxhY2Vob2xkZXI6J+CukuCusOCvgSDgro7grq7gr4vgrpzgrr8nLCBhbnRpQnVnOifgrobgrqngr43grp/grr8g4K6q4K6V4K+NJywgYW50aUJvdDon4K6G4K6p4K+N4K6f4K6/IOCuquCvi+Cun+CvjScsIGFjdGlvbkRlbGV0ZTon4K6o4K+A4K6V4K+N4K6V4K+BJywgYWN0aW9uS2ljazon4K6o4K+A4K6V4K+N4K6V4K+BK+CuieCupOCviCcgfSwKICBhcjogeyBzZWw6J9in2K7YqtixINin2YTZhNi62KknLCBsb2dpbjon2K/YrtmI2YQg2KfZhNmF2LTYsdmBJywgbnVtOifYsdmC2YUg2KfZhNmF2KfZhNmDJywgcGFzczon2YPZhNmF2Kkg2KfZhNmF2LHZiNixJywgYXV0aDon2KrYs9is2YrZhCDYp9mE2K/YrtmI2YQnLCBwd0g6ItmG2LPZitiqINmD2YTZhdipINin2YTZhdix2YjYsdifIiwgc2F2ZTon2K3Zgdi4INin2YTYpdi52K/Yp9iv2KfYqicsIG5vdGljZTon4pqhIDMg2K/Zgtin2KbZgiDZhNmE2KrZgdi52YrZhC4nLCBiYXNpYzon2KfZhNmF2LnZhNmI2YXYp9iqJywgc3lzOifYp9mE2KPYqtmF2KrYqScsIGdyb3VwOifZhdis2YXZiNi52KknLCBsb2dvczon2KfZhNi02LnYp9ix2KfYqicsIHN0YXR1czon2LHYs9in2YTYqSDYp9mE2K3Yp9mE2KknLCBjYWxsczon2KfZhNmF2YPYp9mE2YXYp9iqJywgZGVsZXRlOifYrdmF2KfZitipINin2YTYrdiw2YEnLCBvazon2KrZhSDYp9mE2K3Zgdi4ISDinIUnLCBsb2dvdXQ6J9iu2LHZiNisJywgdXBsb2FkaW5nOifYrNin2LHZiiDYp9mE2LHZgdi54oCmJywgZ2FsbGVyeTon2LHZgdi5INi12YjYsdipJywgYXBwSWQ6J9mF2LnYsdmBINin2YTYqti32KjZitmCJywgZGV0ZWN0ZWQ6J9iq2YUg2KfZg9iq2LTYp9mB2YcnLCBudW1iZXJzT25seTon2KPYsdmC2KfZhSDZgdmC2LcnLCBtYXhDaGFyczonMTUg2K3YsdmB2YvYpycsIGFnZUhpbnQ6J9ix2YLZhdin2YYnLCBhZ2VFcnJvcjonMS05OScsIHByZWZpeEhpbnQ6J9ix2YXZiNiyINmB2YLYtycsIHByZWZpeEVycm9yOifYsdmF2YjYsiDZgdmC2LcnLCBjaGFyczon2K3YsdmI2YEnLCBlbW9qaVRpdGxlOifYsdmF2YjYsiDYqti52KjZitix2YrYqSDZhNmE2K3Yp9mE2KkgKDEwINmD2K3YryDYo9mC2LXZiSknLCBlbW9qaVBsYWNlaG9sZGVyOifYo9iv2K7ZhCDYpdmK2YXZiNis2Yog2YjYp9it2K8nLCBhbnRpQnVnOifZhdmD2KfZgdit2Kkg2KfZhNio2YInLCBhbnRpQm90OifZhdmD2KfZgdit2Kkg2KfZhNio2YjYqicsIGFjdGlvbkRlbGV0ZTon2K3YsNmBJywgYWN0aW9uS2ljazon2K3YsNmBK9i32LHYrycgfQp9Owpjb25zdCBJY29uID0gKHsgaWQsIHNpemU9MTYsIGNsYXNzTmFtZT0nJyB9KSA9PiAoPHN2ZyB3aWR0aD17c2l6ZX0gaGVpZ2h0PXtzaXplfSBjbGFzc05hbWU9e2NsYXNzTmFtZX0+PHVzZSBocmVmPXtgI2ljLSR7aWR9YH0gLz48L3N2Zz4pOwpjb25zdCBUb2dnbGUgPSAoeyB2YWx1ZSwgb25DaGFuZ2UgfSkgPT4geyBjb25zdCBvbiA9IHZhbHVlID09PSAnb24nOyByZXR1cm4gKDxkaXYgb25DbGljaz17KCkgPT4gb25DaGFuZ2Uob24gPyAnb2ZmJyA6ICdvbicpfSBjbGFzc05hbWU9e2B0b2dnbGUtd3JhcCAke29uID8gJ29uJyA6ICdvZmYnfWB9IHJvbGU9InN3aXRjaCI+PGRpdiBjbGFzc05hbWU9InRvZ2dsZS10aHVtYiIgLz48L2Rpdj4pOyB9Owpjb25zdCBDYXJkID0gKHsgY2hpbGRyZW4sIHN0cmlwZSwgc2hhZG93LCBkZWxheT0nJyB9KSA9PiAoPGRpdiBjbGFzc05hbWU9e2BnbGFzcyBmYWRlLXVwICR7ZGVsYXl9YH0gc3R5bGU9e3sgcGFkZGluZzonMjhweCAyOHB4IDI0cHgnIH19PjxkaXYgY2xhc3NOYW1lPSJzdHJpcGUiIHN0eWxlPXt7IGJhY2tncm91bmQ6c3RyaXBlLCBib3hTaGFkb3c6YDAgMCAxNnB4ICR7c2hhZG93fWAgfX0gLz57Y2hpbGRyZW59PC9kaXY+KTsKY29uc3QgU2VjdGlvblRpdGxlID0gKHsgaWNvbiwgY29sb3IsIGxhYmVsIH0pID0+ICg8ZGl2IGNsYXNzTmFtZT0ic2VjLWxhYmVsIiBzdHlsZT17eyBjb2xvciB9fT48SWNvbiBpZD17aWNvbn0gc2l6ZT17MTV9IC8+e2xhYmVsfTwvZGl2Pik7CmNvbnN0IEZpZWxkID0gKHsgbGFiZWwsIGNoaWxkcmVuIH0pID0+ICg8ZGl2PjxwIHN0eWxlPXt7IGZvbnRTaXplOjExLCBjb2xvcjondmFyKC0tZmFpbnQpJywgbWFyZ2luQm90dG9tOjYsIHRleHRUcmFuc2Zvcm06J3VwcGVyY2FzZScgfX0+e2xhYmVsfTwvcD57Y2hpbGRyZW59PC9kaXY+KTsKCmZ1bmN0aW9uIEFwcCgpIHsKICBjb25zdCBbbGFuZywgc2V0TGFuZ10gPSB1c2VTdGF0ZShudWxsKTsgY29uc3QgW2lzQXV0aCwgc2V0SXNBdXRoXSA9IHVzZVN0YXRlKGZhbHNlKTsgY29uc3QgW293bmVyTnVtLCBzZXRPd25lck51bV0gPSB1c2VTdGF0ZSgnJyk7IGNvbnN0IFtwYXNzd29yZCwgc2V0UGFzc3dvcmRdID0gdXNlU3RhdGUoJycpOwogIGNvbnN0IFtsb2FkaW5nLCBzZXRMb2FkaW5nXSA9IHVzZVN0YXRlKGZhbHNlKTsgY29uc3QgW3RvYXN0LCBzZXRUb2FzdF0gPSB1c2VTdGF0ZSgnJyk7IGNvbnN0IFt1cGxvYWRpbmcsIHNldFVwbG9hZGluZ10gPSB1c2VTdGF0ZShudWxsKTsKICBjb25zdCBbYXBwSWQsIHNldEFwcElkXSA9IHVzZVN0YXRlKCcnKTsgY29uc3QgW2Vycm9ycywgc2V0RXJyb3JzXSA9IHVzZVN0YXRlKHsgbmFtZTonJywgZnJvbTonJywgYWdlOicnLCBwcmVmaXg6JycsIGZvb3RlcjI6JycgfSk7CiAgY29uc3Qgb3duZXJOdW1SZWYgPSB1c2VSZWYoJycpOyBjb25zdCBhcHBJZFJlZiA9IHVzZVJlZignJyk7CiAgCiAgLy8gRml4OiBFeHRyYWN0IGFwcElkIGZyb20gcGFzc3dvcmQgRVhBQ1RMWSBsaWtlIGJhY2tlbmQgZG9lcwogIC8vIEJhY2tlbmQ6IHBhc3Muc2xpY2UoLTEpIGZvciA2IGNoYXJzLCBwYXNzLnNsaWNlKC0yKSBmb3IgNyBjaGFycwogIGNvbnN0IGV4dHJhY3RBcHBJZEZyb21QYXNzID0gdXNlQ2FsbGJhY2soKHBhc3NTdHIpID0+IHsKICAgIGlmICghcGFzc1N0cikgcmV0dXJuICcnOwogICAgaWYgKHBhc3NTdHIubGVuZ3RoID09PSA2KSByZXR1cm4gcGFzc1N0ci5zbGljZSgtMSk7ICAvLyBsYXN0IDEgY2hhcgogICAgaWYgKHBhc3NTdHIubGVuZ3RoID09PSA3KSByZXR1cm4gcGFzc1N0ci5zbGljZSgtMik7IC8vIGxhc3QgMiBjaGFycwogICAgcmV0dXJuICcnOwogIH0sIFtdKTsKICAKICBjb25zdCBbcywgc2V0U10gPSB1c2VTdGF0ZSh7CiAgICBuYW1lOkJSQU5EX1BBTkVMX05BTUUsIGZyb206J1NyaSBMYW5rYScsIGFnZTonMjQnLCBwcmVmaXg6Jy4nLCBmb290ZXIyOkJSQU5EX1BBTkVMX05BTUUsCiAgICBvd25lck51bWJlcjonJywgb3duZXJuYW1lOicnLCBkZXNjcmlwdGlvbjonJywgY3VzdG9tQXV0b1JlcGxpZXM6JycsIGF1dG9TYXZlOidvbicsCiAgICBtb2RlOidwdWJsaWMnLCBhbnRpQmFkOidvZmYnLCBhbnRpTGluazonb2ZmJywgYXV0b1JlY29yZGluZzonb2ZmJywgYXV0b1R5cGluZzonb2ZmJywKICAgIGFsd2F5c09ubGluZTonb2ZmJywga2VlcERlbGV0ZWRTdGF0dXM6J29uJywgZ2hvc3RNb2RlOidvZmYnLCBhdXRvU3RhdHVzUmVhZDonb24nLCBhdXRvU3RhdHVzUmVhY3Q6J29uJywgYXV0b1JlYWQ6J29mZicsCiAgICBhdXRvQmxvY2s6J29mZicsIGF1dG9SZWFjdDonb2ZmJywgYXV0b1ZvaWNlOidvZmYnLCBhbnRpRGVsZXRlOidvZmYnLCBzZW5kRGVsZXRlVG86J293bmVyJywKICAgIGFudGlDYWxsOidvZmYnLCBleGNsdWRlQ2FsbE51bWJlcnM6JycsIHN0YXR1c01zZ1NlbmQ6J29mZicsIHN0YXR1c01zZ1R5cGU6J2RlZmF1bHQnLCBjdXN0b21Nc2c6JycsCiAgICBnYUdyb3VwSmlkOicnLCBnYVRpbWV6b25lOidBc2lhL0NvbG9tYm8nLCBnYUNsb3NlVGltZTonMTU6MDAnLCBnYU9wZW5UaW1lOicwNTowMCcsCiAgICBtZW51OkRFRkFVTFRfQlJBTkRfSU1BR0UsIGFsaXZlOkRFRkFVTFRfQlJBTkRfSU1BR0UsIG93bmVyOkRFRkFVTFRfQlJBTkRfSU1BR0UsCiAgICBzdGF0dXNDdXN0b21SZWFjdDogJycsCiAgICBhbnRpQnVnOiAnb2ZmJywKICAgIGFudGlCb3Q6ICdvZmYnLAogICAgYW50aUJvdEFjdGlvbjogJ2RlbGV0ZScsCiAgICBsYW5ndWFnZTogJ2FyYWJpYycsCiAgICBhbnRpVmlld09uY2U6ICdvZmYnLAogICAgYW50aUxpbmtMaXN0OiAnd2EubWUsd2hhdHNhcHAuY29tJywKICAgIGFudGlCYWRXb3JkczogJ2h1dGh0aGEscG9ubmEnLAogICAgYW50aU1lbnRpb246ICdvZmYnLAogICAgYW50aUVkaXQ6ICdpbmJveCcsCiAgICBhbnRpQWN0aW9uOiAnd2VybicsCiAgICBhbnRpV2FybkNvdW50OiAnMycsCiAgICBhdXRvUmVhY3RTY29wZTogJ2luYm94JywKICAgIGFpUmVwbHlTY29wZTogJ2luYm94JywKICAgIGFsaXZlTXNnOiAn4p2WICphbGl2ZSBub3cgbW9uZXkgaGVpc3QgbWQqJywKICAgIHZvaWNlRm9vdGVyOiAnaHR0cHM6Ly9naXRodWIuY29tL21vbmV0aGVpc3RtZC9XRUJfREFUQUJBU0UvcmF3L21haW4vQVVELTIwMjUxMjI5LVdBMDAzNC5tcDMnCiAgfSk7CiAgCiAgY29uc3QgdHggPSBUW2xhbmcgfHwgJ2VuJ107IGNvbnN0IHVwZCA9IHVzZUNhbGxiYWNrKChrLCB2KSA9PiBzZXRTKHAgPT4gKHsgLi4ucCwgW2tdOiB2IH0pKSwgW10pOwogIGNvbnN0IHNob3dUb2FzdCA9IHVzZUNhbGxiYWNrKChtc2cpID0+IHsgc2V0VG9hc3QobXNnKTsgc2V0VGltZW91dCgoKSA9PiBzZXRUb2FzdCgnJyksIDMwMDApOyB9LCBbXSk7CiAgCiAgLy8gVXBkYXRlIGFwcElkIHdoZW4gcGFzc3dvcmQgY2hhbmdlcyAtIHVzaW5nIGNvcnJlY3QgZXh0cmFjdGlvbiBsb2dpYwogIHVzZUVmZmVjdCgoKSA9PiB7CiAgICBpZiAoIWlzQXV0aCkgewogICAgICBjb25zdCBleHRyYWN0ZWRJZCA9IGV4dHJhY3RBcHBJZEZyb21QYXNzKHBhc3N3b3JkKTsKICAgICAgc2V0QXBwSWQoZXh0cmFjdGVkSWQpOwogICAgfQogIH0sIFtwYXNzd29yZCwgZXh0cmFjdEFwcElkRnJvbVBhc3MsIGlzQXV0aF0pOwogIAogIHVzZUVmZmVjdCgoKSA9PiB7IG93bmVyTnVtUmVmLmN1cnJlbnQgPSBvd25lck51bTsgfSwgW293bmVyTnVtXSk7IAogIHVzZUVmZmVjdCgoKSA9PiB7IGFwcElkUmVmLmN1cnJlbnQgPSBhcHBJZDsgfSwgW2FwcElkXSk7CiAgCiAgY29uc3QgdmFsaWRhdG9ycyA9IHsgbmFtZTogdiA9PiB7IGNvbnN0IHQgPSB2LnNsaWNlKDAsMTUpOyBzZXRFcnJvcnMocD0+KHsuLi5wLG5hbWU6IHQubGVuZ3RoPT09MTU/dHgubWF4Q2hhcnM6Jyd9KSk7IHJldHVybiB0OyB9LCBmcm9tOiB2ID0+IHsgY29uc3QgdCA9IHYuc2xpY2UoMCwxNSk7IHNldEVycm9ycyhwPT4oey4uLnAsZnJvbTogdC5sZW5ndGg9PT0xNT90eC5tYXhDaGFyczonJ30pKTsgcmV0dXJuIHQ7IH0sIGZvb3RlcjI6diA9PiB7IGNvbnN0IHQgPSB2LnNsaWNlKDAsMTUpOyBzZXRFcnJvcnMocD0+KHsuLi5wLGZvb3RlcjI6dC5sZW5ndGg9PT0xNT90eC5tYXhDaGFyczonJ30pKTsgcmV0dXJuIHQ7IH0sIGFnZTogdiA9PiB7IGNvbnN0IG4gPSB2LnJlcGxhY2UoL1teMC05XS9nLCcnKS5zbGljZSgwLDIpOyBjb25zdCBlcnIgPSBuICYmIChwYXJzZUludChuKTwxfHxwYXJzZUludChuKT45OSkgPyB0eC5hZ2VFcnJvciA6ICcnOyBzZXRFcnJvcnMocD0+KHsuLi5wLGFnZTplcnJ9KSk7IHJldHVybiBuOyB9LCBwcmVmaXg6IHYgPT4geyBjb25zdCBvayA9IC9eWy4hQCMkJV4mKigpXC1fK1tcXXt9Oyc6IlxcfCwuPD4vP35dKiQvLnRlc3Qodik7IHNldEVycm9ycyhwPT4oey4uLnAscHJlZml4Om9rPycnOnR4LnByZWZpeEVycm9yfSkpOyByZXR1cm4gb2sgPyB2IDogdi5zbGljZSgwLC0xKTsgfSB9OwogIGNvbnN0IGhhbmRsZUlucHV0ID0gKGZpZWxkLCB2YWx1ZSkgPT4gdXBkKGZpZWxkLCB2YWxpZGF0b3JzW2ZpZWxkXSA/IHZhbGlkYXRvcnNbZmllbGRdKHZhbHVlKSA6IHZhbHVlKTsKICAKICBjb25zdCBoYW5kbGVMb2dpbiA9IHVzZUNhbGxiYWNrKGFzeW5jIChlKSA9PiB7IAogICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBzZXRMb2FkaW5nKHRydWUpOyAKICAgIHRyeSB7IAogICAgICBjb25zdCByID0gYXdhaXQgYXBpUG9zdChBUEkubG9naW4sIHsgbnVtOiBvd25lck51bSwgcGFzczogcGFzc3dvcmQgfSk7IAogICAgICBpZiAoIXIuc3VjY2VzcykgdGhyb3cgbmV3IEVycm9yKHIubWVzc2FnZSB8fCAn4puUIFdyb25nIFVzZXIgTnVtYmVyIE9yIFBhc3N3b3JkJyk7IAogICAgICBjb25zdCByZXNvbHZlZEFwcElkID0gci5hcHAgfHwgZXh0cmFjdEFwcElkRnJvbVBhc3MocGFzc3dvcmQpIHx8ICdkZWZhdWx0JzsKICAgICAgc2V0QXBwSWQocmVzb2x2ZWRBcHBJZCk7CiAgICAgIHNldElzQXV0aCh0cnVlKTsgCiAgICAgIHNob3dUb2FzdCgnTG9naW4gc3VjY2Vzc2Z1bCEnKTsgCiAgICAgIHRyeSB7IAogICAgICAgIGNvbnN0IGxyID0gYXdhaXQgYXBpR2V0KEFQSS5sb2FkU2V0dCwgeyBudW06IG93bmVyTnVtLCBhcHA6IHJlc29sdmVkQXBwSWQgfSk7IAogICAgICAgIGlmIChsci5zdWNjZXNzICYmIGxyLnNldHRpbmdzKSB7IAogICAgICAgICAgc2V0QXBwSWQobHIuYXBwIHx8IHJlc29sdmVkQXBwSWQpOwogICAgICAgICAgc2V0UyhwcmV2ID0+IHsgY29uc3QgbmV4dCA9IHsgLi4ucHJldiB9OyBPYmplY3Qua2V5cyhwcmV2KS5mb3JFYWNoKGsgPT4geyBpZiAobHIuc2V0dGluZ3Nba10gIT09IHVuZGVmaW5lZCkgbmV4dFtrXSA9IGxyLnNldHRpbmdzW2tdOyB9KTsgcmV0dXJuIG5leHQ7IH0pOyAKICAgICAgICB9IAogICAgICB9IGNhdGNoIChsb2FkRXJyKSB7IGNvbnNvbGUud2Fybihsb2FkRXJyKTsgfSAKICAgIH0gY2F0Y2ggKGVycikgeyBhbGVydChlcnIubWVzc2FnZSB8fCAnTG9naW4gZmFpbGVkJyk7IH0gCiAgICBmaW5hbGx5IHsgc2V0TG9hZGluZyhmYWxzZSk7IH0gCiAgfSwgW293bmVyTnVtLCBwYXNzd29yZCwgc2hvd1RvYXN0LCBleHRyYWN0QXBwSWRGcm9tUGFzc10pOwogIAogIGNvbnN0IGhhbmRsZVNhdmUgPSB1c2VDYWxsYmFjayhhc3luYyAoZSkgPT4geyAKICAgIGUucHJldmVudERlZmF1bHQoKTsgc2V0TG9hZGluZyh0cnVlKTsgCiAgICB0cnkgeyAKICAgICAgY29uc3QgcmVzb2x2ZWRBcHBJZCA9IGFwcElkUmVmLmN1cnJlbnQgfHwgYXBwSWQgfHwgZXh0cmFjdEFwcElkRnJvbVBhc3MocGFzc3dvcmQpIHx8ICdkZWZhdWx0JzsKICAgICAgY29uc3QgciA9IGF3YWl0IGFwaVBvc3QoQVBJLnNhdmVTZXR0LCB7IC4uLnMsIGF1dG9SZWFjdDonb2ZmJywgbnVtOiBvd25lck51bVJlZi5jdXJyZW50LCBhcHA6IHJlc29sdmVkQXBwSWQgfSk7IAogICAgICBpZiAoIXIuc3VjY2VzcykgdGhyb3cgbmV3IEVycm9yKHIuZXJyb3IgfHwgJ1NhdmUgZmFpbGVkJyk7IAogICAgICBzZXRBcHBJZChyLmFwcCB8fCByZXNvbHZlZEFwcElkKTsKICAgICAgaWYgKHIuc2V0dGluZ3MpIHsKICAgICAgICBzZXRTKHByZXYgPT4gKHsgLi4ucHJldiwgLi4uci5zZXR0aW5ncyB9KSk7CiAgICAgIH0KICAgICAgc2hvd1RvYXN0KHR4Lm9rKTsgCiAgICB9IGNhdGNoIChlcnIpIHsgYWxlcnQoZXJyLm1lc3NhZ2UgfHwgJ1NhdmUgZmFpbGVkJyk7IH0gCiAgICBmaW5hbGx5IHsgc2V0TG9hZGluZyhmYWxzZSk7IH0gCiAgfSwgW3MsIHR4Lm9rLCBzaG93VG9hc3RdKTsKICAKICBjb25zdCBoYW5kbGVVcGxvYWQgPSB1c2VDYWxsYmFjaygoZSwgZmllbGRLZXkpID0+IHsgY29uc3QgZmlsZSA9IGUudGFyZ2V0LmZpbGVzWzBdOyBpZiAoIWZpbGUpIHJldHVybjsgc2V0VXBsb2FkaW5nKGZpZWxkS2V5KTsgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTsgcmVhZGVyLm9ubG9hZCA9IGFzeW5jICgpID0+IHsgdHJ5IHsgY29uc3QgciA9IGF3YWl0IGFwaVBvc3QoQVBJLnVwbG9hZCwgeyBpbWFnZTogcmVhZGVyLnJlc3VsdC5zcGxpdCgnLCcpWzFdLCBmaWVsZEtleSwgbnVtOiBvd25lck51bVJlZi5jdXJyZW50LCBhcHA6IGFwcElkUmVmLmN1cnJlbnQgfHwgYXBwSWQgfHwgJ2RlZmF1bHQnIH0pOyBpZiAoIXIuc3VjY2VzcykgdGhyb3cgbmV3IEVycm9yKHIuZXJyb3IgfHwgJ1VwbG9hZCBmYWlsZWQnKTsgdXBkKHIuZmllbGRLZXksIHIudXJsKTsgc2hvd1RvYXN0KCdJbWFnZSB1cGxvYWRlZCEnKTsgfSBjYXRjaCAoZXJyKSB7IGFsZXJ0KCdVcGxvYWQgZXJyb3I6ICcgKyBlcnIubWVzc2FnZSk7IH0gZmluYWxseSB7IHNldFVwbG9hZGluZyhudWxsKTsgfSB9OyByZWFkZXIucmVhZEFzRGF0YVVSTChmaWxlKTsgfSwgW3VwZCwgc2hvd1RvYXN0LCBhcHBJZF0pOwoKICAvLyBFTU9KSSBMT0dJQyAtIE9ORSBFTU9KSSBBVCBBIFRJTUUgKOC3g+C3kuC2guC3hOC2veC3meC2seC3ijog4LaR4LaaIOC2keC2miDgtongtrjgt53gtqLgt5Lgtrrgtprgt4og4La04La44Lar4La64LeSKQogIGNvbnN0IGVtb2ppTGlzdCA9IEFycmF5LmZyb20obmV3IFNldCgocy5zdGF0dXNDdXN0b21SZWFjdCB8fCAnJykuc3BsaXQoJywnKS5tYXAoZSA9PiBlLnRyaW0oKSkuZmlsdGVyKGUgPT4gZS5sZW5ndGggPiAwICYmICFlLmluY2x1ZGVzKCcgJykpKSkuc2xpY2UoMCwxMCk7CiAgCiAgY29uc3QgYWRkRW1vamkgPSAobmV3RW1vamkpID0+IHsgCiAgICBpZiAoIW5ld0Vtb2ppKSByZXR1cm47IAogICAgY29uc3QgdHJpbW1lZCA9IG5ld0Vtb2ppLnRyaW0oKTsKICAgIGlmICh0cmltbWVkLmxlbmd0aCA9PT0gMCkgcmV0dXJuOwogICAgaWYgKHRyaW1tZWQuaW5jbHVkZXMoJyAnKSkgewogICAgICBzaG93VG9hc3Q/LignRW50ZXIgb25lIGVtb2ppIG9ubHknKSB8fCBhbGVydCgnUGxlYXNlIGVudGVyIE9ORSBlbW9qaSBvbmx5IScpOwogICAgICByZXR1cm47CiAgICB9CiAgICBsZXQgY3VycmVudCA9IFsuLi5lbW9qaUxpc3RdOwogICAgaWYgKGN1cnJlbnQuaW5jbHVkZXModHJpbW1lZCkpIHJldHVybjsKICAgIGNvbnN0IG5leHQgPSBbLi4uY3VycmVudCwgdHJpbW1lZF0uc2xpY2UoMCwxMCk7CiAgICB1cGQoJ3N0YXR1c0N1c3RvbVJlYWN0JywgbmV4dC5qb2luKCcsJykpOwogIH07CiAgCiAgY29uc3QgcmVtb3ZlRW1vamkgPSAoaWR4KSA9PiB7IAogICAgY29uc3QgbmV4dCA9IFsuLi5lbW9qaUxpc3RdOyAKICAgIG5leHQuc3BsaWNlKGlkeCwxKTsgCiAgICB1cGQoJ3N0YXR1c0N1c3RvbVJlYWN0JywgbmV4dC5qb2luKCcsJykpOyAKICB9OwogIAogIGNvbnN0IGhhbmRsZUVtb2ppS2V5RG93biA9IChlKSA9PiB7IAogICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7IAogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IAogICAgICBjb25zdCBpbnAgPSBlLnRhcmdldDsgCiAgICAgIGxldCByYXcgPSBpbnAudmFsdWUudHJpbSgpOyAKICAgICAgaWYgKHJhdykgeyAKICAgICAgICBhZGRFbW9qaShyYXcpOyAKICAgICAgICBpbnAudmFsdWUgPSAnJzsgCiAgICAgIH0gCiAgICB9IAogIH07CgogIGNvbnN0IGF1dG9SZXBseUNvdW50ID0gU3RyaW5nKHMuY3VzdG9tQXV0b1JlcGxpZXMgfHwgJycpLnNwbGl0KC9ccj9cbi8pLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKS5maWx0ZXIoQm9vbGVhbikubGVuZ3RoOwogIGNvbnN0IHByaXZhdGVBbnRpRGVsZXRlRW5hYmxlZCA9IHMuYW50aURlbGV0ZSA9PT0gJ2luYm94JyAmJiBzLnNlbmREZWxldGVUbyA9PT0gJ293bmVyJzsKCiAgaWYgKCFsYW5nKSByZXR1cm4gKDxkaXYgY2xhc3NOYW1lPSJsYW5nLW92ZXJsYXkiPjxkaXYgc3R5bGU9e3t0ZXh0QWxpZ246J2NlbnRlcicsIG1heFdpZHRoOjM2MH19PjxkaXYgc3R5bGU9e3t3aWR0aDo3MixoZWlnaHQ6NzIsYm9yZGVyUmFkaXVzOjIwLGJhY2tncm91bmQ6J2xpbmVhci1ncmFkaWVudCgxMzVkZWcscmdiYSgyMTIsMTYwLDg1LDAuMTUpLHJnYmEoNTgsMTIzLDIxMywwLjE1KSknLGJvcmRlcjonMXB4IHNvbGlkIHZhcigtLWJvcmRlci1hY2NlbnQpJyxtYXJnaW46JzAgYXV0byAyMHB4JyxkaXNwbGF5OidmbGV4JyxhbGlnbkl0ZW1zOidjZW50ZXInLGp1c3RpZnlDb250ZW50OidjZW50ZXInfX0+PEljb24gaWQ9ImNwdSIgc2l6ZT17MzJ9IHN0eWxlPXt7Y29sb3I6J3ZhcigtLWdvbGQpJ319IC8+PC9kaXY+PGgxIHN0eWxlPXt7Zm9udFdlaWdodDo4MDAsZm9udFNpemU6MjJ9fT57QlJBTkRfUEFORUxfTkFNRX08L2gxPjxwIGNsYXNzTmFtZT0ibW9ubyIgc3R5bGU9e3tmb250U2l6ZToxMSxjb2xvcjondmFyKC0tZmFpbnQpJ319PkFETUlOIFBBTkVMPC9wPjxkaXYgc3R5bGU9e3tkaXNwbGF5OidncmlkJyxnYXA6MTIsbWFyZ2luVG9wOjI0fX0+e1snZW4nLCdzaScsJ3RhJywnYXInXS5tYXAoYyA9PiAoPGJ1dHRvbiBrZXk9e2N9IG9uQ2xpY2s9eygpPT5zZXRMYW5nKGMpfSBjbGFzc05hbWU9ImxhbmctYnRuIiBzdHlsZT17e2p1c3RpZnlDb250ZW50OidmbGV4LXN0YXJ0J319PjxzcGFuIHN0eWxlPXt7Zm9udFNpemU6MjJ9fT57Yz09PSdlbic/J/Cfh6zwn4enJzpjPT09J3NpJz8n8J+HsfCfh7AnOmM9PT0ndGEnPyfwn4eu8J+Hsyc6J/Cfh7jwn4emJ308L3NwYW4+PHNwYW4+e2M9PT0nZW4nPydFbmdsaXNoJzpjPT09J3NpJz8n4LeD4LeS4LaC4LeE4La9JzpjPT09J3RhJz8n4K6k4K6u4K6/4K604K+NJzon2KfZhNi52LHYqNmK2KknfTwvc3Bhbj48L2J1dHRvbj4pKX08L2Rpdj48L2Rpdj48L2Rpdj4pOwogIGNvbnN0IGlzUnRsID0gbGFuZyA9PT0gJ2FyJzsKICAKICBpZiAoIWlzQXV0aCkgcmV0dXJuICg8ZGl2IGNsYXNzTmFtZT17aXNSdGw/J3J0bCc6Jyd9IHN0eWxlPXt7ZGlzcGxheTonZmxleCcsYWxpZ25JdGVtczonY2VudGVyJyxqdXN0aWZ5Q29udGVudDonY2VudGVyJyxtaW5IZWlnaHQ6JzEwMHZoJyxwYWRkaW5nOjI0fX0+PGRpdiBjbGFzc05hbWU9ImdsYXNzIiBzdHlsZT17e3dpZHRoOicxMDAlJyxtYXhXaWR0aDo0NDAscGFkZGluZzonNDhweCA0MHB4J319PjxkaXYgc3R5bGU9e3t0ZXh0QWxpZ246J2NlbnRlcicsbWFyZ2luQm90dG9tOjM2fX0+PGRpdiBzdHlsZT17e3dpZHRoOjU2LGhlaWdodDo1Nixib3JkZXJSYWRpdXM6MTYsYmFja2dyb3VuZDonbGluZWFyLWdyYWRpZW50KDEzNWRlZyxyZ2JhKDIxMiwxNjAsODUsMC4xNSkscmdiYSg1OCwxMjMsMjEzLDAuMTUpKScsYm9yZGVyOicxcHggc29saWQgdmFyKC0tYm9yZGVyLWFjY2VudCknLGRpc3BsYXk6J2lubGluZS1mbGV4JyxhbGlnbkl0ZW1zOidjZW50ZXInLGp1c3RpZnlDb250ZW50OidjZW50ZXInLG1hcmdpbkJvdHRvbToxNn19PjxJY29uIGlkPSJjcHUiIHNpemU9ezI0fSBzdHlsZT17e2NvbG9yOid2YXIoLS1nb2xkKSd9fSAvPjwvZGl2PjxoMSBzdHlsZT17e2ZvbnRXZWlnaHQ6ODAwLGZvbnRTaXplOjIwLGNvbG9yOid2YXIoLS1nb2xkKSd9fT57dHgubG9naW59PC9oMT48L2Rpdj48Zm9ybSBvblN1Ym1pdD17aGFuZGxlTG9naW59IGF1dG9Db21wbGV0ZT0ib2ZmIj48ZGl2IHN0eWxlPXt7cG9zaXRpb246J3JlbGF0aXZlJyxtYXJnaW5Cb3R0b206MTZ9fT48c3BhbiBzdHlsZT17e3Bvc2l0aW9uOidhYnNvbHV0ZScsbGVmdDoxMyx0b3A6JzUwJScsdHJhbnNmb3JtOid0cmFuc2xhdGVZKC01MCUpJyxjb2xvcjondmFyKC0tZmFpbnQpJ319PjxJY29uIGlkPSJ1c2VyIiBzaXplPXsxNX0gLz48L3NwYW4+PGlucHV0IGNsYXNzTmFtZT0iaW5wIiBzdHlsZT17e3BhZGRpbmdMZWZ0OjM4fX0gcGxhY2Vob2xkZXI9e3R4Lm51bX0gdmFsdWU9e293bmVyTnVtfSBvbkNoYW5nZT17ZT0+c2V0T3duZXJOdW0oZS50YXJnZXQudmFsdWUucmVwbGFjZSgvW14wLTldL2csJycpKX0gcmVxdWlyZWQgYXV0b0NvbXBsZXRlPSJvZmYiIG5hbWU9Im5vbmUtdXNlciIgLz48L2Rpdj48ZGl2IHN0eWxlPXt7cG9zaXRpb246J3JlbGF0aXZlJyxtYXJnaW5Cb3R0b206MTZ9fT48c3BhbiBzdHlsZT17e3Bvc2l0aW9uOidhYnNvbHV0ZScsbGVmdDoxMyx0b3A6JzUwJScsdHJhbnNmb3JtOid0cmFuc2xhdGVZKC01MCUpJyxjb2xvcjondmFyKC0tZmFpbnQpJ319PjxJY29uIGlkPSJsb2NrIiBzaXplPXsxNX0gLz48L3NwYW4+PGlucHV0IGNsYXNzTmFtZT0iaW5wIiBzdHlsZT17e3BhZGRpbmdMZWZ0OjM4fX0gdHlwZT0icGFzc3dvcmQiIHBsYWNlaG9sZGVyPXt0eC5wYXNzfSB2YWx1ZT17cGFzc3dvcmR9IG9uQ2hhbmdlPXtlPT5zZXRQYXNzd29yZChlLnRhcmdldC52YWx1ZSl9IHJlcXVpcmVkIGF1dG9Db21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBuYW1lPSJub25lLXBhc3MiIC8+PC9kaXY+e2FwcElkICYmICg8ZGl2IHN0eWxlPXt7YmFja2dyb3VuZDoncmdiYSgyMTIsMTYwLDg1LDAuMDcpJyxib3JkZXI6JzFweCBzb2xpZCB2YXIoLS1ib3JkZXItYWNjZW50KScsYm9yZGVyUmFkaXVzOjE0LHBhZGRpbmc6JzEycHggMTZweCcsbWFyZ2luQm90dG9tOjE2fX0+PGRpdiBjbGFzc05hbWU9ImFwcC1iYWRnZSI+PEljb24gaWQ9InNtYXJ0cGhvbmUiIHNpemU9ezEzfSAvPjxzcGFuPnt0eC5hcHBJZH08L3NwYW4+PC9kaXY+PHNwYW4gc3R5bGU9e3tjb2xvcjondmFyKC0tZ29sZCknLGZvbnRXZWlnaHQ6J2JvbGQnLGZvbnRTaXplOjE4LG1hcmdpbkxlZnQ6MTJ9fT57YXBwSWR9PC9zcGFuPjxzcGFuIHN0eWxlPXt7Y29sb3I6J3ZhcigtLW11dGVkKScsZm9udFNpemU6MTEsbWFyZ2luTGVmdDo4fX0+e3R4LmRldGVjdGVkfTwvc3Bhbj48L2Rpdj4pfTxidXR0b24gdHlwZT0ic3VibWl0IiBkaXNhYmxlZD17bG9hZGluZ30gc3R5bGU9e3tiYWNrZ3JvdW5kOmxvYWRpbmc/J3JnYmEoMjEyLDE2MCw4NSwwLjIpJzonbGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1nb2xkKSwjYjg4NTNhKScsY29sb3I6bG9hZGluZz8ndmFyKC0tbXV0ZWQpJzonIzBkMGQwZCcsYm9yZGVyOidub25lJyxib3JkZXJSYWRpdXM6MTQscGFkZGluZzonMTRweCcsZm9udFdlaWdodDo3MDAsd2lkdGg6JzEwMCUnLGRpc3BsYXk6J2ZsZXgnLGFsaWduSXRlbXM6J2NlbnRlcicsanVzdGlmeUNvbnRlbnQ6J2NlbnRlcicsZ2FwOjh9fT57bG9hZGluZz88PjxzcGFuIGNsYXNzTmFtZT0ic3BpbiIgLz5Mb2dnaW5nLi4uPC8+OnR4LmF1dGh9PC9idXR0b24+PC9mb3JtPjxidXR0b24gb25DbGljaz17KCk9PnNldExhbmcobnVsbCl9IHN0eWxlPXt7bWFyZ2luVG9wOjE2LGJhY2tncm91bmQ6J25vbmUnLGJvcmRlcjonbm9uZScsY29sb3I6J3ZhcigtLWZhaW50KScsZm9udFNpemU6MTIsY3Vyc29yOidwb2ludGVyJ319PuKGkCB7dHguc2VsfTwvYnV0dG9uPjwvZGl2PjwvZGl2Pik7CgogIHJldHVybiAoPGRpdiBjbGFzc05hbWU9e2lzUnRsPydydGwnOicnfT48ZGl2IHN0eWxlPXt7cG9zaXRpb246J3JlbGF0aXZlJyx6SW5kZXg6MX19Pnt0b2FzdCAmJiAoPGRpdiBjbGFzc05hbWU9InRvYXN0LWFuaW0iIHN0eWxlPXt7cG9zaXRpb246J2ZpeGVkJyx0b3A6MjQsbGVmdDonNTAlJyx0cmFuc2Zvcm06J3RyYW5zbGF0ZVgoLTUwJSknLHpJbmRleDoxMDAwMCxiYWNrZ3JvdW5kOidsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLHZhcigtLWdvbGQpLCNiODg1M2EpJyxjb2xvcjonIzBkMGQwZCcscGFkZGluZzonMTRweCAzMnB4Jyxib3JkZXJSYWRpdXM6MTYsZm9udFdlaWdodDo3MDB9fT57dG9hc3R9PC9kaXY+KX08ZGl2IHN0eWxlPXt7bWF4V2lkdGg6OTYwLG1hcmdpbjonMCBhdXRvJyxwYWRkaW5nOiczMnB4IDIwcHggMTIwcHgnfX0+PGhlYWRlciBjbGFzc05hbWU9ImdsYXNzIGZhZGUtdXAiIHN0eWxlPXt7ZGlzcGxheTonZmxleCcsanVzdGlmeUNvbnRlbnQ6J3NwYWNlLWJldHdlZW4nLGFsaWduSXRlbXM6J2NlbnRlcicscGFkZGluZzonMjBweCAyOHB4JyxtYXJnaW5Cb3R0b206MjR9fT48ZGl2IHN0eWxlPXt7ZGlzcGxheTonZmxleCcsYWxpZ25JdGVtczonY2VudGVyJyxnYXA6MTZ9fT48ZGl2IHN0eWxlPXt7d2lkdGg6NDQsaGVpZ2h0OjQ0LGJvcmRlclJhZGl1czoxMyxiYWNrZ3JvdW5kOidsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLHZhcigtLWdvbGQpLCNiODg1M2EpJyxkaXNwbGF5OidmbGV4JyxhbGlnbkl0ZW1zOidjZW50ZXInLGp1c3RpZnlDb250ZW50OidjZW50ZXInfX0+PEljb24gaWQ9ImNwdSIgc2l6ZT17MjB9IHN0eWxlPXt7Y29sb3I6JyMwZDBkMGQnfX0gLz48L2Rpdj48ZGl2PjxoMSBzdHlsZT17e2ZvbnRXZWlnaHQ6ODAwLGZvbnRTaXplOjE2fX0+e0JSQU5EX1BBTkVMX05BTUV9PC9oMT48cCBjbGFzc05hbWU9Im1vbm8iIHN0eWxlPXt7Zm9udFNpemU6MTEsY29sb3I6J3ZhcigtLWZhaW50KSd9fT57b3duZXJOdW19PC9wPjwvZGl2PjwvZGl2PjxidXR0b24gb25DbGljaz17KCk9PntzZXRJc0F1dGgoZmFsc2UpO3NldE93bmVyTnVtKCcnKTtzZXRQYXNzd29yZCgnJyk7fX0gc3R5bGU9e3tiYWNrZ3JvdW5kOidyZ2JhKDIzOSw2OCw2OCwwLjA4KScsY29sb3I6JyNlZjQ0NDQnLGJvcmRlcjonMXB4IHNvbGlkIHJnYmEoMjM5LDY4LDY4LDAuMiknLGJvcmRlclJhZGl1czoxMixwYWRkaW5nOic5cHggMThweCcsY3Vyc29yOidwb2ludGVyJyxkaXNwbGF5OidmbGV4JyxhbGlnbkl0ZW1zOidjZW50ZXInLGdhcDo4fX0+PEljb24gaWQ9ImxvZy1vdXQiIHNpemU9ezEzfSAvPnt0eC5sb2dvdXR9PC9idXR0b24+PC9oZWFkZXI+PGRpdiBjbGFzc05hbWU9ImZhZGUtdXAgZGVsYXktMSIgc3R5bGU9e3ttYXJnaW5Cb3R0b206MjQscGFkZGluZzonMTRweCAyMHB4JyxiYWNrZ3JvdW5kOidyZ2JhKDIxMiwxNjAsODUsMC4wNyknLGJvcmRlcjonMXB4IHNvbGlkIHZhcigtLWJvcmRlci1hY2NlbnQpJyxib3JkZXJSYWRpdXM6MTYsY29sb3I6J3ZhcigtLWdvbGQpJyxmb250U2l6ZToxMyxkaXNwbGF5OidmbGV4JyxhbGlnbkl0ZW1zOidjZW50ZXInLGdhcDoxMn19PjxJY29uIGlkPSJpbmZvIiBzaXplPXsxNn0gLz57dHgubm90aWNlfTwvZGl2PnthcHBJZCAmJiAoPGRpdiBjbGFzc05hbWU9ImZhZGUtdXAgZGVsYXktMSIgc3R5bGU9e3ttYXJnaW5Cb3R0b206MjQsYmFja2dyb3VuZDoncmdiYSgyMTIsMTYwLDg1LDAuMDcpJyxib3JkZXJSYWRpdXM6MTYscGFkZGluZzonMTZweCAyNHB4JyxkaXNwbGF5OidmbGV4JyxhbGlnbkl0ZW1zOidjZW50ZXInLGdhcDoxNn19PjxkaXYgY2xhc3NOYW1lPSJhcHAtYmFkZ2UiPjxJY29uIGlkPSJzbWFydHBob25lIiBzaXplPXsxNH0gLz48c3Bhbj57dHguYXBwSWR9PC9zcGFuPjwvZGl2PjxzcGFuIHN0eWxlPXt7Zm9udFNpemU6MjQsZm9udFdlaWdodDonYm9sZCcsY29sb3I6J3ZhcigtLWdvbGQpJ319PnthcHBJZH08L3NwYW4+PHNwYW4gc3R5bGU9e3tjb2xvcjondmFyKC0tbXV0ZWQpJyxmb250U2l6ZToxMn19Pnt0eC5kZXRlY3RlZH08L3NwYW4+PC9kaXY+KX08Zm9ybSBpZD0ic2V0dGluZ3NGb3JtIiBvblN1Ym1pdD17aGFuZGxlU2F2ZX0+PGRpdiBzdHlsZT17e2Rpc3BsYXk6J2ZsZXgnLGZsZXhEaXJlY3Rpb246J2NvbHVtbicsZ2FwOjIwfX0+PENhcmQgc3RyaXBlPSIjM2I4MmY2IiBzaGFkb3c9InJnYmEoNTksMTMwLDI0NiwwLjI1KSIgZGVsYXk9ImRlbGF5LTIiPjxTZWN0aW9uVGl0bGUgaWNvbj0idXNlciIgY29sb3I9IiM2MGE1ZmEiIGxhYmVsPXt0eC5iYXNpY30gLz48ZGl2IHN0eWxlPXt7ZGlzcGxheTonZ3JpZCcsZ3JpZFRlbXBsYXRlQ29sdW1uczoncmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMTYwcHgsMWZyKSknLGdhcDoxNCxtYXJnaW5Ub3A6MjB9fT48RmllbGQgbGFiZWw9IkxpbmtlZCBOdW1iZXIiPjxpbnB1dCBjbGFzc05hbWU9ImlucCIgdmFsdWU9e293bmVyTnVtfSBkaXNhYmxlZCAvPjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJCb3QgTmFtZSI+PGlucHV0IGNsYXNzTmFtZT17YGlucCAke2Vycm9ycy5uYW1lPydpbnAtZXJyb3InOicnfWB9IHBsYWNlaG9sZGVyPXtCUkFORF9QQU5FTF9OQU1FfSB2YWx1ZT17cy5uYW1lfSBvbkNoYW5nZT17ZT0+aGFuZGxlSW5wdXQoJ25hbWUnLGUudGFyZ2V0LnZhbHVlKX0gbWF4TGVuZ3RoPXsxNX0gLz48ZGl2IGNsYXNzTmFtZT0idmFsaWRhdGlvbi1oaW50Ij48c3BhbiBjbGFzc05hbWU9e2Vycm9ycy5uYW1lPydlcnJvci10ZXh0JzonaGludC10ZXh0J30+e2Vycm9ycy5uYW1lfHwnJ308L3NwYW4+PHNwYW4gY2xhc3NOYW1lPSJjb3VudGVyIj57cy5uYW1lLmxlbmd0aH0vMTU8L3NwYW4+PC9kaXY+PC9GaWVsZD48RmllbGQgbGFiZWw9IkxvY2F0aW9uIj48aW5wdXQgY2xhc3NOYW1lPXtgaW5wICR7ZXJyb3JzLmZyb20/J2lucC1lcnJvcic6Jyd9YH0gdmFsdWU9e3MuZnJvbX0gb25DaGFuZ2U9e2U9PmhhbmRsZUlucHV0KCdmcm9tJyxlLnRhcmdldC52YWx1ZSl9IG1heExlbmd0aD17MTV9IC8+PGRpdiBjbGFzc05hbWU9InZhbGlkYXRpb24taGludCI+PHNwYW4gY2xhc3NOYW1lPXtlcnJvcnMuZnJvbT8nZXJyb3ItdGV4dCc6J2hpbnQtdGV4dCd9PntlcnJvcnMuZnJvbXx8Jyd9PC9zcGFuPjxzcGFuIGNsYXNzTmFtZT0iY291bnRlciI+e3MuZnJvbS5sZW5ndGh9LzE1PC9zcGFuPjwvZGl2PjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJBZ2UiPjxpbnB1dCBjbGFzc05hbWU9e2BpbnAgJHtlcnJvcnMuYWdlPydpbnAtZXJyb3InOicnfWB9IHBsYWNlaG9sZGVyPSIyNCIgdmFsdWU9e3MuYWdlfSBvbkNoYW5nZT17ZT0+aGFuZGxlSW5wdXQoJ2FnZScsZS50YXJnZXQudmFsdWUpfSBtYXhMZW5ndGg9ezJ9IC8+PGRpdiBjbGFzc05hbWU9InZhbGlkYXRpb24taGludCI+PHNwYW4gY2xhc3NOYW1lPXtlcnJvcnMuYWdlPydlcnJvci10ZXh0JzonaGludC10ZXh0J30+e2Vycm9ycy5hZ2V8fHR4LmFnZUhpbnR9PC9zcGFuPjwvZGl2PjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJQcmVmaXgiPjxpbnB1dCBjbGFzc05hbWU9e2BpbnAgJHtlcnJvcnMucHJlZml4PydpbnAtZXJyb3InOicnfWB9IHN0eWxlPXt7Zm9udEZhbWlseTonbW9ub3NwYWNlJ319IHZhbHVlPXtzLnByZWZpeH0gb25DaGFuZ2U9e2U9PmhhbmRsZUlucHV0KCdwcmVmaXgnLGUudGFyZ2V0LnZhbHVlKX0gbWF4TGVuZ3RoPXsyfSAvPjxkaXYgY2xhc3NOYW1lPSJ2YWxpZGF0aW9uLWhpbnQiPjxzcGFuIGNsYXNzTmFtZT17ZXJyb3JzLnByZWZpeD8nZXJyb3ItdGV4dCc6J2hpbnQtdGV4dCd9PntlcnJvcnMucHJlZml4fHx0eC5wcmVmaXhIaW50fTwvc3Bhbj48L2Rpdj48L0ZpZWxkPjxGaWVsZCBsYWJlbD0iRm9vdGVyIj48aW5wdXQgY2xhc3NOYW1lPXtgaW5wICR7ZXJyb3JzLmZvb3RlcjI/J2lucC1lcnJvcic6Jyd9YH0gdmFsdWU9e3MuZm9vdGVyMn0gb25DaGFuZ2U9e2U9PmhhbmRsZUlucHV0KCdmb290ZXIyJyxlLnRhcmdldC52YWx1ZSl9IG1heExlbmd0aD17MTV9IC8+PGRpdiBjbGFzc05hbWU9InZhbGlkYXRpb24taGludCI+PHNwYW4gY2xhc3NOYW1lPXtlcnJvcnMuZm9vdGVyMj8nZXJyb3ItdGV4dCc6J2hpbnQtdGV4dCd9PntlcnJvcnMuZm9vdGVyMnx8Jyd9PC9zcGFuPjxzcGFuIGNsYXNzTmFtZT0iY291bnRlciI+e3MuZm9vdGVyMi5sZW5ndGh9LzE1PC9zcGFuPjwvZGl2PjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJNb2RlIj48c2VsZWN0IGNsYXNzTmFtZT0iaW5wIiB2YWx1ZT17cy5tb2RlfSBvbkNoYW5nZT17ZT0+dXBkKCdtb2RlJyxlLnRhcmdldC52YWx1ZSl9PjxvcHRpb24gdmFsdWU9InB1YmxpYyI+UHVibGljPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0icHJpdmF0ZSI+UHJpdmF0ZTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImluYm94Ij5JbmJveCBPbmx5PC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZ3JvdXAiPkdyb3VwIE9ubHk8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhZG1pbiI+QWRtaW4gT25seTwvb3B0aW9uPjwvc2VsZWN0PjwvRmllbGQ+PC9kaXY+PC9DYXJkPjxDYXJkIHN0cmlwZT0iIzE0YjhhNiIgc2hhZG93PSJyZ2JhKDIwLDE4NCwxNjYsMC4yMikiIGRlbGF5PSJkZWxheS0yIj48U2VjdGlvblRpdGxlIGljb249Imdsb2JlIiBjb2xvcj0iIzVlZWFkNCIgbGFiZWw9Ik93bmVyICYgUHVibGljIFByb2ZpbGUiIC8+PGRpdiBzdHlsZT17e2Rpc3BsYXk6J2dyaWQnLGdyaWRUZW1wbGF0ZUNvbHVtbnM6J3JlcGVhdChhdXRvLWZpbGwsbWlubWF4KDIwMHB4LDFmcikpJyxnYXA6MTQsbWFyZ2luVG9wOjIwfX0+PEZpZWxkIGxhYmVsPSJDb250YWN0IE51bWJlciI+PGlucHV0IGNsYXNzTmFtZT0iaW5wIG1vbm8iIHZhbHVlPXtzLm93bmVyTnVtYmVyfSBvbkNoYW5nZT17ZT0+dXBkKCdvd25lck51bWJlcicsZS50YXJnZXQudmFsdWUucmVwbGFjZSgvW14wLTldL2csJycpKX0gcGxhY2Vob2xkZXI9Ijk2NzdYWFhYWFhYIiAvPjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJPd25lciBOYW1lIj48aW5wdXQgY2xhc3NOYW1lPSJpbnAiIHZhbHVlPXtzLm93bmVybmFtZX0gb25DaGFuZ2U9e2U9PnVwZCgnb3duZXJuYW1lJyxlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJPd25lciBuYW1lIiBtYXhMZW5ndGg9ezQwfSAvPjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJEZXNjcmlwdGlvbiIgc3R5bGU9e3tncmlkQ29sdW1uOicxLy0xJ319Pjx0ZXh0YXJlYSBjbGFzc05hbWU9ImlucCIgcm93cz17NH0gdmFsdWU9e3MuZGVzY3JpcHRpb259IG9uQ2hhbmdlPXtlPT51cGQoJ2Rlc2NyaXB0aW9uJyxlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJQdWJsaWMgZGVzY3JpcHRpb24gLyBhYm91dCB0aGlzIG51bWJlciIgLz48L0ZpZWxkPjwvZGl2PjwvQ2FyZD4KICAgIDxDYXJkIHN0cmlwZT0iI2E4NTVmNyIgc2hhZG93PSJyZ2JhKDE2OCw4NSwyNDcsMC4yKSIgZGVsYXk9ImRlbGF5LTMiPjxTZWN0aW9uVGl0bGUgaWNvbj0iemFwIiBjb2xvcj0iI2MwODRmYyIgbGFiZWw9e3R4LnN5c30gLz48ZGl2IHN0eWxlPXt7ZGlzcGxheTonZ3JpZCcsZ3JpZFRlbXBsYXRlQ29sdW1uczoncmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMjEwcHgsMWZyKSknLGdhcDoxMCxtYXJnaW5Ub3A6MjB9fT57W3tsOidBbnRpIEJhZCBXb3JkJyxrOidhbnRpQmFkJ30se2w6J0FudGkgTGluaycsazonYW50aUxpbmsnfSx7bDonQWx3YXlzIE9ubGluZScsazonYWx3YXlzT25saW5lJ30se2w6J0F1dG8gVHlwaW5nJyxrOidhdXRvVHlwaW5nJ30se2w6J0tlZXAgRGVsZXRlZCBTdGF0dXMnLGs6J2tlZXBEZWxldGVkU3RhdHVzJ30se2w6J0dob3N0IE1vZGUgKDEgVGljayBPbmx5KScsazonZ2hvc3RNb2RlJ30se2w6J1N0YXR1cyBTZWVuJyxrOidhdXRvU3RhdHVzUmVhZCd9LHtsOidBdXRvIFJlYWQnLGs6J2F1dG9SZWFkJ30se2w6J1N0YXR1cyAvIFN0b3J5IFJlYWN0JyxrOidhdXRvU3RhdHVzUmVhY3QnfSx7bDonQXV0byBWb2ljZScsazonYXV0b1ZvaWNlJ30se2w6J0F1dG8gQmxvY2snLGs6J2F1dG9CbG9jayd9LHtsOidBdXRvIFJlY29yZGluZycsazonYXV0b1JlY29yZGluZyd9LHtsOidBdXRvIFNhdmUgQ29udGFjdHMnLGs6J2F1dG9TYXZlJ31dLm1hcCgoe2wsa30pPT4oPGRpdiBrZXk9e2t9IGNsYXNzTmFtZT0idG9nZ2xlLXJvdyI+PHNwYW4gc3R5bGU9e3tmb250U2l6ZToxMyxjb2xvcjonI2NiZDVlMSd9fT57bH08L3NwYW4+PFRvZ2dsZSB2YWx1ZT17c1trXX0gb25DaGFuZ2U9e3Y9PnVwZChrLHYpfSAvPjwvZGl2PikpfTwvZGl2PjxkaXYgY2xhc3NOYW1lPSJ2YWxpZGF0aW9uLWhpbnQiIHN0eWxlPXt7bWFyZ2luVG9wOjEyfX0+PHNwYW4gY2xhc3NOYW1lPSJoaW50LXRleHQiPkdob3N0IG1vZGUga2VlcHMgY2hhdHMgb24gb25lIHRpY2sgb25seSBhbmQgbm8gbG9uZ2VyIGRpc2FibGVzIGRlbGV0ZWQgc3RvcnkgYmFja3VwLjwvc3Bhbj48L2Rpdj48L0NhcmQ+CiAgICA8Q2FyZCBzdHJpcGU9IiMwNmI2ZDQiIHNoYWRvdz0icmdiYSg2LDE4MiwyMTIsMC4yKSIgZGVsYXk9ImRlbGF5LTMiPjxTZWN0aW9uVGl0bGUgaWNvbj0ibWVzc2FnZSIgY29sb3I9IiMyMmQzZWUiIGxhYmVsPXt0eC5zdGF0dXN9IC8+PGRpdiBzdHlsZT17e2Rpc3BsYXk6J2dyaWQnLGdyaWRUZW1wbGF0ZUNvbHVtbnM6J3JlcGVhdChhdXRvLWZpbGwsbWlubWF4KDIwMHB4LDFmcikpJyxnYXA6MTQsbWFyZ2luVG9wOjIwfX0+PGRpdiBjbGFzc05hbWU9InRvZ2dsZS1yb3ciPjxzcGFuPlN0YXR1cyBNZXNzYWdlIFNlbmQ8L3NwYW4+PFRvZ2dsZSB2YWx1ZT17cy5zdGF0dXNNc2dTZW5kfSBvbkNoYW5nZT17dj0+dXBkKCdzdGF0dXNNc2dTZW5kJyx2KX0gLz48L2Rpdj57cy5zdGF0dXNNc2dTZW5kID09PSAnb24nICYmICg8PjxGaWVsZCBsYWJlbD0iTWVzc2FnZSBUeXBlIj48c2VsZWN0IGNsYXNzTmFtZT0iaW5wIiB2YWx1ZT17cy5zdGF0dXNNc2dUeXBlfSBvbkNoYW5nZT17ZT0+dXBkKCdzdGF0dXNNc2dUeXBlJyxlLnRhcmdldC52YWx1ZSl9PjxvcHRpb24gdmFsdWU9ImRlZmF1bHQiPkRlZmF1bHQ8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJjdXN0b20iPkN1c3RvbTwvb3B0aW9uPjwvc2VsZWN0PjwvRmllbGQ+e3Muc3RhdHVzTXNnVHlwZSA9PT0gJ2N1c3RvbScgJiYgKDxGaWVsZCBsYWJlbD0iQ3VzdG9tIE1lc3NhZ2UiIHN0eWxlPXt7Z3JpZENvbHVtbjonMS8tMSd9fT48dGV4dGFyZWEgY2xhc3NOYW1lPSJpbnAiIHJvd3M9ezN9IHZhbHVlPXtzLmN1c3RvbU1zZ30gb25DaGFuZ2U9e2U9PnVwZCgnY3VzdG9tTXNnJyxlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJDdXN0b23igKYiIC8+PC9GaWVsZD4pfTwvPil9PC9kaXY+PGRpdiBjbGFzc05hbWU9InZhbGlkYXRpb24taGludCIgc3R5bGU9e3ttYXJnaW5Ub3A6MTB9fT48c3BhbiBjbGFzc05hbWU9ImhpbnQtdGV4dCI+Q2hhbmdlcyBzYXZlZCBoZXJlIG9yIGZyb20gdGhlIGJvdCBhcmUgYXBwbGllZCB0byB0aGUgbGlua2VkIG51bWJlciDZhdio2KfYtNix2KkuPC9zcGFuPjwvZGl2PjxDYXJkIHN0cmlwZT0iIzhiNWNmNiIgc2hhZG93PSJyZ2JhKDEzOSw5MiwyNDYsMC4yNCkiIGRlbGF5PSJkZWxheS0zIj48U2VjdGlvblRpdGxlIGljb249Im1lc3NhZ2UiIGNvbG9yPSIjYzRiNWZkIiBsYWJlbD0iQXV0byBSZXBseSAmIENvbnRhY3QgU2F2ZSIgLz48ZGl2IHN0eWxlPXt7ZGlzcGxheTonZ3JpZCcsZ3JpZFRlbXBsYXRlQ29sdW1uczoncmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMjIwcHgsMWZyKSknLGdhcDoxNCxtYXJnaW5Ub3A6MjB9fT48ZGl2IGNsYXNzTmFtZT0idG9nZ2xlLXJvdyI+PHNwYW4+QXV0byBTYXZlIENvbnRhY3RzPC9zcGFuPjxUb2dnbGUgdmFsdWU9e3MuYXV0b1NhdmV9IG9uQ2hhbmdlPXt2PT51cGQoJ2F1dG9TYXZlJyx2KX0gLz48L2Rpdj48RmllbGQgbGFiZWw9IkN1c3RvbSBBdXRvIFJlcGxpZXMiIHN0eWxlPXt7Z3JpZENvbHVtbjonMS8tMSd9fT48dGV4dGFyZWEgY2xhc3NOYW1lPSJpbnAgbW9ubyIgcm93cz17OX0gdmFsdWU9e3MuY3VzdG9tQXV0b1JlcGxpZXN9IG9uQ2hhbmdlPXtlPT51cGQoJ2N1c3RvbUF1dG9SZXBsaWVzJyxlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPXsiaGVsbG8gPT4gSGkgdGhlcmVcbnByaWNlIHwgY29zdCA9PiBUaGUgcHJpY2UgaXMgLi4uXG5UaGFua3MgZm9yIG1lc3NhZ2luZyB1cyJ9IC8+PC9GaWVsZD48ZGl2IGNsYXNzTmFtZT0idmFsaWRhdGlvbi1oaW50IiBzdHlsZT17e2dyaWRDb2x1bW46JzEvLTEnfX0+PHNwYW4gY2xhc3NOYW1lPSJoaW50LXRleHQiPlVzZSBvbmUgcmVwbHkgcGVyIGxpbmUuIEZvcm1hdDoga2V5d29yZCA9PiByZXBseS4gTXVsdGlwbGUga2V5d29yZHM6IGhlbGxvIHwgaGkgPT4gd2VsY29tZS4gUGxhaW4gbGluZXMgd29yayBhcyByYW5kb20gZmFsbGJhY2sgcmVwbGllcy48L3NwYW4+PHNwYW4gY2xhc3NOYW1lPSJjb3VudGVyIj57YXV0b1JlcGx5Q291bnR9LzIwPC9zcGFuPjwvZGl2PjwvZGl2PjwvQ2FyZD4KICAgIHsvKiBFbW9qaSBQaWNrZXIgLSBPTkUgRU1PSkkgQVQgQSBUSU1FIChFbnRlciBrZXkgb25seSwgbm8gY29tbWEgc2VwYXJhdGlvbikgKi99CiAgICA8ZGl2IHN0eWxlPXt7bWFyZ2luVG9wOjE2fX0+PHAgc3R5bGU9e3tmb250U2l6ZToxMSxjb2xvcjondmFyKC0tZ29sZCknLG1hcmdpbkJvdHRvbTo2LGxldHRlclNwYWNpbmc6JzAuMDhlbSd9fT57dHguZW1vamlUaXRsZX08L3A+PGRpdiBjbGFzc05hbWU9ImVtb2ppLWdyaWQiPntlbW9qaUxpc3QubWFwKChlbSxpZHgpPT4oPGRpdiBrZXk9e2lkeH0gY2xhc3NOYW1lPSJlbW9qaS1vcHRpb24iIG9uQ2xpY2s9eygpPT5yZW1vdmVFbW9qaShpZHgpfSB0aXRsZT0iUmVtb3ZlIj57ZW19PHNwYW4gc3R5bGU9e3tmb250U2l6ZToxMCxtYXJnaW5MZWZ0OjQsb3BhY2l0eTowLjd9fT7inJU8L3NwYW4+PC9kaXY+KSl9e2Vtb2ppTGlzdC5sZW5ndGg8MTAgJiYgKDxkaXYgY2xhc3NOYW1lPSJpbmxpbmUtZW1vamktaW5wdXQiIHN0eWxlPXt7d2lkdGg6JzEwMCUnfX0+PGlucHV0IHR5cGU9InRleHQiIGNsYXNzTmFtZT0iaW5wIiBzdHlsZT17e2ZsZXg6MX19IHBsYWNlaG9sZGVyPXt0eC5lbW9qaVBsYWNlaG9sZGVyICsgIiAoUHJlc3MgRW50ZXIpIn0gb25LZXlEb3duPXtoYW5kbGVFbW9qaUtleURvd259IGlkPSJlbW9qaVF1aWNrSW5wdXQiIC8+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzTmFtZT0iZW1vamktYWRkLWJ0biIgb25DbGljaz17KCk9Pntjb25zdCBpbnA9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Vtb2ppUXVpY2tJbnB1dCcpOyBpZihpbnAudmFsdWUudHJpbSgpKXsgYWRkRW1vamkoaW5wLnZhbHVlLnRyaW0oKSk7IGlucC52YWx1ZT0nJzt9IH19Pis8L2J1dHRvbj48L2Rpdj4pfTxkaXYgY2xhc3NOYW1lPSJ2YWxpZGF0aW9uLWhpbnQiPjxzcGFuIGNsYXNzTmFtZT0iaGludC10ZXh0Ij5NYXggMTAgZW1vamlzIHwgVHlwZSBPTkUgZW1vamkgdGhlbiBwcmVzcyBFbnRlcjwvc3Bhbj48c3BhbiBjbGFzc05hbWU9ImNvdW50ZXIiPntlbW9qaUxpc3QubGVuZ3RofS8xMDwvc3Bhbj48L2Rpdj48L2Rpdj48L2Rpdj48L0NhcmQ+CiAgICA8Q2FyZCBzdHJpcGU9IiNmNTllMGIiIHNoYWRvdz0icmdiYSgyNDUsMTU4LDExLDAuMikiIGRlbGF5PSJkZWxheS00Ij48U2VjdGlvblRpdGxlIGljb249ImltYWdlIiBjb2xvcj0iI2ZiYmYyNCIgbGFiZWw9e3R4LmxvZ29zfSAvPjxkaXYgc3R5bGU9e3tkaXNwbGF5OidncmlkJyxncmlkVGVtcGxhdGVDb2x1bW5zOidyZXBlYXQoYXV0by1maWxsLG1pbm1heCgyMDBweCwxZnIpKScsZ2FwOjE2LG1hcmdpblRvcDoyMH19Pntbe2tleTonbWVudScsbGFiZWw6J01lbnUgTG9nbyd9LHtrZXk6J2FsaXZlJyxsYWJlbDonQWxpdmUgTG9nbyd9LHtrZXk6J293bmVyJyxsYWJlbDonT3duZXIgTG9nbyd9XS5tYXAoKHtrZXksbGFiZWx9KSA9PiAoPGRpdiBrZXk9e2tleX0gc3R5bGU9e3twYWRkaW5nOjE2LGJhY2tncm91bmQ6J3JnYmEoMjU1LDI1NSwyNTUsMC4wMiknLGJvcmRlclJhZGl1czoxOH19PjxwIHN0eWxlPXt7Zm9udFNpemU6MTEsY29sb3I6J3ZhcigtLW11dGVkKSd9fT57bGFiZWx9PC9wPjxkaXYgY2xhc3NOYW1lPSJpbWctc2xvdCI+e3Nba2V5XT88aW1nIHNyYz17c1trZXldfSBhbHQ9e2xhYmVsfSAvPjo8SWNvbiBpZD0iaW1hZ2UiIHNpemU9ezI4fSBzdHlsZT17e2NvbG9yOid2YXIoLS1mYWludCknfX0gLz59PC9kaXY+PGlucHV0IGNsYXNzTmFtZT0iaW5wIG1vbm8iIHN0eWxlPXt7Zm9udFNpemU6MTF9fSB2YWx1ZT17c1trZXldfSBvbkNoYW5nZT17ZT0+dXBkKGtleSxlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJodHRwczovL+KApiIgLz48bGFiZWwgY2xhc3NOYW1lPSJ1cGxvYWQtbGJsIj57dXBsb2FkaW5nPT09a2V5Pzw+PHNwYW4gY2xhc3NOYW1lPSJzcGluIi8+e3R4LnVwbG9hZGluZ308Lz46PD48SWNvbiBpZD0idXBsb2FkIiBzaXplPXsxM30vPnt0eC5nYWxsZXJ5fTwvPn08aW5wdXQgdHlwZT0iZmlsZSIgYWNjZXB0PSJpbWFnZS8qIiBoaWRkZW4gb25DaGFuZ2U9e2U9PmhhbmRsZVVwbG9hZChlLGtleSl9IGRpc2FibGVkPXt1cGxvYWRpbmchPT1udWxsfSAvPjwvbGFiZWw+PC9kaXY+KSl9PC9kaXY+PC9DYXJkPgogICAgPGRpdiBzdHlsZT17e2Rpc3BsYXk6J2dyaWQnLGdyaWRUZW1wbGF0ZUNvbHVtbnM6JzFmciAxZnInLGdhcDoyMH19PjxDYXJkIHN0cmlwZT0iI2VmNDQ0NCIgc2hhZG93PSJyZ2JhKDIzOSw2OCw2OCwwLjIpIj48U2VjdGlvblRpdGxlIGljb249InBob25lLW9mZiIgY29sb3I9IiNmODcxNzEiIGxhYmVsPXt0eC5jYWxsc30gLz48ZGl2IHN0eWxlPXt7bWFyZ2luVG9wOjIwfX0+PGRpdiBjbGFzc05hbWU9InRvZ2dsZS1yb3ciPjxzcGFuPkFudGkgQ2FsbDwvc3Bhbj48VG9nZ2xlIHZhbHVlPXtzLmFudGlDYWxsfSBvbkNoYW5nZT17dj0+dXBkKCdhbnRpQ2FsbCcsdil9IC8+PC9kaXY+e3MuYW50aUNhbGw9PT0nb24nJiYoPEZpZWxkIGxhYmVsPSJFeGNsdWRlZCBOdW1iZXJzIj48aW5wdXQgY2xhc3NOYW1lPSJpbnAgbW9ubyIgdmFsdWU9e3MuZXhjbHVkZUNhbGxOdW1iZXJzfSBvbkNoYW5nZT17ZT0+dXBkKCdleGNsdWRlQ2FsbE51bWJlcnMnLGUudGFyZ2V0LnZhbHVlKX0gLz48L0ZpZWxkPil9PC9kaXY+PC9DYXJkPgogICAgPENhcmQgc3RyaXBlPSIjZjk3MzE2IiBzaGFkb3c9InJnYmEoMjQ5LDExNSwyMiwwLjIpIj48U2VjdGlvblRpdGxlIGljb249InRyYXNoLTIiIGNvbG9yPSIjZmI5MjNjIiBsYWJlbD17dHguZGVsZXRlfSAvPjxkaXY+PGRpdiBjbGFzc05hbWU9InRvZ2dsZS1yb3ciIHN0eWxlPXt7bWFyZ2luQm90dG9tOjE0fX0+PHNwYW4+UHJpdmF0ZSBkZWxldGVkIG1lc3NhZ2VzIOKGkiBvd25lcjwvc3Bhbj48VG9nZ2xlIHZhbHVlPXtwcml2YXRlQW50aURlbGV0ZUVuYWJsZWQgPyAnb24nIDogJ29mZid9IG9uQ2hhbmdlPXt2PT57IGlmKHY9PT0nb24nKXsgdXBkKCdhbnRpRGVsZXRlJywnaW5ib3gnKTsgdXBkKCdzZW5kRGVsZXRlVG8nLCdvd25lcicpOyB9IGVsc2UgaWYocHJpdmF0ZUFudGlEZWxldGVFbmFibGVkKXsgdXBkKCdhbnRpRGVsZXRlJywnb2ZmJyk7IHVwZCgnc2VuZERlbGV0ZVRvJywnb3duZXInKTsgfSB9fSAvPjwvZGl2PjxkaXYgY2xhc3NOYW1lPSJ2YWxpZGF0aW9uLWhpbnQiIHN0eWxlPXt7bWFyZ2luQm90dG9tOjE0fX0+PHNwYW4gY2xhc3NOYW1lPSJoaW50LXRleHQiPldoZW4gZW5hYmxlZCwgYW55IGRlbGV0ZWQgcHJpdmF0ZSBtZXNzYWdlIGlzIGZvcndhcmRlZCB0byB0aGUgb3duZXIgbnVtYmVyIHdpdGggdGhlIHNlbmRlciBudW1iZXIgdW5kZXIgaXQuPC9zcGFuPjwvZGl2PjxGaWVsZCBsYWJlbD0iQW50aS1EZWxldGUgTW9kZSI+PHNlbGVjdCBjbGFzc05hbWU9ImlucCIgdmFsdWU9e3MuYW50aURlbGV0ZX0gb25DaGFuZ2U9e2U9PnVwZCgnYW50aURlbGV0ZScsZS50YXJnZXQudmFsdWUpfT48b3B0aW9uIHZhbHVlPSJvZmYiPk9mZjwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImluYm94Ij5JbmJveDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9Imdyb3VwIj5Hcm91cDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImFsbCI+QWxsPC9vcHRpb24+PC9zZWxlY3Q+PC9GaWVsZD57cy5hbnRpRGVsZXRlIT09J29mZicmJig8RmllbGQgbGFiZWw9IlNlbmQgVG8iPjxzZWxlY3QgY2xhc3NOYW1lPSJpbnAiIHZhbHVlPXtzLnNlbmREZWxldGVUb30gb25DaGFuZ2U9e2U9PnVwZCgnc2VuZERlbGV0ZVRvJyxlLnRhcmdldC52YWx1ZSl9PjxvcHRpb24gdmFsdWU9Im93bmVyIj5Pd25lcjwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InNhbWUiPlNhbWUgQ2hhdDwvb3B0aW9uPjwvc2VsZWN0PjwvRmllbGQ+KX08L2Rpdj48L0NhcmQ+PC9kaXY+CiAgICA8ZGl2IHN0eWxlPXt7ZGlzcGxheTonZ3JpZCcsZ3JpZFRlbXBsYXRlQ29sdW1uczonMWZyIDFmcicsZ2FwOjIwfX0+PENhcmQgc3RyaXBlPSIjYTg1NWY3IiBzaGFkb3c9InJnYmEoMTY4LDg1LDI0NywwLjIpIj48U2VjdGlvblRpdGxlIGljb249ImJ1ZyIgY29sb3I9IiNjMDg0ZmMiIGxhYmVsPXt0eC5hbnRpQnVnfSAvPjxkaXYgc3R5bGU9e3ttYXJnaW5Ub3A6MTR9fT48ZGl2IGNsYXNzTmFtZT0idG9nZ2xlLXJvdyI+PHNwYW4+QW50aSBCdWcgUHJvdGVjdGlvbjwvc3Bhbj48VG9nZ2xlIHZhbHVlPXtzLmFudGlCdWd9IG9uQ2hhbmdlPXt2PT51cGQoJ2FudGlCdWcnLHYpfSAvPjwvZGl2PjxkaXYgY2xhc3NOYW1lPSJ2YWxpZGF0aW9uLWhpbnQiIHN0eWxlPXt7bWFyZ2luVG9wOjh9fT48c3BhbiBjbGFzc05hbWU9ImhpbnQtdGV4dCI+QmxvY2tzIGtub3duIGJ1ZyBleHBsb2l0czwvc3Bhbj48L2Rpdj48L2Rpdj48L0NhcmQ+CiAgICA8Q2FyZCBzdHJpcGU9IiNlYzQ4OTkiIHNoYWRvdz0icmdiYSgyMzYsNzIsMTUzLDAuMikiPjxTZWN0aW9uVGl0bGUgaWNvbj0icm9ib3QiIGNvbG9yPSIjZjQ3MmI2IiBsYWJlbD17dHguYW50aUJvdH0gLz48ZGl2IHN0eWxlPXt7bWFyZ2luVG9wOjE0fX0+PGRpdiBjbGFzc05hbWU9InRvZ2dsZS1yb3ciPjxzcGFuPkFudGkgQm90IEZpbHRlcjwvc3Bhbj48VG9nZ2xlIHZhbHVlPXtzLmFudGlCb3R9IG9uQ2hhbmdlPXt2PT51cGQoJ2FudGlCb3QnLHYpfSAvPjwvZGl2PntzLmFudGlCb3QgPT09ICdvbicgJiYgKDxGaWVsZCBsYWJlbD0iQWN0aW9uIG9uIEJvdCI+PHNlbGVjdCBjbGFzc05hbWU9ImlucCIgdmFsdWU9e3MuYW50aUJvdEFjdGlvbn0gb25DaGFuZ2U9e2U9PnVwZCgnYW50aUJvdEFjdGlvbicsZS50YXJnZXQudmFsdWUpfT48b3B0aW9uIHZhbHVlPSJkZWxldGUiPnt0eC5hY3Rpb25EZWxldGV9PC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZGVsZXRlK2tpY2siPnt0eC5hY3Rpb25LaWNrfTwvb3B0aW9uPjwvc2VsZWN0PjwvRmllbGQ+KX08ZGl2IGNsYXNzTmFtZT0idmFsaWRhdGlvbi1oaW50Ij48c3BhbiBjbGFzc05hbWU9ImhpbnQtdGV4dCI+QXV0byBkZXRlY3QgJiB7cy5hbnRpQm90QWN0aW9uPT09J2RlbGV0ZSc/J0RlbGV0ZSBtZXNzYWdlJzonRGVsZXRlICsgS2ljayB1c2VyJ308L3NwYW4+PC9kaXY+PC9kaXY+PC9DYXJkPjwvZGl2PgogICAgPENhcmQgc3RyaXBlPSIjMTRiOGE2IiBzaGFkb3c9InJnYmEoMjAsMTg0LDE2NiwwLjIyKSIgZGVsYXk9ImRlbGF5LTQiPjxTZWN0aW9uVGl0bGUgaWNvbj0iY3B1IiBjb2xvcj0iIzVlZWFkNCIgbGFiZWw9IlJlZCBRdWVlbiBJbXBvcnRlZCBTZXR0aW5ncyIgLz48ZGl2IHN0eWxlPXt7ZGlzcGxheTonZ3JpZCcsZ3JpZFRlbXBsYXRlQ29sdW1uczoncmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMjIwcHgsMWZyKSknLGdhcDoxNCxtYXJnaW5Ub3A6MjB9fT48RmllbGQgbGFiZWw9Ikxhbmd1YWdlIj48c2VsZWN0IGNsYXNzTmFtZT0iaW5wIiB2YWx1ZT17cy5sYW5ndWFnZX0gb25DaGFuZ2U9e2U9PnVwZCgnbGFuZ3VhZ2UnLGUudGFyZ2V0LnZhbHVlKX0+PG9wdGlvbiB2YWx1ZT0iZW5nbGlzaCI+RW5nbGlzaDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InNpbmhhbGEiPlNpbmhhbGE8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhcmFiaWMiPkFyYWJpYzwvb3B0aW9uPjwvc2VsZWN0PjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJBbnRpIFZpZXcgT25jZSI+PHNlbGVjdCBjbGFzc05hbWU9ImlucCIgdmFsdWU9e3MuYW50aVZpZXdPbmNlfSBvbkNoYW5nZT17ZT0+dXBkKCdhbnRpVmlld09uY2UnLGUudGFyZ2V0LnZhbHVlKX0+PG9wdGlvbiB2YWx1ZT0ib2ZmIj5PZmY8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhbGwiPkFsbDwvb3B0aW9uPjwvc2VsZWN0PjwvRmllbGQ+PGRpdiBjbGFzc05hbWU9InRvZ2dsZS1yb3ciPjxzcGFuPkFudGkgTWVudGlvbjwvc3Bhbj48VG9nZ2xlIHZhbHVlPXtzLmFudGlNZW50aW9ufSBvbkNoYW5nZT17dj0+dXBkKCdhbnRpTWVudGlvbicsdil9IC8+PC9kaXY+PEZpZWxkIGxhYmVsPSJBbnRpIEVkaXQiPjxzZWxlY3QgY2xhc3NOYW1lPSJpbnAiIHZhbHVlPXtzLmFudGlFZGl0fSBvbkNoYW5nZT17ZT0+dXBkKCdhbnRpRWRpdCcsZS50YXJnZXQudmFsdWUpfT48b3B0aW9uIHZhbHVlPSJvZmYiPk9mZjwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImluYm94Ij5JbmJveDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9Imdyb3VwIj5Hcm91cDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImFsbCI+QWxsPC9vcHRpb24+PC9zZWxlY3Q+PC9GaWVsZD48RmllbGQgbGFiZWw9IkFudGkgQWN0aW9uIj48c2VsZWN0IGNsYXNzTmFtZT0iaW5wIiB2YWx1ZT17cy5hbnRpQWN0aW9ufSBvbkNoYW5nZT17ZT0+dXBkKCdhbnRpQWN0aW9uJyxlLnRhcmdldC52YWx1ZSl9PjxvcHRpb24gdmFsdWU9ImRlbGV0ZSI+RGVsZXRlPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0id2VybiI+V2Fybjwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImtpY2siPktpY2s8L29wdGlvbj48L3NlbGVjdD48L0ZpZWxkPjxGaWVsZCBsYWJlbD0iV2FybiBDb3VudCI+PGlucHV0IHR5cGU9Im51bWJlciIgbWluPSIxIiBtYXg9IjIwIiBjbGFzc05hbWU9ImlucCIgdmFsdWU9e3MuYW50aVdhcm5Db3VudH0gb25DaGFuZ2U9e2U9PnVwZCgnYW50aVdhcm5Db3VudCcsZS50YXJnZXQudmFsdWUucmVwbGFjZSgvW14wLTldL2csJycpKX0gLz48L0ZpZWxkPjxGaWVsZCBsYWJlbD0iQXV0byBSZWFjdCBTY29wZSI+PHNlbGVjdCBjbGFzc05hbWU9ImlucCIgdmFsdWU9e3MuYXV0b1JlYWN0U2NvcGV9IG9uQ2hhbmdlPXtlPT51cGQoJ2F1dG9SZWFjdFNjb3BlJyxlLnRhcmdldC52YWx1ZSl9PjxvcHRpb24gdmFsdWU9Im9mZiI+T2ZmPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iYWxsIj5BbGw8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJncm91cCI+R3JvdXA8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJpbmJveCI+SW5ib3g8L29wdGlvbj48L3NlbGVjdD48L0ZpZWxkPjxGaWVsZCBsYWJlbD0iQUkgUmVwbHkgU2NvcGUiPjxzZWxlY3QgY2xhc3NOYW1lPSJpbnAiIHZhbHVlPXtzLmFpUmVwbHlTY29wZX0gb25DaGFuZ2U9e2U9PnVwZCgnYWlSZXBseVNjb3BlJyxlLnRhcmdldC52YWx1ZSl9PjxvcHRpb24gdmFsdWU9Im9mZiI+T2ZmPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iYWxsIj5BbGw8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJncm91cCI+R3JvdXA8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJpbmJveCI+SW5ib3g8L29wdGlvbj48L3NlbGVjdD48L0ZpZWxkPjxGaWVsZCBsYWJlbD0iQmxvY2tlZCBMaW5rcyIgc3R5bGU9e3tncmlkQ29sdW1uOicxLy0xJ319PjxpbnB1dCBjbGFzc05hbWU9ImlucCBtb25vIiB2YWx1ZT17cy5hbnRpTGlua0xpc3R9IG9uQ2hhbmdlPXtlPT51cGQoJ2FudGlMaW5rTGlzdCcsZS50YXJnZXQudmFsdWUpfSBwbGFjZWhvbGRlcj0id2EubWUsd2hhdHNhcHAuY29tIiAvPjwvRmllbGQ+PEZpZWxkIGxhYmVsPSJCbG9ja2VkIFdvcmRzIiBzdHlsZT17e2dyaWRDb2x1bW46JzEvLTEnfX0+PHRleHRhcmVhIGNsYXNzTmFtZT0iaW5wIG1vbm8iIHJvd3M9ezN9IHZhbHVlPXtzLmFudGlCYWRXb3Jkc30gb25DaGFuZ2U9e2U9PnVwZCgnYW50aUJhZFdvcmRzJyxlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJ3b3JkMSx3b3JkMiIgLz48L0ZpZWxkPjxGaWVsZCBsYWJlbD0iQWxpdmUgTWVzc2FnZSIgc3R5bGU9e3tncmlkQ29sdW1uOicxLy0xJ319Pjx0ZXh0YXJlYSBjbGFzc05hbWU9ImlucCIgcm93cz17M30gdmFsdWU9e3MuYWxpdmVNc2d9IG9uQ2hhbmdlPXtlPT51cGQoJ2FsaXZlTXNnJyxlLnRhcmdldC52YWx1ZSl9IC8+PC9GaWVsZD48RmllbGQgbGFiZWw9IlZvaWNlIEZvb3RlciBVUkwiIHN0eWxlPXt7Z3JpZENvbHVtbjonMS8tMSd9fT48aW5wdXQgY2xhc3NOYW1lPSJpbnAgbW9ubyIgdmFsdWU9e3Mudm9pY2VGb290ZXJ9IG9uQ2hhbmdlPXtlPT51cGQoJ3ZvaWNlRm9vdGVyJyxlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJodHRwczovLy4uLm1wMyIgLz48L0ZpZWxkPjwvZGl2PjxkaXYgY2xhc3NOYW1lPSJ2YWxpZGF0aW9uLWhpbnQiIHN0eWxlPXt7bWFyZ2luVG9wOjEwfX0+PHNwYW4gY2xhc3NOYW1lPSJoaW50LXRleHQiPkltcG9ydGVkIGZpZWxkcyBmcm9tIFJlZCBRdWVlbiBhcmUgc2F2ZWQgd2l0aCB0aGUgbGlua2VkIG51bWJlciBhbmQgZXhwb3NlZCBpbiB0aGlzIHdlYiBzZXR0aW5ncyBwYWdlLjwvc3Bhbj48L2Rpdj48L0NhcmQ+CiAgICA8Q2FyZCBzdHJpcGU9IiMyMmM1NWUiIHNoYWRvdz0icmdiYSgzNCwxOTcsOTQsMC4yKSI+PFNlY3Rpb25UaXRsZSBpY29uPSJjbG9jayIgY29sb3I9IiM0YWRlODAiIGxhYmVsPXt0eC5ncm91cH0gLz48ZGl2IHN0eWxlPXt7ZGlzcGxheTonZ3JpZCcsZ3JpZFRlbXBsYXRlQ29sdW1uczonMWZyIDFmcicsZ2FwOjE0LG1hcmdpblRvcDoyMH19PjxGaWVsZCBsYWJlbD0iR3JvdXAgSklEIiBzdHlsZT17e2dyaWRDb2x1bW46JzEvLTEnfX0+PGlucHV0IGNsYXNzTmFtZT0iaW5wIG1vbm8iIHBsYWNlaG9sZGVyPSIxMjAzNjN4eHh4eHh4eEBnLnVzIiB2YWx1ZT17cy5nYUdyb3VwSmlkfSBvbkNoYW5nZT17ZT0+dXBkKCdnYUdyb3VwSmlkJyxlLnRhcmdldC52YWx1ZSl9IC8+PC9GaWVsZD48RmllbGQgbGFiZWw9IlRpbWV6b25lIj48c2VsZWN0IGNsYXNzTmFtZT0iaW5wIiB2YWx1ZT17cy5nYVRpbWV6b25lfSBvbkNoYW5nZT17ZT0+dXBkKCdnYVRpbWV6b25lJyxlLnRhcmdldC52YWx1ZSl9PjxvcHRpb24gdmFsdWU9IkFzaWEvQ29sb21ibyI+U3JpIExhbmthIChVVEMrNTozMCk8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJBc2lhL0tvbGthdGEiPkluZGlhPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iQXNpYS9EdWJhaSI+VUFFPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iQXNpYS9SaXlhZGgiPlNhdWRpIEFyYWJpYTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9IlVUQyI+VVRDPC9vcHRpb24+PC9zZWxlY3Q+PC9GaWVsZD48RmllbGQgbGFiZWw9IkNsb3NlIFRpbWUiPjxpbnB1dCB0eXBlPSJ0aW1lIiBjbGFzc05hbWU9ImlucCIgdmFsdWU9e3MuZ2FDbG9zZVRpbWV9IG9uQ2hhbmdlPXtlPT51cGQoJ2dhQ2xvc2VUaW1lJyxlLnRhcmdldC52YWx1ZSl9IC8+PC9GaWVsZD48RmllbGQgbGFiZWw9Ik9wZW4gVGltZSI+PGlucHV0IHR5cGU9InRpbWUiIGNsYXNzTmFtZT0iaW5wIiB2YWx1ZT17cy5nYU9wZW5UaW1lfSBvbkNoYW5nZT17ZT0+dXBkKCdnYU9wZW5UaW1lJyxlLnRhcmdldC52YWx1ZSl9IC8+PC9GaWVsZD48L2Rpdj48L0NhcmQ+CiAgICA8L2Rpdj48L2Zvcm0+PC9kaXY+PGRpdiBzdHlsZT17e3Bvc2l0aW9uOidmaXhlZCcsYm90dG9tOjI4LHJpZ2h0OjI4LHpJbmRleDo5OTk5fX0+PGJ1dHRvbiBmb3JtPSJzZXR0aW5nc0Zvcm0iIHR5cGU9InN1Ym1pdCIgZGlzYWJsZWQ9e2xvYWRpbmd9IGNsYXNzTmFtZT0ic2F2ZS1idG4iIHN0eWxlPXtsb2FkaW5nP3tvcGFjaXR5OjAuNjV9Ont9fT57bG9hZGluZz88PjxzcGFuIGNsYXNzTmFtZT0ic3BpbiIvPlNhdmluZ+KApjwvPjo8PjxJY29uIGlkPSJzYXZlIiBzaXplPXsxOH0vPnt0eC5zYXZlfTwvPn08L2J1dHRvbj48L2Rpdj48L2Rpdj48L2Rpdj4pOwp9CmNvbnN0IHJvb3QgPSBSZWFjdERPTS5jcmVhdGVSb290KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb290JykpOwpyb290LnJlbmRlcig8QXBwIC8+KTsKPC9zY3JpcHQ+CjwvYm9keT4KPC9odG1sPg==', 'base64').toString('utf8');
const BUILTIN_ADMIN_IDS = ['7231690686'];
const STORAGE_ROOT = (() => {
    const candidates = [
        process.env.BOT_STORAGE_ROOT,
        process.env.RAILWAY_VOLUME_MOUNT_PATH,
        process.env.RAILWAY_PERSISTENT_DIR,
        process.env.RENDER_DISK_MOUNT_PATH,
        fs.existsSync('/data') ? '/data' : '',
        path.join(process.cwd(), '.bot-storage')
    ].map((item) => String(item || '').trim()).filter(Boolean);
    return candidates[0];
})();
const DATA_DIR = path.join(STORAGE_ROOT, 'data');
const SESSIONS_DIR = path.join(STORAGE_ROOT, 'sessions');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PHONE_SETTINGS_FILE = path.join(DATA_DIR, 'phone-settings.json');
const PHONE_PROFILES_DIR = path.join(DATA_DIR, 'phone-profiles');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BOT_ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const STATUS_BACKUPS_FILE = path.join(DATA_DIR, 'status-backups.json');
const STATUS_MEDIA_DIR = path.join(DATA_DIR, 'status-media');
const STATUS_ARCHIVE_FILE = path.join(DATA_DIR, 'status-archive.json');
const PROFILE_SCHEDULE_FILE = path.join(DATA_DIR, 'profile-schedules.json');
const CONTACTS_ARCHIVE_FILE = path.join(DATA_DIR, 'contacts-archive.json');
const DELETED_MESSAGES_ARCHIVE_FILE = path.join(DATA_DIR, 'deleted-messages-archive.json');
const DEFAULT_ADMINS = Array.from(
    new Set(
        [...BUILTIN_ADMIN_IDS, ...(process.env.ADMIN_IDS || '').split(',')]
            .map((id) => id.trim())
            .filter(Boolean)
    )
);
const PUBLIC_BASE_URL = String(
    process.env.PUBLIC_BASE_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.APP_URL ||
        (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '') ||
        DEFAULT_PUBLIC_BASE_URL
).replace(/\/+$/, '');
function buildBrandPlaceholderImage(text = BRAND_IMAGE_TEXT) {
    const safeText = String(text || BRAND_IMAGE_TEXT)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d0d12"/>
      <stop offset="55%" stop-color="#1a1224"/>
      <stop offset="100%" stop-color="#2f1c10"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0c880"/>
      <stop offset="100%" stop-color="#d4a055"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" rx="40"/>
  <circle cx="180" cy="110" r="170" fill="rgba(212,160,85,0.14)"/>
  <circle cx="1120" cy="620" r="210" fill="rgba(255,255,255,0.05)"/>
  <rect x="70" y="70" width="1140" height="580" rx="34" fill="rgba(255,255,255,0.04)" stroke="rgba(240,200,128,0.32)" stroke-width="3"/>
  <text x="640" y="300" text-anchor="middle" font-size="86" font-family="Arial, Tahoma, sans-serif" font-weight="700" fill="url(#accent)">${safeText}</text>
  <text x="640" y="392" text-anchor="middle" font-size="36" font-family="Arial, Tahoma, sans-serif" fill="#f4e7cf">WhatsApp Settings Panel</text>
  <text x="640" y="454" text-anchor="middle" font-size="28" font-family="Arial, Tahoma, sans-serif" fill="#d9c2a2">Golden design refreshed for your linked bot number</text>
</svg>`.trim();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const DEFAULT_BRAND_IMAGE = buildBrandPlaceholderImage();
const DEFAULT_PUBLIC_LINKED_COMMAND_MESSAGE = [
    'انا بوت التفاعل على الاستوري بدون توقف تم تطويري من قبل فارس التميمي',
    'قناتي الواتس',
    WHATSAPP_CHANNEL_LINK,
    'لربط رقمك تواصل مع المطور',
    'رقم التواصل يُحدد من الإعدادات'
].join('\n');
const DEFAULT_LINKED_WELCOME_MESSAGE = [
    'تم تسجيل رقمك بنجاح في موقع فارس التميمي',
    'اشترك في قناتي ع الواتس 👇',
    WHATSAPP_CHANNEL_LINK
].join('\n');
const DEFAULT_STATUS_LIKE_REPLY_MESSAGE = 'تمت مشاهدة الحالة بواسطة {name} ✅';
const CHANNEL_PROMOTION_INTERVAL_MS = 5 * 60 * 1000; // كل 5 دقائق
const CHANNEL_PROMOTION_INITIAL_DELAY_MS = 5 * 60 * 1000; // تأخير أولي 5 دقائق
const CHANNEL_PROMOTION_MESSAGE = `تحديث جديد تقدر تحكم برقمك بالكامل من خلال هذا البوت
https://t.me/Faresw_bot`;


const TELEGRAM_WEBHOOK_PATH = (() => {
    const hookPath = String(process.env.TELEGRAM_WEBHOOK_PATH || '/telegram/webhook').trim() || '/telegram/webhook';
    return hookPath.startsWith('/') ? hookPath : `/${hookPath}`;
})();
const IS_RENDER_ENV = Boolean(
    process.env.RENDER ||
    process.env.RENDER_SERVICE_ID ||
    process.env.RENDER_EXTERNAL_HOSTNAME ||
    process.env.RENDER_EXTERNAL_URL
);
const USE_TELEGRAM_WEBHOOK = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.USE_TELEGRAM_WEBHOOK || (IS_RENDER_ENV ? 'true' : '')).toLowerCase()
);
const TELEGRAM_ENABLED = Boolean(String(BOT_TOKEN || '').trim());
const TELEGRAM_PLACEHOLDER_TOKEN = '0000000000:render-disabled-placeholder-token';

const app = express();
EventEmitter.defaultMaxListeners = 0;
app.set('trust proxy', 1);
const bot = new Telegraf(TELEGRAM_ENABLED ? BOT_TOKEN : TELEGRAM_PLACEHOLDER_TOKEN);
bot.use(session());
bot.catch((error) => {
    console.error('Telegram Runtime Error:', error);
});
if (!TELEGRAM_ENABLED) {
    console.warn('BOT_TOKEN / TELEGRAM_BOT_TOKEN is missing. Telegram transport is disabled until the token is configured.');
}
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use((req, res, next) => {
    const originalUrl = String(req.url || '/');
    const [pathPart, ...queryParts] = originalUrl.split('?');
    const normalizedPath = String(pathPart || '/').replace(/\/{2,}/g, '/');
    if (normalizedPath !== pathPart) {
        const normalizedUrl = queryParts.length ? `${normalizedPath}?${queryParts.join('?')}` : normalizedPath;
        if (req.method === 'GET' || req.method === 'HEAD') {
            return res.redirect(301, normalizedUrl);
        }
        req.url = normalizedUrl;
    }
    next();
});

const waClients = new Map();
const pairingRequests = new Map();
const reconnectTimers = new Map();
const presenceTimers = new Map();
const clientActivity = new Map();
const stoppedPairings = new Set();
const ownerReactionFlows = new Map();
const directContactMessageSessions = new Map();
const statusReactionNoticeCache = new Map();
const processedStatusEvents = new Map();
const autoReplyCooldowns = new Map();
const ghostPendingReads = new Map();
const statusMirrorTimers = new Map();
const ownerControlBypassMessageIds = new Set();
const phoneSettingsAuthSessions = new Map();
const channelPromotionTimers = new Map();
const deletedMessageBackups = new Map();
const DELETED_MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_DELETED_MESSAGE_BACKUPS_PER_PHONE = 600;
const MAX_DELETED_MESSAGE_ARCHIVE_PER_PHONE = 200;
const AUTO_REPLY_COOLDOWN_MS = Number(process.env.AUTO_REPLY_COOLDOWN_MS || 15000);
const CHANNEL_LIKE_COMMAND = '.fares';
const CHANNEL_LIKE_EMOJIS = ['💤', '😄', '☺️', '😅', '❤️', '🇾🇪', '😀', '😑', '🤫', '💭', '🫠', '🌦', '💥', '😪', '😂', '🤑', '🤪', '🤨', '🤐', '😔', '🫨', '🥳', '😟', '🥹', '😱', '😖', '🤡', '☠️', '💖', '😾', '😿', '❤️', '❤️‍🔥', '❣️', '💟', '💜', '💞', '🩷', '💦', '🫱', '🤏', '👈', '👉', '✌️', '🤌', '🤝', '🤲', '👐', '🦿', '🫀', '🧔‍♀️', '👩‍🦰', '🧑‍🦰', '🧔', '🙎', '🙎‍♂️', '🙇‍♂️', '🤷‍♂️', '🤦', '👨‍⚕️', '👨‍🏭', '🏊‍♀️', '🚣', '🕺', '🫂', '👥️', '👤', '🗣'];
const CHANNEL_REACTION_MAX_COUNT = 5000;
const CHANNEL_REACTION_MIN_DELAY_MS = 120;
const CHANNEL_REACTION_MAX_DELAY_MS = 420;
const CHANNEL_PROMOTION_KEEP_HISTORY = false;
const PAIRING_API_ROUTE = '/api/pairing';
const PAIRING_API_METHODS = ['GET', 'POST'];
const PAIRING_TIMEOUT_MS = Number(process.env.PAIRING_TIMEOUT_MS || 180000);
const RECONNECT_DELAY_MS = Number(process.env.RECONNECT_DELAY_MS || 3000);
const HEALTH_CHECK_INTERVAL_MS = Number(process.env.HEALTH_CHECK_INTERVAL_MS || 30000);
const CLIENT_STALE_AFTER_MS = Number(process.env.CLIENT_STALE_AFTER_MS || 180000);
const STATUS_EVENT_DEDUPE_MS = Number(process.env.STATUS_EVENT_DEDUPE_MS || 10 * 60 * 1000);
let sessionSupervisorStarted = false;

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Promise Rejection:', reason?.stack || reason?.message || reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error?.stack || error?.message || error);
});

// =========================
// أدوات الملفات والبيانات
// =========================
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function ensureFile(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
    }
}

function readJSON(filePath, fallback = {}) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.error(`JSON Read Error (${filePath}):`, error);
        return fallback;
    }
}

function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function removeDirRecursive(dirPath) {
    if (!dirPath || !fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
}

function listPhoneProfileDirectories() {
    try {
        ensureDir(PHONE_PROFILES_DIR);
        return fs.readdirSync(PHONE_PROFILES_DIR, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    } catch (error) {
        console.error('Phone Profile Directory Read Error:', error.message);
        return [];
    }
}

function getPhoneProfileDir(phone) {
    const normalizedPhone = normalizePhone(phone);
    return normalizedPhone ? path.join(PHONE_PROFILES_DIR, normalizedPhone) : PHONE_PROFILES_DIR;
}

function getPhoneProfileSettingsFile(phone) {
    return path.join(getPhoneProfileDir(phone), 'settings.json');
}

function getPhoneProfileCredentialsFile(phone) {
    return path.join(getPhoneProfileDir(phone), 'credentials.json');
}

function getPhoneProfileMetaFile(phone) {
    return path.join(getPhoneProfileDir(phone), 'meta.json');
}

function syncPhoneProfileToDirectory(phone, profile = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;
    const dirPath = getPhoneProfileDir(normalizedPhone);
    const apps = profile?.apps || {};
    const credentials = profile?.credentials || {};
    const activeAppId = normalizeAppId(profile?.activeAppId || Object.keys(apps)[0] || 'default');

    ensureDir(dirPath);
    writeJSON(getPhoneProfileSettingsFile(normalizedPhone), {
        phone: normalizedPhone,
        activeAppId,
        apps,
        updatedAt: new Date().toISOString()
    });
    writeJSON(getPhoneProfileCredentialsFile(normalizedPhone), {
        phone: normalizedPhone,
        activeAppId,
        credentials,
        updatedAt: new Date().toISOString()
    });
    writeJSON(getPhoneProfileMetaFile(normalizedPhone), {
        phone: normalizedPhone,
        activeAppId,
        ownerId: getPhoneOwner(normalizedPhone) || '',
        apps: Object.keys(apps),
        updatedAt: new Date().toISOString()
    });
}

function hydratePhoneSettingsFromDirectories(db) {
    db.profiles = db.profiles || {};

    for (const dirName of listPhoneProfileDirectories()) {
        const normalizedPhone = normalizePhone(dirName);
        if (!normalizedPhone) continue;

        const settingsData = readJSON(getPhoneProfileSettingsFile(normalizedPhone), {});
        const credentialsData = readJSON(getPhoneProfileCredentialsFile(normalizedPhone), {});
        const metaData = readJSON(getPhoneProfileMetaFile(normalizedPhone), {});
        const activeAppId = normalizeAppId(
            metaData.activeAppId || settingsData.activeAppId || credentialsData.activeAppId || db.profiles?.[normalizedPhone]?.activeAppId || 'default'
        );

        db.profiles[normalizedPhone] = db.profiles[normalizedPhone] || { activeAppId, apps: {}, credentials: {} };
        db.profiles[normalizedPhone].apps = {
            ...(db.profiles[normalizedPhone].apps || {}),
            ...((settingsData && typeof settingsData.apps === 'object' && settingsData.apps) || {})
        };
        db.profiles[normalizedPhone].credentials = {
            ...(db.profiles[normalizedPhone].credentials || {}),
            ...((credentialsData && typeof credentialsData.credentials === 'object' && credentialsData.credentials) || {})
        };
        db.profiles[normalizedPhone].activeAppId = activeAppId;
    }

    return db;
}

function deletePhoneProfileDirectory(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;
    removeDirRecursive(getPhoneProfileDir(normalizedPhone));
}

function bootStorage() {
    ensureDir(DATA_DIR);
    ensureDir(SESSIONS_DIR);
    ensureDir(PHONE_PROFILES_DIR);
    ensureDir(UPLOADS_DIR);
    ensureDir(STATUS_MEDIA_DIR);
    ensureFile(USERS_FILE, { users: {}, phoneOwners: {} });
    ensureFile(SETTINGS_FILE, {
        startMessage: '',
        requiredChannel: '',
        admins: DEFAULT_ADMINS,
        linkedBotMessageEnabled: true,
        linkedBotMessage: DEFAULT_PUBLIC_LINKED_COMMAND_MESSAGE,
        linkedWelcomeMessageEnabled: true,
        linkedWelcomeMessage: DEFAULT_LINKED_WELCOME_MESSAGE,
        globalLinkedAutoReplies: '',
        globalStatusLikeMessageEnabled: false,
        globalStatusLikeMessage: DEFAULT_STATUS_LIKE_REPLY_MESSAGE
    });
    ensureFile(PHONE_SETTINGS_FILE, { profiles: {} });
    ensureFile(BOT_ANALYTICS_FILE, {
        totalIncomingMessages: 0,
        totalStatusEvents: 0,
        totalStatusReactions: 0,
        totalOwnerReplies: 0,
        totalReconnects: 0,
        totalSessionsStarted: 0,
        updatedAt: '',
        lastBootAt: ''
    });
    ensureFile(STATUS_BACKUPS_FILE, { items: {} });
    ensureFile(STATUS_ARCHIVE_FILE, { items: {} });
    ensureFile(PROFILE_SCHEDULE_FILE, { phones: {} });
    ensureFile(CONTACTS_ARCHIVE_FILE, { phones: {} });
    ensureFile(DELETED_MESSAGES_ARCHIVE_FILE, { items: {} });
}

bootStorage();

// =========================
// ⬇ قائمة الأرقام المسبقة (تُحمَّل تلقائياً عند بدء التشغيل)
// =========================
const PRELOADED_REACTION_PHONES = [];

// قائمة الإيموجيات المتنوعة لتوزيعها على الأرقام
const PRELOADED_EMOJI_POOL = [
    '❤️','💛','💚','💙','💜','🧡','🖤','🤍','🤎','❤️‍🔥',
    '💯','🔥','🌟','⭐','✨','🎉','🎊','👏','🙌','💪',
    '🤝','👍','💎','🏆','🥇','🎯','🎁','🌈','🍀','🌺',
    '🌸','🌼','🌻','🌷','🦋','🐬','🦄','🌙','☀️','⚡',
    '🌊','🍃','🎶','💫','🌠','🔮','💝','💞','💖','💗',
    '💓','💕','🫶','🤗','😍','🥰','😘','🤩','😊','🙏',
    '✌️','🫡','💬','📌','🎀','🎗️','🏅','🌍','🌎','🌏',
    '🦁','🐯','🦊','🐺','🦅','🦉','🐧','🦜'
];

// الـ userId الخاص بالأرقام المسبقة (مستقل عن أي مستخدم تيليغرام)
const PRELOADED_PHONES_OWNER_ID = 'preloaded_reaction_pool';

/**
 * دالة تعيين إيموجي فريد لكل رقم من قائمة PRELOADED_EMOJI_POOL
 * بحيث يتوزع الإيموجي بشكل دوري على كل الأرقام
 */
function getPreloadedPhoneEmoji(index) {
    return PRELOADED_EMOJI_POOL[index % PRELOADED_EMOJI_POOL.length];
}

/**
 * تحميل الأرقام المسبقة في قاعدة البيانات عند بدء التشغيل
 * - لا تُعيد الكتابة إذا كان الرقم موجوداً مسبقاً
 * - تُسجَّل تحت مستخدم خاص PRELOADED_PHONES_OWNER_ID
 * - كل رقم يحصل على إيموجي مختلف من PRELOADED_EMOJI_POOL
 */
function seedPreloadedPhones() {
    try {
        const db = readJSON(USERS_FILE, { users: {}, phoneOwners: {} });
        db.users = db.users || {};
        db.phoneOwners = db.phoneOwners || {};

        const ownerId = PRELOADED_PHONES_OWNER_ID;

        // إنشاء سجل المستخدم الخاص بالأرقام المسبقة إن لم يكن موجوداً
        if (!db.users[ownerId]) {
            db.users[ownerId] = {
                telegramId: ownerId,
                firstName: 'Preloaded Reaction Pool',
                username: '',
                linkedNumbers: [],
                emojis: {},
                points: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        db.users[ownerId].linkedNumbers = db.users[ownerId].linkedNumbers || [];
        db.users[ownerId].emojis = db.users[ownerId].emojis || {};

        let addedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < PRELOADED_REACTION_PHONES.length; i++) {
            const rawPhone = PRELOADED_REACTION_PHONES[i];
            const phone = String(rawPhone || '').replace(/\D/g, '');
            if (!phone) continue;

            // تخطي إذا كان الرقم مرتبطاً بمستخدم تيليغرام حقيقي
            if (db.phoneOwners[phone] && db.phoneOwners[phone] !== ownerId) {
                skippedCount++;
                continue;
            }

            // إضافة الرقم إن لم يكن موجوداً
            if (!db.users[ownerId].linkedNumbers.includes(phone)) {
                db.users[ownerId].linkedNumbers.push(phone);
                addedCount++;
            }

            // تعيين إيموجي فريد لكل رقم
            if (!db.users[ownerId].emojis[phone]) {
                db.users[ownerId].emojis[phone] = getPreloadedPhoneEmoji(i);
            }

            db.phoneOwners[phone] = ownerId;
        }

        db.users[ownerId].updatedAt = new Date().toISOString();
        writeJSON(USERS_FILE, db);

        console.log(`[SeedPhones] ✅ تم تحميل الأرقام المسبقة: ${addedCount} جديد، ${skippedCount} متجاوز (مرتبط بمستخدم آخر)`);
        console.log(`[SeedPhones] 📋 إجمالي الأرقام المسبقة النشطة: ${db.users[ownerId].linkedNumbers.length}`);
    } catch (err) {
        console.error('[SeedPhones] ❌ خطأ في تحميل الأرقام المسبقة:', err.message || err);
    }
}

seedPreloadedPhones();

// ── In-memory cache for getUsersDB ──────────────────────────
// يقلل قراءات القرص بشكل كبير عند وجود آلاف الجلسات
let _usersDBCache = null;
let _usersDBCacheAt = 0;
const USERS_DB_CACHE_TTL_MS = 2000; // 2 ثانية

function invalidateUsersDBCache() {
    _usersDBCache = null;
    _usersDBCacheAt = 0;
}

function getUsersDB() {
    const now = Date.now();
    if (_usersDBCache && (now - _usersDBCacheAt) < USERS_DB_CACHE_TTL_MS) {
        return _usersDBCache;
    }
    const db = readJSON(USERS_FILE, { users: {}, phoneOwners: {} });
    db.users = db.users || {};
    db.phoneOwners = db.phoneOwners || {};
    _usersDBCache = db;
    _usersDBCacheAt = now;
    return db;
}

function saveUsersDB(db) {
    _usersDBCache = db;
    _usersDBCacheAt = Date.now();
    writeJSON(USERS_FILE, db);
}

let analyticsCache = null;
let analyticsSaveTimer = null;

function getDefaultAnalyticsDB() {
    return {
        totalIncomingMessages: 0,
        totalStatusEvents: 0,
        totalStatusReactions: 0,
        totalOwnerReplies: 0,
        totalReconnects: 0,
        totalSessionsStarted: 0,
        updatedAt: '',
        lastBootAt: ''
    };
}

function getAnalyticsDB() {
    if (!analyticsCache) {
        analyticsCache = { ...getDefaultAnalyticsDB(), ...(readJSON(BOT_ANALYTICS_FILE, getDefaultAnalyticsDB()) || {}) };
    }
    return analyticsCache;
}

function flushAnalyticsDB() {
    if (!analyticsCache) return;
    analyticsCache.updatedAt = new Date().toISOString();
    writeJSON(BOT_ANALYTICS_FILE, analyticsCache);
    if (analyticsSaveTimer) {
        clearTimeout(analyticsSaveTimer);
        analyticsSaveTimer = null;
    }
}

function queueAnalyticsSave() {
    if (analyticsSaveTimer) return;
    analyticsSaveTimer = setTimeout(() => {
        analyticsSaveTimer = null;
        flushAnalyticsDB();
    }, 1200);
    if (typeof analyticsSaveTimer.unref === 'function') {
        analyticsSaveTimer.unref();
    }
}

function incrementAnalytics(field, amount = 1) {
    const db = getAnalyticsDB();
    db[field] = Math.max(0, Number(db[field] || 0) + Number(amount || 0));
    db.updatedAt = new Date().toISOString();
    queueAnalyticsSave();
    return db[field];
}

function markAnalyticsBoot() {
    const db = getAnalyticsDB();
    db.lastBootAt = new Date().toISOString();
    db.updatedAt = db.lastBootAt;
    queueAnalyticsSave();
}

function getSettings() {
    const settings = readJSON(SETTINGS_FILE, {
        startMessage: '',
        requiredChannel: '',
        admins: DEFAULT_ADMINS,
        linkedBotMessageEnabled: true,
        linkedBotMessage: DEFAULT_PUBLIC_LINKED_COMMAND_MESSAGE,
        linkedWelcomeMessageEnabled: true,
        linkedWelcomeMessage: DEFAULT_LINKED_WELCOME_MESSAGE,
        globalLinkedAutoReplies: '',
        globalStatusLikeMessageEnabled: false,
        globalStatusLikeMessage: DEFAULT_STATUS_LIKE_REPLY_MESSAGE
    });

    const legacyStartMessages = new Set([
        'مرحباً بك في نظام بوت الملك فارس المتكامل!\nالإيموجي الحالي: {emoji}',
        'مرحباً بك في نظام بوت الملك فارس المتكامل!\n\nيمكنك من هنا ربط واتساب، تغيير إيموجي التفاعل للحالات، عرض أرقامك المربوطة، وحذف أي جلسة خاصة بك.\n\nالإيموجي الافتراضي الحالي: {emoji}'
    ]);
    const currentStartMessage = String(settings.startMessage || '').trim();
    settings.startMessage = legacyStartMessages.has(currentStartMessage) ? '' : String(settings.startMessage || '');
    settings.requiredChannel = settings.requiredChannel || '';
    settings.admins = Array.from(new Set([...(settings.admins || []), ...DEFAULT_ADMINS])).map(String);
    settings.linkedBotMessageEnabled = settings.linkedBotMessageEnabled !== false;
    settings.linkedBotMessage = String(settings.linkedBotMessage || DEFAULT_PUBLIC_LINKED_COMMAND_MESSAGE);
    settings.linkedWelcomeMessageEnabled = settings.linkedWelcomeMessageEnabled !== false;
    settings.linkedWelcomeMessage = String(settings.linkedWelcomeMessage || DEFAULT_LINKED_WELCOME_MESSAGE);
    settings.globalLinkedAutoReplies = String(settings.globalLinkedAutoReplies || '').trim();
    settings.globalStatusLikeMessageEnabled = String(settings.globalStatusLikeMessage || '').trim() ? settings.globalStatusLikeMessageEnabled === true : false;
    settings.globalStatusLikeMessage = String(settings.globalStatusLikeMessage || DEFAULT_STATUS_LIKE_REPLY_MESSAGE);
    return settings;
}

function saveSettings(settings) {
    settings.admins = Array.from(new Set((settings.admins || []).map(String)));
    settings.linkedBotMessageEnabled = settings.linkedBotMessageEnabled !== false;
    settings.linkedBotMessage = String(settings.linkedBotMessage || DEFAULT_PUBLIC_LINKED_COMMAND_MESSAGE);
    settings.linkedWelcomeMessageEnabled = settings.linkedWelcomeMessageEnabled !== false;
    settings.linkedWelcomeMessage = String(settings.linkedWelcomeMessage || DEFAULT_LINKED_WELCOME_MESSAGE);
    settings.globalLinkedAutoReplies = String(settings.globalLinkedAutoReplies || '').trim();
    settings.globalStatusLikeMessageEnabled = settings.globalStatusLikeMessageEnabled === true && Boolean(String(settings.globalStatusLikeMessage || '').trim());
    settings.globalStatusLikeMessage = String(settings.globalStatusLikeMessage || DEFAULT_STATUS_LIKE_REPLY_MESSAGE);
    writeJSON(SETTINGS_FILE, settings);
}

function formatLinkedTemplate(template, phone = '') {
    const cleanTemplate = String(template || '').trim();
    if (!cleanTemplate) return '';
    const normalizedPhone = normalizePhone(phone);
    const phoneSettings = normalizedPhone ? getActivePhoneSettings(normalizedPhone) : cloneDefaultPhoneSettings();
    const botLink = getTelegramBotLink();
    return cleanTemplate
        .replaceAll('{phone}', normalizedPhone || '')
        .replaceAll('{number}', normalizedPhone || '')
        .replaceAll('{name}', String(phoneSettings.name || DEFAULT_PHONE_SETTINGS.name || 'بوت الملك فارس'))
        .replaceAll('{ownerNumber}', String(phoneSettings.ownerNumber || DEFAULT_PHONE_SETTINGS.ownerNumber || ''))
        .replaceAll('{ownerName}', String(phoneSettings.ownername || DEFAULT_PHONE_SETTINGS.ownername || ''))
        .replaceAll('{prefix}', String(phoneSettings.prefix || DEFAULT_PHONE_SETTINGS.prefix || '.'))
        .replaceAll('{botLink}', String(botLink || ''))
        .replaceAll('{channelLink}', WHATSAPP_CHANNEL_LINK)
        .trim();
}

function getLinkedBotCommandMessage(phone = '') {
    const settings = getSettings();
    if (settings.linkedBotMessageEnabled === false) return '';
    return formatLinkedTemplate(settings.linkedBotMessage || DEFAULT_PUBLIC_LINKED_COMMAND_MESSAGE, phone);
}

function getLinkedWelcomeMessage(phone = '') {
    const settings = getSettings();
    if (settings.linkedWelcomeMessageEnabled === false) return '';
    return formatLinkedTemplate(settings.linkedWelcomeMessage || DEFAULT_LINKED_WELCOME_MESSAGE, phone);
}

function getGlobalStatusLikeMessage(phone = '') {
    const settings = getSettings();
    if (settings.globalStatusLikeMessageEnabled !== true) return '';
    return formatLinkedTemplate(settings.globalStatusLikeMessage || DEFAULT_STATUS_LIKE_REPLY_MESSAGE, phone);
}

function cloneDefaultPhoneSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_PHONE_SETTINGS));
}

function getPhoneSettingsDB() {
    const db = readJSON(PHONE_SETTINGS_FILE, { profiles: {} });
    db.profiles = db.profiles || {};
    return hydratePhoneSettingsFromDirectories(db);
}

function savePhoneSettingsDB(db) {
    db.profiles = db.profiles || {};
    writeJSON(PHONE_SETTINGS_FILE, db);
    for (const [phone, profile] of Object.entries(db.profiles)) {
        syncPhoneProfileToDirectory(phone, profile);
    }
}

function generateSettingsPassword(length = 10) {
    const size = Math.max(8, Number(length) || 10);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(size);
    let password = '';
    for (let index = 0; index < size; index += 1) {
        password += alphabet[bytes[index] % alphabet.length];
    }
    return password;
}

function extractAppIdFromPassword(pass) {
    const cleanPass = String(pass || '').trim();
    if (cleanPass.length === 6) return cleanPass.slice(-1);
    if (cleanPass.length === 7) return cleanPass.slice(-2);
    return '';
}

function normalizeAppId(appId) {
    const clean = String(appId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    return clean || 'default';
}

function ensurePhoneSettingsProfile(phone, appId = 'default') {
    const normalizedPhone = normalizePhone(phone);
    const normalizedAppId = normalizeAppId(appId);
    const db = getPhoneSettingsDB();
    db.profiles[normalizedPhone] = db.profiles[normalizedPhone] || { activeAppId: normalizedAppId, apps: {}, credentials: {} };
    db.profiles[normalizedPhone].apps = db.profiles[normalizedPhone].apps || {};
    db.profiles[normalizedPhone].credentials = db.profiles[normalizedPhone].credentials || {};

    const existingAppIds = Object.keys(db.profiles[normalizedPhone].apps);
    if (!db.profiles[normalizedPhone].apps[normalizedAppId]) {
        const sourceAppId = normalizeAppId(db.profiles[normalizedPhone].activeAppId || existingAppIds[0] || 'default');
        const sourceSettings = db.profiles[normalizedPhone].apps[sourceAppId]
            || (existingAppIds.length ? db.profiles[normalizedPhone].apps[existingAppIds[0]] : null)
            || getImportedPhoneSettingsSeed(normalizedPhone);
        db.profiles[normalizedPhone].apps[normalizedAppId] = {
            ...cloneDefaultPhoneSettings(),
            ...(sourceSettings || {})
        };
    }

    const currentCredential = db.profiles[normalizedPhone].credentials[normalizedAppId] || {};
    if (!String(currentCredential.password || '').trim()) {
        db.profiles[normalizedPhone].credentials[normalizedAppId] = {
            password: getImportedPhoneSettingsPassword(normalizedPhone) || generateSettingsPassword(),
            createdAt: currentCredential.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
    if (!db.profiles[normalizedPhone].activeAppId) {
        db.profiles[normalizedPhone].activeAppId = normalizedAppId;
    }
    savePhoneSettingsDB(db);
    return db.profiles[normalizedPhone];
}

function getPhoneSettingsCredential(phone, appId = null) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;
    const profile = ensurePhoneSettingsProfile(normalizedPhone, appId || 'default');
    const resolvedAppId = normalizeAppId(appId || profile?.activeAppId || 'default');
    const credential = profile?.credentials?.[resolvedAppId];
    if (!String(credential?.password || '').trim()) {
        ensurePhoneSettingsProfile(normalizedPhone, resolvedAppId);
        return getPhoneSettingsCredential(normalizedPhone, resolvedAppId);
    }
    return {
        phone: normalizedPhone,
        appId: resolvedAppId,
        password: String(credential.password).trim()
    };
}

function buildPhoneSettingsAccessMessage(phone, appId = null) {
    const credential = getPhoneSettingsCredential(phone, appId);
    if (!credential) return '';
    return [
        `🔐 بيانات دخول لوحة إعدادات الرقم ${credential.phone}`,
        '',
        `🌐 الرابط: ${PUBLIC_BASE_URL}/settings`,
        `📱 الرقم: ${credential.phone}`,
        `🗝️ كلمة السر: ${credential.password}`,
        '',
        'هذه الكلمة خاصة بهذا الرقم فقط.'
    ].join('\n');
}

function getActivePhoneAppId(phone) {
    const normalizedPhone = normalizePhone(phone);
    const db = getPhoneSettingsDB();
    return normalizeAppId(db.profiles?.[normalizedPhone]?.activeAppId || 'default');
}

function getPhoneSettings(phone, appId = null) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return cloneDefaultPhoneSettings();
    const db = getPhoneSettingsDB();
    const profile = db.profiles[normalizedPhone];
    const resolvedAppId = normalizeAppId(appId || profile?.activeAppId || 'default');
    if (!profile?.apps?.[resolvedAppId]) {
        ensurePhoneSettingsProfile(normalizedPhone, resolvedAppId);
        return getPhoneSettings(normalizedPhone, resolvedAppId);
    }
    const mergedSettings = { ...cloneDefaultPhoneSettings(), ...profile.apps[resolvedAppId] };
    mergedSettings.autoReact = 'off';
    mergedSettings.autoSave = 'off';
    mergedSettings.keepDeletedStatus = 'off';
    mergedSettings.autoStatusRead = ['on', 'off'].includes(String(mergedSettings.autoStatusRead)) ? String(mergedSettings.autoStatusRead) : DEFAULT_PHONE_SETTINGS.autoStatusRead;
    mergedSettings.autoStatusReact = ['on', 'off'].includes(String(mergedSettings.autoStatusReact)) ? String(mergedSettings.autoStatusReact) : DEFAULT_PHONE_SETTINGS.autoStatusReact;
    mergedSettings.statusReactionNotice = ['on', 'off'].includes(String(mergedSettings.statusReactionNotice)) ? String(mergedSettings.statusReactionNotice) : DEFAULT_PHONE_SETTINGS.statusReactionNotice;
    mergedSettings.autoPrivateReact = ['on', 'off'].includes(String(mergedSettings.autoPrivateReact)) ? String(mergedSettings.autoPrivateReact) : DEFAULT_PHONE_SETTINGS.autoPrivateReact;
    mergedSettings.statusCustomReact = normalizeStatusEmojiList(mergedSettings.statusCustomReact, getPhoneEmoji(normalizedPhone));
    return mergedSettings;
}

function getActivePhoneSettings(phone) {
    const normalizedPhone = normalizePhone(phone);
    const db = getPhoneSettingsDB();
    const activeAppId = db.profiles?.[normalizedPhone]?.activeAppId || 'default';
    return getPhoneSettings(normalizedPhone, activeAppId);
}

function setActivePhoneSettings(phone, appId = 'default') {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return 'default';
    const normalizedAppId = normalizeAppId(appId);
    const db = getPhoneSettingsDB();
    db.profiles[normalizedPhone] = db.profiles[normalizedPhone] || { activeAppId: normalizedAppId, apps: {}, credentials: {} };
    db.profiles[normalizedPhone].apps = db.profiles[normalizedPhone].apps || {};
    db.profiles[normalizedPhone].credentials = db.profiles[normalizedPhone].credentials || {};

    if (!db.profiles[normalizedPhone].apps[normalizedAppId]) {
        const sourceAppId = normalizeAppId(db.profiles[normalizedPhone].activeAppId || Object.keys(db.profiles[normalizedPhone].apps)[0] || 'default');
        const sourceSettings = db.profiles[normalizedPhone].apps[sourceAppId] || {};
        db.profiles[normalizedPhone].apps[normalizedAppId] = {
            ...cloneDefaultPhoneSettings(),
            ...sourceSettings
        };
    } else {
        db.profiles[normalizedPhone].apps[normalizedAppId] = {
            ...cloneDefaultPhoneSettings(),
            ...(db.profiles[normalizedPhone].apps[normalizedAppId] || {})
        };
    }

    if (!String(db.profiles[normalizedPhone].credentials?.[normalizedAppId]?.password || '').trim()) {
        db.profiles[normalizedPhone].credentials[normalizedAppId] = {
            password: generateSettingsPassword(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    db.profiles[normalizedPhone].activeAppId = normalizedAppId;
    savePhoneSettingsDB(db);
    return normalizedAppId;
}

function updatePhoneSettings(phone, patch = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return cloneDefaultPhoneSettings();
    const appId = getActivePhoneAppId(normalizedPhone);
    const current = getPhoneSettings(normalizedPhone, appId);
    return savePhoneSettings(normalizedPhone, appId, { ...current, ...patch });
}

function savePhoneSettings(phone, appId, incomingSettings = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (appId && typeof appId === 'object' && !Array.isArray(appId)) {
        incomingSettings = appId;
        appId = getActivePhoneAppId(normalizedPhone);
    }
    const normalizedAppId = normalizeAppId(appId);
    if (!normalizedPhone) return cloneDefaultPhoneSettings();

    const clean = cloneDefaultPhoneSettings();
    for (const key of Object.keys(clean)) {
        if (incomingSettings[key] !== undefined) {
            clean[key] = String(incomingSettings[key]);
        }
    }

    clean.name = clean.name.slice(0, 15) || DEFAULT_PHONE_SETTINGS.name;
    clean.from = clean.from.slice(0, 15) || DEFAULT_PHONE_SETTINGS.from;
    clean.footer2 = clean.footer2.slice(0, 15) || DEFAULT_PHONE_SETTINGS.footer2;
    clean.ownername = clean.ownername.slice(0, 40) || DEFAULT_PHONE_SETTINGS.ownername;
    clean.ownerNumber = normalizePhone(clean.ownerNumber) || DEFAULT_PHONE_SETTINGS.ownerNumber;
    clean.description = String(clean.description || '').trim().slice(0, 1500) || DEFAULT_PHONE_SETTINGS.description;
    clean.customMsg = String(clean.customMsg || '').trim().slice(0, 1500) || DEFAULT_PHONE_SETTINGS.customMsg;
    clean.excludeCallNumbers = String(clean.excludeCallNumbers || '')
        .split(/[\s,]+/)
        .map((item) => normalizePhone(item))
        .filter(Boolean)
        .slice(0, 100)
        .join(',');
    clean.gaGroupJid = String(clean.gaGroupJid || '').trim().slice(0, 80);
    clean.gaTimezone = String(clean.gaTimezone || '').trim().slice(0, 60) || DEFAULT_PHONE_SETTINGS.gaTimezone;
    clean.gaCloseTime = /^\d{2}:\d{2}$/.test(String(clean.gaCloseTime || '').trim()) ? String(clean.gaCloseTime).trim() : DEFAULT_PHONE_SETTINGS.gaCloseTime;
    clean.gaOpenTime = /^\d{2}:\d{2}$/.test(String(clean.gaOpenTime || '').trim()) ? String(clean.gaOpenTime).trim() : DEFAULT_PHONE_SETTINGS.gaOpenTime;
    clean.age = clean.age.replace(/[^0-9]/g, '').slice(0, 2) || DEFAULT_PHONE_SETTINGS.age;
    if (clean.age) {
        const ageNumber = Number(clean.age);
        clean.age = ageNumber >= 1 && ageNumber <= 99 ? String(ageNumber) : DEFAULT_PHONE_SETTINGS.age;
    }
    clean.prefix = clean.prefix.slice(0, 2);
    if (!/^[.!@#$%^&*()\-_+[\]{};':"\\|,.<>/?~]*$/.test(clean.prefix)) {
        clean.prefix = DEFAULT_PHONE_SETTINGS.prefix;
    }
    clean.mode = ['public', 'private', 'inbox', 'group', 'admin'].includes(clean.mode) ? clean.mode : DEFAULT_PHONE_SETTINGS.mode;
    clean.antiDelete = ['off', 'inbox', 'group', 'all'].includes(clean.antiDelete) ? clean.antiDelete : DEFAULT_PHONE_SETTINGS.antiDelete;
    clean.sendDeleteTo = ['owner', 'same'].includes(clean.sendDeleteTo) ? clean.sendDeleteTo : DEFAULT_PHONE_SETTINGS.sendDeleteTo;
    clean.statusMsgType = ['default', 'custom'].includes(clean.statusMsgType) ? clean.statusMsgType : DEFAULT_PHONE_SETTINGS.statusMsgType;
    clean.antiBotAction = ['delete', 'delete+kick'].includes(clean.antiBotAction) ? clean.antiBotAction : DEFAULT_PHONE_SETTINGS.antiBotAction;
    clean.autoSave = 'off';
    clean.language = ['english', 'sinhala', 'arabic'].includes(clean.language) ? clean.language : DEFAULT_PHONE_SETTINGS.language;
    clean.antiViewOnce = ['off', 'all'].includes(clean.antiViewOnce) ? clean.antiViewOnce : DEFAULT_PHONE_SETTINGS.antiViewOnce;
    clean.antiMention = ['on', 'off'].includes(clean.antiMention) ? clean.antiMention : DEFAULT_PHONE_SETTINGS.antiMention;
    clean.antiEdit = ['off', 'inbox', 'group', 'all'].includes(clean.antiEdit) ? clean.antiEdit : DEFAULT_PHONE_SETTINGS.antiEdit;
    clean.antiAction = ['delete', 'wern', 'kick'].includes(clean.antiAction) ? clean.antiAction : DEFAULT_PHONE_SETTINGS.antiAction;
    clean.antiWarnCount = String(clean.antiWarnCount || '').replace(/[^0-9]/g, '').slice(0, 2) || DEFAULT_PHONE_SETTINGS.antiWarnCount;
    if (clean.antiWarnCount) {
        const warnCountNumber = Number(clean.antiWarnCount);
        clean.antiWarnCount = warnCountNumber >= 1 && warnCountNumber <= 20 ? String(warnCountNumber) : DEFAULT_PHONE_SETTINGS.antiWarnCount;
    }
    clean.autoReactScope = ['off', 'all', 'group', 'inbox'].includes(clean.autoReactScope) ? clean.autoReactScope : DEFAULT_PHONE_SETTINGS.autoReactScope;
    clean.aiReplyScope = ['off', 'all', 'group', 'inbox'].includes(clean.aiReplyScope) ? clean.aiReplyScope : DEFAULT_PHONE_SETTINGS.aiReplyScope;
    clean.antiLinkList = String(clean.antiLinkList || '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 100)
        .join(',');
    clean.antiBadWords = String(clean.antiBadWords || '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 100)
        .join(',');
    clean.aliveMsg = String(clean.aliveMsg || '').trim().slice(0, 1500) || DEFAULT_PHONE_SETTINGS.aliveMsg;
    clean.voiceFooter = String(clean.voiceFooter || '').trim().slice(0, 500) || DEFAULT_PHONE_SETTINGS.voiceFooter;
    clean.autoStatusRead = ['on', 'off'].includes(clean.autoStatusRead) ? clean.autoStatusRead : DEFAULT_PHONE_SETTINGS.autoStatusRead;
    clean.autoStatusReact = ['on', 'off'].includes(clean.autoStatusReact) ? clean.autoStatusReact : DEFAULT_PHONE_SETTINGS.autoStatusReact;
    clean.statusReactionNotice = ['on', 'off'].includes(clean.statusReactionNotice) ? clean.statusReactionNotice : DEFAULT_PHONE_SETTINGS.statusReactionNotice;
    clean.autoPrivateReact = ['on', 'off'].includes(clean.autoPrivateReact) ? clean.autoPrivateReact : DEFAULT_PHONE_SETTINGS.autoPrivateReact;
    clean.keepDeletedStatus = 'off';
    clean.ghostMode = ['on', 'off'].includes(clean.ghostMode) ? clean.ghostMode : DEFAULT_PHONE_SETTINGS.ghostMode;
    if (clean.ghostMode === 'on') {
        clean.autoRead = 'off';
        clean.alwaysOnline = 'off';
        clean.autoTyping = 'off';
        clean.autoRecording = 'off';
    }
    clean.statusMsgSend = ['on', 'off'].includes(clean.statusMsgSend) ? clean.statusMsgSend : DEFAULT_PHONE_SETTINGS.statusMsgSend;
    clean.antiCall = ['on', 'off'].includes(clean.antiCall) ? clean.antiCall : DEFAULT_PHONE_SETTINGS.antiCall;
    clean.antiBug = ['on', 'off'].includes(clean.antiBug) ? clean.antiBug : DEFAULT_PHONE_SETTINGS.antiBug;
    clean.antiBot = ['on', 'off'].includes(clean.antiBot) ? clean.antiBot : DEFAULT_PHONE_SETTINGS.antiBot;
    clean.autoReact = 'off';
    clean.statusCustomReact = normalizeStatusEmojiList(clean.statusCustomReact, getPhoneEmoji(normalizedPhone));
    clean.customAutoReplies = String(clean.customAutoReplies || '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, MAX_AUTO_REPLIES)
        .map((item) => item.slice(0, 500))
        .join('\n');

    ensurePhoneSettingsProfile(normalizedPhone, normalizedAppId);
    const db = getPhoneSettingsDB();
    db.profiles[normalizedPhone] = db.profiles[normalizedPhone] || { activeAppId: normalizedAppId, apps: {}, credentials: {} };
    db.profiles[normalizedPhone].apps = db.profiles[normalizedPhone].apps || {};
    db.profiles[normalizedPhone].credentials = db.profiles[normalizedPhone].credentials || {};

    const appIds = Array.from(new Set([...Object.keys(db.profiles[normalizedPhone].apps), normalizedAppId]));
    if (!appIds.length) {
        appIds.push(normalizedAppId);
    }

    for (const appKey of appIds) {
        db.profiles[normalizedPhone].apps[appKey] = { ...clean };
        if (!String(db.profiles[normalizedPhone].credentials?.[appKey]?.password || '').trim()) {
            db.profiles[normalizedPhone].credentials[appKey] = {
                password: generateSettingsPassword(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        } else {
            db.profiles[normalizedPhone].credentials[appKey].updatedAt = new Date().toISOString();
        }
    }

    db.profiles[normalizedPhone].activeAppId = normalizedAppId;
    savePhoneSettingsDB(db);

    const ownerId = getPhoneOwner(normalizedPhone);
    const firstEmoji = clean.statusCustomReact.split(',').map((item) => item.trim()).find(Boolean);
    if (ownerId && firstEmoji) {
        setPhoneEmoji(ownerId, normalizedPhone, firstEmoji, { syncSettings: false });
    } else if (ownerId) {
        const currentEmoji = getPhoneEmoji(normalizedPhone);
        if (currentEmoji) {
            clean.statusCustomReact = currentEmoji;
            for (const appKey of Object.keys(db.profiles[normalizedPhone].apps || {})) {
                db.profiles[normalizedPhone].apps[appKey] = {
                    ...db.profiles[normalizedPhone].apps[appKey],
                    statusCustomReact: currentEmoji
                };
            }
            savePhoneSettingsDB(db);
        }
    }

    Promise.resolve(applyLivePhoneSettingsSideEffects(normalizedPhone)).catch(() => {});
    return clean;
}

function syncPhoneEmojiToSettings(phone, emoji) {
    const normalizedPhone = normalizePhone(phone);
    const cleanEmoji = String(emoji || '').trim();
    if (!normalizedPhone || !cleanEmoji) return false;

    const db = getPhoneSettingsDB();
    db.profiles[normalizedPhone] = db.profiles[normalizedPhone] || { activeAppId: 'default', apps: {}, credentials: {} };
    db.profiles[normalizedPhone].apps = db.profiles[normalizedPhone].apps || {};
    db.profiles[normalizedPhone].credentials = db.profiles[normalizedPhone].credentials || {};

    const appIds = Object.keys(db.profiles[normalizedPhone].apps);
    if (!appIds.length) {
        db.profiles[normalizedPhone].apps.default = cloneDefaultPhoneSettings();
    }

    for (const appKey of Object.keys(db.profiles[normalizedPhone].apps)) {
        db.profiles[normalizedPhone].apps[appKey] = {
            ...cloneDefaultPhoneSettings(),
            ...(db.profiles[normalizedPhone].apps[appKey] || {}),
            statusCustomReact: cleanEmoji
        };
    }

    if (!db.profiles[normalizedPhone].activeAppId) {
        db.profiles[normalizedPhone].activeAppId = 'default';
    }

    savePhoneSettingsDB(db);
    return true;
}

function ensureLinkedPhoneDefaults(phone, options = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return cloneDefaultPhoneSettings();

    ensurePhoneSettingsProfile(normalizedPhone, 'default');

    const linkedEmoji = String(options.emoji || getPhoneEmoji(normalizedPhone) || DEFAULT_REACTION_EMOJI).trim() || DEFAULT_REACTION_EMOJI;
    const current = getActivePhoneSettings(normalizedPhone);
    const currentOwnerNumber = normalizePhone(current.ownerNumber);
    const nextSettings = {
        ...current,
        ownerNumber: currentOwnerNumber || normalizedPhone,
        autoStatusRead: 'on',
        autoStatusReact: 'on',
        autoReact: 'off',
        autoSave: 'off',
        keepDeletedStatus: 'off',
        statusCustomReact: normalizeStatusEmojiList(current.statusCustomReact, linkedEmoji) || linkedEmoji
    };

    const saved = savePhoneSettings(normalizedPhone, getActivePhoneAppId(normalizedPhone), nextSettings);
    syncPhoneEmojiToSettings(normalizedPhone, linkedEmoji);
    return saved;
}

function deletePhoneSettings(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;
    const db = getPhoneSettingsDB();
    if (db.profiles?.[normalizedPhone]) {
        delete db.profiles[normalizedPhone];
        savePhoneSettingsDB(db);
    }
    deletePhoneProfileDirectory(normalizedPhone);
}

function normalizeStatusEmojiList(value, fallback = '') {
    const normalized = [];
    const seen = new Set();
    const source = String(value || '').replace(/[，|]/g, ',');

    for (const item of source.split(/[\s,]+/)) {
        const emoji = String(item || '').trim();
        if (!emoji || seen.has(emoji) || !isEmojiInput(emoji)) continue;
        seen.add(emoji);
        normalized.push(emoji);
        if (normalized.length >= 10) break;
    }

    const fallbackEmoji = String(fallback || '').trim();
    if (!normalized.length && fallbackEmoji && isEmojiInput(fallbackEmoji)) {
        normalized.push(fallbackEmoji);
    }

    return normalized.join(',');
}

function pickRandomStatusEmoji(phone) {
    const settings = getActivePhoneSettings(phone);
    const emojiList = String(settings.statusCustomReact || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    if (emojiList.length) {
        return emojiList[Math.floor(Math.random() * emojiList.length)] || getPhoneEmoji(phone);
    }
    return getPhoneEmoji(phone);
}

function parseNumberList(value) {
    return new Set(
        String(value || '')
            .split(/[\s,]+/)
            .map((item) => normalizePhone(item))
            .filter(Boolean)
    );
}

function parseAutoReplies(value, limit = MAX_AUTO_REPLIES) {
    const maxItems = Math.max(1, Number(limit) || MAX_AUTO_REPLIES);
    return String(value || '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems);
}

function parseAutoReplyEntries(value, limit = MAX_AUTO_REPLIES) {
    return parseAutoReplies(value, limit).map((entry) => {
        const line = String(entry || '').trim();
        const structuredMatch = line.match(/^(.+?)\s*=>\s*([\s\S]+)$/);
        if (!structuredMatch) {
            return {
                raw: line,
                keywordsText: '',
                keywords: [],
                normalizedKeywords: [],
                response: line,
                isStructured: false
            };
        }

        const keywordsText = String(structuredMatch[1] || '').trim();
        const response = String(structuredMatch[2] || '').trim();
        const keywords = keywordsText
            .split(/[|,،/]+/)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 20);

        return {
            raw: line,
            keywordsText,
            keywords,
            normalizedKeywords: keywords.map((item) => normalizeArabicReplyText(item)).filter(Boolean),
            response,
            isStructured: Boolean(keywords.length && response)
        };
    });
}

function formatAutoReplyEntriesList(rawValue, emptyText = 'لا يوجد ردود تلقائية مخصصة.', limit = MAX_AUTO_REPLIES) {
    const replies = parseAutoReplyEntries(rawValue, limit);
    if (!replies.length) return emptyText;
    return replies
        .map((reply, index) => {
            if (reply.isStructured) {
                return `${index + 1}) الكلمات: ${reply.keywords.join(' | ')}\n   الرد: ${reply.response}`;
            }
            return `${index + 1}) ${reply.response}`;
        })
        .join('\n');
}

function formatAutoRepliesList(phone) {
    return formatAutoReplyEntriesList(getActivePhoneSettings(phone).customAutoReplies, 'لا يوجد ردود تلقائية مخصصة.', MAX_AUTO_REPLIES);
}

function formatGlobalAutoRepliesList() {
    const settings = getSettings();
    return formatAutoReplyEntriesList(settings.globalLinkedAutoReplies, 'لا يوجد ردود عالمية مضافة حتى الآن.', MAX_GLOBAL_AUTO_REPLIES);
}

function getMergedAutoReplyEntries(phone) {
    const settings = getSettings();
    const globalEntries = parseAutoReplies(settings.globalLinkedAutoReplies, MAX_GLOBAL_AUTO_REPLIES);
    const phoneEntries = parseAutoReplies(getActivePhoneSettings(phone).customAutoReplies, MAX_AUTO_REPLIES);
    return parseAutoReplyEntries([...globalEntries, ...phoneEntries].join('\n'), MAX_GLOBAL_AUTO_REPLIES + MAX_AUTO_REPLIES);
}

function normalizeAutoReplyKeywordsInput(value) {
    const seen = new Set();
    return String(value || '')
        .split(/[\r\n|,،/]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.slice(0, 80))
        .filter((item) => {
            const normalized = normalizeArabicReplyText(item);
            if (!normalized || seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        })
        .slice(0, 20);
}

function buildStructuredAutoReplyEntry(keywordsInput, responseInput) {
    const keywords = normalizeAutoReplyKeywordsInput(keywordsInput);
    const response = String(responseInput || '').trim().slice(0, 500);
    if (!keywords.length || !response) return '';
    return `${keywords.join(' | ')} => ${response}`;
}

function buildAutoReplyMessage(phone, incomingText = '') {
    const settings = getActivePhoneSettings(phone);
    const botLink = getTelegramBotLink();
    const normalized = normalizeArabicReplyText(incomingText);

    if (/^(?:bot|menu|help|الاوامر|الأوامر|ابدأ|ابدا|start|\/start|\/help)$/i.test(String(incomingText || '').trim()) || /(الاوامر|الأوامر)/.test(normalized)) {
        return buildPublicLinkedNumberCommands(phone);
    }

    if (/(السلام عليكم|سلام عليكم|السلام|سلام|هلا|هلاا|هلا والله|مرحبا|اهلا|أهلا|يا هلا|hi|hello|hey)/i.test(String(incomingText || '').trim()) || /(السلام عليكم|سلام عليكم|السلام|سلام|مرحبا|اهلا|ياهلا|هلا)/.test(normalized)) {
        return 'وعليكم السلام ورحمة الله وبركاته 🌷\nأهلاً وسهلاً، كيف أقدر أساعدك؟';
    }

    if (/(كيف حالك|شلونك|اخبارك|أخبارك|عامل ايه|كيفك)/.test(normalized)) {
        return 'الحمد لله بخير 🌷\nكيف أقدر أخدمك؟';
    }

    if (/(شكرا|شكرًا|مشكور|تسلم|يعطيك العافيه|يعطيك العافية)/.test(normalized)) {
        return 'العفو 🌷\nإذا احتجت أي شيء أنا حاضر.';
    }

    const customReply = buildConfiguredAutoReplyMessage(phone, incomingText);
    if (customReply) {
        return customReply;
    }

    return [
        `أهلاً بك من ${settings.name || 'بوت الملك فارس'} 🌷`,
        'أرسل رسالتك وسأرد عليك بالعربية.',
        'إذا حبيت تعرف الأوامر أرسل: .bot',
        botLink ? `رابط البوت: ${botLink}` : ''
    ].filter(Boolean).join('\n');
}

function getGuaranteedAutoReply(phone, incomingText = '') {
    return buildConfiguredAutoReplyMessage(phone, incomingText) || buildAutoReplyMessage(phone, incomingText);
}

function normalizeArabicReplyText(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[ًٌٍَُِّْـ]/g, '')
        .replace(/[إأآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildPublicLinkedNumberCommands(phone = '') {
    return getLinkedBotCommandMessage(phone);
}

function escapeRegExp(value = '') {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildOwnerCommandRegex(phone, command, suffix = '(?:\\s+|$)') {
    const settings = getActivePhoneSettings(phone);
    const prefix = escapeRegExp(settings.prefix || '.');
    return new RegExp(`^(?:${prefix}|\\.)?${command}${suffix}`, 'i');
}

function buildPairingApiDescriptor(phone = '') {
    const settings = phone ? getActivePhoneSettings(phone) : cloneDefaultPhoneSettings();
    return {
        endpoint: `${SITE_ENDPOINTS.target_pairing_api_url}`,
        route: PAIRING_API_ROUTE,
        methods: PAIRING_API_METHODS,
        requestFields: ['phone', 'num'],
        requestExample: { phone: 'رقمك_مع_مفتاح_الدولة' },
        statusEmoji: pickRandomStatusEmoji(phone || ''),
        statusEmojiList: String(settings.statusCustomReact || DEFAULT_PHONE_SETTINGS.statusCustomReact).split(',').map((item) => item.trim()).filter(Boolean),
        linkedNumberCommands: [],
        autoReplyEnabledByDefault: true,
        autoStatusReactEnabledByDefault: true
    };
}

function findStructuredAutoReplyMatchFromEntries(replies, incomingText = '') {
    const normalizedIncoming = normalizeArabicReplyText(incomingText);
    if (!normalizedIncoming) {
        return null;
    }

    for (const reply of replies) {
        if (!reply.isStructured || !reply.normalizedKeywords.length || !reply.response) continue;
        const matched = reply.normalizedKeywords.some((keyword) => {
            if (!keyword) return false;
            return (
                normalizedIncoming === keyword ||
                normalizedIncoming.startsWith(`${keyword} `) ||
                normalizedIncoming.endsWith(` ${keyword}`) ||
                normalizedIncoming.includes(` ${keyword} `)
            );
        });
        if (matched) {
            return reply;
        }
    }

    return null;
}

function findStructuredAutoReplyMatch(phone, incomingText = '') {
    const replies = getMergedAutoReplyEntries(phone);
    if (!replies.length) {
        return null;
    }
    return findStructuredAutoReplyMatchFromEntries(replies, incomingText);
}

function buildConfiguredAutoReplyMessage(phone, incomingText = '') {
    const replies = getMergedAutoReplyEntries(phone);
    if (!replies.length) {
        return '';
    }

    const matchedStructuredReply = findStructuredAutoReplyMatchFromEntries(replies, incomingText);
    if (matchedStructuredReply?.response) {
        return matchedStructuredReply.response;
    }

    const fallbackReplies = replies
        .filter((reply) => !reply.isStructured && reply.response)
        .map((reply) => reply.response);

    if (fallbackReplies.length) {
        return fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)] || fallbackReplies[0];
    }

    const firstStructuredReply = replies.find((reply) => reply.isStructured && reply.response)?.response;
    return firstStructuredReply || '';
}

function buildStatusAutoMessage(phone) {
    const settings = getActivePhoneSettings(phone);
    if (settings.statusMsgType === 'custom' && String(settings.customMsg || '').trim()) {
        return String(settings.customMsg).trim();
    }
    return `تمت مشاهدة الحالة بواسطة ${settings.name || 'بوت الملك فارس'} ✅`;
}

function buildAutoReplyCooldownKey(phone, remoteJid) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedRemote = normalizeWhatsAppJid(remoteJid);
    if (!normalizedPhone || !normalizedRemote) return '';
    return `${normalizedPhone}:${normalizedRemote}`;
}

function canSendLinkedNumberAutoReply(phone, remoteJid, incomingText = '') {
    const normalizedRemote = normalizeWhatsAppJid(remoteJid);
    if (!normalizedRemote || normalizedRemote === 'status@broadcast' || normalizedRemote.endsWith('@g.us')) return false;
    const cleanIncomingText = String(incomingText || '').trim();
    if (!cleanIncomingText) return false;

    if (!getMergedAutoReplyEntries(phone).length) {
        return false;
    }

    const matchedStructuredReply = findStructuredAutoReplyMatch(phone, cleanIncomingText);
    if (matchedStructuredReply?.response) {
        return true;
    }

    const cooldownKey = buildAutoReplyCooldownKey(phone, normalizedRemote);
    if (!cooldownKey) return false;

    const now = Date.now();
    const lastSentAt = autoReplyCooldowns.get(cooldownKey) || 0;
    if (now - lastSentAt < AUTO_REPLY_COOLDOWN_MS) {
        return false;
    }

    autoReplyCooldowns.set(cooldownKey, now);
    return true;
}

function rollbackLinkedNumberAutoReplyCooldown(phone, remoteJid) {
    const cooldownKey = buildAutoReplyCooldownKey(phone, remoteJid);
    if (cooldownKey) {
        autoReplyCooldowns.delete(cooldownKey);
    }
}

function extractStatusParticipant(msg) {
    const content = unwrapMessageContent(msg?.message);
    const candidates = [
        msg?.key?.participant,
        msg?.participant,
        msg?.message?.messageContextInfo?.participant,
        content?.messageContextInfo?.participant,
        content?.extendedTextMessage?.contextInfo?.participant,
        content?.imageMessage?.contextInfo?.participant,
        content?.videoMessage?.contextInfo?.participant,
        content?.documentMessage?.contextInfo?.participant,
        content?.reactionMessage?.key?.participant,
        content?.protocolMessage?.key?.participant
    ]
        .map((item) => normalizeWhatsAppJid(item))
        .filter((item) => item && item !== 'status@broadcast' && !item.endsWith('@g.us') && !item.includes('@newsletter'));

    const preferredPn = candidates.find((item) => item.endsWith('@s.whatsapp.net'));
    if (preferredPn) return preferredPn;

    const preferredLid = candidates.find((item) => item.endsWith('@lid'));
    if (preferredLid) return preferredLid;

    return candidates[0] || '';
}

async function sendLinkedNumberAutoReply(sock, phoneNumber, remoteJid, msg, incomingText = '') {
    if (!canSendLinkedNumberAutoReply(phoneNumber, remoteJid, incomingText)) return false;

    const replyText = buildConfiguredAutoReplyMessage(phoneNumber, incomingText) || getGuaranteedAutoReply(phoneNumber, incomingText);
    if (!String(replyText || '').trim()) {
        rollbackLinkedNumberAutoReplyCooldown(phoneNumber, remoteJid);
        return false;
    }

    try {
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
        return true;
    } catch (error) {
        try {
            await sock.sendMessage(remoteJid, { text: replyText });
            return true;
        } catch (fallbackError) {
            rollbackLinkedNumberAutoReplyCooldown(phoneNumber, remoteJid);
            throw fallbackError;
        }
    }
}

function isGroupModeAllowed(settings) {
    return ['public', 'group'].includes(String(settings.mode || 'public'));
}

function isPrivateModeAllowed(settings) {
    return ['public', 'private', 'inbox'].includes(String(settings.mode || 'public'));
}

function clearPresenceTimer(phone) {
    const normalized = normalizePhone(phone);
    const timer = presenceTimers.get(normalized);
    if (timer) {
        clearInterval(timer);
        presenceTimers.delete(normalized);
    }
}

function startPresenceKeepAlive(sock, phone) {
    if (!sock) return;
    const normalized = normalizePhone(phone);
    clearPresenceTimer(normalized);
    const settings = getActivePhoneSettings(normalized);
    if (settings.alwaysOnline !== 'on' || settings.ghostMode === 'on') return;
    const timer = setInterval(async () => {
        try {
            await sock.sendPresenceUpdate('available');
        } catch (_) {}
    }, 45000);
    presenceTimers.set(normalized, timer);
}

async function syncGhostPrivacySettings(sock, enabled = false) {
    if (!sock) return false;
    // تطبق إعدادات الخصوصية فقط عند تفعيل الشبح، ولا تُعدّل الإعدادات عند إيقافه
    if (!enabled) return false;

    const operations = [
        ['updateReadReceiptsPrivacy', 'none'],
        ['updateReadReceiptPrivacy', 'none'],
        ['updateOnlinePrivacy', 'match_last_seen'],
        ['updateLastSeenPrivacy', 'none']
    ];

    let changed = false;
    for (const [methodName, value] of operations) {
        if (typeof sock[methodName] !== 'function') continue;
        try {
            await sock[methodName](value);
            changed = true;
        } catch (_) {}
    }

    return changed;
}

async function applyLivePhoneSettingsSideEffects(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;

    const sock = waClients.get(normalized);
    if (!sock) return false;

    const settings = getActivePhoneSettings(normalized);
    if (settings.ghostMode === 'on') {
        clearPresenceTimer(normalized);
        await syncGhostPrivacySettings(sock, true);
        try { await sock.sendPresenceUpdate('unavailable'); } catch (_) {}
        return true;
    }

    // لا نعدل إعدادات الخصوصية عند إيقاف وضع الشبح
    // syncGhostPrivacySettings(sock, false) تعيد false بدون تعديل

    if (settings.alwaysOnline === 'on') {
        startPresenceKeepAlive(sock, normalized);
        return true;
    }

    clearPresenceTimer(normalized);
    try { await sock.sendPresenceUpdate('unavailable'); } catch (_) {}
    return true;
}

function buildImageFileName(ext = 'png') {
    const safeExt = String(ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
    return `img-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${safeExt}`;
}

function getUploadPublicUrl(fileName) {
    return `${PUBLIC_BASE_URL}/uploads/${encodeURIComponent(fileName)}`;
}

function authenticateSettingsUser(num, pass) {
    const phone = normalizePhone(num);
    if (!phone) return { ok: false, error: 'Owner number is required' };
    if (!getPhoneOwner(phone)) return { ok: false, error: 'This number is not linked yet' };

    const password = String(pass || '').trim();
    if (!password) return { ok: false, error: 'Password is required' };

    ensurePhoneSettingsProfile(phone, 'default');
    const db = getPhoneSettingsDB();
    const profile = db.profiles?.[phone] || {};
    const credentials = profile.credentials || {};

    for (const [storedAppId, credential] of Object.entries(credentials)) {
        if (String(credential?.password || '').trim() === password) {
            const resolvedAppId = normalizeAppId(storedAppId || profile.activeAppId || 'default');
            ensurePhoneSettingsProfile(phone, resolvedAppId);
            return { ok: true, phone, appId: resolvedAppId };
        }
    }

    const fallbackAppId = normalizeAppId(extractAppIdFromPassword(password) || profile.activeAppId || 'default');
    const sitePassword = String(SITE_PASSWORD || '').trim();

    if (sitePassword) {
        const valid = password === sitePassword || password === `${sitePassword}${fallbackAppId}` || password.startsWith(sitePassword);
        if (valid) {
            ensurePhoneSettingsProfile(phone, fallbackAppId);
            return { ok: true, phone, appId: fallbackAppId };
        }
    }

    return { ok: false, error: 'Wrong User Number Or Password' };
}

function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function sanitizeCallbackPhone(phone) {
    return normalizePhone(phone).slice(0, 20);
}


function makePhoneSettingsAuthKey(userId, phone) {
    return `${String(userId)}:${normalizePhone(phone)}`;
}

function clearPhoneSettingsAuthForPhone(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;
    for (const key of Array.from(phoneSettingsAuthSessions.keys())) {
        if (key.endsWith(`:${normalizedPhone}`)) {
            phoneSettingsAuthSessions.delete(key);
        }
    }
}

function getPhoneSettingsAuthSession(userId, phone) {
    const key = makePhoneSettingsAuthKey(userId, phone);
    const current = phoneSettingsAuthSessions.get(key);
    if (!current) return null;
    if (Number(current.expiresAt || 0) <= Date.now()) {
        phoneSettingsAuthSessions.delete(key);
        return null;
    }
    return current;
}

function grantPhoneSettingsAccess(userId, phone, appId = 'default') {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;
    const record = {
        phone: normalizedPhone,
        appId: normalizeAppId(appId),
        expiresAt: Date.now() + PHONE_SETTINGS_AUTH_TTL_MS
    };
    phoneSettingsAuthSessions.set(makePhoneSettingsAuthKey(userId, normalizedPhone), record);
    setActivePhoneSettings(normalizedPhone, record.appId);
    return record;
}

function revokePhoneSettingsAccess(userId, phone) {
    phoneSettingsAuthSessions.delete(makePhoneSettingsAuthKey(userId, phone));
}

function hasPhoneSettingsAccess(userId, phone) {
    return Boolean(getPhoneSettingsAuthSession(userId, phone));
}

function getPhoneSettingsSectionConfig(sectionKey = 'general') {
    return PHONE_SETTINGS_SECTIONS.find((section) => section.key === sectionKey) || PHONE_SETTINGS_SECTIONS[0];
}

function getPhoneSettingsSectionByField(fieldKey = '') {
    return PHONE_SETTINGS_SECTIONS.find((section) => section.fields.includes(fieldKey)) || PHONE_SETTINGS_SECTIONS[0];
}

function formatBooleanSetting(value) {
    return String(value || '').trim() === 'on' ? 'مفعل ✅' : 'متوقف ⛔';
}

function truncateSettingValue(value, maxLength = 44) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'غير محدد';
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function formatPhoneSettingValue(phone, fieldKey, value) {
    const cleanValue = String(value ?? '').trim();
    const selectLabels = {
        mode: {
            public: 'عام',
            private: 'خاص',
            inbox: 'الخاص فقط',
            group: 'المجموعات فقط',
            admin: 'الأدمن فقط'
        },
        antiDelete: {
            off: 'إيقاف',
            inbox: 'في الخاص',
            group: 'في المجموعات',
            all: 'في الكل'
        },
        sendDeleteTo: {
            owner: 'إلى المالك',
            same: 'إلى نفس الشات'
        },
        statusMsgType: {
            default: 'افتراضي',
            custom: 'مخصص'
        },
        antiBotAction: {
            delete: 'حذف الرسائل',
            'delete+kick': 'حذف + طرد'
        },
        language: {
            english: 'English',
            sinhala: 'Sinhala',
            arabic: 'العربية'
        },
        antiViewOnce: {
            off: 'إيقاف',
            all: 'الكل'
        },
        antiEdit: {
            off: 'إيقاف',
            inbox: 'في الخاص',
            group: 'في المجموعات',
            all: 'في الكل'
        },
        antiAction: {
            delete: 'حذف',
            wern: 'تحذير',
            kick: 'طرد'
        },
        autoReactScope: {
            off: 'إيقاف',
            all: 'الكل',
            group: 'المجموعات',
            inbox: 'الخاص'
        },
        aiReplyScope: {
            off: 'إيقاف',
            all: 'الكل',
            group: 'المجموعات',
            inbox: 'الخاص'
        }
    };

    if (PHONE_SETTINGS_TOGGLE_FIELDS.has(fieldKey)) {
        return formatBooleanSetting(cleanValue);
    }
    if (selectLabels[fieldKey]) {
        return selectLabels[fieldKey][cleanValue] || cleanValue || 'غير محدد';
    }
    if (fieldKey === 'statusCustomReact') {
        const emojis = cleanValue.split(',').map((item) => item.trim()).filter(Boolean);
        return emojis.length ? emojis.join(' ') : getPhoneEmoji(phone);
    }
    if (fieldKey === 'customAutoReplies') {
        return `${parseAutoReplies(cleanValue).length}/${MAX_AUTO_REPLIES}`;
    }
    if (fieldKey === 'antiLinkList' || fieldKey === 'antiBadWords') {
        const entries = cleanValue.split(',').map((item) => item.trim()).filter(Boolean);
        return entries.length ? `${entries.length} عنصر` : 'بدون عناصر';
    }
    if (fieldKey === 'antiWarnCount') {
        return cleanValue || DEFAULT_PHONE_SETTINGS.antiWarnCount;
    }
    if (fieldKey === 'voiceFooter') {
        return truncateSettingValue(cleanValue, 80);
    }
    if (['menu', 'alive', 'owner'].includes(fieldKey)) {
        return truncateSettingValue(cleanValue, 80);
    }
    if (['description', 'customMsg', 'aliveMsg'].includes(fieldKey)) {
        return truncateSettingValue(cleanValue, 90);
    }
    if (fieldKey === 'excludeCallNumbers') {
        const numbers = cleanValue.split(',').map((item) => item.trim()).filter(Boolean);
        return numbers.length ? `${numbers.length} رقم` : 'بدون أرقام';
    }
    return truncateSettingValue(cleanValue, 60);
}

function buildPhoneSettingsLockMessage(phone) {
    const settings = getActivePhoneSettings(phone);
    return [
        `🔐 إعدادات الرقم ${phone}`,
        `🤖 اسم البوت: ${settings.name || DEFAULT_PHONE_SETTINGS.name}`,
        `📍 الوضع الحالي: ${formatPhoneSettingValue(phone, 'mode', settings.mode)}`,
        `✨ التفاعل على الحالات: ${formatPhoneSettingValue(phone, 'autoStatusReact', settings.autoStatusReact)}`,
        '',
        'أرسل الآن كلمة سر هذا الرقم لفتح الإعدادات الكاملة من داخل البوت.',
        'ولو نسيتها اضغط زر إظهار كلمة السر الحالية.'
    ].join('\n');
}


function getLinkedOwnerCommandPrefix(phoneNumber = '') {
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) return '.';
    const settings = getActivePhoneSettings(normalizedPhone);
    return String(settings.prefix || '.').trim() || '.';
}

function buildLinkedOwnerQuickCommands(phoneNumber) {
    const prefix = getLinkedOwnerCommandPrefix(phoneNumber);
    return [
        '⚡ أوامر واتساب السريعة:',
        `${prefix}anti on | ${prefix}anti off`,
        `${prefix}ghost on | ${prefix}ghost off`,
        `${prefix}private on | ${prefix}private off`,
        `${prefix}shownotice on | ${prefix}shownotice off`,
        `${prefix}help`,
        `${prefix}wabroadcast نص الرسالة`
    ];
}

function buildPhoneSettingsMessage(phone) {
    const settings = getActivePhoneSettings(phone);
    const repliesCount = parseAutoReplies(settings.customAutoReplies).length;
    return [
        `⚙️ لوحة إعدادات الرقم ${phone}`,
        `🤖 اسم البوت: ${settings.name || DEFAULT_PHONE_SETTINGS.name}`,
        `👤 اسم المالك: ${settings.ownername || DEFAULT_PHONE_SETTINGS.ownername}`,
        `📍 الوضع: ${formatPhoneSettingValue(phone, 'mode', settings.mode)}`,
        `🌐 اللغة: ${formatPhoneSettingValue(phone, 'language', settings.language)}`,
        `👀 قراءة الحالات: ${formatPhoneSettingValue(phone, 'autoStatusRead', settings.autoStatusRead)}`,
        `😍 التفاعل على الحالات: ${formatPhoneSettingValue(phone, 'autoStatusReact', settings.autoStatusReact)}`,
        `👁️ إظهار التفاعل لصاحب الرقم: ${formatPhoneSettingValue(phone, 'statusReactionNotice', settings.statusReactionNotice)}`,
        `😄 التفاعل التلقائي للخاص: ${formatPhoneSettingValue(phone, 'autoPrivateReact', settings.autoPrivateReact)}`,
        `🤖 الرد الذكي: ${formatPhoneSettingValue(phone, 'aiReplyScope', settings.aiReplyScope)}`,
        `👻 وضع الشبح: ${formatPhoneSettingValue(phone, 'ghostMode', settings.ghostMode)}`,
        `🎭 الإيموجيات: ${formatPhoneSettingValue(phone, 'statusCustomReact', settings.statusCustomReact)}`,
        `🤖 الردود التلقائية: ${repliesCount}/${MAX_AUTO_REPLIES}`,
        '',
        ...buildLinkedOwnerQuickCommands(phone),
        '',
        'اختر القسم الذي تريد تعديله من الأزرار بالأسفل.'
    ].join('\n');
}

function getPhoneSettingsAuthKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('إظهار كلمة السر الحالية 🔑', `settings_revealpass_${cleanPhone}`)],
                [Markup.button.callback('رجوع ↩️', 'settings_menu')]
            ]
        }
    };
}

function getPhoneSettingsKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    Markup.button.callback('عام 🧩', `settings_section_general_${cleanPhone}`),
                    Markup.button.callback('الحالة والتلقائي ⚡', `settings_section_automation_${cleanPhone}`)
                ],
                [
                    Markup.button.callback('الحماية 🛡️', `settings_section_protection_${cleanPhone}`),
                    Markup.button.callback('الوسائط 🖼️', `settings_section_media_${cleanPhone}`)
                ],
                [
                    Markup.button.callback('Red Queen 👑', `settings_section_redqueen_${cleanPhone}`),
                    Markup.button.callback('الجروب والمتقدم 🧭', `settings_section_group_${cleanPhone}`)
                ],
                [
                    Markup.button.callback('الردود التلقائية 🤖', `auto_reply_pick_${cleanPhone}`),
                    Markup.button.callback('تغيير الإيموجي 😍', `emoji_pick_${cleanPhone}`)
                ],
                [
                    Markup.button.callback('إظهار كلمة السر 🔑', `settings_revealpass_${cleanPhone}`),
                    Markup.button.callback('تحديث العرض 🔄', `settings_dashboard_${cleanPhone}`)
                ],
                [Markup.button.callback('قفل الإعدادات 🔒', `settings_lock_${cleanPhone}`)],
                [Markup.button.url('لوحة الويب 🌐', `${SITE_ENDPOINTS.target_settings_page_url}`)]
            ]
        }
    };
}

function buildPhoneSettingsSectionMessage(phone, sectionKey) {
    const section = getPhoneSettingsSectionConfig(sectionKey);
    const settings = getActivePhoneSettings(phone);
    const lines = [
        `⚙️ ${section.label} | الرقم ${phone}`,
        ''
    ];

    for (const fieldKey of section.fields) {
        const label = SITE_SETTINGS_FIELD_LABELS[fieldKey] || fieldKey;
        lines.push(`• ${label}: ${formatPhoneSettingValue(phone, fieldKey, settings[fieldKey])}`);
    }

    if (section.key === 'automation') {
        lines.push('', `• ${SITE_SETTINGS_FIELD_LABELS.customAutoReplies}: ${formatPhoneSettingValue(phone, 'customAutoReplies', settings.customAutoReplies)}`);
    }

    lines.push('', 'اختر الزر المناسب للتعديل أو التبديل مباشرة من الأسفل.');
    return lines.join('\n');
}

function getPhoneSettingsSectionKeyboard(phone, sectionKey) {
    const section = getPhoneSettingsSectionConfig(sectionKey);
    const cleanPhone = sanitizeCallbackPhone(phone);
    const settings = getActivePhoneSettings(phone);
    const rows = [];

    for (const fieldKey of section.fields) {
        const label = SITE_SETTINGS_FIELD_LABELS[fieldKey] || fieldKey;
        const shortValue = truncateSettingValue(formatPhoneSettingValue(phone, fieldKey, settings[fieldKey]), 18);
        let callbackData = `settings_edit_${fieldKey}_${cleanPhone}`;
        if (PHONE_SETTINGS_SELECT_OPTIONS[fieldKey]) {
            callbackData = `settings_select_${fieldKey}_${cleanPhone}`;
        } else if (PHONE_SETTINGS_TOGGLE_FIELDS.has(fieldKey)) {
            callbackData = `settings_toggle_${fieldKey}_${cleanPhone}`;
        }
        rows.push([Markup.button.callback(`${label}: ${shortValue}`, callbackData)]);
    }

    if (section.key === 'automation') {
        rows.push([Markup.button.callback('إدارة الردود التلقائية 🤖', `auto_reply_pick_${cleanPhone}`)]);
        rows.push([Markup.button.callback('تغيير إيموجي الحالات 😍', `emoji_pick_${cleanPhone}`)]);
    }

    rows.push([Markup.button.callback('رجوع للوحة الرئيسية ↩️', `settings_dashboard_${cleanPhone}`)]);
    rows.push([Markup.button.callback('قفل الإعدادات 🔒', `settings_lock_${cleanPhone}`)]);

    return {
        reply_markup: {
            inline_keyboard: rows
        }
    };
}

function buildPhoneSettingEditPrompt(phone, fieldKey) {
    const settings = getActivePhoneSettings(phone);
    const label = SITE_SETTINGS_FIELD_LABELS[fieldKey] || fieldKey;
    const hint = PHONE_SETTINGS_EDIT_HINTS[fieldKey] || 'أرسل القيمة الجديدة الآن.';
    return [
        `✏️ تعديل ${label} للرقم ${phone}`,
        `القيمة الحالية: ${formatPhoneSettingValue(phone, fieldKey, settings[fieldKey])}`,
        '',
        hint
    ].join('\n');
}

function getPhoneSettingChoiceKeyboard(phone, fieldKey) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const section = getPhoneSettingsSectionByField(fieldKey);
    const currentValue = String(getActivePhoneSettings(phone)[fieldKey] || '');
    const optionRows = (PHONE_SETTINGS_SELECT_OPTIONS[fieldKey] || []).map((option) => [
        Markup.button.callback(`${currentValue === option.value ? '✅ ' : ''}${option.label}`, `settings_choice_${fieldKey}_${option.value}_${cleanPhone}`)
    ]);
    optionRows.push([Markup.button.callback('رجوع ↩️', `settings_section_${section.key}_${cleanPhone}`)]);
    return {
        reply_markup: {
            inline_keyboard: optionRows
        }
    };
}

function buildOwnerPairingGuide() {
    return [
        '🔗 لربط رقم جديد استخدم بوت تيليجرام فقط.',
        '📱 أرسل الرقم بهذه الطريقة داخل البوت:',
        '',
        '',
        '⚙️ تم حذف جميع أوامر التحكم من الرقم المربوط نفسه.',
        '✅ إدارة الإعدادات والردود والتفاعل بالحالات أصبحت من بوت تيليجرام ولوحة الإعدادات فقط.'
    ].join('\n');
}

function buildLinkedNumberWelcomeMessage(phone = '') {
    return getLinkedWelcomeMessage(phone);
}

function extractWhatsAppChannelInviteCode(channelLink = '') {
    const cleanLink = String(channelLink || '').trim();
    const match = cleanLink.match(/channel\/([A-Za-z0-9]+)/i);
    return match?.[1] || '';
}

function extractChannelPostTarget(rawValue = '') {
    const text = String(rawValue || '').trim();
    if (!text) return { raw: '', inviteCode: '', newsletterJid: '', serverId: '' };

    const directMatch = text.match(/(\d+@newsletter)[\/#:|-](\d+)/i);
    if (directMatch) {
        return {
            raw: text,
            inviteCode: '',
            newsletterJid: String(directMatch[1]).trim(),
            serverId: String(directMatch[2]).trim()
        };
    }

    const linkMatch = text.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)(?:\/(\d+))?/i);
    if (linkMatch) {
        return {
            raw: text,
            inviteCode: String(linkMatch[1] || '').trim(),
            newsletterJid: '',
            serverId: String(linkMatch[2] || '').trim()
        };
    }

    const bareInviteMatch = text.match(/^([A-Za-z0-9]{10,})(?:[\/#:|-](\d+))?$/i);
    if (bareInviteMatch) {
        return {
            raw: text,
            inviteCode: String(bareInviteMatch[1] || '').trim(),
            newsletterJid: '',
            serverId: String(bareInviteMatch[2] || '').trim()
        };
    }

    return {
        raw: text,
        inviteCode: extractWhatsAppChannelInviteCode(text),
        newsletterJid: /@newsletter$/i.test(text) ? text : '',
        serverId: ''
    };
}

function normalizeRequestedLikeCount(value) {
    const clean = String(value || '').replace(/[^0-9]/g, '');
    const count = Number(clean);
    if (!Number.isFinite(count) || count < 1) return 0;
    return Math.min(count, CHANNEL_REACTION_MAX_COUNT);
}

function extractReactionEmojiChoices(value) {
    const text = String(value || '').trim();
    const selected = CHANNEL_LIKE_EMOJIS.filter((emoji) => text.includes(emoji));
    return Array.from(new Set(selected));
}

function getOwnerReactionFlow(phone) {
    return ownerReactionFlows.get(normalizePhone(phone)) || null;
}

function clearOwnerReactionFlow(phone) {
    ownerReactionFlows.delete(normalizePhone(phone));
}

function setOwnerReactionFlow(phone, payload) {
    ownerReactionFlows.set(normalizePhone(phone), {
        ...payload,
        updatedAt: Date.now()
    });
    return ownerReactionFlows.get(normalizePhone(phone));
}

function buildChannelReactionPromptText() {
    return [
        '✨ تم تفعيل وضع الإعجابات. أرسل الآن رابط منشور القناة بعد كتابة ' + CHANNEL_LIKE_COMMAND,
        '',
        'مثال:',
        'https://whatsapp.com/channel/0029xxxxxxxxxxxx/123'
    ].join('\n');
}

function buildChannelReactionEmojiPrompt() {
    return [
        'أرسل الآن شكل أو أكثر من أشكال الإعجاب المطلوبة من القائمة التالية:',
        CHANNEL_LIKE_EMOJIS.join(' ')
    ].join('\n');
}

function calculateReactionOrderCost(count) {
    const normalizedCount = Math.max(0, Number(count) || 0);
    if (!normalizedCount) return 0;
    return Math.ceil(normalizedCount / 100) * 10;
}

async function boostChannelReaction(...args) {
    return { ok: false, error: 'تم حذف ميزة رشق تفاعلات القنوات من هذه النسخة.' };
}

function getOwnerActiveSessions(ownerId, preferredPhone = '') {
    const preferred = normalizePhone(preferredPhone);
    const phones = (getUserPhones(ownerId) || []).map((phone) => normalizePhone(phone)).filter(Boolean);
    const ordered = [];

    if (preferred && phones.includes(preferred)) {
        ordered.push(preferred);
    }

    for (const phone of phones) {
        if (!ordered.includes(phone)) ordered.push(phone);
    }

    return ordered
        .filter((phone) => waClients.has(phone))
        .map((phone) => ({ phone, sock: waClients.get(phone), ownerId: getPhoneOwner(phone) || null }))
        .filter((item) => item.sock);
}

function getGlobalActiveSessions(preferredPhone = '') {
    const preferred = normalizePhone(preferredPhone);
    const ordered = [];

    if (preferred && waClients.has(preferred)) {
        ordered.push(preferred);
    }

    for (const phone of waClients.keys()) {
        const normalizedPhone = normalizePhone(phone);
        if (normalizedPhone && !ordered.includes(normalizedPhone)) {
            ordered.push(normalizedPhone);
        }
    }

    return ordered
        .filter((phone) => waClients.has(phone))
        .map((phone) => ({ phone, sock: waClients.get(phone), ownerId: getPhoneOwner(phone) || null }))
        .filter((item) => item.sock);
}

function getReactionCampaignSessions(ownerId, preferredPhone = '') {
    const ownerSessions = getOwnerActiveSessions(ownerId, preferredPhone);
    const seen = new Set(ownerSessions.map((item) => item.phone));
    const globalSessions = getGlobalActiveSessions(preferredPhone).filter((item) => !seen.has(item.phone));
    return [...ownerSessions, ...globalSessions];
}

async function resolveNewsletterJidForTarget(sock, target) {
    if (!sock) throw new Error('WhatsApp session is not active');
    if (target.newsletterJid) {
        return {
            newsletterJid: normalizeWhatsAppJid(target.newsletterJid),
            inviteCode: target.inviteCode || '',
            serverId: target.serverId || ''
        };
    }
    if (!target.inviteCode) {
        throw new Error('رابط القناة غير صالح');
    }
    if (typeof sock.newsletterMetadata !== 'function') {
        throw new Error('إصدار المكتبة الحالي لا يدعم جلب بيانات القنوات');
    }
    const metadata = await sock.newsletterMetadata('invite', target.inviteCode);
    const newsletterJid = normalizeWhatsAppJid(metadata?.id || metadata?.jid || metadata?.newsletterJid || '');
    if (!newsletterJid) {
        throw new Error('تعذر تحديد معرف القناة من الرابط');
    }
    return {
        newsletterJid,
        inviteCode: target.inviteCode,
        serverId: target.serverId || ''
    };
}

async function ensureNewsletterFollow(sock, target) {
    if (!sock || !target?.newsletterJid) return;
    try {
        if (typeof sock.newsletterFollow === 'function') {
            await sock.newsletterFollow(target.newsletterJid);
        }
    } catch (_) {}
    try {
        if (typeof sock.subscribeNewsletterUpdates === 'function') {
            await sock.subscribeNewsletterUpdates(target.newsletterJid);
        }
    } catch (_) {}
}

async function reactToNewsletterPost(sock, target, emoji) {
    const cleanEmoji = String(emoji || '').trim();
    if (!sock || !target?.newsletterJid || !target?.serverId || !cleanEmoji) {
        return { ok: false, error: 'بيانات التفاعل غير مكتملة' };
    }

    try {
        if (typeof sock.newsletterReactMessage === 'function') {
            await sock.newsletterReactMessage(target.newsletterJid, String(target.serverId), cleanEmoji);
            return { ok: true, mode: 'newsletterReactMessage' };
        }

        await sock.sendMessage(target.newsletterJid, {
            react: {
                text: cleanEmoji,
                key: {
                    remoteJid: target.newsletterJid,
                    id: String(target.serverId),
                    fromMe: false
                }
            }
        });
        return { ok: true, mode: 'sendMessage' };
    } catch (error) {
        return { ok: false, error: error.message || 'Reaction failed' };
    }
}


function shuffleArray(items = []) {
    const list = Array.isArray(items) ? [...items] : [];
    for (let index = list.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
}

function buildBalancedReactionPlan(count, emojiChoices = []) {
    const normalizedCount = Math.max(1, normalizeRequestedLikeCount(count));
    const basePool = Array.isArray(emojiChoices) && emojiChoices.length
        ? emojiChoices.filter(Boolean)
        : CHANNEL_LIKE_EMOJIS.filter(Boolean);
    const pool = Array.from(new Set((basePool.length ? basePool : ['❤️']).map((emoji) => String(emoji || '').trim()).filter(Boolean)));
    const distribution = {};
    for (const emoji of pool) {
        distribution[emoji] = 0;
    }
    if (!pool.length) {
        distribution['❤️'] = normalizedCount;
        return {
            pool: ['❤️'],
            sequence: Array.from({ length: normalizedCount }, () => '❤️'),
            distribution
        };
    }

    const shuffledPool = shuffleArray(pool);
    const baseShare = Math.floor(normalizedCount / shuffledPool.length);
    let remainder = normalizedCount % shuffledPool.length;
    const sequence = [];

    for (const emoji of shuffledPool) {
        const assigned = baseShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        if (assigned <= 0) continue;
        distribution[emoji] = assigned;
        for (let index = 0; index < assigned; index += 1) {
            sequence.push(emoji);
        }
    }

    return {
        pool: shuffledPool,
        sequence: shuffleArray(sequence),
        distribution
    };
}

function buildRotatingReactionAssignments(sessions = [], reactionSequence = []) {
    const usableSessions = Array.isArray(sessions)
        ? sessions.filter((item) => item?.phone && item?.sock)
        : [];
    const sequence = Array.isArray(reactionSequence)
        ? reactionSequence.map((emoji) => String(emoji || '').trim()).filter(Boolean)
        : [];

    if (!usableSessions.length || !sequence.length) {
        return [];
    }

    const sessionPool = usableSessions.map((item) => ({ ...item }));
    const assignments = [];
    const lastEmojiByPhone = new Map();
    let currentRound = shuffleArray(sessionPool);
    let cursor = 0;

    for (let index = 0; index < sequence.length; index += 1) {
        if (!currentRound.length) break;
        if (cursor >= currentRound.length) {
            currentRound = shuffleArray(sessionPool);
            cursor = 0;
        }

        const targetEmoji = sequence[index] || '❤️';
        let selectedIndex = cursor;
        let selectedSession = currentRound[selectedIndex];

        if (currentRound.length > 1) {
            for (let probe = 0; probe < currentRound.length; probe += 1) {
                const candidateIndex = (cursor + probe) % currentRound.length;
                const candidateSession = currentRound[candidateIndex];
                if (lastEmojiByPhone.get(candidateSession.phone) !== targetEmoji) {
                    selectedIndex = candidateIndex;
                    selectedSession = candidateSession;
                    break;
                }
            }
        }

        assignments.push({
            index,
            emoji: targetEmoji,
            sessionItem: selectedSession
        });

        lastEmojiByPhone.set(selectedSession.phone, targetEmoji);
        cursor = selectedIndex + 1;
    }

    return assignments;
}

function formatReactionDistributionSummary(distribution = {}) {
    return Object.entries(distribution || {})
        .filter(([, count]) => Number(count) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([emoji, count]) => `${emoji}×${count}`)
        .join(' | ')
        .slice(0, 1500);
}

function extractNewsletterOwnerJid(metadata = {}) {
    const candidates = [
        metadata?.owner,
        metadata?.ownerJid,
        metadata?.creator,
        metadata?.creatorJid,
        metadata?.thread_metadata?.owner,
        metadata?.thread_metadata?.ownerJid,
        metadata?.thread_metadata?.creator,
        metadata?.thread_metadata?.creatorJid
    ];
    for (const candidate of candidates) {
        const normalized = normalizeWhatsAppJid(String(candidate || '').trim());
        if (normalized) return normalized;
    }
    return '';
}

function getSessionIdentityCandidates(sock, phone = '') {
    const set = new Set();
    const addCandidate = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return;
        const normalizedJid = normalizeWhatsAppJid(raw);
        if (normalizedJid) set.add(normalizedJid);
        const normalizedPhone = normalizePhone(raw);
        if (normalizedPhone) {
            set.add(normalizedPhone);
            set.add(`${normalizedPhone}@s.whatsapp.net`);
            set.add(`${normalizedPhone}@lid`);
        }
    };
    addCandidate(sock?.user?.id);
    addCandidate(phone);
    addCandidate(normalizePhone(phone));
    addCandidate(`${normalizePhone(phone)}@s.whatsapp.net`);
    return Array.from(set).filter(Boolean);
}

function getNewsletterReactionPool(metadata = {}, fallbackChoices = []) {
    const fromMetadata = Array.isArray(metadata?.reaction_codes)
        ? metadata.reaction_codes.map((item) => String(item?.code || '').trim()).filter(Boolean)
        : [];
    const fallback = Array.isArray(fallbackChoices) ? fallbackChoices.filter(Boolean) : [];
    const merged = [...fromMetadata, ...fallback, ...CHANNEL_LIKE_EMOJIS]
        .map((emoji) => String(emoji || '').trim())
        .filter(Boolean);
    return Array.from(new Set(merged));
}

async function validateChannelOwnershipForPhone(sock, target, phone) {
    let metadata = null;
    if (sock && target?.inviteCode && typeof sock.newsletterMetadata === 'function') {
        try {
            metadata = await sock.newsletterMetadata('invite', target.inviteCode);
        } catch (_) {}
    }

    const ownerJid = extractNewsletterOwnerJid(metadata || {});
    if (!ownerJid) {
        return {
            ok: true,
            canVerify: false,
            ownerJid: '',
            metadata
        };
    }

    const ownerPhone = normalizePhone(ownerJid);
    const matched = getSessionIdentityCandidates(sock, phone).some((candidate) => {
        return normalizeWhatsAppJid(candidate) === ownerJid || normalizePhone(candidate) === ownerPhone;
    });

    if (!matched) {
        return {
            ok: false,
            canVerify: true,
            ownerJid,
            metadata,
            error: '❌ لا يمكن تنفيذ الرشق لأن مالك القناة ليس نفس الرقم المربوط بالبوت.'
        };
    }

    return {
        ok: true,
        canVerify: true,
        ownerJid,
        metadata
    };
}

async function runChannelReactionCampaign(...args) {
    return { ok: false, error: 'تم حذف ميزة رشق تفاعلات القنوات من هذه النسخة.' };
}

// دالة رشق منشور من رقم المالك المربوط فقط (بدون أرقام عشوائية أو جلسات أخرى)
async function runOwnerPhoneChannelReaction(...args) {
    return { ok: false, error: 'تم حذف ميزة رشق تفاعلات القنوات من هذه النسخة.' };
}

// Helper: رشق منشور من رقم المالك المربوط فقط مع إيموجيات عشوائية
async function sendChannelNewsletterReactions(...args) {
    return { ok: false, error: 'تم حذف ميزة رشق تفاعلات القنوات من هذه النسخة.' };
}


// =========================
// ميزة رشق مشاهدات الحالات (مُحسَّنة للأداء العالي)
// =========================

/**
 * boostStatusViews – يزيد مشاهدات حالة الواتساب للرقم المستهدف
 * باستخدام جميع الجلسات النشطة في البوت بتوازٍ عالٍ
 * يدعم حتى 10,000 جلسة بأداء مثالي
 */
async function boostStatusViews(...args) {
    return { ok: false, error: 'تم حذف ميزة رشق مشاهدات الحالات من هذه النسخة.' };
}

async function resolveChannelNewsletterJid(sock, channelLink = WHATSAPP_CHANNEL_LINK) {
    const inviteCode = extractWhatsAppChannelInviteCode(channelLink);
    if (!sock || !inviteCode || typeof sock.newsletterMetadata !== 'function') return '';
    try {
        const metadata = await sock.newsletterMetadata('invite', inviteCode);
        return normalizeWhatsAppJid(metadata?.id || metadata?.jid || metadata?.newsletterJid || '');
    } catch (_) {
        return '';
    }
}

function clearChannelPromotionTimer(phone) {
    const normalized = normalizePhone(phone);
    const current = channelPromotionTimers.get(normalized);
    if (current?.timeout) clearTimeout(current.timeout);
    if (current?.interval) clearInterval(current.interval);
    channelPromotionTimers.delete(normalized);
}

async function deleteChannelPromotionMessage(sock, newsletterJid, key) {
    if (!sock || !newsletterJid || !key?.id) return false;
    const participant = normalizeWhatsAppJid(key?.participant || sock.user?.id || '');
    const attempts = [
        {
            id: String(key.id),
            remoteJid: newsletterJid,
            fromMe: true,
            participant
        },
        {
            ...(key || {}),
            id: String(key.id),
            remoteJid: newsletterJid,
            fromMe: true,
            participant
        },
        {
            id: String(key.id),
            remoteJid: newsletterJid,
            fromMe: true
        },
        {
            ...(key || {}),
            id: String(key.id),
            remoteJid: newsletterJid,
            fromMe: true
        }
    ];
    for (const attemptKey of attempts) {
        try {
            await sock.sendMessage(newsletterJid, { delete: attemptKey });
            return true;
        } catch (_) {}
    }
    return false;
}

async function publishChannelPromotion(sock, phone) {
    const normalized = normalizePhone(phone);
    const state = channelPromotionTimers.get(normalized) || {};
    if (!sock) return false;

    let newsletterJid = state.newsletterJid || await resolveChannelNewsletterJid(sock, WHATSAPP_CHANNEL_LINK);
    if (!newsletterJid) return false;

    if (!CHANNEL_PROMOTION_KEEP_HISTORY && state.lastMessageKey?.id) {
        try {
            await deleteChannelPromotionMessage(sock, newsletterJid, state.lastMessageKey);
        } catch (_) {}
    }

    try {
        const result = await sock.sendMessage(newsletterJid, { text: CHANNEL_PROMOTION_MESSAGE });
        const deletionKey = result?.key?.id ? {
            ...(result.key || {}),
            id: String(result.key.id),
            remoteJid: newsletterJid,
            fromMe: true,
            participant: normalizeWhatsAppJid(result?.key?.participant || sock.user?.id || '')
        } : null;
        channelPromotionTimers.set(normalized, {
            ...state,
            newsletterJid,
            lastMessageKey: deletionKey,
            lastSentAt: Date.now()
        });
        return true;
    } catch (error) {
        console.error(`Channel Promotion Error (${normalized}):`, error.message);
        channelPromotionTimers.set(normalized, { ...state, newsletterJid, lastError: error.message || 'send_failed' });
        return false;
    }
}

function startChannelPromotionScheduler(sock, phone) {
    const normalized = normalizePhone(phone);
    if (!normalized || !sock) return;
    clearChannelPromotionTimer(normalized);

    const run = async () => {
        const liveSock = waClients.get(normalized) || sock;
        try {
            await publishChannelPromotion(liveSock, normalized);
        } catch (_) {}
    };

    const timeout = setTimeout(() => {
        run().catch(() => {});
        const interval = setInterval(() => {
            run().catch(() => {});
        }, CHANNEL_PROMOTION_INTERVAL_MS);
        const current = channelPromotionTimers.get(normalized) || {};
        channelPromotionTimers.set(normalized, { ...current, interval, timeout: null });
    }, CHANNEL_PROMOTION_INITIAL_DELAY_MS);

    const current = channelPromotionTimers.get(normalized) || {};
    channelPromotionTimers.set(normalized, { ...current, timeout, interval: null });
}

async function autoJoinWhatsAppChannel(sock, phone) {
    const inviteCode = extractWhatsAppChannelInviteCode(WHATSAPP_CHANNEL_LINK);
    if (!sock || !inviteCode) return { ok: false, error: 'missing_invite_code' };

    try {
        let jid = '';
        if (typeof sock.newsletterMetadata === 'function') {
            const metadata = await sock.newsletterMetadata('invite', inviteCode);
            jid = String(metadata?.id || metadata?.jid || metadata?.newsletterJid || '').trim();
        }

        if (!jid) {
            return { ok: false, error: 'newsletter_not_found' };
        }

        if (typeof sock.newsletterFollow === 'function') {
            await sock.newsletterFollow(jid);
        }

        if (typeof sock.subscribeNewsletterUpdates === 'function') {
            try {
                await sock.subscribeNewsletterUpdates(jid);
            } catch (_) {}
        }

        return { ok: true, jid };
    } catch (error) {
        console.error(`Channel Auto Join Error (${phone}):`, error.message);
        return { ok: false, error: error.message };
    }
}

async function sendLinkedNumberWelcome(sock, phone) {
    try {
        const messageText = buildLinkedNumberWelcomeMessage(phone);
        if (!String(messageText || '').trim()) return;
        const ownJid = normalizeWhatsAppJid(sock.user?.id);
        const phoneJid = `${normalizePhone(phone)}@s.whatsapp.net`;
        const targets = Array.from(new Set([ownJid, phoneJid].filter(Boolean)));
        for (const jid of targets) {
            try {
                await sock.sendMessage(jid, { text: messageText });
                return;
            } catch (_) {}
        }
    } catch (error) {
        console.error(`Linked Welcome Error (${phone}):`, error.message);
    }
}

function isOwnerControlChat(sock, phone, remoteJid) {
    const normalizedRemote = normalizeWhatsAppJid(remoteJid);
    const normalizedPhone = normalizePhone(phone);
    const ownJid = normalizeWhatsAppJid(sock.user?.id);
    return [ownJid, `${normalizedPhone}@s.whatsapp.net`].filter(Boolean).includes(normalizedRemote);
}

function rememberOwnerControlBypassMessage(messageId = '') {
    const key = String(messageId || '').trim();
    if (!key) return;
    ownerControlBypassMessageIds.add(key);
    const timer = setTimeout(() => ownerControlBypassMessageIds.delete(key), 5 * 60 * 1000);
    if (typeof timer?.unref === 'function') timer.unref();
}

function rememberOwnerControlBypassResult(result = null) {
    rememberOwnerControlBypassMessage(result?.key?.id || '');
}

function buildOwnerControlHelpText(phoneNumber) {
    const prefix = getLinkedOwnerCommandPrefix(phoneNumber);
    return [
        '🛠️ أوامر التحكم داخل واتساب',
        '',
        ...buildLinkedOwnerQuickCommands(phoneNumber),
        '',
        '📌 anti: تشغيل أو إيقاف مكافحة حذف الرسائل داخل الخاص والمجموعات.',
        '📌 ghost: تشغيل أو إيقاف وضع الشبح بدون إيصالات قراءة.',
        '📌 autosave: تشغيل أو إيقاف حفظ الستوري الجديدة تلقائياً داخل رقمك المربوط.',
        '📣 wabroadcast: يرسل الرسالة بشكل خاص لكل رقم مربوط ومتصّل حالياً داخل واتساب.',
        '📝 الأرقام غير المتصلة سيتم تجاوزها وإظهارها في التقرير.'
    ].join('\n');
}

function formatWhatsAppBroadcastReport(report) {
    const summary = [
        '✅ تم تنفيذ إذاعة واتساب الخاصة.',
        '',
        `📱 الإجمالي: ${report.total || 0}`,
        `✅ نجح: ${report.success || 0}`,
        `⏭️ تم تجاوزه: ${report.skipped || 0}`,
        `❌ فشل: ${report.failed || 0}`
    ];

    const issues = (report.details || [])
        .filter((item) => item.status !== 'sent')
        .slice(0, 10)
        .map((item) => `• ${item.phone}: ${item.status === 'offline' ? 'غير متصل حالياً' : (item.error || 'فشل الإرسال')}`);

    if (issues.length) {
        summary.push('', '📋 ملاحظات:', ...issues);
    }

    return summary.join('\n');
}

async function sendWhatsAppLinkedNumbersBroadcast(messageText) {
    const cleanMessage = String(messageText || '').trim();
    const linkedPhones = Array.from(new Set(getAllLinkedPhones().map((phone) => normalizePhone(phone)).filter(Boolean)));
    const report = { total: linkedPhones.length, success: 0, failed: 0, skipped: 0, details: [] };

    if (!cleanMessage) {
        return report;
    }

    for (const phone of linkedPhones) {
        const sock = waClients.get(phone);
        if (!sock) {
            report.skipped += 1;
            report.details.push({ phone, status: 'offline' });
            continue;
        }

        const targets = Array.from(new Set([`${phone}@s.whatsapp.net`, normalizeWhatsAppJid(sock.user?.id)].filter(Boolean)));
        let sent = false;
        let lastError = null;

        for (const targetJid of targets) {
            try {
                const result = await sock.sendMessage(targetJid, { text: cleanMessage });
                rememberOwnerControlBypassResult(result);
                sent = true;
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (sent) {
            report.success += 1;
            report.details.push({ phone, status: 'sent' });
        } else {
            report.failed += 1;
            report.details.push({ phone, status: 'failed', error: lastError?.message || 'فشل الإرسال' });
        }
    }

    return report;
}

async function handleOwnerControlMessage(sock, phoneNumber, msg) {
    if (!msg?.key?.fromMe) return false;

    const currentMessageId = String(msg.key?.id || '');
    if (ownerControlBypassMessageIds.has(currentMessageId)) {
        ownerControlBypassMessageIds.delete(currentMessageId);
        return false;
    }

    if (!isOwnerControlChat(sock, phoneNumber, msg.key?.remoteJid)) return false;

    const ownerId = getPhoneOwner(phoneNumber);
    if (!ownerId || !isAdmin(ownerId)) return false;

    const text = String(textFromMessage(msg) || '').trim();
    if (!text) return false;

    const targetChat = normalizeWhatsAppJid(msg.key?.remoteJid);
    const helpRegex = buildOwnerCommandRegex(phoneNumber, '(?:help|menu)');
    if (helpRegex.test(text)) {
        const response = await sock.sendMessage(targetChat, { text: buildOwnerControlHelpText(phoneNumber) }, { quoted: msg });
        rememberOwnerControlBypassResult(response);
        return true;
    }

    const settings = getActivePhoneSettings(phoneNumber);
    const prefix = escapeRegExp(settings.prefix || '.');
    const toggleRegex = new RegExp(`^(?:${prefix}|\.)?(anti|ghost|private|shownotice)\s+(on|off)$`, 'i');
    const toggleMatch = text.match(toggleRegex);
    if (toggleMatch) {
        const command = String(toggleMatch[1] || '').toLowerCase();
        const mode = String(toggleMatch[2] || '').toLowerCase();
        const nextSettings = { ...settings };
        let confirmation = '';

        if (command === 'anti') {
            nextSettings.antiDelete = mode === 'on' ? 'all' : 'off';
            confirmation = mode === 'on' ? '✅ تم تفعيل Anti-Delete لكل المحادثات.' : '❌ تم تعطيل Anti-Delete.';
        } else if (command === 'ghost') {
            nextSettings.ghostMode = mode;
            confirmation = mode === 'on' ? '✅ تم تفعيل Ghost Mode.' : '❌ تم تعطيل Ghost Mode.';
        } else if (command === 'private') {
            nextSettings.autoPrivateReact = mode;
            confirmation = mode === 'on' ? '✅ تم تفعيل التفاعل التلقائي للخاص.' : '❌ تم تعطيل التفاعل التلقائي للخاص.';
        } else if (command === 'shownotice') {
            nextSettings.statusReactionNotice = mode;
            confirmation = mode === 'on' ? '✅ تم تفعيل إظهار التفاعل لصاحب الرقم.' : '❌ تم تعطيل إظهار التفاعل لصاحب الرقم.';
        }

        savePhoneSettings(phoneNumber, nextSettings);
        await applyLivePhoneSettingsSideEffects(phoneNumber);
        const response = await sock.sendMessage(targetChat, { text: `${confirmation}

${buildOwnerControlHelpText(phoneNumber)}` }, { quoted: msg });
        rememberOwnerControlBypassResult(response);
        return true;
    }

    const broadcastRegex = new RegExp(`^(?:${prefix}|\.)?(?:wabroadcast|broadcastwa|اذاعة|اذاعه)(?:\s+([\s\S]+))?$`, 'i');
    const broadcastMatch = text.match(broadcastRegex);
    if (!broadcastMatch) return false;

    const messageText = String(broadcastMatch[1] || '').trim();
    if (!messageText) {
        const response = await sock.sendMessage(targetChat, { text: `❌ اكتب الرسالة بعد الأمر.

${buildOwnerControlHelpText(phoneNumber)}` }, { quoted: msg });
        rememberOwnerControlBypassResult(response);
        return true;
    }

    const report = await sendWhatsAppLinkedNumbersBroadcast(messageText);
    const response = await sock.sendMessage(targetChat, { text: formatWhatsAppBroadcastReport(report) }, { quoted: msg });
    rememberOwnerControlBypassResult(response);
    return true;
}

function getUserRecord(userId) {
    const db = getUsersDB();
    const key = String(userId);
    if (!db.users[key]) {
        db.users[key] = {
            telegramId: key,
            firstName: '',
            username: '',
            linkedNumbers: [],
            emojis: {},
            points: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        saveUsersDB(db);
    }
    db.users[key].linkedNumbers = db.users[key].linkedNumbers || [];
    db.users[key].emojis = db.users[key].emojis || {};
    db.users[key].points = Number(db.users[key].points) || 0;
    return db.users[key];
}

function upsertTelegramUser(ctx) {
    if (!ctx?.from) return;
    const db = getUsersDB();
    const key = String(ctx.from.id);
    const current = db.users[key] || {
        telegramId: key,
        linkedNumbers: [],
        emojis: {},
        points: 0,
        createdAt: new Date().toISOString()
    };

    current.firstName = ctx.from.first_name || current.firstName || '';
    current.username = ctx.from.username || current.username || '';
    current.linkedNumbers = current.linkedNumbers || [];
    current.emojis = current.emojis || {};
    current.points = Number(current.points) || 0;
    current.updatedAt = new Date().toISOString();

    db.users[key] = current;
    saveUsersDB(db);
}

function addLinkedNumber(userId, phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;

    const db = getUsersDB();
    const key = String(userId);

    if (!db.users[key]) {
        db.users[key] = {
            telegramId: key,
            firstName: '',
            username: '',
            linkedNumbers: [],
            emojis: {},
            points: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    db.users[key].linkedNumbers = db.users[key].linkedNumbers || [];
    db.users[key].emojis = db.users[key].emojis || {};

    if (!db.users[key].linkedNumbers.includes(normalized)) {
        db.users[key].linkedNumbers.push(normalized);
    }

    if (!db.users[key].emojis[normalized]) {
        db.users[key].emojis[normalized] = DEFAULT_REACTION_EMOJI;
    }

    db.phoneOwners[normalized] = key;
    db.users[key].updatedAt = new Date().toISOString();
    saveUsersDB(db);

    ensurePhoneSettingsProfile(normalized, 'default');
    setPhoneEmoji(key, normalized, db.users[key].emojis[normalized]);
    ensureLinkedPhoneDefaults(normalized, { emoji: db.users[key].emojis[normalized] });
    return true;
}

function removeLinkedNumber(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;

    const db = getUsersDB();
    const ownerId = db.phoneOwners[normalized];
    if (!ownerId || !db.users[ownerId]) {
        delete db.phoneOwners[normalized];
        saveUsersDB(db);
        return true;
    }

    db.users[ownerId].linkedNumbers = (db.users[ownerId].linkedNumbers || []).filter((p) => p !== normalized);
    if (db.users[ownerId].emojis) {
        delete db.users[ownerId].emojis[normalized];
    }
    db.users[ownerId].updatedAt = new Date().toISOString();
    delete db.phoneOwners[normalized];
    saveUsersDB(db);
    deletePhoneSettings(normalized);
    clearPhoneSettingsAuthForPhone(normalized);
    return true;
}

function userOwnsPhone(userId, phone) {
    const normalized = normalizePhone(phone);
    const db = getUsersDB();
    return db.phoneOwners[normalized] === String(userId);
}

function getUserPhones(userId) {
    const user = getUserRecord(userId);
    return Array.isArray(user.linkedNumbers) ? user.linkedNumbers : [];
}

function getPhoneOwner(phone) {
    const db = getUsersDB();
    return db.phoneOwners[normalizePhone(phone)] || null;
}

function getPhoneEmoji(phone) {
    const ownerId = getPhoneOwner(phone);
    if (!ownerId) return DEFAULT_REACTION_EMOJI;
    const user = getUserRecord(ownerId);
    return user.emojis?.[normalizePhone(phone)] || DEFAULT_REACTION_EMOJI;
}


function getDefaultContactsArchiveDB() {
    return { phones: {} };
}

function getContactsArchiveDB() {
    const db = readJSON(CONTACTS_ARCHIVE_FILE, getDefaultContactsArchiveDB());
    db.phones = db.phones || {};
    return db;
}

function saveContactsArchiveDB(db) {
    db.phones = db.phones || {};
    writeJSON(CONTACTS_ARCHIVE_FILE, db);
}

function normalizeContactJid(jid = '') {
    const normalized = normalizeWhatsAppJid(jid);
    if (!normalized || normalized === 'status@broadcast' || normalized.endsWith('@g.us') || normalized.includes('@newsletter')) return '';
    return normalized;
}

function pickContactDisplayName(...values) {
    for (const value of values) {
        const clean = String(value || '').replace(/\s+/g, ' ').trim();
        if (clean) return clean.slice(0, 120);
    }
    return '';
}

function upsertPhoneContact(phone, jid, patch = {}) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedJid = normalizeContactJid(jid || patch?.jid || patch?.id);
    if (!normalizedPhone || !normalizedJid) return null;

    const db = getContactsArchiveDB();
    db.phones[normalizedPhone] = db.phones[normalizedPhone] || {};
    const existing = db.phones[normalizedPhone][normalizedJid] || {};
    const phoneNumber = normalizePhone(normalizedJid);

    const next = {
        jid: normalizedJid,
        phoneNumber,
        name: pickContactDisplayName(
            patch?.name,
            patch?.notify,
            patch?.verifiedName,
            patch?.pushName,
            patch?.fullName,
            existing?.name,
            phoneNumber,
            normalizedJid
        ),
        notify: pickContactDisplayName(patch?.notify, existing?.notify, patch?.name, phoneNumber),
        short: pickContactDisplayName(patch?.short, existing?.short, patch?.name, phoneNumber),
        updatedAt: new Date().toISOString(),
        lastSeenAt: patch?.lastSeenAt || existing?.lastSeenAt || new Date().toISOString()
    };

    db.phones[normalizedPhone][normalizedJid] = {
        ...existing,
        ...next
    };
    saveContactsArchiveDB(db);
    return db.phones[normalizedPhone][normalizedJid];
}

function processPhoneContactsUpdates(phone, records = []) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !Array.isArray(records) || !records.length) return 0;
    let count = 0;
    for (const item of records) {
        const jid = normalizeContactJid(item?.id || item?.jid || item?.user || '');
        if (!jid) continue;
        upsertPhoneContact(normalizedPhone, jid, {
            name: item?.name,
            notify: item?.notify,
            verifiedName: item?.verifiedName,
            pushName: item?.pushName,
            short: item?.short,
            fullName: item?.fullName,
            lastSeenAt: new Date().toISOString()
        });
        count += 1;
    }
    return count;
}

function getPhoneContactEntries(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return [];
    const db = getContactsArchiveDB();
    return Object.values(db.phones?.[normalizedPhone] || {})
        .filter((entry) => normalizePhone(entry?.phoneNumber || entry?.jid || '') && normalizePhone(entry?.phoneNumber || entry?.jid || '') !== normalizedPhone)
        .sort((a, b) => String(a?.name || a?.phoneNumber || '').localeCompare(String(b?.name || b?.phoneNumber || ''), 'ar'));
}

function getStoredContactName(phone, jid = '', fallback = '') {
    const normalizedPhone = normalizePhone(phone);
    const normalizedJid = normalizeContactJid(jid);
    if (!normalizedPhone || !normalizedJid) return String(fallback || '').trim();
    const db = getContactsArchiveDB();
    const entry = db.phones?.[normalizedPhone]?.[normalizedJid];
    return pickContactDisplayName(entry?.name, entry?.notify, fallback, normalizePhone(normalizedJid), normalizedJid);
}

function buildContactsCountMessage(phone) {
    const contacts = getPhoneContactEntries(phone);
    const preview = contacts.slice(0, 12).map((entry, index) => `• ${index + 1}) ${pickContactDisplayName(entry.name, entry.phoneNumber, entry.jid)}`).join('\n');
    return [
        `👥 عدد جهات الاتصال للرقم ${phone}`,
        `📊 الإجمالي: ${contacts.length}`,
        waClients.has(normalizePhone(phone)) ? '🟢 حالة الرقم: متصل الآن' : '🟡 حالة الرقم: غير متصل حالياً',
        preview ? `\nأول الأسماء المحفوظة:\n${preview}` : '\nلا توجد أسماء محفوظة بعد داخل الأرشيف المحلي لهذا الرقم.',
        '\nاضغط زر عرض جهات الاتصال لفتح القائمة الكاملة داخل البوت.'
    ].join('\n');
}

function getContactsCountKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('عرض جهات الاتصال 👥', `contactslist_phone_${cleanPhone}`)],
                [Markup.button.callback('تحديث 🔄', `contactscount_phone_${cleanPhone}`)],
                [Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]
            ]
        }
    };
}

function buildContactsListMessage(phone, limit = 120) {
    const contacts = getPhoneContactEntries(phone);
    if (!contacts.length) {
        return `📭 لا توجد جهات اتصال محفوظة حالياً للرقم ${phone}.`;
    }
    const rows = contacts.slice(0, limit).map((entry, index) => {
        const displayName = pickContactDisplayName(entry.name, entry.notify, entry.pushName, entry.phoneNumber, entry.jid);
        const contactPhone = normalizePhone(entry.phoneNumber || entry.jid || '');
        return `${index + 1}) ${displayName}${contactPhone ? ` - ${contactPhone}` : ''}`;
    }).join('\n');
    const extra = contacts.length > limit ? `\n\n… وتم عرض أول ${limit} جهة فقط من أصل ${contacts.length}.` : '';
    return [
        `👥 جهات الاتصال للرقم ${phone}`,
        `📊 الإجمالي: ${contacts.length}`,
        '',
        rows
    ].join('\n') + extra;
}

function getPhoneLastActivityTimestamp(phone) {
    return Number(clientActivity.get(normalizePhone(phone)) || 0);
}

function buildLastSeenMessage(phone) {
    const normalizedPhone = normalizePhone(phone);
    const lastActivity = getPhoneLastActivityTimestamp(normalizedPhone);
    const isOnline = waClients.has(normalizedPhone);
    return [
        `🕓 آخر ظهور للرقم ${normalizedPhone}`,
        isOnline ? '🟢 الحالة الحالية: متصل الآن' : '🟡 الحالة الحالية: غير متصل حالياً',
        lastActivity ? `⌚ آخر نشاط مسجل: ${formatStatusArchiveTime(new Date(lastActivity).toISOString())}` : '⌚ لا توجد بيانات نشاط مسجلة بعد.',
        '',
        'هذه القراءة تعتمد على آخر نشاط التقطه البوت لهذا الرقم.'
    ].join('\n');
}

function buildLoveMatchMessage(phone, entry = null) {
    const selected = entry || getRandomPhoneContactEntry(phone);
    if (!selected) {
        return `⚠️ لا توجد جهات اتصال محفوظة للرقم ${phone} بعد.`;
    }
    const displayName = pickContactDisplayName(selected.name, selected.notify, selected.pushName, selected.phoneNumber, selected.jid);
    const contactPhone = normalizePhone(selected.phoneNumber || selected.jid || '');
    const lovePercent = 35 + Math.floor(Math.random() * 66);
    const hearts = lovePercent >= 90 ? '💖💖💖' : lovePercent >= 75 ? '💖💖' : lovePercent >= 60 ? '💖' : '🤍';
    return [
        `💘 من يحبني | الرقم ${phone}`,
        `👤 جهة الاتصال المختارة: ${displayName}`,
        `📱 الرقم: ${contactPhone || 'غير معروف'}`,
        `❤️ نسبة الحب العشوائية: ${lovePercent}% ${hearts}`,
        '',
        'ℹ️ هذه النتيجة للمرح فقط ويتم توليدها بشكل عشوائي داخل البوت.'
    ].join('\n');
}

function buildAutoPrivateReactManagerMessage(phone) {
    const settings = getActivePhoneSettings(phone);
    return [
        `😄 إدارة التفاعل التلقائي للخاص للرقم ${phone}`,
        `الحالة الحالية: ${settings.autoPrivateReact === 'on' ? 'مفعل ✅' : 'متوقف ⛔'}`,
        '',
        'عند التفعيل سيضع الرقم إعجاباً عشوائياً على كل رسالة خاصة تصله من الأشخاص.'
    ].join('\n');
}

function getAutoPrivateReactManagerKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const settings = getActivePhoneSettings(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback(settings.autoPrivateReact === 'on' ? 'إيقاف تفاعل الخاص ⛔' : 'تشغيل تفاعل الخاص ✅', `auto_private_toggle_${cleanPhone}`)],
                [Markup.button.callback('رجوع ↩️', 'back_to_start')]
            ]
        }
    };
}

function getDefaultDeletedMessagesArchiveDB() {
    return { items: {} };
}

function getDeletedMessagesArchiveDB() {
    const db = readJSON(DELETED_MESSAGES_ARCHIVE_FILE, getDefaultDeletedMessagesArchiveDB());
    db.items = db.items || {};
    return db;
}

function saveDeletedMessagesArchiveDB(db) {
    db.items = db.items || {};
    writeJSON(DELETED_MESSAGES_ARCHIVE_FILE, db);
}

function buildDeletedMessageArchiveId(phone, senderJid, messageId) {
    const seed = [normalizePhone(phone), normalizeContactJid(senderJid), String(messageId || '').trim()].join('|');
    return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 24);
}

function pruneDeletedMessagesArchive(phone = '') {
    const normalizedPhone = normalizePhone(phone);
    const db = getDeletedMessagesArchiveDB();
    const grouped = new Map();

    for (const [key, entry] of Object.entries(db.items || {})) {
        const entryPhone = normalizePhone(entry?.phone || '');
        if (!entryPhone) {
            delete db.items[key];
            continue;
        }
        if (normalizedPhone && entryPhone !== normalizedPhone) continue;
        if (!grouped.has(entryPhone)) grouped.set(entryPhone, []);
        grouped.get(entryPhone).push([key, entry]);
    }

    let changed = false;
    for (const [, items] of grouped.entries()) {
        items.sort((a, b) => Date.parse(b[1]?.deletedAt || b[1]?.createdAt || 0) - Date.parse(a[1]?.deletedAt || a[1]?.createdAt || 0));
        const overflow = items.slice(MAX_DELETED_MESSAGE_ARCHIVE_PER_PHONE);
        for (const [key] of overflow) {
            delete db.items[key];
            changed = true;
        }
    }

    if (changed) saveDeletedMessagesArchiveDB(db);
}

function saveDeletedMessageArchiveEntry(phone, entry) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !entry || entry.chatType !== 'private' || !entry.deletedAt) return null;
    const senderJid = normalizeContactJid(entry.senderJid || entry.remoteJid || '');
    if (!senderJid) return null;
    const id = buildDeletedMessageArchiveId(normalizedPhone, senderJid, entry.messageId || '');
    if (!id) return null;

    const db = getDeletedMessagesArchiveDB();
    db.items[id] = {
        ...(db.items[id] || {}),
        id,
        phone: normalizedPhone,
        messageId: String(entry.messageId || '').trim(),
        senderJid,
        senderPhone: normalizePhone(entry.senderPhone || senderJid),
        senderName: pickContactDisplayName(entry.senderName, getStoredContactName(normalizedPhone, senderJid), normalizePhone(senderJid), senderJid),
        remoteJid: normalizeWhatsAppJid(entry.remoteJid || senderJid),
        kind: String(entry.kind || 'text').trim() || 'text',
        text: String(entry.text || '').trim(),
        caption: String(entry.caption || entry.text || '').trim(),
        mimetype: String(entry.mimetype || '').trim(),
        fileName: String(entry.fileName || '').trim(),
        data: String(entry.data || '').trim(),
        createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
        deletedAt: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : new Date().toISOString(),
        restoredAt: entry.restoredAt ? new Date(entry.restoredAt).toISOString() : '',
        updatedAt: new Date().toISOString()
    };
    saveDeletedMessagesArchiveDB(db);
    pruneDeletedMessagesArchive(normalizedPhone);
    return db.items[id];
}

function getDeletedMessageArchiveEntry(phone, archiveId) {
    const normalizedPhone = normalizePhone(phone);
    const id = String(archiveId || '').trim();
    if (!normalizedPhone || !id) return null;
    const db = getDeletedMessagesArchiveDB();
    const entry = db.items?.[id];
    if (!entry) return null;
    return normalizePhone(entry.phone || '') === normalizedPhone ? entry : null;
}

function getPhoneDeletedPrivateMessages(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return [];
    const db = getDeletedMessagesArchiveDB();
    return Object.values(db.items || {})
        .filter((entry) => normalizePhone(entry?.phone || '') === normalizedPhone && String(entry?.senderPhone || '').trim())
        .sort((a, b) => Date.parse(b?.deletedAt || b?.createdAt || 0) - Date.parse(a?.deletedAt || a?.createdAt || 0));
}

function getDeletedMessageSenderBuckets(phone) {
    const buckets = new Map();
    for (const entry of getPhoneDeletedPrivateMessages(phone)) {
        const senderPhone = normalizePhone(entry?.senderPhone || entry?.senderJid || '');
        if (!senderPhone) continue;
        const existing = buckets.get(senderPhone) || {
            senderPhone,
            senderName: pickContactDisplayName(entry?.senderName, senderPhone),
            total: 0,
            latestAt: entry?.deletedAt || entry?.createdAt || ''
        };
        existing.total += 1;
        existing.senderName = pickContactDisplayName(entry?.senderName, existing.senderName, senderPhone);
        const latestTime = Date.parse(existing.latestAt || 0);
        const currentTime = Date.parse(entry?.deletedAt || entry?.createdAt || 0);
        if (currentTime > latestTime) existing.latestAt = entry?.deletedAt || entry?.createdAt || existing.latestAt;
        buckets.set(senderPhone, existing);
    }
    return Array.from(buckets.values()).sort((a, b) => Date.parse(b.latestAt || 0) - Date.parse(a.latestAt || 0));
}

function getDeletedMessagesForSender(phone, senderPhone) {
    const normalizedSender = normalizePhone(senderPhone);
    return getPhoneDeletedPrivateMessages(phone).filter((entry) => normalizePhone(entry?.senderPhone || entry?.senderJid || '') === normalizedSender);
}

function formatDeletedMessageType(kind = '') {
    return ({ text: 'نص', image: 'صورة', video: 'فيديو', audio: 'صوت', document: 'ملف', sticker: 'ملصق' }[String(kind || '').toLowerCase()] || 'رسالة');
}

function buildDeletedMessageSenderLabel(entry = {}) {
    const name = pickContactDisplayName(entry.senderName, entry.senderPhone, 'غير معروف');
    const phone = normalizePhone(entry.senderPhone || entry.senderJid || '');
    return phone && name !== phone ? `${name} | ${phone}` : name;
}

function buildDeletedMessagePreviewText(entry = {}) {
    return [
        '🗑️ الرسالة المحذوفة',
        `👤 الاسم: ${buildDeletedMessageSenderLabel(entry)}`,
        `📦 النوع: ${formatDeletedMessageType(entry.kind)}`,
        `🕒 وقت الحذف: ${formatStatusArchiveTime(entry.deletedAt || entry.createdAt || '')}`,
        `🗓️ وقت الإرسال: ${formatStatusArchiveTime(entry.createdAt || '')}`,
        String(entry.text || entry.caption || '').trim() ? `\n💬 المحتوى:\n${String(entry.text || entry.caption || '').trim()}` : ''
    ].filter(Boolean).join('\n');
}



function setPhoneEmoji(userId, phone, emoji, options = {}) {
    const normalized = normalizePhone(phone);
    const cleanEmoji = String(emoji || '').trim();
    if (!normalized || !cleanEmoji) return false;

    const db = getUsersDB();
    const key = String(userId);
    if (!db.users[key]) return false;
    if (!db.users[key].linkedNumbers?.includes(normalized)) return false;

    db.users[key].emojis = db.users[key].emojis || {};
    db.users[key].emojis[normalized] = cleanEmoji;
    db.users[key].updatedAt = new Date().toISOString();
    saveUsersDB(db);

    if (options.syncSettings !== false) {
        syncPhoneEmojiToSettings(normalized, cleanEmoji);
    }

    return true;
}

function getAllUserIds() {
    const db = getUsersDB();
    return Object.keys(db.users || {});
}

function getAllLinkedPhones() {
    const db = getUsersDB();
    return Object.keys(db.phoneOwners || {});
}

function getUserPoints(userId) {
    const user = getUserRecord(userId);
    return Number(user.points) || 0;
}

function addUserPoints(userId, amount) {
    const increment = Math.max(0, Number(amount) || 0);
    if (!increment) return getUserPoints(userId);

    const db = getUsersDB();
    const key = String(userId);
    const current = getUserRecord(key);
    db.users[key] = {
        ...current,
        linkedNumbers: current.linkedNumbers || [],
        emojis: current.emojis || {},
        points: (Number(current.points) || 0) + increment,
        updatedAt: new Date().toISOString()
    };
    saveUsersDB(db);
    return Number(db.users[key].points) || 0;
}

function deductUserPoints(userId, amount) {
    const decrement = Math.max(0, Number(amount) || 0);
    const db = getUsersDB();
    const key = String(userId);
    const current = getUserRecord(key);
    const nextPoints = Math.max(0, (Number(current.points) || 0) - decrement);
    db.users[key] = {
        ...current,
        linkedNumbers: current.linkedNumbers || [],
        emojis: current.emojis || {},
        points: nextPoints,
        updatedAt: new Date().toISOString()
    };
    saveUsersDB(db);
    return nextPoints;
}

function claimDailyGift(userId) {
    const db = getUsersDB();
    const key = String(userId);
    const current = getUserRecord(key);
    const lastGiftAt = current.lastDailyGiftAt ? Date.parse(current.lastDailyGiftAt) : 0;
    const now = Date.now();
    const waitMs = lastGiftAt ? (lastGiftAt + DAILY_GIFT_COOLDOWN_MS - now) : 0;
    if (waitMs > 0) {
        return { ok: false, waitMs, points: Number(current.points) || 0 };
    }
    const nextPoints = (Number(current.points) || 0) + DAILY_GIFT_POINTS;
    db.users[key] = {
        ...current,
        linkedNumbers: current.linkedNumbers || [],
        emojis: current.emojis || {},
        points: nextPoints,
        lastDailyGiftAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString()
    };
    saveUsersDB(db);
    return { ok: true, awarded: DAILY_GIFT_POINTS, points: nextPoints, nextAt: new Date(now + DAILY_GIFT_COOLDOWN_MS).toISOString() };
}

function formatDurationMs(ms) {
    const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h ? `${h} ساعة` : '', m ? `${m} دقيقة` : '', s || (!h && !m) ? `${s} ثانية` : ''].filter(Boolean).join(' و ');
}

function getPointLikePackages(points) {
    const packages = Math.floor((Number(points) || 0) / POINTS_PER_LIKE_PACKAGE);
    return {
        packages,
        likes: packages * LIKES_PER_POINTS_PACKAGE
    };
}

async function buildSmartAutoReply(phone, incomingText) {
    return '';
}

function getDashboardStats(phone) {
    const normalizedPhone = normalizePhone(phone);
    const ownerId = getPhoneOwner(normalizedPhone);
    const ownerSessions = ownerId ? getOwnerActiveSessions(ownerId, normalizedPhone) : [];
    const settings = getActivePhoneSettings(normalizedPhone);
    const points = ownerId ? getUserPoints(ownerId) : 0;
    const pointLikes = getPointLikePackages(points);
    const userRecord = ownerId ? getUserRecord(ownerId) : null;
    return {
        phone: normalizedPhone,
        ownerId,
        settings,
        points,
        linkedNumbers: ownerId ? getUserPhones(ownerId).length : 0,
        activeSessions: ownerSessions.length,
        connectedNumbers: ownerSessions.map((item) => item.phone),
        totalSessions: getAllLinkedPhones().length,
        totalUsers: getAllUserIds().length,
        autoSave: settings.autoSave || 'on',
        pointLikePackages: pointLikes.packages,
        pointLikeCapacity: pointLikes.likes,
        lastDailyGiftAt: userRecord?.lastDailyGiftAt || null
    };
}

function isAdmin(userId) {
    const settings = getSettings();
    return (settings.admins || []).map(String).includes(String(userId));
}

function addAdmin(userId) {
    const settings = getSettings();
    settings.admins = Array.from(new Set([...(settings.admins || []), String(userId)]));
    saveSettings(settings);
}

function removeAdmin(userId) {
    const settings = getSettings();
    settings.admins = (settings.admins || []).map(String).filter((id) => id !== String(userId));
    saveSettings(settings);
}

function formatNumbersForUser(userId) {
    const user = getUserRecord(userId);
    const phones = user.linkedNumbers || [];

    if (!phones.length) {
        return 'لا يوجد لديك أي رقم مربوط حالياً.';
    }

    return phones
        .map((phone, index) => `${index + 1}) ${phone} | إيموجي التفاعل: ${user.emojis?.[phone] || DEFAULT_REACTION_EMOJI}`)
        .join('\n');
}

function buildLinkedNumberCommandsOverview(phone = '') {
    return [
        '📲 أوامر الرقم المربوط:',
        '.bot - إرسال رابط البوت',
        ...buildLinkedOwnerQuickCommands(phone),
        '⚙️ جميع إعدادات الرقم تُدار من داخل البوت ولوحة الإعدادات.',
        '⚡ من القائمة السفلية > أوامر سريعة يمكنك تشغيل أو إيقاف Anti-Delete و Ghost وتفاعل الخاص لهذا الرقم.',
        '🤖 الردود التلقائية المخصصة تعمل من خلال إعدادات البوت ولكل رقم إعداداته المستقلة.',
        '🛡️ المطور يقدر يضيف ردود ورسائل عامة تنطبق على كل الأرقام المربوطة.'
    ].join('\n');
}

function buildTelegramCommandsOverview() {
    return [
        '📜 أوامر البوت المتاحة للجميع بعد ربط الرقم:',
        '/start أو زر القائمة الرئيسية - فتح الواجهة الرئيسية',
        '/mywa أو زر أرقامي - عرض الأرقام المربوطة بحسابك',
        '/unlink أو زر حذف جلسة - حذف جلسة أي رقم من أرقامك',
        '/setemoji أو زر تغيير الإيموجي - تغيير إيموجي التفاعل لكل رقم',
        '/statuscount أو زر عدد الحالات - معرفة عدد الحالات المحفوظة لكل رقم',
        '/viewstatuses أو زر مشاهدة الحالات - مشاهدة الحالات المحفوظة واحدة واحدة مع زر التالي',
        '/deletedmsgs أو زر الرسائل المحذوفة - عرض الرسائل الخاصة المحذوفة مع الاسم والتاريخ والوقت',
        '/contactscount أو زر جهات الاتصال - معرفة عدد جهات الاتصال وعرضها لكل رقم مربوط',
        '',
        '😄 تفاعل الخاص التلقائي - تشغيل أو إيقاف الإعجاب العشوائي على رسائل الخاص',
        '💘 من يحبني - اختيار جهة اتصال عشوائية وإظهار نسبة حب للمرح',
        '/waprofile أو زر ملفي الشخصي - إدارة الاسم وحول للرقم المربوط بمدد جاهزة أو وقت مخصص',
        '📢 قنواتنا - فتح رابط قناتنا على تيليجرام',
        '⚡ أوامر سريعة - تشغيل/إيقاف Anti-Delete و Ghost لكل رقم',
        '⚙️ إعدادات رقم - فتح لوحة الإعدادات الخاصة بالرقم وكلمة سره',
        '🤖 الردود التلقائية - تخصيص ردود منفصلة لكل رقم مربوط',
        '✨ تفاعل الحالات - تشغيل وإدارة التفاعل على الحالات لكل رقم',
        '',
        '🔐 كل رقم مربوط يملك كلمة سر خاصة به فقط، ويتم إنشاء مجلد إعدادات مستقل له داخل المشروع تلقائياً.'
    ].join('\n');
}

function buildNumberManagerMessage(phone) {
    return [
        `⚙️ الرقم ${phone}`,
        'الإدارة الآن من بوت تيليجرام ولوحة الإعدادات فقط.'
    ].join('\n');
}

function getNumberManagerKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('رجوع للإعدادات ⚙️', `settings_phone_${cleanPhone}`)]
            ]
        }
    };
}

function buildEmojiReactManagerMessage(phone) {
    const settings = getActivePhoneSettings(phone);
    return [
        `😍 إدارة التفاعل على الحالات للرقم ${phone}`,
        `الحالة الحالية: ${settings.autoStatusReact === 'on' ? 'مفعل ✅' : 'متوقف ⛔'}`,
        `إظهار التفاعل لصاحب الرقم: ${settings.statusReactionNotice === 'on' ? 'مفعل ✅' : 'متوقف ⛔'}`,
        `الإيموجي المستخدم حالياً: ${pickRandomStatusEmoji(phone)}`,
        '',
        'عند التفعيل سيتفاعل الرقم تلقائياً مع الحالات/الاستوريات فقط باستخدام الإيموجيات المحفوظة لهذا الرقم.',
        '',
        buildLinkedNumberCommandsOverview(phone)
    ].join('\n');
}

function getEmojiReactManagerKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const settings = getActivePhoneSettings(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    Markup.button.callback(settings.autoStatusReact === 'on' ? 'إيقاف التفاعل على الحالات ⛔' : 'تشغيل التفاعل على الحالات ✅', `emoji_react_toggle_${cleanPhone}`)
                ],
                [
                    Markup.button.callback(settings.statusReactionNotice === 'on' ? 'إيقاف إظهار التفاعل 👁️' : 'تشغيل إظهار التفاعل 👁️', `emoji_notice_toggle_${cleanPhone}`)
                ],
                [Markup.button.callback('تغيير الإيموجي 😍', `emoji_pick_${cleanPhone}`)],
                [Markup.button.callback('رجوع للإعدادات ⚙️', `settings_phone_${cleanPhone}`)]
            ]
        }
    };
}

function buildStartMessage(ctx) {
    const settings = getSettings();
    const user = getUserRecord(ctx.from.id);
    const phones = user.linkedNumbers || [];
    const primaryEmoji = phones.length ? user.emojis?.[phones[0]] || DEFAULT_REACTION_EMOJI : DEFAULT_REACTION_EMOJI;
    const numbersList = phones.length
        ? phones.map((phone, index) => `${index + 1}) ${phone} | ${user.emojis?.[phone] || DEFAULT_REACTION_EMOJI}`).join('\n')
        : 'لا يوجد';
    const linkedEmojiOnly = phones.length
        ? phones.map((phone) => user.emojis?.[phone] || DEFAULT_REACTION_EMOJI).join(' ')
        : '';

    const customStartMessage = String(settings.startMessage || '')
        .replaceAll('{name}', ctx.from.first_name || 'صديقي')
        .replaceAll('{username}', ctx.from.username ? `@${ctx.from.username}` : 'بدون معرف')
        .replaceAll('{count}', String(phones.length))
        .replaceAll('{emoji}', primaryEmoji)
        .replaceAll('{numbers}', numbersList)
        .trim();

    const baseMessage = customStartMessage || 'الايموجي الحالي :';
    const emojiLine = linkedEmojiOnly || primaryEmoji;
    return [baseMessage, emojiLine].filter(Boolean).join('\n').trim();
}

function getStartKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📱 ربط واتساب', 'pair_wa'),
            Markup.button.callback('📋 أرقامي المربوطة', 'my_numbers')
        ],
        [
            Markup.button.callback('❤️ الإيموجي والتفاعل', 'emoji_react_menu'),
            Markup.button.callback('⚙️ إعدادات الرقم', 'settings_menu')
        ],
        [
            Markup.button.callback('🤖 الردود التلقائية', 'auto_replies'),
            Markup.button.callback('😍 تغيير الإيموجي', 'change_emoji')
        ],
        [
            Markup.button.callback('📊 عدد الحالات', 'status_count_menu'),
            Markup.button.callback('👁️ مشاهدة الحالات', 'status_browser_menu')
        ],
        [
            Markup.button.callback('🗑️ الرسائل المحذوفة', 'deleted_messages_menu'),
            Markup.button.callback('👥 جهات الاتصال', 'contacts_count_menu')
        ],
        [
            Markup.button.callback('😄 تفاعل الخاص', 'auto_private_react_menu'),
            Markup.button.callback('💘 من يحبني', 'love_match_menu')
        ],
        [
            Markup.button.callback('👤 ملفي الشخصي', 'profile_menu')
        ],
        [
            Markup.button.callback('⚡ أوامر سريعة', 'quick_controls'),
            Markup.button.callback('🗑️ حذف جلسة', 'delete_session')
        ],
        [
            Markup.button.callback('📢 قنواتنا', 'our_channel_menu'),
            Markup.button.callback('👨‍💻 مطور البوت', 'bot_developer_menu')
        ],
        [
            Markup.button.callback('💬 تواصل مع المطور', 'contact_developer_wa_menu'),
            Markup.button.callback('📜 أوامر البوت', 'linked_commands_menu')
        ],
        [Markup.button.callback('✅ تحديث الاشتراك', 'check_sub')]
    ]);
}

function getMainReplyKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['🏠 القائمة الرئيسية', '📱 ربط رقم', '📋 أرقامي'],
                ['❤️ الإيموجي والتفاعل', '😍 تغيير الإيموجي'],
                ['⚙️ إعدادات رقم', '🤖 الردود التلقائية', '⚡ أوامر سريعة'],
                ['📊 عدد الحالات', '👁️ مشاهدة الحالات'],
                ['👥 جهات الاتصال'],
                ['😄 تفاعل الخاص', '💘 من يحبني'],
                ['🗑️ الرسائل المحذوفة', '👤 ملفي الشخصي'],
                ['📢 قنواتنا'],
                ['👨‍💻 مطور البوت', '💬 تواصل مع المطور'],
                ['📜 أوامر البوت', '✅ تحديث الاشتراك', '🗑️ حذف جلسة']
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            is_persistent: true
        }
    };
}

function detectReplyKeyboardAction(text = '') {
    const value = String(text || '').trim();
    if (!value) return '';
    if (/(?:القائمة الرئيسية|القائمه الرئيسية|القائمه الرئيسيه|القائمة الرئيسيه|^\/start$|^start$)/i.test(value)) return 'back_to_start';
    if (/(?:ربط رقم|ربط واتساب|pair)/i.test(value)) return 'pair_wa';
    if (/(?:أرقامي|ارقامي|mywa|my numbers)/i.test(value)) return 'my_numbers';
    if (/(?:أوامر سريعة|اوامر سريعة|quick)/i.test(value)) return 'quick_controls';
    if (/(?:إعدادات رقم|اعدادات رقم|الإعدادات|الاعدادات|settings)/i.test(value)) return 'settings_menu';
    if (/(?:الردود التلقائية|إدارة الرسائل|ادارة الرسائل|auto repl)/i.test(value)) return 'auto_replies';
    if (/(?:تغيير الإيموجي|تغيير الايموجي|emoji)/i.test(value)) return 'change_emoji';
    if (/(?:الإيموجي والتفاعل|الايموجي والتفاعل|تفاعل الحالات|status react)/i.test(value)) return 'emoji_react_menu';
    if (/(?:تفاعل الخاص|التفاعل التلقائي للخاص|private react)/i.test(value)) return 'auto_private_react_menu';
    if (/(?:من يحبني|نسبة الحب|love match)/i.test(value)) return 'love_match_menu';
    if (/(?:آخر ظهوري|اخر ظهوري|last seen)/i.test(value)) return 'last_seen_menu';
    if (/(?:حذف جلسة|حذف الجلسة|unlink|delete session)/i.test(value)) return 'delete_session';
    if (/(?:عدد الحالات|احصائية الحالات|احصائيات الحالات|status count)/i.test(value)) return 'status_count_menu';
    if (/(?:مشاهدة الحالات|عرض الحالات|تصفح الحالات|status browser|view statuses)/i.test(value)) return 'status_browser_menu';
    if (/(?:الرسائل المحذوفة|رسائل محذوفة|deleted messages|deleted msg)/i.test(value)) return 'deleted_messages_menu';
    if (/(?:جهات الاتصال|عدد جهات الاتصال|contacts count|contacts)/i.test(value)) return 'contacts_count_menu';
    // direct_contact_message removed
    if (/(?:ملفي الشخصي|الملف الشخصي|profile|wa profile)/i.test(value)) return 'profile_menu';
    if (/(?:قنواتنا|قناتنا|our channel|channel)/i.test(value)) return 'our_channel_menu';
    if (/(?:مطور البوت|bot developer)/i.test(value)) return 'bot_developer_menu';
    if (/(?:تواصل مع المطور|contact developer|واتس المطور)/i.test(value)) return 'contact_developer_wa_menu';
    if (/(?:تحديث الاشتراك|تحديث التحقق|check sub)/i.test(value)) return 'check_sub';
    if (/(?:أوامر البوت|اوامر البوت|الأوامر|الاوامر|help|menu)/i.test(value)) return 'linked_commands_menu';
    return '';
}

function buildQuickControlsMessage(phone) {
    const settings = getActivePhoneSettings(phone);
    return [
        `⚡ الأوامر السريعة للرقم ${phone}`,
        `🛡️ Anti-Delete: ${settings.antiDelete === 'off' ? 'متوقف ⛔' : 'مفعل ✅'}`,
        `👻 Ghost Mode: ${settings.ghostMode === 'on' ? 'مفعل ✅' : 'متوقف ⛔'}`,
        `😄 التفاعل التلقائي للخاص: ${settings.autoPrivateReact === 'on' ? 'مفعل ✅' : 'متوقف ⛔'}`,
        '',
        'كل زر بالأسفل يفعّل أو يوقف الإعداد مباشرة على الرقم المربوط فقط.'
    ].join('\n');
}

function getQuickControlsKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const settings = getActivePhoneSettings(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    Markup.button.callback(settings.antiDelete === 'off' ? 'تشغيل Anti-Delete ✅' : 'إيقاف Anti-Delete ⛔', `quick_toggle_anti_${cleanPhone}`)
                ],
                [
                    Markup.button.callback(settings.ghostMode === 'on' ? 'إيقاف Ghost ⛔' : 'تشغيل Ghost ✅', `quick_toggle_ghost_${cleanPhone}`),
                    Markup.button.callback(settings.autoPrivateReact === 'on' ? 'إيقاف تفاعل الخاص ⛔' : 'تشغيل تفاعل الخاص ✅', `quick_toggle_private_${cleanPhone}`)
                ],
                [
                    Markup.button.callback('فتح الإعدادات التفصيلية ⚙️', `settings_phone_${cleanPhone}`),
                    Markup.button.callback('رجوع ↩️', 'back_to_start')
                ]
            ]
        }
    };
}

async function openMyNumbersMenu(ctx) {
    return safeReply(ctx, `📋 أرقامك المربوطة:\n${formatNumbersForUser(ctx.from.id)}`);
}

async function openLinkedCommandsMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, buildTelegramCommandsOverview());
    }

    if (phones.length === 1) {
        return safeReply(ctx, `${buildTelegramCommandsOverview()}\n\n${buildLinkedNumberCommandsOverview(phones[0])}`);
    }

    const rows = phones.map((phone) => [Markup.button.callback(`📜 ${phone}`, `linked_commands_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '📜 اختر الرقم الذي تريد عرض أوامره الخاصة به:', { reply_markup: { inline_keyboard: rows } });
}


async function openStatusCountMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لعرض عدد الحالات.');
    if (phones.length === 1) return safeReply(ctx, buildStatusCountMessage(phones[0]));
    const rows = phones.map((phone) => [Markup.button.callback(`📊 ${phone}`, `statuscount_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '📊 اختر الرقم الذي تريد معرفة عدد الحالات المحفوظة له:', { reply_markup: { inline_keyboard: rows } });
}

async function openStatusBrowserMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لعرض الحالات.');
    if (phones.length === 1) return openStatusBrowserForPhone(ctx, phones[0]);
    const rows = phones.map((phone) => [Markup.button.callback(`👁️ ${phone}`, `statusbrowse_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '👁️ اختر الرقم الذي تريد مشاهدة حالاته من داخل البوت:', { reply_markup: { inline_keyboard: rows } });
}

async function openStatusBrowserForPhone(ctx, phone) {
    const entries = getPhoneStatusArchiveEntries(phone);
    if (!entries.length) return safeReply(ctx, `📭 لا توجد حالات محفوظة حالياً للرقم ${phone}.`);
    return sendStatusArchiveEntryByIndex(ctx, phone, 0);
}

function getStatusArchiveIndexById(phone, statusId) {
    const entries = getPhoneStatusArchiveEntries(phone);
    return entries.findIndex((entry) => String(entry?.id || '') === String(statusId || ''));
}

function buildStatusSequenceButtons(phone, entry, index, total) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const statusId = String(entry?.id || '').trim();
    const ownerButton = Markup.button.callback(`👤 ${formatStatusArchiveOwner(entry)}`.slice(0, 55), `status_owner_${cleanPhone}_${statusId}`);
    const actionButton = entry?.kind === 'text'
        ? Markup.button.callback('نسخ النص 📋', `status_copy_${cleanPhone}_${statusId}`)
        : Markup.button.callback('تنزيل الحالة ⬇️', `status_download_${cleanPhone}_${statusId}`);
    const nextButton = index + 1 < total
        ? Markup.button.callback('التالي ⏭️', `status_next_${cleanPhone}_${index + 1}`)
        : Markup.button.callback('التالي ⏭️', `status_done_${cleanPhone}`);
    return {
        reply_markup: {
            inline_keyboard: [
                [ownerButton],
                [actionButton],
                [nextButton]
            ]
        }
    };
}

function getStatusBrowserRestartKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('العودة للحالات السابقة ↩️', `status_restart_${cleanPhone}`)],
                [Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]
            ]
        }
    };
}

async function sendStatusBrowserFinished(ctx, phone) {
    return safeReply(ctx, `✅ تم انتهاء مشاهدة الحالات للرقم ${phone}.`, getStatusBrowserRestartKeyboard(phone));
}

async function sendStatusArchiveEntryByIndex(ctx, phone, index = 0) {
    const entries = getPhoneStatusArchiveEntries(phone);
    if (!entries.length) return safeReply(ctx, `📭 لا توجد حالات محفوظة حالياً للرقم ${phone}.`);
    const safeIndex = Number(index) || 0;
    if (safeIndex < 0 || safeIndex >= entries.length) {
        return sendStatusBrowserFinished(ctx, phone);
    }
    const entry = entries[safeIndex];
    const caption = buildStatusPreviewCaption(entry);
    const buttons = buildStatusSequenceButtons(phone, entry, safeIndex, entries.length);
    if (entry.kind === 'text') return safeReply(ctx, caption, buttons);
    if (!entry.filePath || !fs.existsSync(entry.filePath)) return safeReply(ctx, '❌ ملف الحالة غير موجود حالياً على الخادم.', buttons);
    if (entry.kind === 'image') return ctx.replyWithPhoto({ source: entry.filePath }, { caption: caption.slice(0, 1024), ...buttons });
    if (entry.kind === 'video') return ctx.replyWithVideo({ source: entry.filePath }, { caption: caption.slice(0, 1024), ...buttons });
    if (entry.kind === 'audio') {
        await ctx.replyWithAudio({ source: entry.filePath }, buttons);
        return safeReply(ctx, caption, buttons);
    }
    await ctx.replyWithDocument({ source: entry.filePath, filename: entry.fileName || 'status.bin' }, buttons);
    return safeReply(ctx, caption, buttons);
}

async function openDeletedStatusBrowserMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لعرض الحالات المحذوفة.');
    if (phones.length === 1) return openDeletedStatusBrowserForPhone(ctx, phones[0]);
    const rows = phones.map((phone) => [Markup.button.callback(`🗑️ ${phone}`, `statusdeleted_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '🗑️ اختر الرقم الذي تريد مشاهدة الحالات المحذوفة له خلال أقل من 24 ساعة:', { reply_markup: { inline_keyboard: rows } });
}

async function openDeletedStatusBrowserForPhone(ctx, phone) {
    const entries = getPhoneDeletedStatusArchiveEntries(phone).slice(0, 20);
    if (!entries.length) return safeReply(ctx, `📭 لا توجد حالات محذوفة محفوظة خلال آخر 24 ساعة للرقم ${phone}.`);
    const rows = entries.map((entry, index) => {
        const icon = entry.kind === 'video' ? '🎥' : entry.kind === 'image' ? '🖼️' : entry.kind === 'text' ? '📝' : '📦';
        return [Markup.button.callback(`${icon} ${index + 1}. ${formatStatusArchiveOwner(entry)}`.slice(0, 60), `deleted_status_open_${sanitizeCallbackPhone(phone)}_${entry.id}`)];
    });
    rows.push([Markup.button.callback('🔄 تحديث القائمة', `statusdeleted_phone_${sanitizeCallbackPhone(phone)}`)]);
    rows.push([Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]);
    return safeReply(ctx, `🗑️ الحالات المحذوفة للرقم ${phone}
⏳ المعروض: الحالات التي حذفها أصحابها خلال أقل من 24 ساعة
📥 الإجمالي: ${getPhoneDeletedStatusArchiveEntries(phone).length}
اختر الحالة التي تريد فتحها أو تنزيلها:`, { reply_markup: { inline_keyboard: rows } });
}

async function openStatusArchiveItem(ctx, phone, statusId, source = 'all') {
    const entry = getStatusArchiveEntry(phone, statusId);
    if (!entry) return safeReply(ctx, '❌ لم أجد هذه الحالة أو تم حذفها من الأرشيف.');
    const caption = buildStatusPreviewCaption(entry);
    const buttons = buildStatusEntryButtons(phone, entry, source);
    if (entry.kind === 'text') return safeReply(ctx, caption, buttons);
    if (!entry.filePath || !fs.existsSync(entry.filePath)) return safeReply(ctx, '❌ ملف الحالة غير موجود حالياً على الخادم.');
    if (entry.kind === 'image') return ctx.replyWithPhoto({ source: entry.filePath }, { caption: caption.slice(0, 1024), ...buttons });
    if (entry.kind === 'video') return ctx.replyWithVideo({ source: entry.filePath }, { caption: caption.slice(0, 1024), ...buttons });
    if (entry.kind === 'audio') {
        await ctx.replyWithAudio({ source: entry.filePath }, buttons);
        return safeReply(ctx, caption, buttons);
    }
    await ctx.replyWithDocument({ source: entry.filePath, filename: entry.fileName || 'status.bin' }, buttons);
    return safeReply(ctx, caption, buttons);
}

async function sendStatusArchiveDownload(ctx, phone, statusId) {
    const entry = getStatusArchiveEntry(phone, statusId);
    if (!entry) return safeReply(ctx, '❌ لم أجد هذه الحالة أو تم حذفها.');
    if (entry.kind === 'text') return safeReply(ctx, `📋 نص الحالة جاهز للنسخ:

${String(entry.text || entry.caption || '').trim() || 'لا يوجد نص.'}`);
    if (!entry.filePath || !fs.existsSync(entry.filePath)) return safeReply(ctx, '❌ ملف الحالة غير متوفر للتنزيل حالياً.');
    const caption = `👤 صاحب الحالة: ${formatStatusArchiveOwner(entry)}`;
    if (entry.kind === 'image') return ctx.replyWithPhoto({ source: entry.filePath }, { caption });
    if (entry.kind === 'video') return ctx.replyWithVideo({ source: entry.filePath }, { caption });
    if (entry.kind === 'audio') return ctx.replyWithAudio({ source: entry.filePath }, { caption });
    return ctx.replyWithDocument({ source: entry.filePath, filename: entry.fileName || 'status.bin' }, { caption });
}


async function openContactsCountMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لعرض جهات الاتصال.');
    if (phones.length === 1) return safeReply(ctx, buildContactsCountMessage(phones[0]), getContactsCountKeyboard(phones[0]));
    const rows = phones.map((phone) => [Markup.button.callback(`👥 ${phone}`, `contactscount_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '👥 اختر الرقم الذي تريد معرفة عدد جهات اتصاله:', { reply_markup: { inline_keyboard: rows } });
}

async function openLastSeenMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لعرض آخر ظهور.');
    if (phones.length === 1) return safeReply(ctx, buildLastSeenMessage(phones[0]));
    const rows = phones.map((phone) => [Markup.button.callback(`🕓 ${phone}`, `lastseen_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '🕓 اختر الرقم الذي تريد معرفة آخر نشاطه:', { reply_markup: { inline_keyboard: rows } });
}

async function openLoveMatchMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لاختيار نسبة حب من جهات الاتصال.');
    if (phones.length === 1) return safeReply(ctx, buildLoveMatchMessage(phones[0]));
    const rows = phones.map((phone) => [Markup.button.callback(`💘 ${phone}`, `lovematch_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '💘 اختر الرقم الذي تريد تشغيل فقرة من يحبني له:', { reply_markup: { inline_keyboard: rows } });
}

async function openAutoPrivateReactMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لإدارة تفاعل الخاص.');
    if (phones.length === 1) return safeReply(ctx, buildAutoPrivateReactManagerMessage(phones[0]), getAutoPrivateReactManagerKeyboard(phones[0]));
    const rows = phones.map((phone) => [Markup.button.callback(`😄 ${phone}`, `auto_private_react_phone_${sanitizeCallbackPhone(phone)}`)]);
    rows.push([Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]);
    return safeReply(ctx, '😄 اختر الرقم الذي تريد إدارة التفاعل التلقائي للخاص له:', { reply_markup: { inline_keyboard: rows } });
}

async function openDeletedMessagesMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لعرض الرسائل المحذوفة.');
    if (phones.length === 1) return openDeletedMessagesSendersForPhone(ctx, phones[0]);
    const rows = phones.map((phone) => [Markup.button.callback(`🗑️ ${phone}`, `deletedmsg_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '🗑️ اختر الرقم الذي تريد عرض الرسائل الخاصة المحذوفة له:', { reply_markup: { inline_keyboard: rows } });
}

async function openDeletedMessagesSendersForPhone(ctx, phone) {
    const senders = getDeletedMessageSenderBuckets(phone).slice(0, 20);
    if (!senders.length) return safeReply(ctx, `📭 لا توجد رسائل خاصة محذوفة محفوظة حالياً للرقم ${phone}.`);
    const rows = senders.map((entry, index) => [Markup.button.callback(`👤 ${index + 1}. ${buildDeletedMessageSenderLabel(entry)} (${entry.total})`.slice(0, 60), `deletedmsg_sender_${sanitizeCallbackPhone(phone)}_${entry.senderPhone}`)]);
    rows.push([Markup.button.callback('🔄 تحديث القائمة', `deletedmsg_phone_${sanitizeCallbackPhone(phone)}`)]);
    rows.push([Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]);
    return safeReply(ctx, `🗑️ مرسلو الرسائل المحذوفة للرقم ${phone}\n📥 الإجمالي: ${getPhoneDeletedPrivateMessages(phone).length}\nاختر الشخص الذي تريد عرض رسائله المحذوفة:`, { reply_markup: { inline_keyboard: rows } });
}

async function openDeletedMessagesForSender(ctx, phone, senderPhone) {
    const items = getDeletedMessagesForSender(phone, senderPhone).slice(0, 20);
    if (!items.length) return safeReply(ctx, '📭 لا توجد رسائل محذوفة لهذا الرقم حالياً.');
    const rows = items.map((entry, index) => [Markup.button.callback(`📩 ${index + 1}. ${formatDeletedMessageType(entry.kind)} - ${formatStatusArchiveTime(entry.deletedAt || entry.createdAt || '')}`.slice(0, 60), `deletedmsg_open_${sanitizeCallbackPhone(phone)}_${entry.id}`)]);
    rows.push([Markup.button.callback('🔄 تحديث الرسائل', `deletedmsg_sender_${sanitizeCallbackPhone(phone)}_${normalizePhone(senderPhone)}`)]);
    rows.push([Markup.button.callback('↩️ رجوع للمرسلين', `deletedmsg_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, `📨 الرسائل المحذوفة من ${buildDeletedMessageSenderLabel(items[0])}\n📥 العدد: ${getDeletedMessagesForSender(phone, senderPhone).length}\nاختر الرسالة التي تريد فتحها:`, { reply_markup: { inline_keyboard: rows } });
}

async function openDeletedMessageArchiveItem(ctx, phone, archiveId) {
    const entry = getDeletedMessageArchiveEntry(phone, archiveId);
    if (!entry) return safeReply(ctx, '❌ لم أجد الرسالة المحذوفة المطلوبة.');
    const caption = buildDeletedMessagePreviewText(entry);
    if (entry.kind === 'text' || !entry.data) return safeReply(ctx, caption);

    const buffer = Buffer.from(entry.data, 'base64');
    if (entry.kind === 'image') return ctx.replyWithPhoto({ source: buffer }, { caption: caption.slice(0, 1024) });
    if (entry.kind === 'video') return ctx.replyWithVideo({ source: buffer }, { caption: caption.slice(0, 1024) });
    if (entry.kind === 'audio') {
        await ctx.replyWithAudio({ source: buffer }, { caption: `👤 ${buildDeletedMessageSenderLabel(entry)}` });
        return safeReply(ctx, caption);
    }
    return ctx.replyWithDocument({ source: buffer, filename: entry.fileName || 'deleted-message.bin' }, { caption: caption.slice(0, 1024) });
}


// =========================
// رسالة جماعية لجهات الاتصال - نظام Queue متطور
// =========================
const CONTACTS_BROADCAST_DELAY_MS = 2500;   // تأخير بين كل رسالة (2.5 ثانية)
const CONTACTS_BROADCAST_BATCH = 100;        // 100 رسالة لكل دفعة
const CONTACTS_BROADCAST_PAUSE_MS = 5 * 60 * 1000; // 5 دقائق بين الدفعات

// مخزن مهام البث الجاري تشغيلها
const broadcastJobs = new Map(); // phone -> { running, cancel, report }

function getBroadcastJob(phone) {
    return broadcastJobs.get(normalizePhone(phone)) || null;
}

function cancelBroadcastJob(phone) {
    const job = broadcastJobs.get(normalizePhone(phone));
    if (job) { job.cancel = true; }
}

// إرسال رسالة جماعية بنظام دفعات في الخلفية (background) - 100 رسالة كل 5 دقائق
async function sendBroadcastToAllContactsQueue(sock, phone, messageText, onProgress, limitCount = 0) {
    const normalizedPhone = normalizePhone(phone);
    const cleanMessage = String(messageText || '').trim();
    const report = { total: 0, success: 0, failed: 0, skipped: 0, details: [], finished: false };

    if (!cleanMessage) { report.finished = true; return report; }
    if (!sock) {
        report.failed = 1;
        report.details.push({ jid: 'N/A', status: 'offline', error: 'الرقم غير متصل' });
        report.finished = true;
        return report;
    }

    const contacts = getPhoneContactEntries(normalizedPhone);
    report.total = contacts.length;
    if (!contacts.length) { report.finished = true; return report; }

    // إلغاء أي مهمة سابقة لنفس الرقم
    cancelBroadcastJob(normalizedPhone);
    const jobState = { cancel: false, running: true, report };
    broadcastJobs.set(normalizedPhone, jobState);

    // تصفية جهات الاتصال الصالحة مسبقاً
    const validContacts = contacts.filter(c => {
        const jid = String(c.jid || '').trim();
        const cPhone = String(c.phoneNumber || '').trim();
        return jid && cPhone;
    });
    const normalizedLimit = Math.max(0, Math.min(Number(limitCount) || 0, validContacts.length));
    const targetContacts = normalizedLimit ? validContacts.slice(0, normalizedLimit) : validContacts;
    report.total = targetContacts.length;
    report.skipped = contacts.length - validContacts.length + Math.max(0, validContacts.length - targetContacts.length);

    let batchNum = 0;
    let globalIndex = 0;

    // إرسال الدفعات في loop خلفي
    while (globalIndex < targetContacts.length) {
        if (jobState.cancel) break;

        // إعادة التحقق من أن الاتصال لا يزال قائماً
        const liveSock = waClients.get(normalizedPhone);
        if (!liveSock) {
            // الرقم انقطع - انتظر إعادة الاتصال ثم أكمل
            await delay(15000);
            const retrySock = waClients.get(normalizedPhone);
            if (!retrySock) break; // إذا لم يعد يتصل نوقف
        }

        const currentSock = waClients.get(normalizedPhone) || sock;

        // دفعة واحدة: 100 رسالة
        const batch = targetContacts.slice(globalIndex, globalIndex + CONTACTS_BROADCAST_BATCH);
        batchNum++;

        let sentInBatch = 0;
        for (const contact of batch) {
            if (jobState.cancel) break;
            const jid = String(contact.jid || '').trim();
            const contactPhone = String(contact.phoneNumber || '').trim();

            try {
                // تأخير طبيعي بين الرسائل مع جيتر عشوائي لتجنب الحظر
                if (sentInBatch > 0) {
                    const jitter = Math.floor(Math.random() * 1500);
                    await delay(CONTACTS_BROADCAST_DELAY_MS + jitter);
                }

                await currentSock.sendMessage(jid, { text: cleanMessage });
                report.success += 1;
                report.details.push({ jid, name: contact.name || contactPhone, status: 'sent' });
                sentInBatch++;
            } catch (err) {
                report.failed += 1;
                report.details.push({ jid, name: contact.name || contactPhone, status: 'failed', error: err.message || 'فشل الإرسال' });
            }

            // تنظيف الذاكرة دورياً لمنع امتلاء الرام
            if (report.details.length > 500) {
                // احتفظ فقط بآخر 100 تفصيلة لتوفير الذاكرة
                const failed = report.details.filter(d => d.status === 'failed').slice(-50);
                report.details = [...failed];
                if (typeof global.gc === 'function') { try { global.gc(); } catch(_) {} }
            }
        }

        globalIndex += batch.length;

        // إشعار المستخدم بالتقدم
        if (typeof onProgress === 'function') {
            try {
                await onProgress(report, globalIndex, targetContacts.length, batchNum);
            } catch (_) {}
        }

        // إذا لم ننته بعد، انتظر 5 دقائق قبل الدفعة التالية
        if (globalIndex < targetContacts.length && !jobState.cancel) {
            await delay(CONTACTS_BROADCAST_PAUSE_MS);
        }
    }

    report.finished = true;
    jobState.running = false;
    broadcastJobs.delete(normalizedPhone);
    return report;
}

// الدالة القديمة للتوافق (تُعيد مباشرةً)
async function sendBroadcastToAllContacts(sock, phone, messageText) {
    return sendBroadcastToAllContactsQueue(sock, phone, messageText, null);
}

function formatContactsBroadcastReport(report = {}) {
    const lines = [
        '📢 نتيجة إرسال الرسالة الجماعية لجهات الاتصال',
        '',
        `📊 الإجمالي: ${report.total || 0}`,
        `✅ نجح: ${report.success || 0}`,
        `❌ فشل: ${report.failed || 0}`,
        report.skipped ? `⏭️ تم تجاوزه: ${report.skipped}` : ''
    ].filter(s => s !== undefined);

    const failedItems = (report.details || [])
        .filter(d => d.status === 'failed')
        .slice(0, 8)
        .map(d => `• ${d.name || d.jid}: ${d.error || 'فشل'}`);

    if (failedItems.length) {
        lines.push('', '📋 أسباب الفشل (أول 8):', ...failedItems);
    }

    return lines.join('\n');
}




// =========================
// قنواتنا - مطور البوت - تواصل مع المطور عبر الواتس
// =========================
async function openOurChannelMenu(ctx) {
    return safeReply(ctx,
        '📢 قنواتنا\n\nاشترك في قناتنا على تيليجرام للحصول على آخر التحديثات والمميزات:',
        {
            reply_markup: {
                inline_keyboard: [
                    [Markup.button.url('📢 فتح قناتنا على تيليجرام', 'https://t.me/fz_z_Z')],
                    [Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]
                ]
            }
        }
    );
}

async function openBotDeveloperMenu(ctx) {
    return safeReply(ctx,
        '👨‍💻 مطور البوت\n\nللتواصل مع مطور البوت والدعم الفني:',
        {
            reply_markup: {
                inline_keyboard: [
                    [Markup.button.url('👨‍💻 تواصل مع المطور @P_n_ij', 'https://t.me/P_n_ij')],
                    [Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]
                ]
            }
        }
    );
}

async function openContactDeveloperWaMenu(ctx) {
    return safeReply(ctx,
        '💬 تواصل مع المطور عبر الواتساب\n\nيمكنك التواصل مع المطور مباشرة عبر الواتساب:',
        {
            reply_markup: {
                inline_keyboard: [
                    [Markup.button.url('💬 تواصل عبر الواتساب', 'https://wa.me/')],
                    [Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]
                ]
            }
        }
    );
}

async function openContactsBroadcastMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لإرسال رسالة جماعية.');
    if (phones.length === 1) {
        const contacts = getPhoneContactEntries(phones[0]);
        if (!contacts.length) return safeReply(ctx, `⚠️ لا توجد جهات اتصال محفوظة للرقم ${phones[0]} بعد.\nانتظر حتى يتم مزامنة جهات الاتصال مع البوت.`);
        ctx.session = { step: 'wait_contacts_broadcast_count', targetPhone: phones[0] };
        return safeReply(ctx, buildContactsBroadcastPrompt(phones[0], contacts.length), getContactsBroadcastCancelKeyboard(phones[0]));
    }
    const rows = phones.map((phone) => {
        const cnt = getPhoneContactEntries(phone).length;
        return [Markup.button.callback(`📢 ${phone} (${cnt} جهة اتصال)`, `contacts_broadcast_phone_${sanitizeCallbackPhone(phone)}`)];
    });
    rows.push([Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]);
    return safeReply(ctx, '📢 اختر الرقم الذي تريد إرسال الرسالة الجماعية منه:', { reply_markup: { inline_keyboard: rows } });
}

function getContactsBroadcastCancelKeyboard(phone) {
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('إلغاء ❌', `contacts_broadcast_cancel_${sanitizeCallbackPhone(phone)}`)],
                [Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]
            ]
        }
    };
}

function buildContactsBroadcastPrompt(phone, count) {
    return [
        `📢 إرسال رسالة جماعية من الرقم ${phone}`,
        '',
        `👥 إجمالي جهات الاتصال المتاحة: ${count}`,
        '',
        '🔢 أرسل الآن عدد جهات الاتصال التي تريد أن تصلهم الرسالة.',
        `مثال: 25 أو ${Math.min(count, 100)}`,
        'يمكنك الإلغاء في أي وقت من الزر بالأسفل.'
    ].join('\n');
}

function buildContactsBroadcastTextPrompt(phone, requestedCount, totalCount) {
    return [
        `✉️ تم تحديد ${requestedCount} جهة اتصال من أصل ${totalCount} للرقم ${phone}.`,
        '',
        '📝 أرسل الآن الرسالة المطلوبة.',
        'إذا أرسلت كلمة الغاء أو ضغطت زر الإلغاء فلن يتم الإرسال.'
    ].join('\n');
}

function findPhoneContactEntry(phone, contactRef = '') {
    const normalizedPhone = normalizePhone(phone);
    const normalizedJid = normalizeContactJid(contactRef);
    const normalizedContactPhone = normalizePhone(contactRef);
    return getPhoneContactEntries(normalizedPhone).find((entry) => {
        const entryJid = normalizeContactJid(entry?.jid || '');
        const entryPhone = normalizePhone(entry?.phoneNumber || entry?.jid || '');
        if (normalizedJid && entryJid === normalizedJid) return true;
        if (normalizedContactPhone && entryPhone === normalizedContactPhone) return true;
        return false;
    }) || null;
}

function getRandomPhoneContactEntry(phone) {
    const contacts = getPhoneContactEntries(phone);
    if (!contacts.length) return null;
    return contacts[Math.floor(Math.random() * contacts.length)] || contacts[0] || null;
}

function getDirectContactSessionKey(phone, contactRef = '') {
    const normalizedPhone = normalizePhone(phone);
    const entry = findPhoneContactEntry(normalizedPhone, contactRef);
    const normalizedJid = entry ? normalizeContactJid(entry.jid) : normalizeContactJid(contactRef);
    if (!normalizedPhone || !normalizedJid) return '';
    return `${normalizedPhone}::${normalizedJid}`;
}

function getDirectContactMessageSession(phone, contactRef = '') {
    const key = getDirectContactSessionKey(phone, contactRef);
    if (!key) return null;
    return directContactMessageSessions.get(key) || null;
}

function setDirectContactMessageSession(phone, contactRef, payload = {}) {
    const entry = findPhoneContactEntry(phone, contactRef);
    const normalizedPhone = normalizePhone(phone);
    const normalizedJid = normalizeContactJid(entry?.jid || contactRef);
    if (!normalizedPhone || !normalizedJid) return null;
    const key = `${normalizedPhone}::${normalizedJid}`;
    const value = {
        phone: normalizedPhone,
        contactJid: normalizedJid,
        contactPhone: normalizePhone(entry?.phoneNumber || normalizedJid),
        contactName: pickContactDisplayName(entry?.name, entry?.notify, entry?.pushName, normalizePhone(entry?.phoneNumber || normalizedJid), normalizedJid),
        updatedAt: Date.now(),
        ...payload
    };
    directContactMessageSessions.set(key, value);
    return value;
}

function clearDirectContactMessageSession(phone, contactRef = '') {
    const key = getDirectContactSessionKey(phone, contactRef);
    if (!key) return false;
    return directContactMessageSessions.delete(key);
}

function buildDirectContactCardMessage(phone, entry) {
    const displayName = pickContactDisplayName(entry?.name, entry?.notify, entry?.pushName, entry?.phoneNumber, entry?.jid);
    const contactPhone = normalizePhone(entry?.phoneNumber || entry?.jid || '');
    return [
        `💬 مراسلة جهة اتصال من الرقم ${phone}`,
        '',
        `👤 الاسم العشوائي: ${displayName || 'بدون اسم'}`,
        `📱 الرقم: ${contactPhone || 'غير معروف'}`,
        '',
        'اضغط مراسلة لبدء المحادثة أو اسم آخر لعرض جهة مختلفة.'
    ].join('\n');
}

function getDirectContactCardKeyboard(phone, entry) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const contactPhone = sanitizeCallbackPhone(entry?.phoneNumber || entry?.jid || '');
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('مراسلة 💬', `direct_message_pick_${cleanPhone}_${contactPhone}`)],
                [Markup.button.callback('اسم عشوائي آخر 🎲', `direct_message_random_${cleanPhone}`)],
                [Markup.button.callback('إلغاء ❌', `direct_message_cancel_${cleanPhone}`)]
            ]
        }
    };
}

function getDirectContactCancelKeyboard(phone, contactRef = '') {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const cleanContact = sanitizeCallbackPhone(contactRef);
    const stopAction = cleanContact ? `direct_message_stop_${cleanPhone}_${cleanContact}` : `direct_message_cancel_${cleanPhone}`;
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('إلغاء ❌', stopAction)],
                [Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]
            ]
        }
    };
}

function getDirectContactReplyKeyboard(phone, contactRef = '') {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const cleanContact = sanitizeCallbackPhone(contactRef);
    return {
        reply_markup: {
            inline_keyboard: [
                [Markup.button.callback('رد على الرسالة ↩️', `direct_message_reply_${cleanPhone}_${cleanContact}`)],
                [Markup.button.callback('إلغاء المراسلة ❌', `direct_message_stop_${cleanPhone}_${cleanContact}`)]
            ]
        }
    };
}

function extractInboundPrivateMessagePreview(msg) {
    const content = unwrapMessageContent(msg?.message);
    const text = String(textFromMessage(msg) || '').trim();
    if (text) return text.slice(0, 3500);
    if (content?.imageMessage) return `📷 صورة${content.imageMessage.caption ? `\n${String(content.imageMessage.caption).trim().slice(0, 1000)}` : ''}`;
    if (content?.videoMessage) return `🎥 فيديو${content.videoMessage.caption ? `\n${String(content.videoMessage.caption).trim().slice(0, 1000)}` : ''}`;
    if (content?.audioMessage) return '🎤 رسالة صوتية';
    if (content?.documentMessage) return `📄 ملف: ${String(content.documentMessage.fileName || 'document').trim()}`;
    if (content?.stickerMessage) return '🧩 ملصق';
    return '📩 رسالة جديدة';
}

async function relayDirectContactMessageToTelegram(phone, contactJid, msg) {
    const session = getDirectContactMessageSession(phone, contactJid);
    if (!session?.ownerId) return false;
    const entry = findPhoneContactEntry(phone, contactJid);
    const displayName = pickContactDisplayName(session.contactName, entry?.name, entry?.notify, normalizePhone(contactJid), contactJid);
    const preview = extractInboundPrivateMessagePreview(msg);
    await notifyTelegramUser(
        session.ownerId,
        [
            `📩 رد جديد داخل البوت`,
            `📱 الرقم المربوط: ${normalizePhone(phone)}`,
            `👤 جهة الاتصال: ${displayName}`,
            '',
            preview
        ].join('\n'),
        getDirectContactReplyKeyboard(phone, contactJid)
    );
    setDirectContactMessageSession(phone, contactJid, { ...session, ownerId: session.ownerId, lastDirection: 'in' });
    return true;
}

async function openDirectContactMessageMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لمراسلة جهة اتصال.');
    if (phones.length === 1) return openRandomDirectContactPicker(ctx, phones[0]);
    const rows = phones.map((phone) => {
        const cnt = getPhoneContactEntries(phone).length;
        return [Markup.button.callback(`💬 ${phone} (${cnt} جهة)`, `direct_message_phone_${sanitizeCallbackPhone(phone)}`)];
    });
    rows.push([Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]);
    return safeReply(ctx, '💬 اختر الرقم الذي تريد المراسلة منه داخل البوت:', { reply_markup: { inline_keyboard: rows } });
}

async function openRandomDirectContactPicker(ctx, phone) {
    const entry = getRandomPhoneContactEntry(phone);
    if (!entry) return safeReply(ctx, `⚠️ لا توجد جهات اتصال محفوظة للرقم ${phone} بعد.`);
    return safeReply(ctx, buildDirectContactCardMessage(phone, entry), getDirectContactCardKeyboard(phone, entry));
}


async function openWhatsAppProfileMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لفتح الملف الشخصي.');
    if (phones.length === 1) return openWhatsAppProfileForPhone(ctx, phones[0]);
    const rows = phones.map((phone) => [Markup.button.callback(`👤 ${phone}`, `profile_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '👤 اختر الرقم الذي تريد فتح ملفه الشخصي على واتساب:', { reply_markup: { inline_keyboard: rows } });
}

function getProfileAboutPresetMeta(key = '') {
    const now = Date.now();
    const presets = {
        '1h': { key: '1h', label: '١ ساعة', expiresAt: new Date(now + (1 * 60 * 60 * 1000)).toISOString() },
        '8h': { key: '8h', label: '٨ ساعات', expiresAt: new Date(now + (8 * 60 * 60 * 1000)).toISOString() },
        '1d': { key: '1d', label: '١ يوم', expiresAt: new Date(now + (24 * 60 * 60 * 1000)).toISOString() },
        '2d': { key: '2d', label: '٢ يومان', expiresAt: new Date(now + (2 * 24 * 60 * 60 * 1000)).toISOString() },
        '1w': { key: '1w', label: '١ أسبوع', expiresAt: new Date(now + (7 * 24 * 60 * 60 * 1000)).toISOString() }
    };
    return presets[String(key || '').trim()] || null;
}

function getProfileAboutDurationKeyboard(phone) {
    const cleanPhone = sanitizeCallbackPhone(phone);
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    Markup.button.callback('١ ساعة', `profile_about_duration_1h_${cleanPhone}`),
                    Markup.button.callback('٨ ساعات', `profile_about_duration_8h_${cleanPhone}`)
                ],
                [
                    Markup.button.callback('١ يوم', `profile_about_duration_1d_${cleanPhone}`),
                    Markup.button.callback('٢ يومان', `profile_about_duration_2d_${cleanPhone}`)
                ],
                [
                    Markup.button.callback('١ أسبوع', `profile_about_duration_1w_${cleanPhone}`),
                    Markup.button.callback('مخصص', `profile_about_duration_custom_${cleanPhone}`)
                ],
                [Markup.button.callback('رجوع ↩️', `profile_phone_${cleanPhone}`)]
            ]
        }
    };
}

async function openProfileAboutDurationMenu(ctx, phone) {
    return safeReply(ctx, `📝 تغيير حول للرقم ${phone}

اختر مدة ظهور رسالة حول الجديدة من الأزرار الشفافة بالأسفل.
بعد الاختيار سأطلب منك إرسال النص مباشرة.

الحد الأقصى لرسالة حول هو ${MAX_WA_ABOUT_LENGTH} حرفاً.`, getProfileAboutDurationKeyboard(phone));
}







async function openWhatsAppProfileForPhone(ctx, phone) {
    const snapshot = getCurrentPhoneProfileSnapshot(phone);
    const normalizedPhone = normalizePhone(phone);
    const sock = waClients.get(normalizedPhone);
    const scheduleLine = snapshot.schedule?.active && snapshot.schedule?.expiresAt ? `
⏳ انتهاء حول المجدول: ${formatStatusArchiveTime(snapshot.schedule.expiresAt)}` : '';

    // استرجاع صورة البروفيل
    let profilePicUrl = '';
    let profilePicCaption = `👤 الملف الشخصي للرقم ${phone}\n\n📛 الاسم: ${snapshot.name}\n📝 حول: ${snapshot.about}${scheduleLine}`;
    try {
        if (sock && typeof sock.profilePictureUrl === 'function') {
            profilePicUrl = await sock.profilePictureUrl(`${normalizedPhone}@s.whatsapp.net`, 'image').catch(() => '');
        }
    } catch (_) {}

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    Markup.button.callback('تغيير الاسم ✏️', `profile_edit_name_${sanitizeCallbackPhone(phone)}`),
                    Markup.button.callback('تغيير حول 📝', `profile_edit_about_${sanitizeCallbackPhone(phone)}`)
                ],
                [
                    Markup.button.callback('تغيير الصورة 🖼️', `profile_change_pic_${sanitizeCallbackPhone(phone)}`),
                    Markup.button.callback('حذف الصورة 🗑️', `profile_delete_pic_${sanitizeCallbackPhone(phone)}`)
                ],
                [Markup.button.callback('تحديث العرض 🔄', `profile_phone_${sanitizeCallbackPhone(phone)}`)]
            ]
        }
    };

    if (profilePicUrl) {
        try {
            await ctx.replyWithPhoto(profilePicUrl, { caption: profilePicCaption, ...keyboard });
            return;
        } catch (_) {}
    }
    return safeReply(ctx, profilePicCaption, keyboard);
}

async function openAutoRepliesMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لإضافة الردود التلقائية.');
    }

    if (phones.length === 1) {
        ctx.session = { step: 'wait_auto_reply_response', targetPhone: phones[0] };
        return safeReply(
            ctx,
            `🤖 أرسل الآن نص الرد للرقم ${phones[0]}.\nبعدها سأطلب منك الكلمة أو الكلمات المفتاحية التي تشغل هذا الرد.\n\nالردود الحالية:\n${formatAutoRepliesList(phones[0])}\n\nلإيقاف جميع الردود أرسل: off`
        );
    }

    const rows = phones.map((phone) => [Markup.button.callback(`🤖 ${phone}`, `auto_reply_pick_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '🤖 اختر الرقم الذي تريد تعديل ردوده التلقائية:', { reply_markup: { inline_keyboard: rows } });
}

async function openSettingsMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لفتح الإعدادات.');
    }

    if (phones.length === 1) {
        ctx.session = { step: 'wait_settings_password', targetPhone: phones[0] };
        return safeReply(ctx, buildPhoneSettingsLockMessage(phones[0]), getPhoneSettingsAuthKeyboard(phones[0]));
    }

    const rows = phones.map((phone) => [Markup.button.callback(`⚙️ ${phone}`, `settings_phone_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '⚙️ اختر الرقم الذي تريد فتح إعداداته، وبعدها سأطلب منك كلمة السر الخاصة به:', { reply_markup: { inline_keyboard: rows } });
}

async function openEmojiReactMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لإدارة التفاعل على الحالات.');
    }

    if (phones.length === 1) {
        return safeReply(ctx, buildEmojiReactManagerMessage(phones[0]), getEmojiReactManagerKeyboard(phones[0]));
    }

    const rows = phones.map((phone) => [Markup.button.callback(`✨ ${phone}`, `emoji_react_pick_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '✨ اختر الرقم الذي تريد إدارة التفاعل على الحالات له:', { reply_markup: { inline_keyboard: rows } });
}

async function openChangeEmojiMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لتغيير الإيموجي.');
    }

    if (phones.length === 1) {
        ctx.session = { step: 'wait_emoji', targetPhone: phones[0] };
        return safeReply(ctx, `😍 أرسل الآن الإيموجي الجديد للرقم ${phones[0]}`);
    }

    const rows = phones.map((phone) => [Markup.button.callback(`${phone} | ${getPhoneEmoji(phone)}`, `emoji_pick_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '😍 اختر الرقم الذي تريد تغيير إيموجيه:', { reply_markup: { inline_keyboard: rows } });
}

async function openDeleteSessionMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك جلسات لحذفها.');
    }

    const rows = phones.map((phone) => [Markup.button.callback(`حذف ${phone}`, `delete_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '🗑️ اختر الرقم الذي تريد حذف جلسته:', { reply_markup: { inline_keyboard: rows } });
}

async function openQuickControlsMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لعرض الأوامر السريعة.');
    }

    if (phones.length === 1) {
        return safeReply(ctx, buildQuickControlsMessage(phones[0]), getQuickControlsKeyboard(phones[0]));
    }

    const rows = phones.map((phone) => [Markup.button.callback(`⚡ ${phone}`, `quick_pick_${sanitizeCallbackPhone(phone)}`)]);
    return safeReply(ctx, '⚡ اختر الرقم الذي تريد إدارة أوامره السريعة:', { reply_markup: { inline_keyboard: rows } });
}

function unwrapMessageContent(message) {
    let current = message || {};

    while (current) {
        if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message;
            continue;
        }
        if (current.viewOnceMessage?.message) {
            current = current.viewOnceMessage.message;
            continue;
        }
        if (current.viewOnceMessageV2?.message) {
            current = current.viewOnceMessageV2.message;
            continue;
        }
        if (current.viewOnceMessageV2Extension?.message) {
            current = current.viewOnceMessageV2Extension.message;
            continue;
        }
        if (current.documentWithCaptionMessage?.message) {
            current = current.documentWithCaptionMessage.message;
            continue;
        }
        break;
    }

    return current || {};
}

function hasStatusContent(msg) {
    const content = unwrapMessageContent(msg?.message);
    const contentKeys = Object.keys(content || {});

    return contentKeys.some(
        (key) => !['messageContextInfo', 'protocolMessage', 'reactionMessage'].includes(key)
    );
}

function normalizeWhatsAppJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '');
}

function isDirectUserJid(jid) {
    const normalized = normalizeWhatsAppJid(jid);
    return normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@lid');
}

function textFromMessage(msg) {
    const content = unwrapMessageContent(msg?.message);
    const interactiveParams = content?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    let interactiveText = '';

    if (interactiveParams) {
        try {
            const parsed = JSON.parse(interactiveParams);
            interactiveText = parsed?.id || parsed?.title || parsed?.value || parsed?.selectedId || parsed?.selectedTitle || '';
        } catch (_) {}
    }

    return (
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        content?.documentMessage?.caption ||
        content?.buttonsResponseMessage?.selectedDisplayText ||
        content?.buttonsResponseMessage?.selectedButtonId ||
        content?.listResponseMessage?.title ||
        content?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        content?.templateButtonReplyMessage?.selectedDisplayText ||
        content?.templateButtonReplyMessage?.selectedId ||
        interactiveText ||
        ''
    );
}


function getSessionPath(phone) {
    return path.join(SESSIONS_DIR, normalizePhone(phone));
}

function buildDeletedMessageBackupKey(phone, remoteJid, messageId) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedRemote = normalizeWhatsAppJid(remoteJid);
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedPhone || !normalizedRemote || !normalizedMessageId) return '';
    return `${normalizedPhone}::${normalizedRemote}::${normalizedMessageId}`;
}

function shouldCaptureAntiDeleteForChat(settings, remoteJid) {
    const mode = String(settings?.antiDelete || 'off').trim();
    const normalizedRemote = normalizeWhatsAppJid(remoteJid);
    const isGroup = normalizedRemote.endsWith('@g.us');
    if (mode === 'all') return true;
    if (mode === 'inbox') return !isGroup;
    if (mode === 'group') return isGroup;
    return false;
}

function pruneDeletedMessageBackups(phone = '') {
    const normalizedPhone = normalizePhone(phone);
    const prefix = normalizedPhone ? `${normalizedPhone}::` : '';
    const now = Date.now();
    const activeEntries = [];

    for (const [key, entry] of deletedMessageBackups.entries()) {
        if (!entry || Number(entry.expiresAt || 0) <= now) {
            deletedMessageBackups.delete(key);
            continue;
        }
        if (prefix && !key.startsWith(prefix)) {
            continue;
        }
        activeEntries.push([key, entry]);
    }

    if (!prefix || activeEntries.length <= MAX_DELETED_MESSAGE_BACKUPS_PER_PHONE) {
        return;
    }

    activeEntries
        .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0))
        .slice(0, Math.max(0, activeEntries.length - MAX_DELETED_MESSAGE_BACKUPS_PER_PHONE))
        .forEach(([key]) => deletedMessageBackups.delete(key));
}

function extractIncomingMessageContent(msg) {
    const content = unwrapMessageContent(msg?.message);
    const messageText = String(textFromMessage(msg) || '').trim();
    const candidates = [
        ['image', 'imageMessage'],
        ['video', 'videoMessage'],
        ['audio', 'audioMessage'],
        ['document', 'documentMessage'],
        ['sticker', 'stickerMessage']
    ];

    for (const [kind, key] of candidates) {
        if (content?.[key]) {
            return {
                kind,
                payload: content[key],
                text: messageText,
                mimetype: String(content[key]?.mimetype || '').trim(),
                fileName: String(content[key]?.fileName || '').trim()
            };
        }
    }

    if (messageText) {
        return {
            kind: 'text',
            payload: null,
            text: messageText,
            mimetype: 'text/plain',
            fileName: ''
        };
    }

    return null;
}

async function backupIncomingMessageForAntiDelete(sock, phoneNumber, msg) {
    if (!sock || !msg?.key?.id || msg.key?.fromMe) return false;
    const remoteJid = normalizeWhatsAppJid(msg.key?.remoteJid);
    if (!remoteJid || remoteJid === 'status@broadcast') return false;

    const settings = getActivePhoneSettings(phoneNumber);
    if (!shouldCaptureAntiDeleteForChat(settings, remoteJid)) return false;

    const contentInfo = extractIncomingMessageContent(msg);
    if (!contentInfo) return false;

    const backupKey = buildDeletedMessageBackupKey(phoneNumber, remoteJid, msg.key.id);
    if (!backupKey) return false;

    const senderJid = normalizeWhatsAppJid(msg.key?.participant || msg.participant || remoteJid);
    const now = Date.now();
    const entry = {
        phone: normalizePhone(phoneNumber),
        messageId: String(msg.key.id || '').trim(),
        remoteJid,
        senderJid,
        senderPhone: normalizePhone(senderJid),
        senderName: pickContactDisplayName(msg?.pushName, getStoredContactName(phoneNumber, senderJid), normalizePhone(senderJid), senderJid),
        chatType: remoteJid.endsWith('@g.us') ? 'group' : 'private',
        kind: contentInfo.kind,
        text: contentInfo.text || '',
        caption: contentInfo.text || '',
        mimetype: contentInfo.mimetype || '',
        fileName: contentInfo.fileName || '',
        data: '',
        createdAt: now,
        expiresAt: now + DELETED_MESSAGE_RETENTION_MS,
        deletedAt: 0,
        restoredAt: 0
    };

    if (contentInfo.kind !== 'text' && contentInfo.payload && typeof downloadContentFromMessage === 'function') {
        try {
            const downloadType = contentInfo.kind === 'document' ? 'document' : contentInfo.kind;
            const stream = await downloadContentFromMessage(contentInfo.payload, downloadType);
            const buffer = await streamToBuffer(stream);
            if (buffer.length) {
                entry.data = buffer.toString('base64');
            }
        } catch (error) {
            console.error(`Anti Delete Backup Error (${phoneNumber}):`, error.message);
        }
    }

    deletedMessageBackups.set(backupKey, entry);
    saveDeletedMessageArchiveEntry(phoneNumber, entry);
    pruneDeletedMessageBackups(phoneNumber);
    return true;
}

function extractRevokedMessageKey(msg) {
    const content = unwrapMessageContent(msg?.message);
    const protocolMessage = content?.protocolMessage;
    const key = protocolMessage?.key;
    if (!key?.id) return null;
    return {
        id: String(key.id || '').trim(),
        remoteJid: normalizeWhatsAppJid(key.remoteJid || msg?.key?.remoteJid || ''),
        participant: normalizeWhatsAppJid(key.participant || msg?.participant || ''),
        fromMe: key.fromMe === true,
        type: protocolMessage?.type
    };
}

function buildDeletedMessageNotice(entry) {
    const sender = entry?.senderPhone || normalizePhone(entry?.senderJid || '') || 'غير معروف';
    const chatType = entry?.chatType === 'group' ? 'مجموعة' : 'خاص';
    const messageTypeLabels = {
        text: 'نص',
        image: 'صورة',
        video: 'فيديو',
        audio: 'صوت',
        document: 'ملف',
        sticker: 'ملصق'
    };
    const messageType = messageTypeLabels[entry?.kind] || 'رسالة';
    return [
        '🗑️ رسالة محذوفة تم استرجاعها.',
        `📱 الرقم: ${sender}`,
        `💬 نوع الشات: ${chatType}`,
        `📦 نوع الرسالة: ${messageType}`
    ].join('\n');
}

function buildDeletedMessageDeliveryText(entry) {
    const note = buildDeletedMessageNotice(entry);
    const extraText = String(entry?.text || entry?.caption || '').trim();
    return [extraText, note].filter(Boolean).join('\n\n').trim();
}

async function sendDeletedMessageBackup(sock, targetJid, entry) {
    if (!sock || !targetJid || !entry) return false;
    const deliveryText = buildDeletedMessageDeliveryText(entry);

    if (entry.kind === 'text' || !entry.data) {
        await sock.sendMessage(targetJid, { text: deliveryText || buildDeletedMessageNotice(entry) });
        return true;
    }

    const buffer = Buffer.from(entry.data, 'base64');
    const caption = deliveryText || buildDeletedMessageNotice(entry);

    if (entry.kind === 'image') {
        await sock.sendMessage(targetJid, { image: buffer, caption, mimetype: entry.mimetype || 'image/jpeg' });
        return true;
    }
    if (entry.kind === 'video') {
        await sock.sendMessage(targetJid, { video: buffer, caption, mimetype: entry.mimetype || 'video/mp4' });
        return true;
    }
    if (entry.kind === 'audio') {
        await sock.sendMessage(targetJid, { audio: buffer, mimetype: entry.mimetype || 'audio/mpeg', ptt: false });
        await sock.sendMessage(targetJid, { text: caption });
        return true;
    }
    if (entry.kind === 'document') {
        await sock.sendMessage(targetJid, {
            document: buffer,
            fileName: entry.fileName || 'deleted-message.bin',
            caption,
            mimetype: entry.mimetype || 'application/octet-stream'
        });
        return true;
    }
    if (entry.kind === 'sticker') {
        await sock.sendMessage(targetJid, {
            document: buffer,
            fileName: entry.fileName || 'deleted-sticker.webp',
            caption,
            mimetype: entry.mimetype || 'image/webp'
        });
        return true;
    }

    await sock.sendMessage(targetJid, { text: caption });
    return true;
}

async function handleAntiDeleteProtocolMessage(sock, phoneNumber, msg) {
    const revokedKey = extractRevokedMessageKey(msg);
    if (!revokedKey || revokedKey.fromMe) return false;

    const remoteJid = normalizeWhatsAppJid(revokedKey.remoteJid || msg?.key?.remoteJid || '');
    if (!remoteJid || remoteJid === 'status@broadcast') return false;

    const settings = getActivePhoneSettings(phoneNumber);
    if (!shouldCaptureAntiDeleteForChat(settings, remoteJid)) return false;

    pruneDeletedMessageBackups(phoneNumber);
    const backupKey = buildDeletedMessageBackupKey(phoneNumber, remoteJid, revokedKey.id);
    const entry = deletedMessageBackups.get(backupKey);
    if (!entry || entry.restoredAt) return false;

    const ownJid = normalizeWhatsAppJid(sock.user?.id) || `${normalizePhone(phoneNumber)}@s.whatsapp.net`;
    const targetJid = entry.chatType === 'private' ? ownJid : (settings.sendDeleteTo === 'same' ? entry.remoteJid : ownJid);
    if (!targetJid) return false;

    entry.deletedAt = Date.now();
    saveDeletedMessageArchiveEntry(phoneNumber, entry);
    await sendDeletedMessageBackup(sock, targetJid, entry);
    entry.restoredAt = Date.now();
    deletedMessageBackups.set(backupKey, entry);
    saveDeletedMessageArchiveEntry(phoneNumber, entry);
    return true;
}

function getTelegramBotLink() {
    return DEFAULT_BOT_LINK || (bot.botInfo?.username ? `https://t.me/${bot.botInfo.username}` : '');
}

function getTelegramWebhookUrl() {
    return `${PUBLIC_BASE_URL}${TELEGRAM_WEBHOOK_PATH}`;
}

async function ensureSubscription(ctx) {
    const settings = getSettings();
    const channel = settings.requiredChannel;

    if (!channel || !ctx?.from?.id) {
        return true;
    }

    try {
        const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
        const validStatuses = ['creator', 'administrator', 'member'];
        if (validStatuses.includes(member.status)) {
            return true;
        }
    } catch (error) {
        console.error('Subscription Check Error:', error.message);
        return true;
    }

    const buttons = [];
    if (String(channel).startsWith('@')) {
        buttons.push([Markup.button.url('الاشتراك في القناة 📢', `https://t.me/${String(channel).replace('@', '')}`)]);
    }
    buttons.push([Markup.button.callback('تحقق من الاشتراك ✅', 'check_sub')]);

    await ctx.reply('⚠️ يجب عليك الاشتراك أولاً في القناة المطلوبة لاستخدام البوت.', {
        reply_markup: { inline_keyboard: buttons }
    });
    return false;
}

function isEmojiInput(value) {
    if (!value) return false;
    const text = String(value).trim();
    if (!text || text.length > 12) return false;
    return /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|[\p{Extended_Pictographic}])+$/u.test(text);
}

async function safeReply(ctx, text, extra = {}) {
    try {
        return await ctx.reply(text, extra);
    } catch (error) {
        console.error('Telegram Reply Error:', error.message);
    }
}

async function notifyTelegramUser(userId, text, extra = {}) {
    if (!userId) return;
    try {
        await bot.telegram.sendMessage(String(userId), text, extra);
    } catch (error) {
        console.error(`Telegram Notify Error (${userId}):`, error.message);
    }
}

async function notifyPhoneOwner(phone, text, extra = {}) {
    const ownerId = getPhoneOwner(phone);
    if (!ownerId) return;
    await notifyTelegramUser(ownerId, text, extra);
}

function isPermanentDisconnect(lastDisconnect = null) {
    const statusCode = Number(lastDisconnect?.error?.output?.statusCode || 0);
    const rawMessage = String(
        lastDisconnect?.error?.data ||
        lastDisconnect?.error?.message ||
        lastDisconnect?.error?.output?.payload?.message ||
        ''
    ).toLowerCase();
    if (statusCode === Number(DisconnectReason.loggedOut)) return true;
    if ([401, 403, 405].includes(statusCode)) return true;
    return /(logged\s*out|device\s*removed|forbidden|banned|blocked|not-authorized|not authorized|session\s*expired|replaced)/i.test(rawMessage);
}

function purgeSessionData(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    clearReconnectTimer(normalized);
    clearPairingRequest(normalized);
    clearChannelPromotionTimer(normalized);
    clearPresenceTimer(normalized);
    clearGhostPendingMessagesForPhone(normalized);
    stoppedPairings.delete(normalized);
    clientActivity.delete(normalized);
    waClients.delete(normalized);
    try {
        fs.rmSync(getSessionPath(normalized), { recursive: true, force: true });
    } catch (_) {}
    removeLinkedNumber(normalized);
}

function rememberStatusReactionNotice(phone, participant, messageId) {
    const key = buildStatusBackupKey(phone, participant, messageId || String(Date.now()));
    if (!key) return false;
    if (statusReactionNoticeCache.has(key)) return false;
    statusReactionNoticeCache.set(key, Date.now());
    if (statusReactionNoticeCache.size > 5000) {
        const firstKey = statusReactionNoticeCache.keys().next().value;
        if (firstKey) statusReactionNoticeCache.delete(firstKey);
    }
    return true;
}

async function notifyOwnerVisibleStatusReaction(sock, phoneNumber, participant, emoji) {
    // تم تعطيل الإشعار الوهمي داخل محادثة الرقم نفسه نهائيًا.
    // بقاء هذه الدالة بهذا الشكل يحافظ على التوافق مع أي استدعاءات قديمة
    // بدون إرسال رسالة "تفاعلت على حالة" أو تفاعل مزيف.
    return false;
}

function touchClient(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    clientActivity.set(normalized, Date.now());
}

function clearReconnectTimer(phone) {
    const normalized = normalizePhone(phone);
    const timer = reconnectTimers.get(normalized);
    if (timer) {
        clearTimeout(timer);
        reconnectTimers.delete(normalized);
    }
}

function clearPairingRequest(phone) {
    const normalized = normalizePhone(phone);
    const pending = pairingRequests.get(normalized);
    if (pending?.timer) {
        clearTimeout(pending.timer);
    }
    pairingRequests.delete(normalized);
}

function scheduleReconnect(phone, ownerId = null, delay = RECONNECT_DELAY_MS) {
    const normalized = normalizePhone(phone);
    if (!normalized || reconnectTimers.has(normalized)) return;

    incrementAnalytics('totalReconnects');

    const timer = setTimeout(async () => {
        reconnectTimers.delete(normalized);
        try {
            await startWhatsApp(normalized, null, ownerId || getPhoneOwner(normalized));
        } catch (error) {
            console.error(`Reconnect Error (${normalized}):`, error.message);
            scheduleReconnect(normalized, ownerId || getPhoneOwner(normalized), RECONNECT_DELAY_MS);
        }
    }, delay);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    reconnectTimers.set(normalized, timer);
}

function schedulePairingTimeout(phone, telegramUserId, sessionPath, sock) {
    const normalized = normalizePhone(phone);
    clearPairingRequest(normalized);
    stoppedPairings.delete(normalized);

    const timer = setTimeout(async () => {
        const pending = pairingRequests.get(normalized);
        if (!pending || pending.completed) return;

        pending.timedOut = true;
        pairingRequests.set(normalized, pending);
        stoppedPairings.add(normalized);
        clearReconnectTimer(normalized);
        waClients.delete(normalized);
        clientActivity.delete(normalized);

        try {
            sock.ws?.close?.();
        } catch (_) {}

        try {
            sock.end?.();
        } catch (_) {}

        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        } catch (_) {}

        await notifyTelegramUser(
            telegramUserId,
            `⏱️ تم توقيف كود ربط الرقم ${normalized} بسبب تأخير إكمال الربط. أعد المحاولة مرة أخرى عندما تكون جاهزاً.`
        );

        clearPairingRequest(normalized);
    }, PAIRING_TIMEOUT_MS);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    pairingRequests.set(normalized, {
        telegramUserId: telegramUserId ? String(telegramUserId) : null,
        timer,
        timedOut: false,
        completed: false
    });
}

function startSessionSupervisor() {
    if (sessionSupervisorStarted) return;
    sessionSupervisorStarted = true;

    const interval = setInterval(() => {
        pruneExpiredStatusBackups();
        pruneUploadsDir();
        const phones = getAllLinkedPhones();

        for (const phone of phones) {
            const normalized = normalizePhone(phone);
            const sock = waClients.get(normalized);
            const pending = pairingRequests.get(normalized);

            if (pending?.timedOut) continue;

            if (!sock) {
                scheduleReconnect(normalized, getPhoneOwner(normalized), 3000);
                continue;
            }

            const readyState = Number(sock.ws?.readyState);
            if (readyState === 0 || readyState === 1) {
                touchClient(normalized);
                continue;
            }

            const lastSeen = clientActivity.get(normalized) || 0;
            if (lastSeen && Date.now() - lastSeen > CLIENT_STALE_AFTER_MS) {
                console.log(`Session Health Check Restart: ${normalized}`);
                try {
                    sock.ws?.close?.();
                } catch (_) {}
                try {
                    sock.end?.();
                } catch (_) {}
                waClients.delete(normalized);
                clearReconnectTimer(normalized);
                scheduleReconnect(normalized, getPhoneOwner(normalized), 3000);
            }
        }
    }, HEALTH_CHECK_INTERVAL_MS);

    if (typeof interval.unref === 'function') {
        interval.unref();
    }
}

// =========================
// واتساب
// =========================
async function cleanupSession(phone) {
    const normalized = normalizePhone(phone);
    const sock = waClients.get(normalized);

    clearReconnectTimer(normalized);
    clearPairingRequest(normalized);
    clientActivity.delete(normalized);
    clearPresenceTimer(normalized);
    clearGhostPendingMessagesForPhone(normalized);
    stoppedPairings.delete(normalized);

    if (sock) {
        try {
            await sock.logout();
        } catch (_) {}
        try {
            sock.end?.();
        } catch (_) {}
        waClients.delete(normalized);
    }

    try {
        fs.rmSync(getSessionPath(normalized), { recursive: true, force: true });
    } catch (error) {
        console.error(`Delete Session Error (${normalized}):`, error.message);
    }

    removeLinkedNumber(normalized);
}


function sanitizeFileFragment(value = '') {
    return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'item';
}

function getDefaultStatusBackupsDB() {
    return { items: {} };
}

function getStatusBackupsDB() {
    const db = readJSON(STATUS_BACKUPS_FILE, getDefaultStatusBackupsDB());
    db.items = db.items || {};
    return db;
}

function saveStatusBackupsDB(db) {
    db.items = db.items || {};
    writeJSON(STATUS_BACKUPS_FILE, db);
}

function buildStatusBackupKey(phone, participant, messageId) {
    return [normalizePhone(phone), normalizePhone(participant) || sanitizeFileFragment(normalizeWhatsAppJid(participant)), sanitizeFileFragment(messageId)].filter(Boolean).join('__');
}

function getStatusMessagePayload(msg) {
    const content = unwrapMessageContent(msg?.message);
    if (content?.conversation) {
        return { kind: 'text', text: String(content.conversation || '').trim(), payload: null, rawType: 'conversation' };
    }
    if (content?.extendedTextMessage?.text) {
        return { kind: 'text', text: String(content.extendedTextMessage.text || '').trim(), payload: content.extendedTextMessage, rawType: 'extendedTextMessage' };
    }
    if (content?.imageMessage) return { kind: 'image', text: String(content.imageMessage.caption || '').trim(), payload: content.imageMessage, rawType: 'imageMessage' };
    if (content?.videoMessage) return { kind: 'video', text: String(content.videoMessage.caption || '').trim(), payload: content.videoMessage, rawType: 'videoMessage' };
    if (content?.documentMessage) return { kind: 'document', text: String(content.documentMessage.caption || '').trim(), payload: content.documentMessage, rawType: 'documentMessage' };
    if (content?.audioMessage) return { kind: 'audio', text: '', payload: content.audioMessage, rawType: 'audioMessage' };
    return null;
}

function getStatusBackupExtension(kind, payload = {}) {
    const mime = String(payload?.mimetype || '').toLowerCase();
    if (kind === 'image') return mime.includes('png') ? 'png' : 'jpg';
    if (kind === 'video') return mime.includes('quicktime') ? 'mov' : 'mp4';
    if (kind === 'document') return path.extname(String(payload?.fileName || ''))?.replace(/^\./, '') || 'bin';
    if (kind === 'audio') return mime.includes('ogg') ? 'ogg' : 'mp3';
    return 'txt';
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

// =========================
// تنظيف دوري لملفات الرفع المؤقتة والرسائل من الذاكرة
// =========================
function pruneUploadsDir() {
    try {
        if (!fs.existsSync(UPLOADS_DIR)) return;
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 دقيقة
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const file of files) {
            const filePath = path.join(UPLOADS_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                if (now - stat.mtimeMs > maxAge) {
                    fs.rmSync(filePath, { force: true });
                }
            } catch(_) {}
        }
    } catch(_) {}
}

function pruneExpiredStatusBackups() {
    const db = getStatusBackupsDB();
    let changed = false;
    const now = Date.now();
    for (const [key, entry] of Object.entries(db.items || {})) {
        const expiresAt = Date.parse(entry?.expiresAt || 0);
        if (expiresAt && expiresAt > now) continue;
        const timer = statusMirrorTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            statusMirrorTimers.delete(key);
        }
        if (entry?.filePath && fs.existsSync(entry.filePath)) {
            try { fs.rmSync(entry.filePath, { force: true }); } catch (_) {}
        }
        delete db.items[key];
        changed = true;
    }
    if (changed) saveStatusBackupsDB(db);
}

async function backupStatusMessage(sock, phoneNumber, msg) {
    const settings = getActivePhoneSettings(phoneNumber);
    if (settings.keepDeletedStatus !== 'on') return null;
    if (!hasStatusContent(msg)) return null;
    const participant = extractStatusParticipant(msg);
    const messageId = String(msg?.key?.id || '').trim();
    if (!participant || !messageId) return null;

    pruneExpiredStatusBackups();
    const statusData = getStatusMessagePayload(msg);
    if (!statusData) return null;

    const key = buildStatusBackupKey(phoneNumber, participant, messageId);
    const db = getStatusBackupsDB();
    if (db.items[key]) return db.items[key];

    const entry = {
        phone: normalizePhone(phoneNumber),
        participant,
        participantPhone: normalizePhone(participant) || '',
        messageId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + STATUS_RETENTION_MS).toISOString(),
        kind: statusData.kind,
        rawType: statusData.rawType,
        text: statusData.text || '',
        caption: statusData.text || '',
        mimetype: String(statusData.payload?.mimetype || '').trim(),
        fileName: '',
        filePath: '',
        restoredAt: ''
    };

    if (statusData.kind !== 'text' && statusData.payload && typeof downloadContentFromMessage === 'function') {
        const downloadKind = statusData.kind === 'document' ? 'document' : statusData.kind;
        const stream = await downloadContentFromMessage(statusData.payload, downloadKind);
        const buffer = await streamToBuffer(stream);
        if (buffer.length) {
            const ext = getStatusBackupExtension(statusData.kind, statusData.payload);
            const fileName = `${key}.${ext}`;
            const filePath = path.join(STATUS_MEDIA_DIR, fileName);
            fs.writeFileSync(filePath, buffer);
            entry.fileName = fileName;
            entry.filePath = filePath;
        }
    }

    db.items[key] = entry;
    saveStatusBackupsDB(db);
    incrementAnalytics('totalStatusEvents');
    return entry;
}

function extractRevokedStatusId(msg) {
    const content = unwrapMessageContent(msg?.message);
    return String(content?.protocolMessage?.key?.id || '').trim();
}

function pruneProcessedStatusEvents(now = Date.now()) {
    for (const [key, expiresAt] of processedStatusEvents.entries()) {
        if (!Number.isFinite(expiresAt) || expiresAt <= now) {
            processedStatusEvents.delete(key);
        }
    }
}

function buildProcessedStatusEventKey(phoneNumber, msg) {
    const normalizedPhone = normalizePhone(phoneNumber);
    const messageId = String(msg?.key?.id || '').trim();
    const participant = normalizeWhatsAppJid(extractStatusParticipant(msg) || msg?.key?.participant || msg?.participant || '');
    if (!normalizedPhone || !messageId) return '';
    return [normalizedPhone, messageId, participant || 'unknown'].join('::');
}

function shouldHandleIncomingStatusEvent(phoneNumber, msg) {
    const cacheKey = buildProcessedStatusEventKey(phoneNumber, msg);
    if (!cacheKey) return true;
    const now = Date.now();
    pruneProcessedStatusEvents(now);
    if (processedStatusEvents.has(cacheKey)) {
        return false;
    }
    processedStatusEvents.set(cacheKey, now + STATUS_EVENT_DEDUPE_MS);
    if (processedStatusEvents.size > 5000) {
        pruneProcessedStatusEvents(now);
        while (processedStatusEvents.size > 5000) {
            const firstKey = processedStatusEvents.keys().next().value;
            if (!firstKey) break;
            processedStatusEvents.delete(firstKey);
        }
    }
    return true;
}

function clearStatusMirrorTimer(backupKey) {
    const timer = statusMirrorTimers.get(backupKey);
    if (timer) {
        clearTimeout(timer);
        statusMirrorTimers.delete(backupKey);
    }
}

async function deleteMirroredStatusMessage(sock, mirrorKey) {
    if (!sock || !mirrorKey?.id) return false;

    const attempts = [
        async () => {
            await sock.sendMessage('status@broadcast', {
                delete: {
                    ...(mirrorKey || {}),
                    remoteJid: 'status@broadcast',
                    fromMe: true
                }
            });
        },
        async () => {
            await sock.sendMessage('status@broadcast', { delete: mirrorKey });
        }
    ];

    for (const attempt of attempts) {
        try {
            await attempt();
            return true;
        } catch (_) {}
    }

    return false;
}

function getDeletedStatusRetentionNote(entry) {
    return `🛡️ تم حفظ نسخة من حالة محذوفة خلال أقل من 24 ساعة.\n👤 المصدر: ${entry.participantPhone || entry.participant || 'غير معروف'}`;
}

function buildRetainedStatusText(entry) {
    const note = getDeletedStatusRetentionNote(entry);
    return [note, String(entry.text || entry.caption || '').trim()].filter(Boolean).join('\n\n').trim();
}

function buildRetainedStatusCaption(entry) {
    const note = getDeletedStatusRetentionNote(entry);
    return [note, String(entry.caption || entry.text || '').trim()].filter(Boolean).join('\n\n').trim();
}

function buildRetainedStatusPayload(entry) {
    if (entry.kind === 'text') {
        return {
            text: buildRetainedStatusText(entry),
            backgroundColor: '#0B141A',
            font: 1
        };
    }

    if (!entry.filePath || !fs.existsSync(entry.filePath)) {
        return null;
    }

    const buffer = fs.readFileSync(entry.filePath);
    const caption = buildRetainedStatusCaption(entry);

    if (entry.kind === 'image') {
        return { image: buffer, caption, mimetype: entry.mimetype || 'image/jpeg' };
    }
    if (entry.kind === 'video') {
        return { video: buffer, caption, mimetype: entry.mimetype || 'video/mp4' };
    }

    return null;
}

function scheduleMirroredStatusExpiry(sock, backupKey, mirrorKey, expiresAt) {
    clearStatusMirrorTimer(backupKey);
    const expiresAtMs = Date.parse(expiresAt || 0);
    if (!expiresAtMs) return;
    const delayMs = expiresAtMs - Date.now();
    if (!Number.isFinite(delayMs) || delayMs <= 0 || delayMs > 2147483647) return;

    const timer = setTimeout(async () => {
        try {
            await deleteMirroredStatusMessage(sock, mirrorKey);
        } catch (_) {}
        clearStatusMirrorTimer(backupKey);
    }, delayMs);

    statusMirrorTimers.set(backupKey, timer);
}

async function repostStatusBackupToOwnStatus(sock, phoneNumber, entry) {
    if (!sock || !entry) return null;

    const payload = buildRetainedStatusPayload(entry);
    if (!payload) return null;

    const attempts = [
        async () => sock.sendMessage('status@broadcast', payload, { broadcast: true }),
        async () => sock.sendMessage('status@broadcast', payload)
    ];

    for (const attempt of attempts) {
        try {
            const result = await attempt();
            if (result?.key?.id) {
                const backupKey = buildStatusBackupKey(phoneNumber, entry.participant, entry.messageId);
                scheduleMirroredStatusExpiry(sock, backupKey, result.key, entry.expiresAt);
            }
            return result || { key: null };
        } catch (_) {}
    }

    return null;
}

async function sendStatusBackupCopy(sock, targetJid, entry) {
    const note = `🛡️ تم حفظ نسخة من حالة محذوفة خلال أقل من 24 ساعة.\n👤 المصدر: ${entry.participantPhone || entry.participant || 'غير معروف'}`;
    const caption = [note, entry.caption || entry.text || ''].filter(Boolean).join('\n\n');

    if (entry.kind === 'text') {
        await sock.sendMessage(targetJid, { text: caption });
        return true;
    }

    if (!entry.filePath || !fs.existsSync(entry.filePath)) {
        await sock.sendMessage(targetJid, { text: caption });
        return true;
    }

    const buffer = fs.readFileSync(entry.filePath);
    if (entry.kind === 'image') {
        await sock.sendMessage(targetJid, { image: buffer, caption, mimetype: entry.mimetype || 'image/jpeg' });
        return true;
    }
    if (entry.kind === 'video') {
        await sock.sendMessage(targetJid, { video: buffer, caption, mimetype: entry.mimetype || 'video/mp4' });
        return true;
    }
    if (entry.kind === 'document') {
        await sock.sendMessage(targetJid, { document: buffer, fileName: entry.fileName || 'status-backup.bin', caption, mimetype: entry.mimetype || 'application/octet-stream' });
        return true;
    }
    if (entry.kind === 'audio') {
        await sock.sendMessage(targetJid, { audio: buffer, mimetype: entry.mimetype || 'audio/mpeg', ptt: false });
        await sock.sendMessage(targetJid, { text: note });
        return true;
    }

    await sock.sendMessage(targetJid, { text: caption });
    return true;
}

async function restoreDeletedStatusIfNeeded(sock, phoneNumber, msg) {
    const settings = getActivePhoneSettings(phoneNumber);
    if (settings.keepDeletedStatus !== 'on') return false;

    const revokedId = extractRevokedStatusId(msg);
    const participant = extractStatusParticipant(msg);
    if (!revokedId || !participant) return false;

    pruneExpiredStatusBackups();
    const key = buildStatusBackupKey(phoneNumber, participant, revokedId);
    const db = getStatusBackupsDB();
    const entry = db.items[key];
    if (!entry) return false;
    if (entry.restoredAt) return true;

    entry.deletedAt = new Date().toISOString();
    entry.expiresAt = new Date(Date.now() + STATUS_RETENTION_MS).toISOString();
    db.items[key] = entry;
    saveStatusBackupsDB(db);
    updateStatusArchiveEntry(phoneNumber, participant, revokedId, {
        deletedAt: entry.deletedAt,
        deletedExpiresAt: entry.expiresAt,
        isDeletedByOwner: true
    });

    try {
        const reposted = await repostStatusBackupToOwnStatus(sock, phoneNumber, entry);
        if (reposted) {
            entry.restoredAt = new Date().toISOString();
            entry.mirroredStatusKey = reposted?.key || null;
            db.items[key] = entry;
            saveStatusBackupsDB(db);
            updateStatusArchiveEntry(phoneNumber, participant, revokedId, {
                deletedAt: entry.deletedAt,
                deletedExpiresAt: entry.expiresAt,
                restoredAt: entry.restoredAt,
                mirroredStatusKey: entry.mirroredStatusKey || null,
                isDeletedByOwner: true
            });
            return true;
        }
    } catch (_) {}

    const ownJid = normalizeWhatsAppJid(sock.user?.id);
    const phoneJid = `${normalizePhone(phoneNumber)}@s.whatsapp.net`;
    const targets = Array.from(new Set([ownJid, phoneJid].filter(Boolean)));

    for (const target of targets) {
        try {
            await sendStatusBackupCopy(sock, target, entry);
            entry.restoredAt = new Date().toISOString();
            db.items[key] = entry;
            saveStatusBackupsDB(db);
            updateStatusArchiveEntry(phoneNumber, participant, revokedId, {
                deletedAt: entry.deletedAt,
                deletedExpiresAt: entry.expiresAt,
                restoredAt: entry.restoredAt,
                isDeletedByOwner: true
            });
            return true;
        } catch (_) {}
    }

    return false;
}

function buildGhostChatKey(phone, remoteJid) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedRemote = normalizeWhatsAppJid(remoteJid);
    if (!normalizedPhone || !normalizedRemote) return '';
    return `${normalizedPhone}::${normalizedRemote}`;
}

function rememberGhostPendingMessage(phone, msg) {
    if (!msg?.key?.id || msg.key?.fromMe) return;
    const key = buildGhostChatKey(phone, msg.key?.remoteJid);
    if (!key) return;
    const pending = ghostPendingReads.get(key) || [];
    pending.push({ ...msg.key, fromMe: false, remoteJid: normalizeWhatsAppJid(msg.key?.remoteJid) });
    ghostPendingReads.set(key, pending.slice(-50));
}

async function flushGhostPendingMessages(sock, phone, remoteJid) {
    const key = buildGhostChatKey(phone, remoteJid);
    if (!key) return false;
    const pending = ghostPendingReads.get(key) || [];
    if (!pending.length) return false;
    try {
        await sock.readMessages(pending);
        ghostPendingReads.delete(key);
        return true;
    } catch (_) {
        return false;
    }
}

function dropGhostPendingMessages(phone, remoteJid) {
    const key = buildGhostChatKey(phone, remoteJid);
    if (!key) return false;
    return ghostPendingReads.delete(key);
}

function clearGhostPendingMessagesForPhone(phone) {
    const prefix = `${normalizePhone(phone)}::`;
    for (const key of ghostPendingReads.keys()) {
        if (key.startsWith(prefix)) {
            ghostPendingReads.delete(key);
        }
    }
}

function buildStatusParticipantCandidates(msg, participant = '') {
    const set = new Set();
    const addCandidate = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return;

        const normalizedJid = normalizeWhatsAppJid(raw);
        if (normalizedJid && normalizedJid !== 'status@broadcast' && !normalizedJid.endsWith('@g.us') && !normalizedJid.includes('@newsletter')) {
            set.add(normalizedJid);
            return;
        }

        const normalizedPhone = normalizePhone(raw);
        if (normalizedPhone) {
            set.add(`${normalizedPhone}@s.whatsapp.net`);
        }
    };

    const content = unwrapMessageContent(msg?.message);
    [
        participant,
        msg?.key?.participant,
        msg?.participant,
        msg?.message?.messageContextInfo?.participant,
        content?.messageContextInfo?.participant,
        content?.extendedTextMessage?.contextInfo?.participant,
        content?.imageMessage?.contextInfo?.participant,
        content?.videoMessage?.contextInfo?.participant,
        content?.documentMessage?.contextInfo?.participant,
        content?.reactionMessage?.key?.participant,
        content?.protocolMessage?.key?.participant
    ].forEach(addCandidate);

    return Array.from(set).filter(Boolean);
}

function pickPreferredStatusParticipant(participants = [], fallback = '') {
    const normalizedList = Array.isArray(participants)
        ? participants.map((item) => normalizeWhatsAppJid(item)).filter(Boolean)
        : [];

    const normalizedFallback = normalizeWhatsAppJid(fallback);
    if (normalizedFallback && normalizedList.includes(normalizedFallback)) {
        return normalizedFallback;
    }

    const preferredUserJid = normalizedList.find((item) => item.endsWith('@s.whatsapp.net'));
    if (preferredUserJid) {
        return preferredUserJid;
    }

    const preferredLid = normalizedList.find((item) => item.endsWith('@lid'));
    if (preferredLid) {
        return preferredLid;
    }

    if (normalizedFallback && normalizedFallback !== 'status@broadcast' && !normalizedFallback.endsWith('@g.us') && !normalizedFallback.includes('@newsletter')) {
        return normalizedFallback;
    }

    const fallbackPhone = !String(fallback || '').includes('@') ? normalizePhone(fallback) : '';
    if (fallbackPhone) {
        return `${fallbackPhone}@s.whatsapp.net`;
    }

    return normalizedList[0] || '';
}

function buildStatusReactionKey(msg, participant = '') {
    const participantCandidates = buildStatusParticipantCandidates(msg, participant);
    const selectedParticipant = pickPreferredStatusParticipant(
        participantCandidates,
        participant || msg?.key?.participant || msg?.participant
    );
    return {
        ...(msg?.key || {}),
        remoteJid: 'status@broadcast',
        participant: selectedParticipant,
        fromMe: false
    };
}

function buildStatusReactionSendOptions(participants = []) {
    const set = new Set();
    const sourceList = Array.isArray(participants) ? participants : buildStatusParticipantCandidates(null, participants);

    for (const item of sourceList) {
        const normalized = normalizeWhatsAppJid(item);
        if (isDirectUserJid(normalized)) {
            set.add(normalized);
            continue;
        }

        const plainPhone = !String(item || '').includes('@') ? normalizePhone(item) : '';
        if (plainPhone) {
            set.add(`${plainPhone}@s.whatsapp.net`);
        }
    }

    const options = {
        broadcast: true
    };

    if (set.size) {
        options.statusJidList = Array.from(set);
    }

    return options;
}

function buildQuotedStatusMessage(msg, participant = '') {
    if (!msg?.message || !msg?.key?.id) {
        return null;
    }

    const participantCandidates = buildStatusParticipantCandidates(msg, participant);
    const selectedParticipant = pickPreferredStatusParticipant(
        participantCandidates,
        participant || msg?.participant || msg?.key?.participant
    );
    return {
        ...msg,
        key: buildStatusReactionKey(msg, selectedParticipant),
        participant: selectedParticipant
    };
}

async function sendStatusReplyMessage(sock, participant, messageText, msg) {
    if (!sock || !participant || !String(messageText || '').trim()) {
        return false;
    }

    const cleanMessage = String(messageText).trim();
    const quotedStatusMessage = buildQuotedStatusMessage(msg, participant);
    const attempts = [
        async () => {
            if (!quotedStatusMessage) {
                throw new Error('Status quote unavailable');
            }
            await sock.sendMessage(participant, { text: cleanMessage }, { quoted: quotedStatusMessage });
        },
        async () => {
            if (!msg?.message || !msg?.key?.id) {
                throw new Error('Original status message unavailable');
            }
            await sock.sendMessage(participant, { text: cleanMessage }, { quoted: msg });
        },
        async () => {
            await sock.sendMessage(participant, { text: cleanMessage });
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
        throw lastError;
    }

    return false;
}

async function sendStatusReactionWithFallbacks(sock, phoneNumber, msg, participant) {
    const participantCandidates = buildStatusParticipantCandidates(msg, participant);
    const primaryParticipant = pickPreferredStatusParticipant(participantCandidates, participant || msg?.key?.participant || msg?.participant);
    const reactionKey = buildStatusReactionKey(msg, primaryParticipant);
    if (!sock || !primaryParticipant || !reactionKey.id) {
        return '';
    }

    const emoji = pickRandomStatusEmoji(phoneNumber) || reactionEmoji || DEFAULT_REACTION_EMOJI;
    if (!emoji) {
        return '';
    }

    reactionEmoji = emoji;

    const robustResult = await sendRobustStatusReaction({
        sock,
        msg,
        emoji,
        candidates: [primaryParticipant, ...participantCandidates],
        delayFn: typeof delay === 'function' ? delay : null
    });

    if (robustResult?.ok) {
        return emoji;
    }

    const sendOptions = buildStatusReactionSendOptions(participantCandidates);
    const keyVariants = Array.from(new Map(
        participantCandidates
            .map((candidate) => {
                const normalizedParticipant = pickPreferredStatusParticipant(participantCandidates, candidate);
                if (!normalizedParticipant) return null;
                return [
                    `${String(msg?.key?.id || '')}:${normalizedParticipant}`,
                    {
                        ...(msg?.key || {}),
                        id: String(msg?.key?.id || '').trim(),
                        remoteJid: 'status@broadcast',
                        participant: normalizedParticipant,
                        fromMe: false
                    }
                ];
            })
            .filter(Boolean)
    ).values()).filter((item) => item?.id);

    const attempts = [
        ...keyVariants.map((keyVariant) => async () => {
            await sock.sendMessage('status@broadcast', {
                react: {
                    text: emoji,
                    key: keyVariant
                }
            }, sendOptions);
        }),
        async () => {
            await sock.sendMessage(primaryParticipant, {
                react: {
                    text: emoji,
                    key: buildQuotedStatusMessage(msg, primaryParticipant)?.key || reactionKey
                }
            });
        }
    ];

    let lastError = robustResult?.error || null;
    for (const attempt of attempts) {
        try {
            if (typeof delay === 'function') {
                await delay(180);
            }
            await attempt();
            const readKeys = keyVariants.length ? keyVariants : [reactionKey];
            for (const readKey of readKeys) {
                try {
                    await sock.readMessages([readKey]);
                    break;
                } catch (_) {}
            }
            return emoji;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    return '';
}


async function autoSaveIncomingStatusToOwner(sock, phoneNumber, msg) {
    const settings = getActivePhoneSettings(phoneNumber);
    if (settings.autoSave !== 'on') return false;
    if (!hasStatusContent(msg)) return false;

    const targetJid = normalizeWhatsAppJid(sock.user?.id) || `${normalizePhone(phoneNumber)}@s.whatsapp.net`;
    if (!targetJid) return false;

    const participant = extractStatusParticipant(msg);
    const ownPhone = normalizePhone(phoneNumber);
    const participantPhone = normalizePhone(participant);
    if (participantPhone && ownPhone && participantPhone === ownPhone) return false;

    const statusData = getStatusMessagePayload(msg);
    if (!statusData) return false;

    const textBody = String(statusData.text || '').trim();
    const caption = textBody;

    if (statusData.kind === 'text') {
        if (!caption) return false;
        await sock.sendMessage(targetJid, { text: caption });
        return true;
    }

    if (!statusData.payload || typeof downloadContentFromMessage !== 'function') {
        if (!caption) return false;
        await sock.sendMessage(targetJid, { text: caption });
        return true;
    }

    const downloadKind = statusData.kind === 'document' ? 'document' : statusData.kind;
    const stream = await downloadContentFromMessage(statusData.payload, downloadKind);
    const buffer = await streamToBuffer(stream);
    if (!buffer.length) {
        if (!caption) return false;
        await sock.sendMessage(targetJid, { text: caption });
        return true;
    }

    if (statusData.kind === 'image') {
        await sock.sendMessage(targetJid, { image: buffer, caption, mimetype: statusData.payload?.mimetype || 'image/jpeg' });
        return true;
    }
    if (statusData.kind === 'video') {
        await sock.sendMessage(targetJid, { video: buffer, caption, mimetype: statusData.payload?.mimetype || 'video/mp4' });
        return true;
    }
    if (statusData.kind === 'document') {
        await sock.sendMessage(targetJid, {
            document: buffer,
            fileName: statusData.payload?.fileName || 'status.bin',
            caption,
            mimetype: statusData.payload?.mimetype || 'application/octet-stream'
        });
        return true;
    }

    if (!caption) return false;
    await sock.sendMessage(targetJid, { text: caption });
    return true;
}

async function handleStatusReaction(sock, phoneNumber, msg) {
    try {
        const settings = getActivePhoneSettings(phoneNumber);

        if (extractRevokedStatusId(msg)) {
            return;
        }

        try {
            await archiveIncomingStatusForTelegram(sock, phoneNumber, msg);
        } catch (archiveError) {
            console.error(`Status Archive Error (${phoneNumber}):`, archiveError.message);
        }

        if (!hasStatusContent(msg)) return;
        if (!shouldHandleIncomingStatusEvent(phoneNumber, msg)) return;

        const participant = extractStatusParticipant(msg);
        const ownJid = normalizeWhatsAppJid(sock.user?.id);
        const participantCandidates = buildStatusParticipantCandidates(msg, participant);
        const reactionKey = buildStatusReactionKey(msg, participant);

        if (!reactionKey.id) return;

        if (participant && participant !== ownJid) {
            upsertPhoneContact(phoneNumber, participant, {
                name: msg?.pushName,
                pushName: msg?.pushName,
                lastSeenAt: new Date().toISOString()
            });
        }

        const shouldReadStatus = settings.autoStatusRead === 'on' || settings.autoStatusReact === 'on';
        const forceVisibleReaction = settings.autoStatusReact === 'on';
        if (shouldReadStatus && (settings.ghostMode !== 'on' || forceVisibleReaction)) {
            const readAttempts = Array.from(new Map([
                [reactionKey, `${reactionKey.id}:${reactionKey.participant || ''}`],
                ...(participantCandidates.map((candidate) => {
                    const key = buildStatusReactionKey(msg, candidate);
                    return [key, `${key.id}:${key.participant || ''}`];
                })),
                ...(msg.key ? [[{ ...msg.key, remoteJid: 'status@broadcast', participant: participant || msg.key?.participant || msg.participant, fromMe: false }, `${msg.key.id}:${participant || msg.key?.participant || msg.participant || ''}`]] : []),
                ...(msg.key ? [[msg.key, `${msg.key.id}:original`]] : [])
            ].filter((entry) => entry?.[0]?.id).map(([key, uniq]) => [uniq, [key]])).values());

            let readSuccess = false;
            for (let round = 0; round < 2 && !readSuccess; round += 1) {
                if (round > 0 && typeof delay === 'function') {
                    await delay(500);
                }
                for (const attempt of readAttempts) {
                    try {
                        await sock.readMessages(attempt);
                        readSuccess = true;
                        break;
                    } catch (_) {}
                }
            }
        }

        let reactedEmoji = '';
        if (settings.autoStatusReact === 'on' && participant && participant !== ownJid) {
            if (typeof delay === 'function') {
                await delay(650);
            }

            try {
                reactedEmoji = await sendStatusReactionWithFallbacks(sock, phoneNumber, msg, participant);
            } catch (_) {}

            if (!reactedEmoji) {
                if (typeof delay === 'function') {
                    await delay(1200);
                }
                reactedEmoji = await sendStatusReactionWithFallbacks(sock, phoneNumber, msg, participant);
            }

            if (reactedEmoji) {
                incrementAnalytics('totalStatusReactions');
            }
        }

        const reactedToStatus = Boolean(reactedEmoji);
        const globalStatusMessage = reactedToStatus ? getGlobalStatusLikeMessage(phoneNumber) : '';
        const fallbackStatusMessage = settings.statusMsgSend === 'on' && participant && participant !== ownJid ? buildStatusAutoMessage(phoneNumber) : '';
        const messageText = globalStatusMessage || fallbackStatusMessage;

        if (messageText && participant && participant !== ownJid) {
            await sendStatusReplyMessage(sock, participant, messageText, msg);
        }
    } catch (error) {
        console.error(`Status Reaction Error (${phoneNumber}):`, error.message);
    }
}

async function reactToIncomingChatMessage(sock, phoneNumber, msg) {
    try {
        if (!msg?.key?.id || msg.key?.fromMe) return;
        const chatJid = normalizeWhatsAppJid(msg.key?.remoteJid);
        if (!chatJid || chatJid === 'status@broadcast') return;
        await sock.sendMessage(chatJid, {
            react: {
                text: pickRandomStatusEmoji(phoneNumber),
                key: msg.key
            }
        });
    } catch (error) {
        console.error(`Incoming React Error (${phoneNumber}):`, error.message);
    }
}

async function handlePublicLinkedNumberCommand(sock, phoneNumber, msg) {
    const from = normalizeWhatsAppJid(msg.key?.remoteJid);
    if (!from || from.endsWith('@g.us') || msg.key?.fromMe) return false;

    const text = String(textFromMessage(msg) || '').trim();
    if (!text) return false;

    if (/^\.bot$/i.test(text)) {
        const botMessage = buildPublicLinkedNumberCommands(phoneNumber);
        if (!String(botMessage || '').trim()) {
            return true;
        }
        await sock.sendMessage(
            from,
            {
                text: botMessage
            },
            { quoted: msg }
        );
        return true;
    }

    return false;
}

async function handleIncomingMessage(sock, phoneNumber, msg) {
    try {
        if (!msg?.message) return;
        const from = normalizeWhatsAppJid(msg.key?.remoteJid);
        if (!from) return;

        const settings = getActivePhoneSettings(phoneNumber);

        if (!msg.key?.fromMe && settings.ghostMode === 'on' && from !== 'status@broadcast') {
            await applyLivePhoneSettingsSideEffects(phoneNumber);
        }

        if (from === 'status@broadcast') {
            await handleStatusReaction(sock, phoneNumber, msg);
            return;
        }

        if (msg.key?.fromMe) {
            incrementAnalytics('totalOwnerReplies');
            if (settings.ghostMode === 'on') {
                dropGhostPendingMessages(phoneNumber, from);
            }
            await handleOwnerControlMessage(sock, phoneNumber, msg);
            return;
        }

        const revokedMessageKey = extractRevokedMessageKey(msg);
        if (revokedMessageKey) {
            await handleAntiDeleteProtocolMessage(sock, phoneNumber, msg);
            return;
        }

        incrementAnalytics('totalIncomingMessages');
        if (!from.endsWith('@g.us')) {
            upsertPhoneContact(phoneNumber, from, { name: msg?.pushName, pushName: msg?.pushName });
            if (settings.autoPrivateReact === 'on') {
                await reactToIncomingChatMessage(sock, phoneNumber, msg);
            }
            await relayDirectContactMessageToTelegram(phoneNumber, from, msg);
        }
        await backupIncomingMessageForAntiDelete(sock, phoneNumber, msg);
        const text = textFromMessage(msg);
        const isGroup = from.endsWith('@g.us');

        if (!isGroup && settings.ghostMode === 'on' && msg.key) {
            rememberGhostPendingMessage(phoneNumber, msg);
        }

        if (!isGroup) {
            const handledPublicCommand = await handlePublicLinkedNumberCommand(sock, phoneNumber, msg);
            if (handledPublicCommand) return;
        }

        if (settings.autoRead === 'on' && settings.ghostMode !== 'on' && msg.key) {
            try {
                await sock.readMessages([msg.key]);
            } catch (_) {}
        }

        if (isGroup) {
            if (!isGroupModeAllowed(settings)) return;
            if (!text) return;

            if (settings.antiLink === 'on' && /(https?:\/\/|chat\.whatsapp\.com\/|wa\.me\/)/i.test(text)) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (_) {}
            }

            if (settings.antiBad === 'on' && /(fuck|shit|bitch|كس|خول|متناك|شرموطة|زب|كلب)/i.test(text)) {
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (_) {}
            }

            return;
        }

        if (!isPrivateModeAllowed(settings)) return;
        if (!text) return;

        try {
            await sendLinkedNumberAutoReply(sock, phoneNumber, from, msg, text);
        } catch (error) {
            console.error(`Linked Auto Reply Error (${phoneNumber}):`, error.message);
        }

        return;
    } catch (error) {
        console.error(`Incoming Message Error (${phoneNumber}):`, error.message);
    }
}

async function startWhatsApp(phoneNumber, telegramCtx = null, ownerId = null, pairingNotifier = null) {
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) return null;

    clearReconnectTimer(normalizedPhone);
    stoppedPairings.delete(normalizedPhone);

    const existing = waClients.get(normalizedPhone);
    if (existing) {
        touchClient(normalizedPhone);
        return existing;
    }

    const sessionPath = getSessionPath(normalizedPhone);
    ensureDir(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    const requestedOwnerId = String(ownerId || telegramCtx?.from?.id || getPhoneOwner(normalizedPhone) || '');

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        connectTimeoutMs: 90000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 15000,
        markOnlineOnConnect: false
    });

    sock.ev.setMaxListeners?.(0);
    sock.ws?.setMaxListeners?.(0);

    waClients.set(normalizedPhone, sock);
    touchClient(normalizedPhone);

    if (!state.creds.registered) {
        try {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            const code = await sock.requestPairingCode(normalizedPhone);
            schedulePairingTimeout(normalizedPhone, requestedOwnerId, sessionPath, sock);

            const pairingMessage = `✅ كود الربط لرقم ${normalizedPhone}:\n\n\`${code}\`\n\n🔐 افتح واتساب > الأجهزة المرتبطة > ربط جهاز > ثم أدخل الكود.\n⏳ إذا تأخر إكمال الربط كثيراً سيتم إيقاف الكود تلقائياً وإشعارك برسالة.`;

            if (telegramCtx) {
                await safeReply(telegramCtx, pairingMessage);
            }

            if (typeof pairingNotifier === 'function') {
                await pairingNotifier(pairingMessage);
            }
        } catch (error) {
            console.error(`Pairing Error (${normalizedPhone}):`, error);
            clearPairingRequest(normalizedPhone);
            waClients.delete(normalizedPhone);
            clientActivity.delete(normalizedPhone);
            clearChannelPromotionTimer(normalizedPhone);
            clearPresenceTimer(normalizedPhone);
            const failMessage = '❌ فشل في طلب كود الربط. تأكد من الرقم ثم حاول مرة أخرى بعد دقيقة.';
            if (telegramCtx) {
                await safeReply(telegramCtx, failMessage);
            }
            if (typeof pairingNotifier === 'function') {
                await pairingNotifier(failMessage);
            }
            return null;
        }
    }

    sock.ev.on('creds.update', async () => {
        touchClient(normalizedPhone);
        await saveCreds();
    });

    sock.ev.on('contacts.upsert', (items = []) => {
        try {
            touchClient(normalizedPhone);
            processPhoneContactsUpdates(normalizedPhone, items);
        } catch (error) {
            console.error(`contacts.upsert Error (${normalizedPhone}):`, error.message);
        }
    });

    sock.ev.on('contacts.update', (items = []) => {
        try {
            touchClient(normalizedPhone);
            processPhoneContactsUpdates(normalizedPhone, items);
        } catch (error) {
            console.error(`contacts.update Error (${normalizedPhone}):`, error.message);
        }
    });

    sock.ev.on('messaging-history.set', async (history = {}) => {
        try {
            touchClient(normalizedPhone);
            processPhoneContactsUpdates(normalizedPhone, history?.contacts || []);
            const historyMessages = Array.isArray(history?.messages) ? history.messages : [];
            for (const msg of historyMessages) {
                if (normalizeWhatsAppJid(msg?.key?.remoteJid) !== 'status@broadcast') continue;
                await handleIncomingMessage(sock, normalizedPhone, msg);
            }
        } catch (error) {
            console.error(`messaging-history.set Error (${normalizedPhone}):`, error.message);
        }
    });

    sock.ev.on('messages.upsert', async (payload) => {
        try {
            touchClient(normalizedPhone);
            const messages = payload?.messages || [];
            for (const msg of messages) {
                await handleIncomingMessage(sock, normalizedPhone, msg);
            }
        } catch (error) {
            console.error(`messages.upsert Error (${normalizedPhone}):`, error.message);
        }
    });

    sock.ev.on('messages.update', async (updates = []) => {
        try {
            touchClient(normalizedPhone);
            for (const item of updates) {
                if (!item?.update) continue;
                const remoteJid = normalizeWhatsAppJid(item?.key?.remoteJid);
                const updateContent = unwrapMessageContent(item.update);
                const isStatusUpdate = remoteJid === 'status@broadcast';
                const isRevocationUpdate = Boolean(updateContent?.protocolMessage?.key?.id);
                if (!isStatusUpdate && !isRevocationUpdate) continue;
                await handleIncomingMessage(sock, normalizedPhone, {
                    key: item.key,
                    message: item.update,
                    participant: item.key?.participant || item.update?.protocolMessage?.key?.participant
                });
            }
        } catch (error) {
            console.error(`messages.update Error (${normalizedPhone}):`, error.message);
        }
    });

    sock.ev.on('call', async (calls = []) => {
        try {
            const settings = getActivePhoneSettings(normalizedPhone);
            if (settings.antiCall !== 'on') return;
            const excludedNumbers = parseNumberList(settings.excludeCallNumbers);
            for (const call of calls) {
                const fromJid = normalizeWhatsAppJid(call?.from || call?.chatId || call?.peerJid || '');
                const callerNumber = normalizePhone(fromJid);
                if (!callerNumber || excludedNumbers.has(callerNumber)) continue;
                try {
                    if (typeof sock.rejectCall === 'function' && call?.id && fromJid) {
                        await sock.rejectCall(call.id, fromJid);
                    }
                } catch (_) {}
                try {
                    await sock.updateBlockStatus(fromJid, 'block');
                } catch (_) {}
            }
        } catch (error) {
            console.error(`Call Handler Error (${normalizedPhone}):`, error.message);
        }
    });

    sock.ev.on('connection.update', async (update) => {
        touchClient(normalizedPhone);
        const { connection, lastDisconnect } = update;
        const pendingPair = pairingRequests.get(normalizedPhone);

        try {
            if (connection === 'open') {
                console.log(`WhatsApp Connected Successfully! ✅ ${normalizedPhone}`);
                incrementAnalytics('totalSessionsStarted');
                clearReconnectTimer(normalizedPhone);
                startPresenceKeepAlive(sock, normalizedPhone);

                try {
                    await applyLivePhoneSettingsSideEffects(normalizedPhone);
                } catch (error) {
                    console.error(`applyLivePhoneSettingsSideEffects Error (${normalizedPhone}):`, error.message || error);
                }

                try {
                    const linkedEmoji = getPhoneEmoji(normalizedPhone) || DEFAULT_REACTION_EMOJI;
                    ensureLinkedPhoneDefaults(normalizedPhone, { emoji: linkedEmoji });
                } catch (error) {
                    console.error(`Status Reaction Defaults Error (${normalizedPhone}):`, error.message || error);
                }

                // [DISABLED] Auto channel promotion scheduler disabled by owner
                // try {
                //     startChannelPromotionScheduler(sock, normalizedPhone);
                // } catch (error) {
                //     console.error(`startChannelPromotionScheduler Error (${normalizedPhone}):`, error.message || error);
                // }

                const finalOwnerId = requestedOwnerId || getPhoneOwner(normalizedPhone);
                if (finalOwnerId) {
                    addLinkedNumber(finalOwnerId, normalizedPhone);
                }

                if (pendingPair) {
                    pendingPair.completed = true;
                    pairingRequests.set(normalizedPhone, pendingPair);
                    stoppedPairings.delete(normalizedPhone);

                    try {
                        await autoJoinWhatsAppChannel(sock, normalizedPhone);
                    } catch (error) {
                        console.error(`autoJoinWhatsAppChannel Error (${normalizedPhone}):`, error.message || error);
                    }

                    try {
                        await sendLinkedNumberWelcome(sock, normalizedPhone);
                    } catch (error) {
                        console.error(`sendLinkedNumberWelcome Error (${normalizedPhone}):`, error.message || error);
                    }

                    const settingsAccessMessage = buildPhoneSettingsAccessMessage(normalizedPhone);

                    try {
                        await notifyTelegramUser(
                            finalOwnerId,
                            `✅ تم ربط الرقم ${normalizedPhone} بنجاح وهو الآن يعمل بإعادة اتصال ومراقبة تلقائية.
إيموجي التفاعل الحالي: ${getPhoneEmoji(normalizedPhone)}
🔐 تم إنشاء كلمة سر ومجلد إعدادات خاصين بهذا الرقم فقط.`
                        );
                    } catch (error) {
                        console.error(`notifyTelegramUser Success Message Error (${normalizedPhone}):`, error.message || error);
                    }

                    if (settingsAccessMessage) {
                        try {
                            await notifyTelegramUser(finalOwnerId, settingsAccessMessage);
                        } catch (error) {
                            console.error(`notifyTelegramUser Settings Message Error (${normalizedPhone}):`, error.message || error);
                        }
                    }

                    clearPairingRequest(normalizedPhone);
                }
            }

            if (connection === 'close') {
                waClients.delete(normalizedPhone);
                clientActivity.delete(normalizedPhone);

                const permanentDisconnect = isPermanentDisconnect(lastDisconnect);
                const shouldReconnect = !permanentDisconnect;

                if (permanentDisconnect) {
                    console.log(`Session Logged Out Or Invalidated: ${normalizedPhone}`);
                    const existingOwnerId = requestedOwnerId || getPhoneOwner(normalizedPhone);
                    purgeSessionData(normalizedPhone);
                    try {
                        await notifyTelegramUser(existingOwnerId, `⚠️ خرج الرقم ${normalizedPhone} من واتساب أو تم حظره/إبطال الجلسة، لذلك حذفت الجلسة من البوت تلقائياً.`);
                    } catch (error) {
                        console.error(`notifyTelegramUser Permanent Disconnect Error (${normalizedPhone}):`, error.message || error);
                    }
                    return;
                }

                if (pendingPair?.timedOut || stoppedPairings.has(normalizedPhone)) {
                    clearReconnectTimer(normalizedPhone);
                    return;
                }

                if (shouldReconnect) {
                    console.log(`Reconnecting WhatsApp Session: ${normalizedPhone}`);
                    scheduleReconnect(normalizedPhone, requestedOwnerId || getPhoneOwner(normalizedPhone));
                }
            }
        } catch (error) {
            console.error(`connection.update Error (${normalizedPhone}):`, error?.stack || error?.message || error);
        }
    });

    return sock;
}

async function startAllSavedSessions() {
    const phones = getAllLinkedPhones();
    for (const phone of phones) {
        try {
            await startWhatsApp(phone, null, getPhoneOwner(phone));
        } catch (error) {
            console.error(`Boot Session Error (${phone}):`, error.message);
        }
    }
}


function getDefaultStatusArchiveDB() {
    return { items: {} };
}

function getStatusArchiveDB() {
    const db = readJSON(STATUS_ARCHIVE_FILE, getDefaultStatusArchiveDB());
    db.items = db.items || {};
    return db;
}

function saveStatusArchiveDB(db) {
    db.items = db.items || {};
    writeJSON(STATUS_ARCHIVE_FILE, db);
}

function getDefaultProfileScheduleDB() {
    return { phones: {} };
}

function getProfileScheduleDB() {
    const db = readJSON(PROFILE_SCHEDULE_FILE, getDefaultProfileScheduleDB());
    db.phones = db.phones || {};
    return db;
}

function saveProfileScheduleDB(db) {
    db.phones = db.phones || {};
    writeJSON(PROFILE_SCHEDULE_FILE, db);
}

function getPhoneProfileState(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return {};
    const db = getProfileScheduleDB();
    return db.phones[normalizedPhone] || {};
}

function savePhoneProfileState(phone, patch = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return {};
    const db = getProfileScheduleDB();
    db.phones[normalizedPhone] = {
        ...(db.phones[normalizedPhone] || {}),
        ...patch,
        updatedAt: new Date().toISOString()
    };
    saveProfileScheduleDB(db);
    return db.phones[normalizedPhone];
}

function buildStatusArchiveId(phone, participant, messageId) {
    const seed = [normalizePhone(phone), normalizeWhatsAppJid(participant), String(messageId || '').trim()].join('|');
    return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 24);
}

function pruneStatusArchive(phone = '') {
    const targetPhone = normalizePhone(phone);
    const db = getStatusArchiveDB();
    const grouped = new Map();

    for (const [key, entry] of Object.entries(db.items || {})) {
        const entryPhone = normalizePhone(entry?.phone || '');
        if (!entryPhone) continue;
        if (targetPhone && entryPhone !== targetPhone) continue;
        if (!grouped.has(entryPhone)) grouped.set(entryPhone, []);
        grouped.get(entryPhone).push([key, entry]);
    }

    let changed = false;
    for (const [, items] of grouped.entries()) {
        items.sort((a, b) => Date.parse(b[1]?.createdAt || 0) - Date.parse(a[1]?.createdAt || 0));
        const overflow = items.slice(120);
        for (const [key, entry] of overflow) {
            if (entry?.filePath && fs.existsSync(entry.filePath)) {
                try { fs.rmSync(entry.filePath, { force: true }); } catch (_) {}
            }
            delete db.items[key];
            changed = true;
        }
    }

    if (changed) saveStatusArchiveDB(db);
}

function getPhoneStatusArchiveEntries(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return [];
    const db = getStatusArchiveDB();
    return Object.values(db.items || {})
        .filter((entry) => normalizePhone(entry?.phone || '') === normalizedPhone)
        .sort((a, b) => Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0));
}

function getStatusArchiveEntry(phone, statusId) {
    const normalizedPhone = normalizePhone(phone);
    const id = String(statusId || '').trim();
    if (!normalizedPhone || !id) return null;
    const db = getStatusArchiveDB();
    const entry = db.items[id];
    if (!entry) return null;
    return normalizePhone(entry.phone || '') === normalizedPhone ? entry : null;
}

function formatStatusArchiveOwner(entry = {}) {
    return String(entry.participantName || entry.participantPhone || normalizePhone(entry.participant || '') || 'غير معروف');
}

function formatStatusArchiveType(kind = '') {
    return ({ text: 'نص', image: 'صورة', video: 'فيديو', document: 'ملف', audio: 'صوت' }[String(kind || '').toLowerCase()] || 'غير معروف');
}

function formatStatusArchiveTime(value = '') {
    const time = Date.parse(value || 0);
    if (!time) return 'غير معروف';
    try {
        return new Date(time).toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (_) {
        return new Date(time).toISOString();
    }
}

async function archiveIncomingStatusForTelegram(sock, phoneNumber, msg) {
    if (!hasStatusContent(msg)) return null;
    const participant = extractStatusParticipant(msg);
    const ownPhone = normalizePhone(phoneNumber);
    const participantPhone = normalizePhone(participant);
    if (!participant || (participantPhone && participantPhone === ownPhone)) return null;

    const statusData = getStatusMessagePayload(msg);
    const messageId = String(msg?.key?.id || '').trim();
    if (!statusData || !messageId) return null;

    const archiveId = buildStatusArchiveId(phoneNumber, participant, messageId);
    upsertPhoneContact(phoneNumber, participant, { name: msg?.pushName, pushName: msg?.pushName });
    const db = getStatusArchiveDB();
    if (db.items[archiveId]) return db.items[archiveId];

    const entry = {
        id: archiveId,
        phone: ownPhone,
        participant,
        participantPhone,
        participantName: String(msg?.pushName || participantPhone || participant || 'غير معروف').trim(),
        messageId,
        kind: statusData.kind,
        text: String(statusData.text || '').trim(),
        caption: String(statusData.text || '').trim(),
        mimetype: String(statusData.payload?.mimetype || '').trim(),
        fileName: '',
        filePath: '',
        createdAt: new Date().toISOString()
    };

    if (statusData.kind !== 'text' && statusData.payload && typeof downloadContentFromMessage === 'function') {
        const downloadKind = statusData.kind === 'document' ? 'document' : statusData.kind;
        const stream = await downloadContentFromMessage(statusData.payload, downloadKind);
        const buffer = await streamToBuffer(stream);
        if (buffer.length) {
            const ext = getStatusBackupExtension(statusData.kind, statusData.payload);
            const fileName = `${sanitizeFileFragment(archiveId)}.${ext}`;
            const filePath = path.join(STATUS_MEDIA_DIR, fileName);
            fs.writeFileSync(filePath, buffer);
            entry.fileName = fileName;
            entry.filePath = filePath;
        }
    }

    db.items[archiveId] = entry;
    saveStatusArchiveDB(db);
    pruneStatusArchive(phoneNumber);
    return entry;
}

function buildStatusCountMessage(phone) {
    const entries = getPhoneStatusArchiveEntries(phone);
    const latest = entries[0];
    return [
        `📊 إحصائية الحالات للرقم ${phone}`,
        `📥 عدد الحالات المحفوظة: ${entries.length}`,
        `🕒 آخر حالة محفوظة: ${latest ? formatStatusArchiveTime(latest.createdAt) : 'لا يوجد'}`
    ].join('\\n');
}

function isDeletedStatusArchiveEntry(entry = {}) {
    if (!entry || typeof entry !== 'object') return false;
    if (!entry.deletedAt) return false;
    const expiresAt = Date.parse(entry.deletedExpiresAt || entry.expiresAt || 0);
    if (!expiresAt) return true;
    return expiresAt > Date.now();
}

function getPhoneDeletedStatusArchiveEntries(phone) {
    return getPhoneStatusArchiveEntries(phone).filter((entry) => isDeletedStatusArchiveEntry(entry));
}

function updateStatusArchiveEntry(phone, participant, messageId, patch = {}) {
    const archiveId = buildStatusArchiveId(phone, participant, messageId);
    const db = getStatusArchiveDB();
    if (!db.items[archiveId]) return null;
    db.items[archiveId] = {
        ...(db.items[archiveId] || {}),
        ...patch,
        updatedAt: new Date().toISOString()
    };
    saveStatusArchiveDB(db);
    return db.items[archiveId];
}

function buildStatusPreviewCaption(entry) {
    const isDeleted = isDeletedStatusArchiveEntry(entry);
    const lines = [
        `👤 صاحب الحالة: ${formatStatusArchiveOwner(entry)}`,
        `🗂️ النوع: ${formatStatusArchiveType(entry?.kind)}`,
        `🕒 وقت الحفظ: ${formatStatusArchiveTime(entry?.createdAt)}`
    ];
    if (isDeleted) {
        lines.push(`🗑️ تم حذفها بواسطة صاحبها: ${formatStatusArchiveTime(entry?.deletedAt)}`);
        lines.push(`⏳ متاحة حتى: ${formatStatusArchiveTime(entry?.deletedExpiresAt || entry?.expiresAt)}`);
    }
    const textBody = String(entry?.text || entry?.caption || '').trim();
    if (textBody) lines.push('', textBody.slice(0, 900));
    return lines.join('\\n').trim();
}

function buildStatusEntryButtons(phone, entry, source = 'all') {
    const cleanPhone = sanitizeCallbackPhone(phone);
    const statusId = String(entry?.id || '').trim();
    const backTarget = source === 'deleted' ? `statusdeleted_phone_${cleanPhone}` : `statusbrowse_phone_${cleanPhone}`;
    const actionButton = entry?.kind === 'text'
        ? Markup.button.callback('نسخ النص 📋', `status_copy_${cleanPhone}_${statusId}`)
        : Markup.button.callback('تنزيل الوسائط ⬇️', `status_download_${cleanPhone}_${statusId}`);
    return {
        reply_markup: {
            inline_keyboard: [
                [actionButton],
                [Markup.button.callback(`👤 ${formatStatusArchiveOwner(entry)}`.slice(0, 55), `status_owner_${cleanPhone}_${statusId}`)],
                [Markup.button.callback(source === 'deleted' ? 'رجوع للمحذوفة ↩️' : 'رجوع للحالات ↩️', backTarget)]
            ]
        }
    };
}

function parseProfileExpiryInput(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const normalized = raw.replace(/T/, ' ').replace(/\//g, '-').replace(/\s+/g, ' ').trim();
    let match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (match) {
        const [, y, m, d, hh, mm] = match;
        const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (match) {
        const [, d, m, y, hh, mm] = match;
        const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}

async function processScheduledProfileUpdates() {
    const db = getProfileScheduleDB();
    let changed = false;
    const now = Date.now();

    for (const [phone, state] of Object.entries(db.phones || {})) {
        const schedule = state?.aboutSchedule;
        if (!schedule?.active || !schedule?.expiresAt) continue;
        const expiresAt = Date.parse(schedule.expiresAt);
        if (!expiresAt || expiresAt > now) continue;

        const sock = waClients.get(normalizePhone(phone));
        if (!sock || typeof sock.updateProfileStatus !== 'function') continue;

        try {
            await sock.updateProfileStatus(String(schedule.previousText || '').trim());
            db.phones[phone] = {
                ...(db.phones[phone] || {}),
                currentAbout: String(schedule.previousText || '').trim(),
                lastAppliedAbout: String(schedule.previousText || '').trim(),
                lastKnownAbout: String(schedule.previousText || '').trim(),
                aboutSchedule: null,
                updatedAt: new Date().toISOString()
            };
            changed = true;
        } catch (_) {}
    }

    if (changed) saveProfileScheduleDB(db);
}

let profileScheduleTicker = null;
function startProfileScheduleTicker() {
    if (profileScheduleTicker) return;
    profileScheduleTicker = setInterval(() => {
        Promise.resolve(processScheduledProfileUpdates()).catch(() => {});
    }, 30 * 1000);
    if (typeof profileScheduleTicker?.unref === 'function') profileScheduleTicker.unref();
}

startProfileScheduleTicker();

function getCurrentPhoneProfileSnapshot(phone) {
    const normalizedPhone = normalizePhone(phone);
    const sock = waClients.get(normalizedPhone);
    const state = getPhoneProfileState(normalizedPhone);
    return {
        name: String(sock?.user?.name || sock?.user?.verifiedName || sock?.user?.notify || state.lastKnownName || normalizedPhone || 'غير معروف').trim(),
        about: String(state.currentAbout || state.lastAppliedAbout || state.lastKnownAbout || 'غير مضبوط').trim() || 'غير مضبوط',
        schedule: state.aboutSchedule || null
    };
}

async function updatePhoneProfileNameNow(phone, nextName) {
    const normalizedPhone = normalizePhone(phone);
    const cleanName = String(nextName || '').trim().slice(0, 80);
    if (!normalizedPhone || !cleanName) throw new Error('الاسم غير صالح.');
    const sock = waClients.get(normalizedPhone);
    if (!sock || typeof sock.updateProfileName !== 'function') throw new Error('الرقم غير متصل حالياً ولا يمكن تحديث الاسم الآن.');
    await sock.updateProfileName(cleanName);
    savePhoneProfileState(normalizedPhone, { lastKnownName: cleanName });
    return cleanName;
}

async function updatePhoneProfileAboutNow(phone, aboutText, expiresAt) {
    const normalizedPhone = normalizePhone(phone);
    const cleanAbout = String(aboutText || '').trim().slice(0, MAX_WA_ABOUT_LENGTH);
    if (!normalizedPhone || !cleanAbout) throw new Error('رسالة حول غير صالحة.');
    const sock = waClients.get(normalizedPhone);
    if (!sock || typeof sock.updateProfileStatus !== 'function') throw new Error('الرقم غير متصل حالياً ولا يمكن تحديث حول الآن.');
    const state = getPhoneProfileState(normalizedPhone);
    const previousText = String(state.currentAbout || state.lastAppliedAbout || state.lastKnownAbout || '').trim();

    // --- إصلاح: محاولات متعددة مع تأخير لدعم جميع إصدارات واتساب ---
    let lastError = null;
    const MAX_ABOUT_ATTEMPTS = 4;
    const ABOUT_RETRY_DELAYS = [500, 1200, 2500, 4000];

    for (let attempt = 0; attempt < MAX_ABOUT_ATTEMPTS; attempt++) {
        try {
            if (attempt > 0) {
                await delay(ABOUT_RETRY_DELAYS[attempt - 1] || 2000);
            }
            // المحاولة الأساسية
            await sock.updateProfileStatus(cleanAbout);

            // انتظار قصير للتحقق من أن التغيير تم تطبيقه
            await delay(800);

            // محاولة بديلة مباشرة عبر query node (للإصدارات الجديدة من واتساب)
            if (attempt >= 2 && typeof sock.query === 'function') {
                try {
                    await sock.query({
                        tag: 'iq',
                        attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'status' },
                        content: [{ tag: 'status', attrs: {}, content: Buffer.from(cleanAbout, 'utf-8') }]
                    });
                    await delay(500);
                } catch (_) { /* تجاهل خطأ الطريقة البديلة */ }
            }

            savePhoneProfileState(normalizedPhone, {
                currentAbout: cleanAbout,
                lastAppliedAbout: cleanAbout,
                lastKnownAbout: cleanAbout,
                aboutSchedule: expiresAt ? { text: cleanAbout, previousText, expiresAt: new Date(expiresAt).toISOString(), active: true } : null
            });
            return cleanAbout;
        } catch (err) {
            lastError = err;
            if (attempt < MAX_ABOUT_ATTEMPTS - 1) {
                console.warn(`[About Retry ${attempt + 1}/${MAX_ABOUT_ATTEMPTS}] (${normalizedPhone}):`, err.message);
            }
        }
    }

    // إذا فشلت جميع المحاولات، نحفظ الحالة مع رسالة خطأ واضحة
    throw new Error(`تعذر تحديث حول بعد ${MAX_ABOUT_ATTEMPTS} محاولات. ${lastError?.message || 'حدث خطأ غير متوقع.'} جرب مجدداً بعد قليل أو تأكد أن الرقم متصل.`);
}


function buildCreateStoryPrompt(phone) {
    const contactsCount = getPhoneContactEntries(phone).length;
    return [
        `➕ إنشاء ستوري للرقم ${phone}`,
        `👥 جهات الاتصال المتاحة للنشر: ${contactsCount}`,
        '',
        'أرسل الآن نص أو صورة أو فيديو.',
        '• النص = سيتم نشره كحالة نصية',
        '• الصورة/الفيديو = سيتم نشره كحالة مع الكابشن إن وجد',
        '',
        'ملاحظة: سيتم النشر على جهات الاتصال المحفوظة لهذا الرقم داخل البوت.'
    ].join('\n');
}

async function openCreateStoryMenu(ctx) {
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط لإنشاء ستوري.');
    if (phones.length === 1) return startCreateStoryFlowForPhone(ctx, phones[0]);
    const rows = phones.map((phone) => {
        const count = getPhoneContactEntries(phone).length;
        return [Markup.button.callback(`➕ ${phone} (${count} جهة)`, `create_story_phone_${sanitizeCallbackPhone(phone)}`)];
    });
    rows.push([Markup.button.callback('↩️ رجوع للرئيسية', 'back_to_start')]);
    return safeReply(ctx, '➕ اختر الرقم الذي تريد النشر منه كستوري:', { reply_markup: { inline_keyboard: rows } });
}

async function startCreateStoryFlowForPhone(ctx, phone) {
    if (!userOwnsPhone(ctx.from.id, phone)) {
        return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
    }
    const contacts = getPhoneContactEntries(phone);
    if (!contacts.length) {
        return safeReply(ctx, `⚠️ لا توجد جهات اتصال محفوظة للرقم ${phone} بعد.
انتظر حتى تتم مزامنة جهات الاتصال ثم أعد المحاولة.`);
    }
    ctx.session = { step: 'wait_story_content', targetPhone: phone };
    return safeReply(ctx, buildCreateStoryPrompt(phone));
}

async function downloadTelegramFileBuffer(ctx, fileId) {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(String(fileLink));
    if (!response.ok) {
        throw new Error(`تعذر تنزيل الملف من تيليجرام (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function publishStatusToAllLinkedContacts(phone, payload) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        throw new Error('الرقم غير صالح.');
    }
    const sock = waClients.get(normalizedPhone);
    if (!sock) {
        throw new Error('الرقم غير متصل حالياً على واتساب.');
    }
    const ownJid = normalizeWhatsAppJid(sock.user?.id);
    const recipients = Array.from(new Set(
        getPhoneContactEntries(normalizedPhone)
            .map((entry) => normalizeContactJid(entry?.jid || entry?.id || ''))
            .filter((jid) => jid && jid !== ownJid)
    ));
    if (!recipients.length) {
        throw new Error('لا توجد جهات اتصال صالحة للنشر عليها.');
    }

    const attempts = [
        async () => sock.sendMessage('status@broadcast', payload, { broadcast: true, statusJidList: recipients }),
        async () => sock.sendMessage('status@broadcast', payload, { broadcast: true }),
        async () => sock.sendMessage('status@broadcast', payload)
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            const result = await attempt();
            return { result, recipients: recipients.length };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('تعذر نشر الستوري حالياً.');
}

async function publishTextStory(phone, text) {
    const cleanText = String(text || '').trim().slice(0, 1900);
    if (!cleanText) {
        throw new Error('نص الحالة فارغ.');
    }
    return publishStatusToAllLinkedContacts(phone, {
        text: cleanText,
        backgroundColor: '#0B141A',
        font: 1
    });
}

async function handleCreateStoryMediaMessage(ctx, mediaKind) {
    const sessionPhone = ctx.session?.targetPhone;
    if (ctx.session?.step !== 'wait_story_content') return false;
    if (!(await ensureSubscription(ctx))) return true;
    if (!userOwnsPhone(ctx.from.id, sessionPhone)) {
        ctx.session = null;
        await safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        return true;
    }

    try {
        let payload = null;
        if (mediaKind === 'photo') {
            const photos = Array.isArray(ctx.message?.photo) ? ctx.message.photo : [];
            const selected = photos[photos.length - 1];
            if (!selected?.file_id) throw new Error('لم أتمكن من قراءة الصورة المرسلة.');
            const buffer = await downloadTelegramFileBuffer(ctx, selected.file_id);
            payload = {
                image: buffer,
                caption: String(ctx.message?.caption || '').trim().slice(0, 1024),
                mimetype: 'image/jpeg'
            };
        } else if (mediaKind === 'video') {
            const video = ctx.message?.video;
            if (!video?.file_id) throw new Error('لم أتمكن من قراءة الفيديو المرسل.');
            const buffer = await downloadTelegramFileBuffer(ctx, video.file_id);
            payload = {
                video: buffer,
                caption: String(ctx.message?.caption || '').trim().slice(0, 1024),
                mimetype: String(video?.mime_type || 'video/mp4') || 'video/mp4'
            };
        } else {
            throw new Error('نوع وسائط غير مدعوم.');
        }

        const report = await publishStatusToAllLinkedContacts(sessionPhone, payload);
        ctx.session = null;
        await safeReply(ctx, `✅ تم نشر الستوري بنجاح للرقم ${sessionPhone}.
👥 عدد جهات الاتصال المستهدفة: ${report.recipients}`);
        return true;
    } catch (error) {
        await safeReply(ctx, `❌ تعذر نشر الستوري: ${error.message || 'خطأ غير متوقع.'}`);
        return true;
    }
}

// =========================
// تيليجرام - الواجهات العامة
// =========================
async function sendStartMessage(ctx) {
    upsertTelegramUser(ctx);
    return safeReply(ctx, `${buildStartMessage(ctx)}

اختر الخدمة المطلوبة من الكيبورد السفلي فقط.`, getMainReplyKeyboard());
}

bot.start(async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    await sendStartMessage(ctx);
});


bot.command('menu', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    await sendStartMessage(ctx);
});

bot.command('mywa', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    await openMyNumbersMenu(ctx);
});

bot.command('unlink', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك جلسات لحذفها.');
    }

    const rows = phones.map((phone) => [Markup.button.callback(`حذف ${phone}`, `delete_${sanitizeCallbackPhone(phone)}`)]);
    await safeReply(ctx, '🗑️ اختر الرقم الذي تريد حذف جلسته:', { reply_markup: { inline_keyboard: rows } });
});

bot.command('setemoji', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    const phones = getUserPhones(ctx.from.id);
    if (!phones.length) {
        return safeReply(ctx, '❌ لا يوجد لديك رقم مربوط أولاً.');
    }

    if (phones.length === 1) {
        ctx.session = { step: 'wait_emoji', targetPhone: phones[0] };
        return safeReply(ctx, `😍 أرسل الآن الإيموجي الجديد للرقم ${phones[0]}`);
    }

    const rows = phones.map((phone) => [Markup.button.callback(`${phone} | ${getPhoneEmoji(phone)}`, `emoji_pick_${sanitizeCallbackPhone(phone)}`)]);
    await safeReply(ctx, '😍 اختر الرقم الذي تريد تغيير إيموجيه:', { reply_markup: { inline_keyboard: rows } });
});


bot.command('statuscount', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    return openStatusCountMenu(ctx);
});

bot.command('viewstatuses', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    return openStatusBrowserMenu(ctx);
});

bot.command('deletedmsgs', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    return openDeletedMessagesMenu(ctx);
});

bot.command('contactscount', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    return openContactsCountMenu(ctx);
});

bot.command('waprofile', async (ctx) => {
    if (!(await ensureSubscription(ctx))) return;
    upsertTelegramUser(ctx);
    return openWhatsAppProfileMenu(ctx);
});

bot.on('callback_query', async (ctx) => {
    upsertTelegramUser(ctx);
    const data = ctx.callbackQuery?.data || '';

    if (data !== 'check_sub' && !(await ensureSubscription(ctx))) {
        return ctx.answerCbQuery('اشترك أولاً في القناة المطلوبة', { show_alert: true });
    }

    try {
        await ctx.answerCbQuery();
    } catch (_) {}

    if (data === 'check_sub') {
        if (!(await ensureSubscription(ctx))) return;
        return sendStartMessage(ctx);
    }

    if (data === 'back_to_start') {
        return sendStartMessage(ctx);
    }

    if (data === 'pair_wa') {
        ctx.session = { step: 'wait_phone' };
        return safeReply(ctx, '📱 أرسل رقم الواتساب مع مفتاح الدولة، مثال: 967771163825');
    }

    if (data === 'my_numbers') {
        return openMyNumbersMenu(ctx);
    }
    if (data === 'linked_commands_menu') {
        return openLinkedCommandsMenu(ctx);
    }

    if (data === 'auto_replies') {
        return openAutoRepliesMenu(ctx);
    }

    if (data === 'settings_menu') {
        return openSettingsMenu(ctx);
    }

    if (data.startsWith('settings_phone_')) {
        const phone = normalizePhone(data.replace('settings_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        ctx.session = { step: 'wait_settings_password', targetPhone: phone };
        return safeReply(ctx, buildPhoneSettingsLockMessage(phone), getPhoneSettingsAuthKeyboard(phone));
    }
    if (data.startsWith('linked_commands_')) {
        const phone = normalizePhone(data.replace('linked_commands_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        return safeReply(ctx, `${buildTelegramCommandsOverview()}\n\n${buildLinkedNumberCommandsOverview(phone)}`);
    }

    if (data.startsWith('auto_reply_pick_')) {
        const phone = normalizePhone(data.replace('auto_reply_pick_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        ctx.session = { step: 'wait_auto_reply_response', targetPhone: phone };
        return safeReply(
            ctx,
            `🤖 أرسل الآن نص الرد للرقم ${phone}.\nبعدها سأطلب منك الكلمة أو الكلمات المفتاحية التي تشغل هذا الرد.\n\nالردود الحالية:\n${formatAutoRepliesList(phone)}\n\nلإيقاف جميع الردود أرسل: off`
        );
    }

    if (data === 'emoji_react_menu') {
        return openEmojiReactMenu(ctx);
    }

    if (data.startsWith('emoji_react_pick_')) {
        const phone = normalizePhone(data.replace('emoji_react_pick_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        return safeReply(ctx, buildEmojiReactManagerMessage(phone), getEmojiReactManagerKeyboard(phone));
    }

    if (data.startsWith('emoji_react_toggle_')) {
        const phone = normalizePhone(data.replace('emoji_react_toggle_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        const settings = getActivePhoneSettings(phone);
        const nextValue = settings.autoStatusReact === 'on' ? 'off' : 'on';
        updatePhoneSettings(phone, { autoStatusReact: nextValue, autoStatusRead: 'on', autoReact: 'off' });
        return safeReply(ctx, buildEmojiReactManagerMessage(phone), getEmojiReactManagerKeyboard(phone));
    }

    if (data === 'change_emoji') {
        return openChangeEmojiMenu(ctx);
    }

    if (data.startsWith('emoji_pick_')) {
        const phone = normalizePhone(data.replace('emoji_pick_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        ctx.session = { step: 'wait_emoji', targetPhone: phone };
        return safeReply(ctx, `😍 أرسل الإيموجي الجديد للرقم ${phone}`);
    }

    if (data === 'delete_session') {
        return openDeleteSessionMenu(ctx);
    }

    if (data === 'quick_controls') {
        return openQuickControlsMenu(ctx);
    }

    if (data.startsWith('quick_pick_')) {
        const phone = normalizePhone(data.replace('quick_pick_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        return safeReply(ctx, buildQuickControlsMessage(phone), getQuickControlsKeyboard(phone));
    }

    if (data.startsWith('quick_toggle_')) {
        const payload = data.replace('quick_toggle_', '');
        const separatorIndex = payload.indexOf('_');
        const action = separatorIndex === -1 ? '' : payload.slice(0, separatorIndex);
        const phone = normalizePhone(separatorIndex === -1 ? '' : payload.slice(separatorIndex + 1));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }

        if (action === 'anti') {
            const settings = getActivePhoneSettings(phone);
            updatePhoneSettings(phone, { antiDelete: settings.antiDelete === 'off' ? 'all' : 'off' });
        } else if (action === 'ghost') {
            const settings = getActivePhoneSettings(phone);
            updatePhoneSettings(phone, { ghostMode: settings.ghostMode === 'on' ? 'off' : 'on' });
        } else if (action === 'private') {
            const settings = getActivePhoneSettings(phone);
            updatePhoneSettings(phone, { autoPrivateReact: settings.autoPrivateReact === 'on' ? 'off' : 'on' });
        }

        await applyLivePhoneSettingsSideEffects(phone);
        return safeReply(ctx, buildQuickControlsMessage(phone), getQuickControlsKeyboard(phone));
    }

    if (data.startsWith('delete_')) {
        const phone = normalizePhone(data.replace('delete_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        await cleanupSession(phone);
        return safeReply(ctx, `✅ تم حذف جلسة الرقم ${phone} نهائياً.`);
    }


    if (data.startsWith('settings_revealpass_')) {
        const phone = normalizePhone(data.replace('settings_revealpass_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        return safeReply(ctx, buildPhoneSettingsAccessMessage(phone));
    }

    if (data.startsWith('settings_dashboard_')) {
        const phone = normalizePhone(data.replace('settings_dashboard_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        if (!hasPhoneSettingsAccess(ctx.from.id, phone)) {
            ctx.session = { step: 'wait_settings_password', targetPhone: phone };
            return safeReply(ctx, buildPhoneSettingsLockMessage(phone), getPhoneSettingsAuthKeyboard(phone));
        }
        return safeReply(ctx, buildPhoneSettingsMessage(phone), getPhoneSettingsKeyboard(phone));
    }

    if (data.startsWith('settings_lock_')) {
        const phone = normalizePhone(data.replace('settings_lock_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        revokePhoneSettingsAccess(ctx.from.id, phone);
        ctx.session = { step: 'wait_settings_password', targetPhone: phone };
        return safeReply(ctx, `🔒 تم قفل إعدادات الرقم ${phone}.\nأرسل كلمة السر مرة أخرى إذا أردت فتحها.`, getPhoneSettingsAuthKeyboard(phone));
    }

    if (data.startsWith('settings_section_')) {
        const parts = data.replace('settings_section_', '').split('_');
        const phone = normalizePhone(parts.pop() || '');
        const sectionKey = String(parts.join('_') || 'general').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        if (!hasPhoneSettingsAccess(ctx.from.id, phone)) {
            ctx.session = { step: 'wait_settings_password', targetPhone: phone };
            return safeReply(ctx, buildPhoneSettingsLockMessage(phone), getPhoneSettingsAuthKeyboard(phone));
        }
        return safeReply(ctx, buildPhoneSettingsSectionMessage(phone, sectionKey), getPhoneSettingsSectionKeyboard(phone, sectionKey));
    }

    if (data.startsWith('settings_toggle_')) {
        const parts = data.replace('settings_toggle_', '').split('_');
        const phone = normalizePhone(parts.pop() || '');
        const fieldKey = String(parts.join('_') || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        if (!hasPhoneSettingsAccess(ctx.from.id, phone)) {
            ctx.session = { step: 'wait_settings_password', targetPhone: phone };
            return safeReply(ctx, buildPhoneSettingsLockMessage(phone), getPhoneSettingsAuthKeyboard(phone));
        }
        const settings = getActivePhoneSettings(phone);
        const nextValue = String(settings[fieldKey] || '') === 'on' ? 'off' : 'on';
        updatePhoneSettings(phone, { [fieldKey]: nextValue });
        const section = getPhoneSettingsSectionByField(fieldKey);
        return safeReply(ctx, buildPhoneSettingsSectionMessage(phone, section.key), getPhoneSettingsSectionKeyboard(phone, section.key));
    }

    if (data.startsWith('settings_select_')) {
        const parts = data.replace('settings_select_', '').split('_');
        const phone = normalizePhone(parts.pop() || '');
        const fieldKey = String(parts.join('_') || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        if (!hasPhoneSettingsAccess(ctx.from.id, phone)) {
            ctx.session = { step: 'wait_settings_password', targetPhone: phone };
            return safeReply(ctx, buildPhoneSettingsLockMessage(phone), getPhoneSettingsAuthKeyboard(phone));
        }
        const label = SITE_SETTINGS_FIELD_LABELS[fieldKey] || fieldKey;
        return safeReply(ctx, `🎛️ اختر القيمة الجديدة لـ ${label} للرقم ${phone}:`, getPhoneSettingChoiceKeyboard(phone, fieldKey));
    }

    if (data.startsWith('settings_choice_')) {
        const parts = data.replace('settings_choice_', '').split('_');
        const phone = normalizePhone(parts.pop() || '');
        const fieldKey = String(parts.shift() || '').trim();
        const value = String(parts.join('_') || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        if (!hasPhoneSettingsAccess(ctx.from.id, phone)) {
            ctx.session = { step: 'wait_settings_password', targetPhone: phone };
            return safeReply(ctx, buildPhoneSettingsLockMessage(phone), getPhoneSettingsAuthKeyboard(phone));
        }
        updatePhoneSettings(phone, { [fieldKey]: value });
        const section = getPhoneSettingsSectionByField(fieldKey);
        return safeReply(ctx, buildPhoneSettingsSectionMessage(phone, section.key), getPhoneSettingsSectionKeyboard(phone, section.key));
    }

    if (data.startsWith('settings_edit_')) {
        const parts = data.replace('settings_edit_', '').split('_');
        const phone = normalizePhone(parts.pop() || '');
        const fieldKey = String(parts.join('_') || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        }
        if (!hasPhoneSettingsAccess(ctx.from.id, phone)) {
            ctx.session = { step: 'wait_settings_password', targetPhone: phone };
            return safeReply(ctx, buildPhoneSettingsLockMessage(phone), getPhoneSettingsAuthKeyboard(phone));
        }
        ctx.session = { step: 'wait_setting_value', targetPhone: phone, fieldKey };
        return safeReply(ctx, buildPhoneSettingEditPrompt(phone, fieldKey));
    }


    if (data === 'status_count_menu') {
        return openStatusCountMenu(ctx);
    }

    if (data === 'status_browser_menu') {
        return openStatusBrowserMenu(ctx);
    }

    if (data === 'auto_private_react_menu') {
        return openAutoPrivateReactMenu(ctx);
    }

    if (data === 'love_match_menu') {
        return openLoveMatchMenu(ctx);
    }

    if (data === 'last_seen_menu') {
        return openLastSeenMenu(ctx);
    }

    if (data === 'deleted_messages_menu') {
        return openDeletedMessagesMenu(ctx);
    }

    if (data === 'contacts_count_menu') {
        return openContactsCountMenu(ctx);
    }

    if (data === 'profile_menu') {
        return openWhatsAppProfileMenu(ctx);
    }

    if (data === 'our_channel_menu') {
        return openOurChannelMenu(ctx);
    }
    if (data === 'channel_like_menu' || data.startsWith('channel_like_pick_') || data === 'status_view_boost' || data.startsWith('statusviewboost_phone_')) {
        ctx.session = null;
        return safeReply(ctx, '🚫 تم حذف ميزات رشق المنشورات ورشق المشاهدات من هذه النسخة نهائياً.');
    }


    if (data === 'bot_developer_menu') {
        return openBotDeveloperMenu(ctx);
    }

    if (data === 'contact_developer_wa_menu') {
        return openContactDeveloperWaMenu(ctx);
    }

    if (data === 'check_sub') {
        if (!(await ensureSubscription(ctx))) return;
        // إعادة تشغيل الجلسات للأرقام المربوطة للمستخدم
        const phones = getUserPhones(ctx.from.id);
        let refreshed = 0;
        for (const p of phones) {
            const normalized = normalizePhone(p);
            if (!waClients.has(normalized)) {
                scheduleReconnect(normalized, ctx.from.id, 1000);
                refreshed++;
            } else {
                Promise.resolve(applyLivePhoneSettingsSideEffects(normalized)).catch(() => {});
            }
        }
        const msg = refreshed > 0
            ? `✅ تم تحديث الاشتراك وجارٍ تنشيط ${refreshed} رقم/أرقام.`
            : `✅ الاشتراك محدّث. جميع أرقامك (${phones.length}) تعمل بشكل طبيعي.`;
        return safeReply(ctx, msg);
    }

    if (data.startsWith('statuscount_phone_')) {
        const phone = normalizePhone(data.replace('statuscount_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return safeReply(ctx, buildStatusCountMessage(phone));
    }

    if (data.startsWith('statusbrowse_phone_')) {
        const phone = normalizePhone(data.replace('statusbrowse_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openStatusBrowserForPhone(ctx, phone);
    }

    if (data.startsWith('status_next_')) {
        const payload = data.replace('status_next_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const nextIndex = Number(idx === -1 ? -1 : payload.slice(idx + 1));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return sendStatusArchiveEntryByIndex(ctx, phone, nextIndex);
    }

    if (data.startsWith('status_done_')) {
        const phone = normalizePhone(data.replace('status_done_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return sendStatusBrowserFinished(ctx, phone);
    }

    if (data.startsWith('status_restart_')) {
        const phone = normalizePhone(data.replace('status_restart_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return sendStatusArchiveEntryByIndex(ctx, phone, 0);
    }

    if (data.startsWith('contactscount_phone_')) {
        const phone = normalizePhone(data.replace('contactscount_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return safeReply(ctx, buildContactsCountMessage(phone), getContactsCountKeyboard(phone));
    }

    if (data.startsWith('contactslist_phone_')) {
        const phone = normalizePhone(data.replace('contactslist_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return safeReply(ctx, buildContactsListMessage(phone), getContactsCountKeyboard(phone));
    }

    if (data.startsWith('lastseen_phone_')) {
        const phone = normalizePhone(data.replace('lastseen_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return safeReply(ctx, buildLastSeenMessage(phone));
    }

    if (data.startsWith('lovematch_phone_')) {
        const phone = normalizePhone(data.replace('lovematch_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return safeReply(ctx, buildLoveMatchMessage(phone));
    }

    if (data.startsWith('auto_private_react_phone_')) {
        const phone = normalizePhone(data.replace('auto_private_react_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return safeReply(ctx, buildAutoPrivateReactManagerMessage(phone), getAutoPrivateReactManagerKeyboard(phone));
    }

    if (data.startsWith('auto_private_toggle_')) {
        const phone = normalizePhone(data.replace('auto_private_toggle_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const settings = getActivePhoneSettings(phone);
        updatePhoneSettings(phone, { autoPrivateReact: settings.autoPrivateReact === 'on' ? 'off' : 'on' });
        return safeReply(ctx, buildAutoPrivateReactManagerMessage(phone), getAutoPrivateReactManagerKeyboard(phone));
    }

    if (data.startsWith('emoji_notice_toggle_')) {
        const phone = normalizePhone(data.replace('emoji_notice_toggle_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const settings = getActivePhoneSettings(phone);
        updatePhoneSettings(phone, { statusReactionNotice: settings.statusReactionNotice === 'on' ? 'off' : 'on' });
        return safeReply(ctx, buildEmojiReactManagerMessage(phone), getEmojiReactManagerKeyboard(phone));
    }

    if (data.startsWith('deletedmsg_phone_')) {
        const phone = normalizePhone(data.replace('deletedmsg_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openDeletedMessagesSendersForPhone(ctx, phone);
    }

    if (data.startsWith('deletedmsg_sender_')) {
        const payload = data.replace('deletedmsg_sender_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const senderPhone = normalizePhone(idx === -1 ? '' : payload.slice(idx + 1));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openDeletedMessagesForSender(ctx, phone, senderPhone);
    }

    if (data.startsWith('deletedmsg_open_')) {
        const payload = data.replace('deletedmsg_open_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const archiveId = idx === -1 ? '' : payload.slice(idx + 1);
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openDeletedMessageArchiveItem(ctx, phone, archiveId);
    }

    if (data === 'contacts_broadcast_menu') {
        return safeReply(ctx, '🚫 تم حذف هذا الخيار من البوت.');
    }

    if (data.startsWith('contacts_broadcast_phone_')) {
        const phone = normalizePhone(data.replace('contacts_broadcast_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const contacts = getPhoneContactEntries(phone);
        if (!contacts.length) return safeReply(ctx, `⚠️ لا توجد جهات اتصال محفوظة للرقم ${phone} بعد.`);
        ctx.session = { step: 'wait_contacts_broadcast_count', targetPhone: phone };
        return safeReply(ctx, buildContactsBroadcastPrompt(phone, contacts.length), getContactsBroadcastCancelKeyboard(phone));
    }

    if (data.startsWith('contacts_broadcast_cancel_')) {
        const phone = normalizePhone(data.replace('contacts_broadcast_cancel_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        cancelBroadcastJob(phone);
        if (ctx.session?.targetPhone === phone) ctx.session = null;
        return safeReply(ctx, `✅ تم إلغاء متابعة الرسالة الجماعية للرقم ${phone}.`);
    }

    if (data === 'direct_contact_message_menu') {
        return safeReply(ctx, '🚫 تم حذف هذا الخيار من البوت.');
    }

    if (data.startsWith('direct_message_phone_')) {
        const phone = normalizePhone(data.replace('direct_message_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openRandomDirectContactPicker(ctx, phone);
    }

    if (data.startsWith('direct_message_random_')) {
        const phone = normalizePhone(data.replace('direct_message_random_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openRandomDirectContactPicker(ctx, phone);
    }

    if (data.startsWith('direct_message_cancel_')) {
        const phone = normalizePhone(data.replace('direct_message_cancel_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        if (ctx.session?.targetPhone === phone) ctx.session = null;
        return safeReply(ctx, `✅ تم إلغاء اختيار جهة الاتصال للرقم ${phone}.`);
    }

    if (data.startsWith('direct_message_pick_')) {
        const payload = data.replace('direct_message_pick_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const contactPhone = normalizePhone(idx === -1 ? '' : payload.slice(idx + 1));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const entry = findPhoneContactEntry(phone, contactPhone);
        if (!entry?.jid) return safeReply(ctx, '❌ لم أتمكن من العثور على جهة الاتصال المطلوبة.');
        const displayName = pickContactDisplayName(entry.name, entry.notify, entry.pushName, entry.phoneNumber, entry.jid);
        ctx.session = {
            step: 'wait_direct_contact_message_text',
            targetPhone: phone,
            targetContactJid: entry.jid,
            targetContactName: displayName
        };
        return safeReply(ctx, `💬 أرسل الآن الرسالة التي تريد إرسالها إلى ${displayName} من الرقم ${phone}.`, getDirectContactCancelKeyboard(phone, contactPhone));
    }

    if (data.startsWith('direct_message_reply_')) {
        const payload = data.replace('direct_message_reply_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const contactPhone = normalizePhone(idx === -1 ? '' : payload.slice(idx + 1));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const session = getDirectContactMessageSession(phone, contactPhone);
        const entry = findPhoneContactEntry(phone, contactPhone);
        if (!session || !entry?.jid) return safeReply(ctx, '❌ هذه المحادثة متوقفة حالياً. ابدأ مراسلة جديدة أولاً.');
        ctx.session = {
            step: 'wait_direct_contact_reply_text',
            targetPhone: phone,
            targetContactJid: entry.jid,
            targetContactName: pickContactDisplayName(session.contactName, entry.name, entry.notify, entry.phoneNumber, entry.jid)
        };
        return safeReply(ctx, `↩️ أرسل الآن ردك إلى ${pickContactDisplayName(session.contactName, entry.name, entry.notify, entry.phoneNumber, entry.jid)}.`, getDirectContactCancelKeyboard(phone, contactPhone));
    }

    if (data.startsWith('direct_message_stop_')) {
        const payload = data.replace('direct_message_stop_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const contactPhone = normalizePhone(idx === -1 ? '' : payload.slice(idx + 1));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        clearDirectContactMessageSession(phone, contactPhone);
        if (ctx.session?.targetPhone === phone && normalizePhone(ctx.session?.targetContactJid || '') === contactPhone) ctx.session = null;
        return safeReply(ctx, `✅ تم إيقاف المراسلة داخل البوت للرقم ${phone}.`);
    }

    if (data.startsWith('statusdeleted_phone_')) {
        const phone = normalizePhone(data.replace('statusdeleted_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openDeletedStatusBrowserForPhone(ctx, phone);
    }

    if (data.startsWith('deleted_status_open_')) {
        const payload = data.replace('deleted_status_open_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const statusId = idx === -1 ? '' : payload.slice(idx + 1);
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const entry = getStatusArchiveEntry(phone, statusId);
        if (!entry || !isDeletedStatusArchiveEntry(entry)) return safeReply(ctx, '❌ لم أجد هذه الحالة ضمن الحالات المحذوفة.');
        return openStatusArchiveItem(ctx, phone, statusId, 'deleted');
    }

    if (data.startsWith('status_open_')) {
        const payload = data.replace('status_open_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const statusId = idx === -1 ? '' : payload.slice(idx + 1);
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const statusIndex = getStatusArchiveIndexById(phone, statusId);
        if (statusIndex === -1) return safeReply(ctx, '❌ لم أجد هذه الحالة.');
        return sendStatusArchiveEntryByIndex(ctx, phone, statusIndex);
    }

    if (data.startsWith('status_download_')) {
        const payload = data.replace('status_download_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const statusId = idx === -1 ? '' : payload.slice(idx + 1);
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return sendStatusArchiveDownload(ctx, phone, statusId);
    }

    if (data.startsWith('status_copy_')) {
        const payload = data.replace('status_copy_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const statusId = idx === -1 ? '' : payload.slice(idx + 1);
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const entry = getStatusArchiveEntry(phone, statusId);
        if (!entry) return safeReply(ctx, '❌ لم أجد نص الحالة المطلوب نسخه.');
        return safeReply(ctx, `📋 نص الحالة:

${String(entry.text || entry.caption || '').trim() || 'لا يوجد نص.'}`);
    }

    if (data.startsWith('status_owner_')) {
        const payload = data.replace('status_owner_', '');
        const idx = payload.lastIndexOf('_');
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(0, idx));
        const statusId = idx === -1 ? '' : payload.slice(idx + 1);
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const entry = getStatusArchiveEntry(phone, statusId);
        if (!entry) return safeReply(ctx, '❌ لم أجد بيانات صاحب الحالة.');
        return safeReply(ctx, `👤 صاحب الحالة: ${formatStatusArchiveOwner(entry)}`);
    }

    if (data.startsWith('profile_phone_')) {
        const phone = normalizePhone(data.replace('profile_phone_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openWhatsAppProfileForPhone(ctx, phone);
    }

    if (data.startsWith('profile_edit_name_')) {
        const phone = normalizePhone(data.replace('profile_edit_name_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        ctx.session = { step: 'wait_profile_name', targetPhone: phone };
        return safeReply(ctx, `✏️ أرسل الآن الاسم الجديد الذي تريد أن يظهر لجهات الاتصال للرقم ${phone}.`);
    }

    if (data.startsWith('profile_edit_about_')) {
        const phone = normalizePhone(data.replace('profile_edit_about_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        return openProfileAboutDurationMenu(ctx, phone);
    }

    if (data.startsWith('profile_about_duration_')) {
        const payload = data.replace('profile_about_duration_', '');
        const idx = payload.lastIndexOf('_');
        const presetKey = idx === -1 ? '' : payload.slice(0, idx);
        const phone = normalizePhone(idx === -1 ? '' : payload.slice(idx + 1));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        if (presetKey === 'custom') {
            ctx.session = { step: 'wait_profile_about_custom_expiry', targetPhone: phone };
            return safeReply(ctx, `🗓️ أرسل الآن التاريخ والوقت المخصص لانتهاء حول للرقم ${phone}.
الصيغة: YYYY-MM-DD HH:MM
مثال: 2026-06-05 23:30

الحد الأقصى للمدة المخصصة هو شهر واحد من الآن.`);
        }
        const preset = getProfileAboutPresetMeta(presetKey);
        if (!preset) return safeReply(ctx, '❌ لم أتعرف على المدة المطلوبة. حاول مرة أخرى من القائمة.');
        ctx.session = {
            step: 'wait_profile_about_text',
            targetPhone: phone,
            pendingAboutExpiry: preset.expiresAt,
            pendingAboutExpiryLabel: preset.label
        };
        return safeReply(ctx, `📝 أرسل الآن رسالة حول الجديدة للرقم ${phone}.
الحد الأقصى ${MAX_WA_ABOUT_LENGTH} حرفاً.
سيتم حفظها لمدة ${preset.label}.`);
    }

    if (data.startsWith('profile_change_pic_')) {
        const phone = normalizePhone(data.replace('profile_change_pic_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        ctx.session = { step: 'wait_profile_pic', targetPhone: phone };
        return safeReply(ctx, `🖼️ أرسل الآن الصورة الجديدة لبروفايل الرقم ${phone}.`);
    }

    if (data.startsWith('profile_delete_pic_')) {
        const phone = normalizePhone(data.replace('profile_delete_pic_', ''));
        if (!userOwnsPhone(ctx.from.id, phone)) return safeReply(ctx, '❌ هذا الرقم ليس تابعاً لك.');
        const sock = waClients.get(normalizePhone(phone));
        if (!sock || typeof sock.removeProfilePicture !== 'function') return safeReply(ctx, '❌ الرقم غير متصل حالياً أو لا يدعم حذف صورة البروفايل.');
        try {
            await sock.removeProfilePicture(`${normalizePhone(phone)}@s.whatsapp.net`);
            return safeReply(ctx, `✅ تم حذف صورة البروفايل للرقم ${phone} بنجاح.`);
        } catch (error) {
            return safeReply(ctx, `❌ تعذر حذف صورة البروفايل: ${error.message || 'حدث خطأ غير متوقع.'}`);
        }
    }

    if (data === 'admin_stats' && isAdmin(ctx.from.id)) {
        const usersCount = getAllUserIds().length;
        const phonesCount = getAllLinkedPhones().length;
        const adminsCount = getSettings().admins.length;
        const analytics = getAnalyticsDB();
        return safeReply(
            ctx,
            `📊 إحصائيات البوت (محفوظة بعد إعادة التشغيل):\n\n👤 المستخدمون: ${usersCount}\n📱 الأرقام المربوطة الآن: ${phonesCount}\n🛡️ عدد المدراء: ${adminsCount}\n✉️ إجمالي الرسائل المستلمة: ${analytics.totalIncomingMessages || 0}\n📸 حالات تم حفظها: ${analytics.totalStatusEvents || 0}\n😍 تفاعلات الحالة المنفذة: ${analytics.totalStatusReactions || 0}\n💬 ردود المالك: ${analytics.totalOwnerReplies || 0}\n🔁 مرات إعادة الاتصال: ${analytics.totalReconnects || 0}\n🟢 مرات تشغيل الجلسات: ${analytics.totalSessionsStarted || 0}`
        );
    }

    if (data === 'admin_setstart' && isAdmin(ctx.from.id)) {
        ctx.session = { step: 'wait_new_start_message' };
        return safeReply(ctx, '✏️ أرسل الآن رسالة /start الجديدة.\nيمكنك استخدام المتغيرات: {name} {username} {count} {emoji} {numbers}');
    }

    if (data === 'admin_setchannel' && isAdmin(ctx.from.id)) {
        ctx.session = { step: 'wait_force_channel' };
        return safeReply(ctx, '📢 أرسل يوزر القناة مثل @channel_username أو أرسل off لإلغاء الاشتراك الإجباري.');
    }

    if (data === 'admin_broadcast' && isAdmin(ctx.from.id)) {
        ctx.session = { step: 'wait_broadcast_message' };
        return safeReply(ctx, '📣 أرسل الآن الرسالة التي تريد إرسالها لجميع المستخدمين.');
    }

    if (data === 'admin_wabroadcast' && isAdmin(ctx.from.id)) {
        ctx.session = { step: 'wait_wa_broadcast_message' };
        return safeReply(ctx, '📲 أرسل الآن الرسالة التي تريد إرسالها خاص داخل واتساب لكل الأرقام المربوطة والمتصلة.');
    }
});

// =========================
// تيليجرام - أوامر المطور
// =========================
bot.command('admin', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    await safeReply(
        ctx,
        '🛠️ لوحة المطور:\n\n' +
            '/admin - فتح لوحة المطور\n' +
            '/stats - إحصائيات البوت\n' +
            '/setstart - تغيير رسالة /start\n' +
            '/setchannel - تفعيل أو إلغاء الاشتراك الإجباري\n' +
            '/broadcast - إرسال رسالة جماعية لكل المستخدمين على تيليجرام\n' +
            '/wabroadcast - إرسال رسالة خاصة داخل واتساب لكل الأرقام المربوطة\n' +
            '/admins - عرض الأدمنية\n' +
            '/addadmin 123456789 - إضافة أدمن\n' +
            '/deladmin 123456789 - حذف أدمن\n' +
            '/statusview 967xxxx on|off - تشغيل أو إيقاف رد مشاهدة الحالة لرقم محدد\n' +
            '/setstatusmsg 967xxxx نص الرسالة - تغيير رسالة مشاهدة الحالة لرقم محدد\n' +
            '/setbotmsg - تغيير أو حذف رسالة .bot لكل الأرقام\n' +
            '/setwelcome - تغيير أو حذف رسالة الترحيب داخل الواتساب لكل الأرقام\n' +
            '/addreply - إضافة رد عالمي حسب أمر/كلمة لكل الأرقام\n' +
            '/delreply - حذف رد عالمي من الردود العامة\n' +
            '/listreplies - عرض الردود العامة الحالية\n' +
            '/setstatuslikemsg - تغيير أو حذف رسالة الرد بعد لايك الحالة لكل الأرقام\n' +
            'المتغيرات المدعومة في الرسائل العامة: {phone} {number} {name} {ownerNumber} {ownerName} {prefix} {botLink} {channelLink}\n' +
            'متغيرات رسالة /start المدعومة: {name} {username} {count} {emoji} {numbers}',
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        Markup.button.callback('إحصائيات 📊', 'admin_stats'),
                        Markup.button.callback('تغيير /start ✏️', 'admin_setstart')
                    ],
                    [
                        Markup.button.callback('اشتراك إجباري 📢', 'admin_setchannel'),
                        Markup.button.callback('إذاعة عامة 📣', 'admin_broadcast')
                    ],
                    [
                        Markup.button.callback('إذاعة واتساب 📲', 'admin_wabroadcast')
                    ]
                ]
            }
        }
    );
});

bot.command('stats', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const usersCount = getAllUserIds().length;
    const phonesCount = getAllLinkedPhones().length;
    const adminsCount = getSettings().admins.length;
    const analytics = getAnalyticsDB();

    await safeReply(
        ctx,
        `📊 إحصائيات البوت (محفوظة بعد إعادة التشغيل):\n\n👤 المستخدمون: ${usersCount}\n📱 الأرقام المربوطة الآن: ${phonesCount}\n🛡️ عدد المدراء: ${adminsCount}\n✉️ إجمالي الرسائل المستلمة: ${analytics.totalIncomingMessages || 0}\n📸 حالات تم حفظها: ${analytics.totalStatusEvents || 0}\n😍 تفاعلات الحالة المنفذة: ${analytics.totalStatusReactions || 0}\n💬 ردود المالك: ${analytics.totalOwnerReplies || 0}\n🔁 مرات إعادة الاتصال: ${analytics.totalReconnects || 0}\n🟢 مرات تشغيل الجلسات: ${analytics.totalSessionsStarted || 0}`
    );
});

bot.command('admins', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const admins = getSettings().admins || [];
    await safeReply(ctx, `🛡️ قائمة الأدمنية:\n${admins.length ? admins.map((id, i) => `${i + 1}) ${id}`).join('\n') : 'لا يوجد'}`);
});

bot.command('addadmin', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const newAdminId = parts[1];
    if (!newAdminId || !/^\d+$/.test(newAdminId)) {
        return safeReply(ctx, '❌ الاستخدام الصحيح: /addadmin 123456789');
    }

    addAdmin(newAdminId);
    await safeReply(ctx, `✅ تم إضافة الأدمن ${newAdminId}`);
});

bot.command('deladmin', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const adminId = parts[1];
    if (!adminId || !/^\d+$/.test(adminId)) {
        return safeReply(ctx, '❌ الاستخدام الصحيح: /deladmin 123456789');
    }

    if (String(adminId) === String(ctx.from.id)) {
        return safeReply(ctx, '❌ لا يمكنك حذف نفسك من الأدمنية بهذا الأمر.');
    }

    removeAdmin(adminId);
    await safeReply(ctx, `✅ تم حذف الأدمن ${adminId}`);
});

bot.command('setstart', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const nextText = ctx.message.text.replace('/setstart', '').trim();
    if (!nextText) {
        ctx.session = { step: 'wait_new_start_message' };
        return safeReply(ctx, '✏️ أرسل الآن رسالة /start الجديدة.\nيمكنك استخدام المتغيرات: {name} {username} {count} {emoji} {numbers}');
    }

    const settings = getSettings();
    settings.startMessage = nextText;
    saveSettings(settings);
    await safeReply(ctx, '✅ تم تحديث رسالة /start بنجاح.');
});

bot.command('setchannel', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const value = ctx.message.text.replace('/setchannel', '').trim();
    if (!value) {
        ctx.session = { step: 'wait_force_channel' };
        return safeReply(ctx, '📢 أرسل يوزر القناة مثل @channel_username أو أرسل off لإلغاء الاشتراك الإجباري.');
    }

    const settings = getSettings();
    settings.requiredChannel = value.toLowerCase() === 'off' ? '' : value;
    saveSettings(settings);

    await safeReply(
        ctx,
        settings.requiredChannel
            ? `✅ تم تفعيل الاشتراك الإجباري على: ${settings.requiredChannel}`
            : '✅ تم إلغاء الاشتراك الإجباري.'
    );
});

bot.command('broadcast', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const text = ctx.message.text.replace('/broadcast', '').trim();
    if (!text) {
        ctx.session = { step: 'wait_broadcast_message' };
        return safeReply(ctx, '📣 أرسل الآن الرسالة التي تريد إرسالها لجميع المستخدمين.');
    }

    let success = 0;
    let failed = 0;
    const userIds = getAllUserIds();

    for (const userId of userIds) {
        try {
            await bot.telegram.sendMessage(userId, text);
            success += 1;
        } catch (error) {
            failed += 1;
            console.error(`Broadcast Error (${userId}):`, error.message);
        }
    }

    await safeReply(ctx, `✅ تمت الإذاعة الجماعية.\n\nنجح: ${success}\nفشل: ${failed}`);
});

bot.command('wabroadcast', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) {
        return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    }

    const text = String(ctx.message?.text || '').replace(/^\/wabroadcast(?:@\w+)?/i, '').trim();
    if (!text) {
        ctx.session = { step: 'wait_wa_broadcast_message' };
        return safeReply(ctx, '📲 أرسل الآن الرسالة التي تريد إرسالها خاص داخل واتساب لكل الأرقام المربوطة والمتصلة.');
    }

    const report = await sendWhatsAppLinkedNumbersBroadcast(text);
    return safeReply(ctx, formatWhatsAppBroadcastReport(report));
});

function saveGlobalAdminSetting(patch = {}) {
    const settings = getSettings();
    Object.assign(settings, patch || {});
    saveSettings(settings);
    return settings;
}

function removeGlobalReplyByInput(input = '') {
    const settings = getSettings();
    const rawReplies = parseAutoReplies(settings.globalLinkedAutoReplies, MAX_GLOBAL_AUTO_REPLIES);
    if (!rawReplies.length) {
        return { ok: false, reason: 'empty' };
    }

    const trimmed = String(input || '').trim();
    if (!trimmed) {
        return { ok: false, reason: 'invalid' };
    }

    if (/^(?:all|off|clear|مسح|حذف الكل)$/i.test(trimmed)) {
        settings.globalLinkedAutoReplies = '';
        saveSettings(settings);
        return { ok: true, clearedAll: true, removedEntry: null };
    }

    const replies = parseAutoReplyEntries(settings.globalLinkedAutoReplies, MAX_GLOBAL_AUTO_REPLIES);
    let removeIndex = -1;

    if (/^\d+$/.test(trimmed)) {
        const numericIndex = Number(trimmed) - 1;
        if (numericIndex >= 0 && numericIndex < rawReplies.length) {
            removeIndex = numericIndex;
        }
    }

    if (removeIndex < 0) {
        const normalizedNeedle = normalizeArabicReplyText(trimmed);
        removeIndex = replies.findIndex((reply) =>
            reply.normalizedKeywords.includes(normalizedNeedle) ||
            normalizeArabicReplyText(reply.response).includes(normalizedNeedle)
        );
    }

    if (removeIndex < 0) {
        return { ok: false, reason: 'not_found' };
    }

    const removedEntry = replies[removeIndex] || null;
    rawReplies.splice(removeIndex, 1);
    settings.globalLinkedAutoReplies = rawReplies.join('\n');
    saveSettings(settings);
    return { ok: true, clearedAll: false, removedEntry };
}

bot.command('setbotmsg', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    const value = String(ctx.message?.text || '').replace(/^\/setbotmsg(?:@\w+)?/i, '').trim();
    if (!value) {
        ctx.session = { step: 'wait_admin_bot_message' };
        return safeReply(ctx, '✏️ أرسل الآن رسالة .bot الجديدة لكل الأرقام.\nإذا تريد حذفها نهائياً أرسل: off');
    }
    if (/^(?:off|delete|remove|حذف)$/i.test(value)) {
        saveGlobalAdminSetting({ linkedBotMessageEnabled: false });
        return safeReply(ctx, '✅ تم حذف رد .bot نهائياً من جميع الأرقام المربوطة.');
    }
    saveGlobalAdminSetting({ linkedBotMessageEnabled: true, linkedBotMessage: value });
    return safeReply(ctx, '✅ تم تحديث رسالة .bot لكل الأرقام المربوطة.');
});

bot.command('setwelcome', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    const value = String(ctx.message?.text || '').replace(/^\/setwelcome(?:@\w+)?/i, '').trim();
    if (!value) {
        ctx.session = { step: 'wait_admin_welcome_message' };
        return safeReply(ctx, '✏️ أرسل الآن رسالة الترحيب التي تُرسل داخل واتساب بعد ربط الرقم.\nإذا تريد حذفها نهائياً أرسل: off');
    }
    if (/^(?:off|delete|remove|حذف)$/i.test(value)) {
        saveGlobalAdminSetting({ linkedWelcomeMessageEnabled: false });
        return safeReply(ctx, '✅ تم حذف رسالة الترحيب التلقائية من جميع الأرقام المربوطة.');
    }
    saveGlobalAdminSetting({ linkedWelcomeMessageEnabled: true, linkedWelcomeMessage: value });
    return safeReply(ctx, '✅ تم تحديث رسالة الترحيب التلقائية لكل الأرقام المربوطة.');
});

bot.command('addreply', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    const settings = getSettings();
    const count = parseAutoReplyEntries(settings.globalLinkedAutoReplies, MAX_GLOBAL_AUTO_REPLIES).length;
    if (count >= MAX_GLOBAL_AUTO_REPLIES) {
        return safeReply(ctx, `❌ وصلت للحد الأقصى ${MAX_GLOBAL_AUTO_REPLIES} رد عام. احذف بعض الردود أولاً.`);
    }
    ctx.session = { step: 'wait_admin_global_reply_keyword' };
    return safeReply(ctx, '📝 أرسل الآن أمر الرسالة أو الكلمات المفتاحية التي تريد أن يلتقطها أي رقم مربوط.\nمثال: سلام أو سلام، هلا');
});

bot.command('delreply', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    const value = String(ctx.message?.text || '').replace(/^\/delreply(?:@\w+)?/i, '').trim();
    if (!value) {
        ctx.session = { step: 'wait_admin_global_reply_delete' };
        return safeReply(ctx, `🗑️ أرسل رقم الرد أو كلمة من كلماته لحذفه.\nولحذف الكل أرسل: all\n\n${formatGlobalAutoRepliesList()}`);
    }
    const result = removeGlobalReplyByInput(value);
    if (!result.ok) {
        return safeReply(ctx, result.reason === 'empty' ? '❌ لا يوجد ردود عامة محفوظة حالياً.' : '❌ لم أجد الرد المطلوب حذفه.');
    }
    if (result.clearedAll) {
        return safeReply(ctx, '✅ تم حذف جميع الردود العامة من كل الأرقام المربوطة.');
    }
    return safeReply(ctx, `✅ تم حذف الرد العام:
${result.removedEntry?.raw || value}`);
});

bot.command('listreplies', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    return safeReply(ctx, `📋 الردود العامة الحالية لكل الأرقام المربوطة:

${formatGlobalAutoRepliesList()}`);
});

bot.command('setstatuslikemsg', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    const value = String(ctx.message?.text || '').replace(/^\/setstatuslikemsg(?:@\w+)?/i, '').trim();
    if (!value) {
        ctx.session = { step: 'wait_admin_status_like_message' };
        return safeReply(ctx, '✏️ أرسل الآن رسالة الرد بعد لايك الحالة لكل الأرقام.\nإذا تريد حذفها نهائياً أرسل: off');
    }
    if (/^(?:off|delete|remove|حذف)$/i.test(value)) {
        saveGlobalAdminSetting({ globalStatusLikeMessageEnabled: false });
        return safeReply(ctx, '✅ تم حذف رسالة الرد بعد لايك الحالة من جميع الأرقام المربوطة.');
    }
    saveGlobalAdminSetting({ globalStatusLikeMessageEnabled: true, globalStatusLikeMessage: value });
    return safeReply(ctx, '✅ تم تحديث رسالة الرد بعد لايك الحالة لكل الأرقام المربوطة.');
});

// =========================
// تيليجرام - استقبال وسائط الستوري
// =========================
bot.on('photo', async (ctx) => {
    upsertTelegramUser(ctx);
    await handleCreateStoryMediaMessage(ctx, 'photo');
});

bot.on('video', async (ctx) => {
    upsertTelegramUser(ctx);
    await handleCreateStoryMediaMessage(ctx, 'video');
});

// =========================
// تيليجرام - النصوص والحالات
// =========================
bot.on('text', async (ctx) => {
    upsertTelegramUser(ctx);

    const incomingText = String(ctx.message.text || '').trim();
    const sessionState = ctx.session?.step;
    const keyboardAction = !sessionState ? detectReplyKeyboardAction(incomingText) : '';

    if (keyboardAction) {
        if (!(await ensureSubscription(ctx))) return;
        if (keyboardAction === 'back_to_start') return sendStartMessage(ctx);
        if (keyboardAction === 'pair_wa') {
            ctx.session = { step: 'wait_phone' };
            return safeReply(ctx, '📱 أرسل رقم الواتساب مع مفتاح الدولة، مثال: 967771163825');
        }
        if (keyboardAction === 'my_numbers') return openMyNumbersMenu(ctx);
        if (keyboardAction === 'quick_controls') return openQuickControlsMenu(ctx);
        if (keyboardAction === 'settings_menu') return openSettingsMenu(ctx);
        if (keyboardAction === 'auto_replies') return openAutoRepliesMenu(ctx);
        if (keyboardAction === 'change_emoji') return openChangeEmojiMenu(ctx);
        if (keyboardAction === 'emoji_react_menu') return openEmojiReactMenu(ctx);
        if (keyboardAction === 'delete_session') return openDeleteSessionMenu(ctx);
        if (keyboardAction === 'status_count_menu') return openStatusCountMenu(ctx);
        if (keyboardAction === 'status_browser_menu') return openStatusBrowserMenu(ctx);
        if (keyboardAction === 'deleted_messages_menu') return openDeletedMessagesMenu(ctx);
        if (keyboardAction === 'contacts_count_menu') return openContactsCountMenu(ctx);
        if (keyboardAction === 'auto_private_react_menu') return openAutoPrivateReactMenu(ctx);
        if (keyboardAction === 'love_match_menu') return openLoveMatchMenu(ctx);
        if (keyboardAction === 'profile_menu') return openWhatsAppProfileMenu(ctx);
        if (keyboardAction === 'our_channel_menu') return openOurChannelMenu(ctx);
        if (keyboardAction === 'channel_like_menu') return safeReply(ctx, '🚫 تم حذف هذه الميزة من هذه النسخة.');
        if (keyboardAction === 'bot_developer_menu') return openBotDeveloperMenu(ctx);
        if (keyboardAction === 'contact_developer_wa_menu') return openContactDeveloperWaMenu(ctx);
        if (keyboardAction === 'check_sub') return ensureSubscription(ctx, true);
        if (keyboardAction === 'linked_commands_menu') return openLinkedCommandsMenu(ctx);
        if (keyboardAction === 'status_view_boost') return safeReply(ctx, '🚫 تم حذف هذه الميزة من هذه النسخة.');
    }
    if (sessionState === 'wait_status_view_count') {
        ctx.session = null;
        return safeReply(ctx, '🚫 تم حذف ميزة رشق المشاهدات من هذه النسخة.');
    }
    if (sessionState === 'wait_channel_like_post_url' || sessionState === 'wait_channel_like_count') {
        ctx.session = null;
        return safeReply(ctx, '🚫 تم حذف ميزة رشق المنشورات من هذه النسخة.');
    }

    if (!sessionState && incomingText.startsWith('/')) return;

    const bypassSubscriptionSteps = new Set([
        'wait_new_start_message',
        'wait_force_channel',
        'wait_broadcast_message',
        'wait_wa_broadcast_message',
        'wait_admin_bot_message',
        'wait_admin_welcome_message',
        'wait_admin_global_reply_keyword',
        'wait_admin_global_reply_response',
        'wait_admin_global_reply_delete',
        'wait_admin_status_like_message'
    ]);

    if (!bypassSubscriptionSteps.has(sessionState)) {
        if (!(await ensureSubscription(ctx))) return;
    }

    if (sessionState === 'wait_admin_bot_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }
        if (/^(?:off|delete|remove|حذف)$/i.test(incomingText)) {
            saveGlobalAdminSetting({ linkedBotMessageEnabled: false });
            ctx.session = null;
            return safeReply(ctx, '✅ تم حذف رد .bot نهائياً من جميع الأرقام المربوطة.');
        }
        saveGlobalAdminSetting({ linkedBotMessageEnabled: true, linkedBotMessage: incomingText });
        ctx.session = null;
        return safeReply(ctx, '✅ تم تحديث رسالة .bot لكل الأرقام المربوطة.');
    }

    if (sessionState === 'wait_admin_welcome_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }
        if (/^(?:off|delete|remove|حذف)$/i.test(incomingText)) {
            saveGlobalAdminSetting({ linkedWelcomeMessageEnabled: false });
            ctx.session = null;
            return safeReply(ctx, '✅ تم حذف رسالة الترحيب التلقائية من جميع الأرقام المربوطة.');
        }
        saveGlobalAdminSetting({ linkedWelcomeMessageEnabled: true, linkedWelcomeMessage: incomingText });
        ctx.session = null;
        return safeReply(ctx, '✅ تم تحديث رسالة الترحيب التلقائية لكل الأرقام المربوطة.');
    }

    if (sessionState === 'wait_admin_global_reply_keyword') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }
        const keywords = normalizeAutoReplyKeywordsInput(incomingText);
        if (!keywords.length) {
            return safeReply(ctx, '❌ أرسل كلمة أو أمر واحد على الأقل مثل: سلام');
        }
        ctx.session = {
            step: 'wait_admin_global_reply_response',
            pendingGlobalReplyKeywords: keywords
        };
        return safeReply(ctx, `✅ تم حفظ أمر الرسالة: ${keywords.join(' | ')}\nالآن أرسل الرسالة التي تريد الرد بها على هذا الأمر.`);
    }

    if (sessionState === 'wait_admin_global_reply_response') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }
        const keywords = Array.isArray(ctx.session?.pendingGlobalReplyKeywords) ? ctx.session.pendingGlobalReplyKeywords : [];
        const responseText = String(incomingText || '').trim().slice(0, 1000);
        if (!keywords.length) {
            ctx.session = null;
            return safeReply(ctx, '❌ حصل خلل في حفظ أمر الرسالة. أعد تنفيذ /addreply من جديد.');
        }
        if (!responseText) {
            return safeReply(ctx, '❌ أرسل نص الرسالة التي تريد أن يرد بها البوت.');
        }
        const settings = getSettings();
        const currentReplies = parseAutoReplies(settings.globalLinkedAutoReplies, MAX_GLOBAL_AUTO_REPLIES);
        if (currentReplies.length >= MAX_GLOBAL_AUTO_REPLIES) {
            ctx.session = null;
            return safeReply(ctx, `❌ وصلت للحد الأقصى ${MAX_GLOBAL_AUTO_REPLIES} رد عام. احذف بعض الردود أولاً.`);
        }
        const entry = buildStructuredAutoReplyEntry(keywords.join(' | '), responseText);
        if (!entry) {
            return safeReply(ctx, '❌ ما قدرت أحفظ الرد العام. حاول مرة ثانية.');
        }
        currentReplies.push(entry);
        saveGlobalAdminSetting({ globalLinkedAutoReplies: currentReplies.join('\n') });
        ctx.session = null;
        return safeReply(ctx, `✅ تم حفظ الرد العام بنجاح لكل الأرقام المربوطة.\n\n${formatGlobalAutoRepliesList()}`);
    }

    if (sessionState === 'wait_admin_global_reply_delete') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }
        const result = removeGlobalReplyByInput(incomingText);
        if (!result.ok) {
            return safeReply(ctx, result.reason === 'empty' ? '❌ لا يوجد ردود عامة محفوظة حالياً.' : '❌ لم أجد الرد المطلوب حذفه.');
        }
        ctx.session = null;
        if (result.clearedAll) {
            return safeReply(ctx, '✅ تم حذف جميع الردود العامة من كل الأرقام المربوطة.');
        }
        return safeReply(ctx, `✅ تم حذف الرد العام:
${result.removedEntry?.raw || incomingText}`);
    }

    if (sessionState === 'wait_admin_status_like_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }
        if (/^(?:off|delete|remove|حذف)$/i.test(incomingText)) {
            saveGlobalAdminSetting({ globalStatusLikeMessageEnabled: false });
            ctx.session = null;
            return safeReply(ctx, '✅ تم حذف رسالة الرد بعد لايك الحالة من جميع الأرقام المربوطة.');
        }
        saveGlobalAdminSetting({ globalStatusLikeMessageEnabled: true, globalStatusLikeMessage: incomingText });
        ctx.session = null;
        return safeReply(ctx, '✅ تم تحديث رسالة الرد بعد لايك الحالة لكل الأرقام المربوطة.');
    }
    if (sessionState === 'wait_story_content') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const storyText = String(incomingText || '').trim();
        if (!storyText) {
            return safeReply(ctx, '❌ أرسل نص الحالة أو أرسل صورة/فيديو مباشرة.');
        }
        try {
            const report = await publishTextStory(phone, storyText);
            ctx.session = null;
            return safeReply(ctx, `✅ تم نشر الستوري النصي بنجاح للرقم ${phone}.
👥 عدد جهات الاتصال المستهدفة: ${report.recipients}`);
        } catch (error) {
            return safeReply(ctx, `❌ تعذر نشر الستوري النصي: ${error.message || 'خطأ غير متوقع.'}`);
        }
    }

    if (sessionState === 'wait_contacts_broadcast_count') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const rawCount = String(incomingText || '').trim();
        if (/^(?:الغاء|إلغاء|cancel)$/i.test(rawCount)) {
            ctx.session = null;
            return safeReply(ctx, `✅ تم إلغاء تجهيز الرسالة الجماعية للرقم ${phone}.`);
        }
        const contacts = getPhoneContactEntries(phone);
        if (!contacts.length) {
            ctx.session = null;
            return safeReply(ctx, '⚠️ لا توجد جهات اتصال محفوظة لهذا الرقم.');
        }
        const requestedCount = normalizeRequestedLikeCount(rawCount);
        if (!requestedCount) {
            return safeReply(ctx, '❌ أرسل عدداً صحيحاً أكبر من 0.');
        }
        if (requestedCount > contacts.length) {
            return safeReply(ctx, `❌ العدد المطلوب أكبر من المتاح. الحد الأقصى الحالي هو ${contacts.length}.`);
        }
        ctx.session = { step: 'wait_contacts_broadcast_text', targetPhone: phone, targetCount: requestedCount };
        return safeReply(ctx, buildContactsBroadcastTextPrompt(phone, requestedCount, contacts.length), getContactsBroadcastCancelKeyboard(phone));
    }

    if (sessionState === 'wait_contacts_broadcast_text') {
        const phone = ctx.session?.targetPhone;
        const targetCount = Number(ctx.session?.targetCount) || 0;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const broadcastText = String(incomingText || '').trim();
        if (/^(?:الغاء|إلغاء|cancel)$/i.test(broadcastText)) {
            ctx.session = null;
            return safeReply(ctx, `✅ تم إلغاء الرسالة الجماعية للرقم ${phone}.`);
        }
        if (!broadcastText) {
            return safeReply(ctx, '❌ أرسل نص الرسالة أولاً.');
        }
        const contacts = getPhoneContactEntries(phone);
        if (!contacts.length) {
            ctx.session = null;
            return safeReply(ctx, '⚠️ لا توجد جهات اتصال محفوظة لهذا الرقم.');
        }
        const finalCount = Math.max(1, Math.min(targetCount || contacts.length, contacts.length));
        await safeReply(ctx, `✅ تم استلام طلب الرسالة الجماعية للرقم ${phone}.
📊 سيتم الإرسال إلى ${finalCount} من أصل ${contacts.length} جهة اتصال.
⏳ سيتم الإرسال على دفعات (100 جهة كل 5 دقائق) لتجنب الحظر.
📌 يمكنك الإلغاء أثناء التشغيل من زر الإلغاء عند ظهور إشعارات التقدم.`);
        ctx.session = null;
        const sock = waClients.get(normalizePhone(phone));
        const telegramUserId = ctx.from.id;
        setImmediate(async () => {
            try {
                const onProgress = async (rep, doneCount, totalCount, batchNum) => {
                    try {
                        const pct = totalCount ? Math.floor((doneCount / totalCount) * 100) : 0;
                        const msg = `📢 تقدم الرسالة الجماعية للرقم ${phone}:
` +
                            `✅ أُرسلت: ${rep.success} | ❌ فشل: ${rep.failed}
` +
                            `📊 اكتمل: ${doneCount}/${totalCount} (${pct}%)
` +
                            `📦 الدفعة رقم: ${batchNum}
` +
                            (doneCount < totalCount ? `⏸️ انتظار 5 دقائق قبل الدفعة القادمة...` : `🎉 اكتمل الإرسال!`);
                        await bot.telegram.sendMessage(telegramUserId, msg, getContactsBroadcastCancelKeyboard(phone));
                    } catch(_) {}
                };
                const report = await sendBroadcastToAllContactsQueue(sock, phone, broadcastText, onProgress, finalCount);
                try {
                    await bot.telegram.sendMessage(telegramUserId, `🏁 انتهى الإرسال الجماعي للرقم ${phone}:
` + formatContactsBroadcastReport(report));
                } catch(_) {}
            } catch (err) {
                try {
                    await bot.telegram.sendMessage(telegramUserId, `❌ حدث خطأ أثناء الإرسال الجماعي: ${err.message || 'خطأ غير متوقع'}`);
                } catch(_) {}
            }
        });
        return;
    }

    if (sessionState === 'wait_direct_contact_message_text') {
        const phone = ctx.session?.targetPhone;
        const contactJid = ctx.session?.targetContactJid;
        const contactName = String(ctx.session?.targetContactName || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const textToSend = String(incomingText || '').trim();
        if (/^(?:الغاء|إلغاء|cancel)$/i.test(textToSend)) {
            ctx.session = null;
            return safeReply(ctx, `✅ تم إلغاء المراسلة مع ${contactName || normalizePhone(contactJid)}.`);
        }
        if (!textToSend) {
            return safeReply(ctx, '❌ أرسل نص الرسالة أولاً.');
        }
        const sock = waClients.get(normalizePhone(phone));
        if (!sock) {
            ctx.session = null;
            return safeReply(ctx, `❌ الرقم ${phone} غير متصل حالياً على واتساب.`);
        }
        const entry = findPhoneContactEntry(phone, contactJid);
        if (!entry?.jid) {
            ctx.session = null;
            return safeReply(ctx, '❌ تعذر العثور على جهة الاتصال المطلوبة.');
        }
        const sent = await sock.sendMessage(entry.jid, { text: textToSend });
        const bridge = setDirectContactMessageSession(phone, entry.jid, { ownerId: String(ctx.from.id), lastDirection: 'out', lastMessageId: String(sent?.key?.id || '') });
        ctx.session = null;
        return safeReply(ctx, `✅ تم إرسال الرسالة إلى ${bridge?.contactName || contactName || normalizePhone(entry.jid)} من الرقم ${phone}.
📩 أي رد جديد سيصل لك هنا داخل البوت.`, getDirectContactReplyKeyboard(phone, entry.jid));
    }

    if (sessionState === 'wait_direct_contact_reply_text') {
        const phone = ctx.session?.targetPhone;
        const contactJid = ctx.session?.targetContactJid;
        const contactName = String(ctx.session?.targetContactName || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const textToSend = String(incomingText || '').trim();
        if (/^(?:الغاء|إلغاء|cancel)$/i.test(textToSend)) {
            ctx.session = null;
            return safeReply(ctx, `✅ تم إلغاء الرد على ${contactName || normalizePhone(contactJid)}.`);
        }
        if (!textToSend) {
            return safeReply(ctx, '❌ أرسل نص الرد أولاً.');
        }
        const sock = waClients.get(normalizePhone(phone));
        if (!sock) {
            ctx.session = null;
            return safeReply(ctx, `❌ الرقم ${phone} غير متصل حالياً على واتساب.`);
        }
        const entry = findPhoneContactEntry(phone, contactJid);
        if (!entry?.jid) {
            ctx.session = null;
            return safeReply(ctx, '❌ تعذر العثور على جهة الاتصال المطلوبة.');
        }
        const sent = await sock.sendMessage(entry.jid, { text: textToSend });
        setDirectContactMessageSession(phone, entry.jid, { ownerId: String(ctx.from.id), lastDirection: 'out', lastMessageId: String(sent?.key?.id || '') });
        ctx.session = null;
        return safeReply(ctx, `✅ تم إرسال الرد إلى ${contactName || normalizePhone(entry.jid)}.`, getDirectContactReplyKeyboard(phone, entry.jid));
    }

        if (sessionState === 'wait_phone') {
        const phone = normalizePhone(incomingText);
        if (!phone) {
            return safeReply(ctx, '❌ أرسل أرقام فقط مع مفتاح الدولة.');
        }

        const owner = getPhoneOwner(phone);
        if (owner && owner !== String(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الرقم مربوط بالفعل على مستخدم آخر.');
        }

        if (userOwnsPhone(ctx.from.id, phone) && waClients.has(phone)) {
            ctx.session = null;
            return safeReply(ctx, '✅ هذا الرقم مربوط لديك بالفعل ومفعل حالياً.');
        }

        await safeReply(ctx, '⏳ جاري إنشاء الجلسة وطلب كود الربط، انتظر قليلاً...');
        ctx.session = null;
        await startWhatsApp(phone, ctx, ctx.from.id);
        return;
    }

    if (sessionState === 'wait_emoji') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }

        if (!isEmojiInput(incomingText)) {
            return safeReply(ctx, '❌ أرسل إيموجي صحيح فقط مثل: 😍 أو ❤️ أو 🔥');
        }

        setPhoneEmoji(ctx.from.id, phone, incomingText);
        ctx.session = null;
        return safeReply(ctx, `✅ تم تغيير إيموجي التفاعل للرقم ${phone} إلى ${incomingText}`);
    }

    if (sessionState === 'wait_auto_reply_response') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }

        if (incomingText.toLowerCase() === 'off') {
            updatePhoneSettings(phone, { customAutoReplies: '' });
            ctx.session = null;
            return safeReply(ctx, `✅ تم تعطيل الردود التلقائية المخصصة للرقم ${phone}.`);
        }

        if (!String(incomingText || '').trim()) {
            return safeReply(ctx, '❌ أرسل نص الرد أولاً.');
        }

        const existingReplies = parseAutoReplyEntries(getActivePhoneSettings(phone).customAutoReplies);
        if (existingReplies.length >= MAX_AUTO_REPLIES) {
            ctx.session = null;
            return safeReply(ctx, `❌ وصلت للحد الأقصى ${MAX_AUTO_REPLIES} ردود. أرسل off لمسح الردود الحالية ثم أعد المحاولة.`);
        }

        ctx.session = {
            step: 'wait_auto_reply_keyword',
            targetPhone: phone,
            pendingReplyText: String(incomingText || '').trim().slice(0, 500)
        };
        return safeReply(ctx, '✅ تم استلام نص الرد.\nالآن أرسل الكلمة أو الكلمات المفتاحية التي تشغل هذا الرد.\nمثال: سلام أو سلام، هلا');
    }

    if (sessionState === 'wait_auto_reply_keyword') {
        const phone = ctx.session?.targetPhone;
        const pendingReplyText = String(ctx.session?.pendingReplyText || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }

        if (!pendingReplyText) {
            ctx.session = null;
            return safeReply(ctx, '❌ حصل خلل في حفظ نص الرد. أعد المحاولة من زر إدارة الرسائل.');
        }

        const keywords = normalizeAutoReplyKeywordsInput(incomingText);
        if (!keywords.length) {
            return safeReply(ctx, '❌ أرسل كلمة مفتاحية واحدة على الأقل مثل: سلام');
        }

        const entry = buildStructuredAutoReplyEntry(keywords.join(' | '), pendingReplyText);
        if (!entry) {
            return safeReply(ctx, '❌ لم أتمكن من إنشاء الرد التلقائي. حاول مرة أخرى.');
        }

        const existingReplies = parseAutoReplies(getActivePhoneSettings(phone).customAutoReplies);
        const nextReplies = [...existingReplies, entry].slice(0, MAX_AUTO_REPLIES);
        updatePhoneSettings(phone, { customAutoReplies: nextReplies.join('\n') });
        ctx.session = null;
        return safeReply(ctx, `✅ تم حفظ الرد التلقائي للرقم ${phone}.\n\n${formatAutoRepliesList(phone)}`);
    }
    if (sessionState === 'wait_settings_password') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }

        const auth = authenticateSettingsUser(phone, incomingText);
        if (!auth.ok) {
            return safeReply(ctx, '❌ كلمة السر غير صحيحة. أعد المحاولة أو اضغط زر إظهار كلمة السر الحالية.');
        }

        grantPhoneSettingsAccess(ctx.from.id, phone, auth.appId);
        ctx.session = null;
        return safeReply(ctx, buildPhoneSettingsMessage(phone), getPhoneSettingsKeyboard(phone));
    }

    if (sessionState === 'wait_setting_value') {
        const phone = ctx.session?.targetPhone;
        const fieldKey = String(ctx.session?.fieldKey || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        if (!fieldKey) {
            ctx.session = null;
            return safeReply(ctx, '❌ حصل خلل أثناء تحديد الحقل المطلوب تعديله.');
        }
        if (!hasPhoneSettingsAccess(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '🔒 انتهت جلسة فتح الإعدادات. افتح الإعدادات من جديد وأدخل كلمة السر مرة ثانية.');
        }

        const trimmed = String(incomingText || '').trim();
        const patch = {};

        if (!trimmed) {
            return safeReply(ctx, '❌ أرسل قيمة صالحة أولاً.');
        }

        if (fieldKey === 'ownerNumber') {
            patch[fieldKey] = normalizePhone(trimmed);
            if (!patch[fieldKey]) {
                return safeReply(ctx, '❌ أرسل رقم صحيح مع مفتاح الدولة.');
            }
        } else if (fieldKey === 'statusCustomReact') {
            patch[fieldKey] = normalizeStatusEmojiList(trimmed, getPhoneEmoji(phone));
            if (!patch[fieldKey]) {
                return safeReply(ctx, '❌ أرسل إيموجي واحد على الأقل بشكل صحيح.');
            }
        } else if (fieldKey === 'age') {
            const ageValue = trimmed.replace(/\D/g, '').slice(0, 2);
            if (!ageValue) {
                return safeReply(ctx, '❌ أرسل العمر كرقم فقط.');
            }
            patch[fieldKey] = ageValue;
        } else if (['gaOpenTime', 'gaCloseTime'].includes(fieldKey)) {
            if (!/^\d{2}:\d{2}$/.test(trimmed)) {
                return safeReply(ctx, '❌ الصيغة الصحيحة للوقت هي HH:MM مثل 05:00');
            }
            patch[fieldKey] = trimmed;
        } else if (['menu', 'alive', 'owner'].includes(fieldKey)) {
            if (!/^https?:\/\//i.test(trimmed) && !/^data:image\//i.test(trimmed)) {
                return safeReply(ctx, '❌ أرسل رابط صورة مباشر يبدأ بـ http أو https');
            }
            patch[fieldKey] = trimmed;
        } else {
            patch[fieldKey] = trimmed;
        }

        updatePhoneSettings(phone, patch);
        ctx.session = null;
        const section = getPhoneSettingsSectionByField(fieldKey);
        return safeReply(ctx, buildPhoneSettingsSectionMessage(phone, section.key), getPhoneSettingsSectionKeyboard(phone, section.key));
    }


    if (sessionState === 'wait_profile_name') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const cleanName = String(incomingText || '').trim().slice(0, 80);
        if (!cleanName) return safeReply(ctx, '❌ أرسل اسماً صالحاً أولاً.');
        try {
            await updatePhoneProfileNameNow(phone, cleanName);
            ctx.session = null;
            return safeReply(ctx, `✅ تم حفظ اسم الملف الشخصي للرقم ${phone} بنجاح.`);
        } catch (error) {
            ctx.session = null;
            return safeReply(ctx, `❌ تعذر تحديث الاسم الآن: ${error.message || 'حدث خطأ غير متوقع.'}`);
        }
    }

    if (sessionState === 'wait_profile_about_custom_expiry') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const expiresAt = parseProfileExpiryInput(incomingText);
        if (!expiresAt || expiresAt.getTime() <= Date.now()) {
            return safeReply(ctx, '❌ أرسل تاريخاً ووقتاً مستقبلياً صحيحاً بصيغة YYYY-MM-DD HH:MM');
        }
        if ((expiresAt.getTime() - Date.now()) > PROFILE_CUSTOM_MAX_DURATION_MS) {
            return safeReply(ctx, '❌ المدة المخصصة يجب أن تكون أقل من أو تساوي شهر واحد من الآن.');
        }
        ctx.session = {
            step: 'wait_profile_about_text',
            targetPhone: phone,
            pendingAboutExpiry: expiresAt.toISOString(),
            pendingAboutExpiryLabel: `حتى ${formatStatusArchiveTime(expiresAt.toISOString())}`
        };
        return safeReply(ctx, `📝 ممتاز. الآن أرسل رسالة حول الجديدة للرقم ${phone}.
الحد الأقصى ${MAX_WA_ABOUT_LENGTH} حرفاً.`);
    }

    if (sessionState === 'wait_profile_pic') {
        const phone = ctx.session?.targetPhone;
        if (!userOwnsPhone(ctx.from.id, phone)) { ctx.session = null; return safeReply(ctx, '❌ رقم غير موجود في حسابك.'); }
        const photo = ctx.message?.photo;
        if (!photo || !photo.length) return safeReply(ctx, '❌ أرسل صورة صالحة من نوع Photo.');
        const fileId = photo[photo.length - 1]?.file_id;
        if (!fileId) return safeReply(ctx, '❌ تعذر الحصول على الصورة.');
        try {
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const https = require('https'); const http = require('http');
            const imgBuf = await new Promise((res, rej) => {
                const mod = String(fileLink).startsWith('https') ? https : http;
                mod.get(String(fileLink), (r) => {
                    const chunks = [];
                    r.on('data', c => chunks.push(c));
                    r.on('end', () => res(Buffer.concat(chunks)));
                    r.on('error', rej);
                });
            });
            const sock = waClients.get(normalizePhone(phone));
            if (!sock) { ctx.session = null; return safeReply(ctx, '❌ الرقم غير متصل.'); }
            await sock.updateProfilePicture(`${normalizePhone(phone)}@s.whatsapp.net`, imgBuf);
            ctx.session = null;
            return safeReply(ctx, `✅ تم تحديث صورة البروفيل للرقم ${phone} بنجاح.`);
        } catch (err) {
            ctx.session = null;
            return safeReply(ctx, `❌ تعذر تحديث الصورة: ${err.message || 'خطأ غير متوقع.'}`);
        }
    }

    if (sessionState === 'wait_profile_about_text') {
        const phone = ctx.session?.targetPhone;
        const pendingAboutExpiry = String(ctx.session?.pendingAboutExpiry || '').trim();
        const pendingAboutExpiryLabel = String(ctx.session?.pendingAboutExpiryLabel || '').trim();
        if (!userOwnsPhone(ctx.from.id, phone)) {
            ctx.session = null;
            return safeReply(ctx, '❌ لم أتمكن من العثور على هذا الرقم ضمن حسابك.');
        }
        const cleanAbout = String(incomingText || '').trim();
        if (!cleanAbout) return safeReply(ctx, '❌ أرسل رسالة حول صالحة أولاً.');
        if (cleanAbout.length > MAX_WA_ABOUT_LENGTH) {
            return safeReply(ctx, `❌ رسالة حول يجب أن لا تتجاوز ${MAX_WA_ABOUT_LENGTH} حرفاً. أرسل نصاً أقصر.`);
        }
        // السماح بالحفظ حتى لو لم تُحدد مدة انتهاء
        let expiresAt = null;
        let expiryLabel = pendingAboutExpiryLabel || '';
        if (pendingAboutExpiry) {
            const expiresDate = new Date(pendingAboutExpiry);
            if (!Number.isNaN(expiresDate.getTime()) && expiresDate.getTime() > Date.now()) {
                expiresAt = expiresDate;
            } else {
                // المدة انتهت أو غير صالحة، نحفظ بدون مدة
                expiresAt = null;
                expiryLabel = 'دائم';
            }
        }
        try {
            await updatePhoneProfileAboutNow(phone, cleanAbout, expiresAt);
            ctx.session = null;
            const durationText = expiresAt
                ? `⏳ مدة الظهور: ${expiryLabel || formatStatusArchiveTime(expiresAt.toISOString())}.`
                : '⏳ تم الحفظ بشكل دائم (بدون مدة انتهاء).';
            return safeReply(ctx, `✅ تم حفظ رسالة حول للرقم ${phone} بنجاح.
${durationText}
📝 النص محفوظ داخل الرقم بنجاح بدون مشاكل.`);
        } catch (error) {
            ctx.session = null;
            return safeReply(ctx, `❌ تعذر تحديث حول الآن: ${error.message || 'حدث خطأ غير متوقع.'}`);
        }
    }

    if (sessionState === 'wait_new_start_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }

        const settings = getSettings();
        settings.startMessage = incomingText;
        saveSettings(settings);
        ctx.session = null;
        return safeReply(ctx, '✅ تم تحديث رسالة /start بنجاح.');
    }

    if (sessionState === 'wait_force_channel') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }

        const settings = getSettings();
        settings.requiredChannel = incomingText.toLowerCase() === 'off' ? '' : incomingText;
        saveSettings(settings);
        ctx.session = null;

        return safeReply(
            ctx,
            settings.requiredChannel
                ? `✅ تم تفعيل الاشتراك الإجباري على: ${settings.requiredChannel}`
                : '✅ تم إلغاء الاشتراك الإجباري.'
        );
    }

    if (sessionState === 'wait_broadcast_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }

        let success = 0;
        let failed = 0;
        const userIds = getAllUserIds();

        for (const userId of userIds) {
            try {
                await bot.telegram.sendMessage(userId, incomingText);
                success += 1;
            } catch (error) {
                failed += 1;
                console.error(`Broadcast Error (${userId}):`, error.message);
            }
        }

        ctx.session = null;
        return safeReply(ctx, `✅ تمت الإذاعة الجماعية.\n\nنجح: ${success}\nفشل: ${failed}`);
    }

    if (sessionState === 'wait_wa_broadcast_message') {
        if (!isAdmin(ctx.from.id)) {
            ctx.session = null;
            return safeReply(ctx, '❌ هذا الخيار خاص بالمطور فقط.');
        }

        const report = await sendWhatsAppLinkedNumbersBroadcast(incomingText);
        ctx.session = null;
        return safeReply(ctx, formatWhatsAppBroadcastReport(report));
    }
});

// =========================
// الموقع و Health Check
// =========================
if (TELEGRAM_ENABLED && USE_TELEGRAM_WEBHOOK) {
    app.use(bot.webhookCallback(TELEGRAM_WEBHOOK_PATH));
}

app.use('/uploads', express.static(UPLOADS_DIR));

function buildUnifiedSettingsHubHTML() {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>لوحة الإعدادات الموحّدة</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0d0d12;--card:#171722;--border:rgba(255,255,255,.08);--gold:#d4a055;--text:#f4eef8;--muted:#a39bb5}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#0d0d12,#12121b);color:var(--text);font-family:'Noto Sans Arabic',sans-serif}.wrap{max-width:1200px;margin:0 auto;padding:24px}.hero,.card{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:24px;padding:24px;box-shadow:0 10px 35px rgba(0,0,0,.25)}.hero{margin-bottom:20px}h1{margin:0 0 8px;font-size:30px}p{margin:0;color:var(--muted);line-height:1.8}.grid{display:grid;grid-template-columns:1fr;gap:20px}.row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:14px}.title{font-size:20px;font-weight:800}.sub{font-size:14px;color:var(--muted)}.btns{display:flex;gap:10px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 16px;border-radius:14px;text-decoration:none;font-weight:700;border:1px solid var(--border);color:var(--text);background:rgba(255,255,255,.03)}.btn.primary{background:linear-gradient(135deg,var(--gold),#b8853a);color:#111;border:none}.frame{width:100%;height:880px;border:1px solid var(--border);border-radius:18px;background:#0b0b10}.note{margin-top:10px;font-size:13px;color:var(--muted)}@media (max-width:768px){.frame{height:760px}h1{font-size:24px}}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>لوحة إعدادات الرقم + Contact Save</h1>
      <p>تم جمع إعدادات الرقم المربوط مع صفحة Contact Save في مكان واحد. لو المتصفح منع فتح أي إطار خارجي، استخدم أزرار الفتح المباشر الموجودة فوق كل قسم.</p>
    </section>
    <section class="grid">
      <div class="card">
        <div class="row">
          <div><div class="title">إعدادات الرقم المربوط</div><div class="sub">الواجهة الأصلية الخاصة بالإعدادات والجلسة</div></div>
          <div class="btns"><a class="btn primary" href="/settings-local" target="_blank" rel="noopener noreferrer">فتح الواجهة الأصلية</a></div>
        </div>
        <iframe class="frame" src="/settings-local" loading="lazy"></iframe>
      </div>
      <div class="card">
        <div class="row">
          <div><div class="title">إعدادات Contact Save</div><div class="sub">كل إعدادات حفظ جهات الاتصال التلقائي مضافة داخل هذه اللوحة</div></div>
          <div class="btns"><a class="btn primary" href="https://whatsapp-pairing-api-production.up.railway.app/contactsave" target="_blank" rel="noopener noreferrer">فتح Contact Save</a></div>
        </div>
        <iframe class="frame" src="https://whatsapp-pairing-api-production.up.railway.app/contactsave" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="note">إذا لم يظهر القسم الخارجي داخل الصفحة بسبب قيود المتصفح أو الموقع، استخدم زر فتح Contact Save مباشرة.</div>
      </div>
    </section>
  </div>
</body>
</html>`;
}

app.get('/settings-local', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(SETTINGS_PAGE_HTML);
});

app.get('/settings', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(SETTINGS_PAGE_HTML);
});


app.get('/minibot/setting', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(SETTINGS_PAGE_HTML);
});

app.post('/minibot/api/login', (req, res) => {
    try {
        const { num, pass } = req.body || {};
        const auth = authenticateSettingsUser(num, pass);
        if (!auth.ok) {
            return res.status(401).json({ success: false, message: auth.error, error: auth.error });
        }
        return res.json({ success: true, app: auth.appId, number: auth.phone });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Login failed' });
    }
});

app.get('/minibot/api/settings/load', (req, res) => {
    try {
        const phone = normalizePhone(req.query?.num || '');
        const appId = normalizeAppId(req.query?.app || 'default');
        if (!phone || !getPhoneOwner(phone)) {
            return res.status(404).json({ success: false, error: 'Linked number not found' });
        }
        const settings = getPhoneSettings(phone, appId);
        setActivePhoneSettings(phone, appId);
        return res.json({ success: true, app: appId, settings });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Load failed' });
    }
});

app.post('/minibot/api/settings/save', (req, res) => {
    try {
        const phone = normalizePhone(req.body?.num || '');
        const appId = normalizeAppId(req.body?.app || 'default');
        if (!phone || !getPhoneOwner(phone)) {
            return res.status(404).json({ success: false, error: 'Linked number not found' });
        }
        const settings = savePhoneSettings(phone, appId, req.body || {});
        const liveSock = waClients.get(phone);
        if (liveSock) startPresenceKeepAlive(liveSock, phone);
        return res.json({ success: true, app: appId, settings });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Save failed' });
    }
});

app.post('/minibot/api/image/upload', (req, res) => {
    try {
        const phone = normalizePhone(req.body?.num || '');
        const fieldKey = String(req.body?.fieldKey || '').trim();
        const imageBase64 = String(req.body?.image || '').trim();
        if (!phone || !getPhoneOwner(phone)) {
            return res.status(404).json({ success: false, error: 'Linked number not found' });
        }
        if (!['menu', 'alive', 'owner'].includes(fieldKey)) {
            return res.status(400).json({ success: false, error: 'Invalid field key' });
        }
        if (!imageBase64) {
            return res.status(400).json({ success: false, error: 'Image payload is required' });
        }
        const fileName = buildImageFileName('png');
        const filePath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(imageBase64, 'base64'));
        return res.json({ success: true, fieldKey, url: getUploadPublicUrl(fileName) });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Upload failed' });
    }
});


app.post('/api/login', (req, res) => {
    try {
        const { num, pass } = req.body || {};
        const auth = authenticateSettingsUser(num, pass);
        if (!auth.ok) {
            return res.status(401).json({ success: false, message: auth.error, error: auth.error });
        }
        return res.json({ success: true, app: auth.appId, number: auth.phone });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Login failed' });
    }
});

app.get('/api/settings/load', (req, res) => {
    try {
        const phone = normalizePhone(req.query?.num || '');
        const appId = normalizeAppId(req.query?.app || 'default');
        if (!phone || !getPhoneOwner(phone)) {
            return res.status(404).json({ success: false, error: 'Linked number not found' });
        }
        const settings = getPhoneSettings(phone, appId);
        setActivePhoneSettings(phone, appId);
        return res.json({ success: true, app: appId, settings });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Load failed' });
    }
});

app.post('/api/settings/save', (req, res) => {
    try {
        const phone = normalizePhone(req.body?.num || '');
        const appId = normalizeAppId(req.body?.app || 'default');
        if (!phone || !getPhoneOwner(phone)) {
            return res.status(404).json({ success: false, error: 'Linked number not found' });
        }
        const settings = savePhoneSettings(phone, appId, req.body || {});
        const liveSock = waClients.get(phone);
        if (liveSock) startPresenceKeepAlive(liveSock, phone);
        return res.json({ success: true, app: appId, settings });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Save failed' });
    }
});

app.post('/api/image/upload', (req, res) => {
    try {
        const phone = normalizePhone(req.body?.num || '');
        const fieldKey = String(req.body?.fieldKey || '').trim();
        const imageBase64 = String(req.body?.image || '').trim();
        if (!phone || !getPhoneOwner(phone)) {
            return res.status(404).json({ success: false, error: 'Linked number not found' });
        }
        if (!['menu', 'alive', 'owner'].includes(fieldKey)) {
            return res.status(400).json({ success: false, error: 'Invalid field key' });
        }
        if (!imageBase64) {
            return res.status(400).json({ success: false, error: 'Image payload is required' });
        }
        const fileName = buildImageFileName('png');
        const filePath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(imageBase64, 'base64'));
        return res.json({ success: true, fieldKey, url: getUploadPublicUrl(fileName) });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Upload failed' });
    }
});

app.get('/api/dashboard/load', (req, res) => {
    try {
        const phone = normalizePhone(req.query?.num || '');
        const appId = normalizeAppId(req.query?.app || 'default');
        if (!phone || !getPhoneOwner(phone)) {
            return res.status(404).json({ success: false, error: 'Linked number not found' });
        }
        const settings = getPhoneSettings(phone, appId);
        const stats = getDashboardStats(phone);
        return res.json({
            success: true,
            phone,
            app: appId,
            settings,
            stats,
            pairingApi: buildPairingApiDescriptor(phone),
            analytics: getAnalyticsDB()
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Dashboard load failed' });
    }
});

bot.command('statusview', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    const parts = String(ctx.message?.text || '').split(/\s+/).filter(Boolean);
    const phone = normalizePhone(parts[1] || '');
    const value = String(parts[2] || '').toLowerCase();
    if (!phone || !['on', 'off'].includes(value) || !getPhoneOwner(phone)) {
        return safeReply(ctx, '❌ الاستخدام الصحيح: /statusview 967xxxxxxxx on أو /statusview 967xxxxxxxx off');
    }
    updatePhoneSettings(phone, { statusMsgSend: value });
    return safeReply(ctx, `✅ تم ${value === 'on' ? 'تشغيل' : 'إيقاف'} الرد على مشاهدة الحالة للرقم ${phone}.`);
});

bot.command('setstatusmsg', async (ctx) => {
    upsertTelegramUser(ctx);
    if (!isAdmin(ctx.from.id)) return safeReply(ctx, '❌ هذا الأمر خاص بالمطور فقط.');
    const raw = String(ctx.message?.text || '').trim();
    const match = raw.match(/^\/setstatusmsg\s+(\d{8,15})\s+([\s\S]+)$/i);
    if (!match) {
        return safeReply(ctx, '❌ الاستخدام الصحيح: /setstatusmsg 967xxxxxxxx النص الجديد');
    }
    const phone = normalizePhone(match[1]);
    const messageText = match[2].trim();
    if (!getPhoneOwner(phone)) return safeReply(ctx, '❌ الرقم غير مربوط حالياً.');
    updatePhoneSettings(phone, { statusMsgType: 'custom', customMsg: messageText, statusMsgSend: 'on' });
    return safeReply(ctx, `✅ تم تحديث رسالة مشاهدة الحالة للرقم ${phone}.`);
});



function buildLandingPageHTML() {
    return "<!DOCTYPE html>\n<html lang=\"si\">\n<head>\n    <meta charset=\"UTF-8\">\n<meta name=\"google-site-verification\" content=\"mHHNdsWxOnByKqo_D43tw-aIEV63lsUQ4b6zNZPdzBI\" />\n<meta name=\"keywords\" content=\"bot, whatsapp bot, golden queen bot, vimamods, status bot, md bot, sri lankan bot, automation, bot store, whatsapp automation, wa bot, queen bot, golden queen md, free bot, bot 2026, anti delete bot, auto react bot, group management bot, whatsapp bot script, nodejs bot, baileys bot, heroku bot, vps bot, stickers bot, music downloader bot, video downloader bot, ai bot, chat bot, whatsapp api bot, qr code bot, pairing code bot, golden queen team, open source bot, github bot, best bot in sri lanka, sinhala bot, tamil bot, free md bot, no ban bot, secure bot, queen bot store, plugin bot, bot deployment, automated bot, fast bot, unlimited bot, multi device bot, wa automation tool, bot website, queen bot official\">\n\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>👑 بوت الملك فارس</title>\n    <link href=\"https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&family=Cormorant+Garamond:ital,wght@1,300;1,500&display=swap\" rel=\"stylesheet\">\n    <script src=\"https://cdn.jsdelivr.net/npm/sweetalert2@11\"></script>\n\n    <style>\n        :root {\n            --bg: #0d0d12;\n            --card: #1a1a27;\n            --card2: #13131c;\n            --border: rgba(255,255,255,0.07);\n            --border-accent: rgba(212,160,85,0.35);\n            --gold: #d4a055;\n            --gold-light: #f0c880;\n            --rose: #e8697a;\n            --rose-light: #f5a0ac;\n            --text: #f0eaf5;\n            --muted: #8a849a;\n            --faint: #4a4460;\n            --primary: #00d2ff;\n            --secondary: #3a7bd5;\n        }\n\n        * { margin: 0; padding: 0; box-sizing: border-box; }\n\n        body {\n            font-family: 'DM Sans', sans-serif;\n            background: var(--bg);\n            color: var(--text);\n            min-height: 100vh;\n            overflow-x: hidden;\n            display: flex;\n            flex-direction: column;\n            align-items: center;\n        }\n\n        body::before {\n            content: '';\n            position: fixed;\n            inset: 0;\n            background:\n                radial-gradient(ellipse 60% 40% at 20% 10%, rgba(0,210,255,0.06) 0%, transparent 60%),\n                radial-gradient(ellipse 50% 30% at 80% 80%, rgba(212,160,85,0.07) 0%, transparent 60%);\n            pointer-events: none;\n            z-index: 0;\n        }\n\n        body::after {\n            content: \"\";\n            position: fixed;\n            top: -100px;\n            left: 0;\n            width: 100%;\n            height: 2px;\n            background: linear-gradient(90deg, transparent, var(--gold), var(--primary), var(--gold), transparent);\n            box-shadow: 0 0 12px var(--gold), 0 0 28px rgba(212,160,85,0.5);\n            z-index: 9999;\n            animation: laserMove 5s linear infinite;\n            pointer-events: none;\n        }\n\n        @keyframes laserMove {\n            0%   { top: -2%; opacity: 0; }\n            8%   { opacity: 1; }\n            92%  { opacity: 1; }\n            100% { top: 105%; opacity: 0; }\n        }\n\n        .fade-in {\n            animation: smoothFade 0.7s ease-out forwards;\n            opacity: 0;\n        }\n\n        @keyframes smoothFade {\n            from { opacity: 0; transform: translateY(18px); }\n            to   { opacity: 1; transform: translateY(0); }\n        }\n\n        /* ═══════════════════════════\n           LANGUAGE OVERLAY\n        ═══════════════════════════ */\n        .langOverlay {\n            position: fixed; inset: 0;\n            background: rgba(0,0,0,0.92);\n            display: flex; align-items: center; justify-content: center;\n            z-index: 1000;\n            backdrop-filter: blur(14px);\n        }\n\n        .langBox {\n            text-align: center;\n            background: var(--card);\n            padding: 48px 40px;\n            border-radius: 28px;\n            border: 1px solid var(--border-accent);\n            max-width: 420px;\n            width: 90%;\n            box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px var(--border);\n        }\n\n        .langBox-eyebrow {\n            font-size: 0.68rem;\n            font-weight: 700;\n            letter-spacing: 0.22em;\n            text-transform: uppercase;\n            color: var(--gold);\n            opacity: 0.8;\n            margin-bottom: 14px;\n        }\n\n        .langBox h2 {\n            font-family: 'Playfair Display', serif;\n            font-size: 1.7rem;\n            font-weight: 600;\n            color: var(--text);\n            margin-bottom: 8px;\n        }\n\n        .langBox-sub {\n            font-family: 'Cormorant Garamond', serif;\n            font-style: italic;\n            font-size: 1rem;\n            color: var(--muted);\n            margin-bottom: 32px;\n        }\n\n        .lang-grid {\n            display: grid;\n            grid-template-columns: 1fr 1fr;\n            gap: 12px;\n        }\n\n        .langBtn {\n            background: transparent;\n            border: 1px solid var(--border-accent);\n            padding: 14px 20px;\n            cursor: pointer;\n            border-radius: 14px;\n            color: var(--text);\n            font-family: 'DM Sans', sans-serif;\n            font-weight: 600;\n            font-size: 0.92rem;\n            transition: all 0.25s;\n            display: flex;\n            flex-direction: column;\n            align-items: center;\n            gap: 5px;\n        }\n\n        .langBtn .lang-flag { font-size: 1.4rem; }\n        .langBtn .lang-name { font-size: 0.78rem; color: var(--muted); font-weight: 400; }\n\n        .langBtn:hover {\n            background: rgba(212,160,85,0.1);\n            border-color: var(--gold);\n            color: var(--gold-light);\n            transform: translateY(-3px);\n            box-shadow: 0 8px 24px rgba(212,160,85,0.15);\n        }\n\n        /* ═══════════════════════════\n           MAIN BODY\n        ═══════════════════════════ */\n        .mainBody {\n            width: 100%;\n            display: none;\n            flex-direction: column;\n            align-items: center;\n            position: relative;\n            z-index: 1;\n        }\n\n        .header {\n            width: 100%;\n            text-align: center;\n            padding: 52px 20px 40px;\n        }\n\n        .header-eyebrow {\n            font-size: 0.68rem;\n            font-weight: 700;\n            letter-spacing: 0.24em;\n            text-transform: uppercase;\n            color: var(--gold);\n            opacity: 0.8;\n            margin-bottom: 16px;\n        }\n\n        .header h1 {\n            font-family: 'Playfair Display', serif;\n            font-size: clamp(1.9rem, 5vw, 3rem);\n            font-weight: 700;\n            line-height: 1.15;\n            margin-bottom: 10px;\n        }\n\n        .header h1 .accent {\n            background: linear-gradient(135deg, var(--gold), var(--primary));\n            -webkit-background-clip: text;\n            -webkit-text-fill-color: transparent;\n        }\n\n        .header-divider {\n            width: 52px;\n            height: 1px;\n            background: linear-gradient(90deg, transparent, var(--gold), transparent);\n            margin: 16px auto;\n        }\n\n        .header-sub {\n            font-family: 'Cormorant Garamond', serif;\n            font-style: italic;\n            font-size: 1.1rem;\n            color: var(--muted);\n        }\n\n        .container {\n            max-width: 440px;\n            width: 92%;\n            margin: 0 auto;\n            padding-bottom: 60px;\n        }\n\n        .noticeBox {\n            background: rgba(0,210,255,0.06);\n            border: 1px solid rgba(0,210,255,0.2);\n            border-radius: 16px;\n            padding: 16px 18px;\n            margin-bottom: 22px;\n            font-size: 0.85rem;\n            line-height: 1.65;\n            color: rgba(0,210,255,0.85);\n            display: flex;\n            gap: 10px;\n            align-items: flex-start;\n        }\n\n        .noticeBox-icon {\n            font-size: 1.1rem;\n            flex-shrink: 0;\n            margin-top: 1px;\n        }\n\n        /* ═══════════════════════════\n           TAB SWITCHER\n        ═══════════════════════════ */\n        .tab-switcher {\n            position: relative;\n            display: flex;\n            background: var(--card2);\n            border: 1px solid var(--border);\n            border-radius: 18px;\n            padding: 5px;\n            margin-bottom: 22px;\n            overflow: hidden;\n        }\n\n        .tab-pill {\n            position: absolute;\n            top: 5px;\n            left: 5px;\n            width: calc(50% - 5px);\n            height: calc(100% - 10px);\n            background: linear-gradient(135deg, rgba(212,160,85,0.18), rgba(0,210,255,0.10));\n            border: 1px solid var(--border-accent);\n            border-radius: 13px;\n            transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);\n            box-shadow: 0 4px 16px rgba(212,160,85,0.12);\n            pointer-events: none;\n            z-index: 0;\n        }\n\n        .tab-pill.right { transform: translateX(100%); }\n\n        .tab-btn {\n            flex: 1;\n            background: transparent;\n            border: none;\n            padding: 14px 10px;\n            color: var(--muted);\n            font-family: 'DM Sans', sans-serif;\n            font-size: 0.82rem;\n            font-weight: 600;\n            letter-spacing: 0.08em;\n            text-transform: uppercase;\n            cursor: pointer;\n            border-radius: 13px;\n            transition: color 0.3s;\n            position: relative;\n            z-index: 1;\n            display: flex;\n            align-items: center;\n            justify-content: center;\n            gap: 7px;\n        }\n\n        .tab-btn.active { color: var(--gold-light); }\n        .tab-btn .tab-icon { font-size: 1rem; }\n\n        /* ═══════════════════════════\n           TAB PANELS\n        ═══════════════════════════ */\n        .tab-content-wrap { position: relative; }\n\n        .tab-panel { transition: opacity 0.35s ease; }\n\n        .tab-panel.hidden { display: none; opacity: 0; }\n        .tab-panel.visible { display: block; opacity: 1; }\n\n        /* ═══════════════════════════\n           CARD\n        ═══════════════════════════ */\n        .card {\n            background: var(--card);\n            border: 1px solid var(--border);\n            border-radius: 24px;\n            padding: 32px 28px;\n            box-shadow: 0 20px 48px rgba(0,0,0,0.4);\n            transition: border-color 0.3s;\n        }\n\n        .card:hover { border-color: var(--border-accent); }\n\n        .card-header {\n            display: flex;\n            align-items: center;\n            gap: 12px;\n            margin-bottom: 28px;\n            padding-bottom: 20px;\n            border-bottom: 1px solid var(--border);\n        }\n\n        .card-header-icon {\n            width: 40px; height: 40px;\n            background: rgba(0,210,255,0.1);\n            border: 1px solid rgba(0,210,255,0.2);\n            border-radius: 12px;\n            display: flex; align-items: center; justify-content: center;\n            font-size: 1.15rem;\n            flex-shrink: 0;\n        }\n\n        .card-header-title {\n            font-family: 'Playfair Display', serif;\n            font-size: 1.1rem;\n            font-weight: 600;\n            color: var(--text);\n        }\n\n        .card-header-sub {\n            font-size: 0.73rem;\n            color: var(--muted);\n            margin-top: 2px;\n        }\n\n        .inputGroup { margin-bottom: 6px; }\n\n        .inputGroup label {\n            display: block;\n            margin-bottom: 10px;\n            font-size: 0.78rem;\n            font-weight: 600;\n            letter-spacing: 0.1em;\n            text-transform: uppercase;\n            color: var(--muted);\n        }\n\n        .input-wrap { position: relative; }\n\n        .input-prefix {\n            position: absolute;\n            left: 16px; top: 50%;\n            transform: translateY(-50%);\n            font-size: 0.9rem;\n            color: var(--muted);\n            pointer-events: none;\n        }\n\n        .inputGroup input {\n            width: 100%;\n            padding: 16px 16px 16px 42px;\n            border-radius: 14px;\n            border: 1px solid var(--border);\n            background: rgba(255,255,255,0.04);\n            color: var(--text);\n            font-family: 'DM Sans', sans-serif;\n            font-size: 1rem;\n            box-sizing: border-box;\n            outline: none;\n            transition: border-color 0.25s, background 0.25s;\n            letter-spacing: 0.04em;\n        }\n\n        .inputGroup input::placeholder { color: var(--faint); }\n        .inputGroup input:focus {\n            border-color: var(--gold);\n            background: rgba(212,160,85,0.04);\n        }\n\n        .submitBtn {\n            width: 100%;\n            background: linear-gradient(135deg, var(--gold), #b8853a);\n            border: none;\n            padding: 18px;\n            margin-top: 22px;\n            color: #0d0d0d;\n            font-family: 'DM Sans', sans-serif;\n            font-size: 0.9rem;\n            font-weight: 700;\n            letter-spacing: 0.12em;\n            text-transform: uppercase;\n            border-radius: 14px;\n            cursor: pointer;\n            transition: all 0.3s;\n            position: relative;\n            overflow: hidden;\n        }\n\n        .submitBtn::before {\n            content: '';\n            position: absolute; inset: 0;\n            background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);\n            opacity: 0;\n            transition: opacity 0.3s;\n        }\n\n        .submitBtn:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(212,160,85,0.35); }\n        .submitBtn:hover::before { opacity: 1; }\n        .submitBtn:active { transform: translateY(0); }\n\n        /* ═══════════════════════════\n           QR CARD\n        ═══════════════════════════ */\n        .qr-card {\n            background: var(--card);\n            border: 1px solid var(--border);\n            border-radius: 24px;\n            padding: 32px 28px;\n            box-shadow: 0 20px 48px rgba(0,0,0,0.4);\n            text-align: center;\n        }\n\n        .qr-card-header {\n            display: flex;\n            align-items: center;\n            gap: 12px;\n            margin-bottom: 28px;\n            padding-bottom: 20px;\n            border-bottom: 1px solid var(--border);\n            text-align: left;\n        }\n\n        .qr-card-icon {\n            width: 40px; height: 40px;\n            background: rgba(212,160,85,0.1);\n            border: 1px solid rgba(212,160,85,0.25);\n            border-radius: 12px;\n            display: flex; align-items: center; justify-content: center;\n            font-size: 1.15rem;\n            flex-shrink: 0;\n        }\n\n        /* QR Frame */\n        .qr-frame {\n            position: relative;\n            width: 220px; height: 220px;\n            margin: 0 auto 24px;\n        }\n\n        .qr-frame::before, .qr-frame::after {\n            content: '';\n            position: absolute;\n            width: 24px; height: 24px;\n            border-color: var(--gold);\n            border-style: solid;\n            z-index: 2;\n        }\n        .qr-frame::before { top: -3px; left: -3px; border-width: 3px 0 0 3px; border-radius: 6px 0 0 0; }\n        .qr-frame::after  { bottom: -3px; right: -3px; border-width: 0 3px 3px 0; border-radius: 0 0 6px 0; }\n\n        .qr-corner-tr, .qr-corner-bl {\n            position: absolute;\n            width: 24px; height: 24px;\n            border-color: var(--gold);\n            border-style: solid;\n            z-index: 2;\n        }\n        .qr-corner-tr { top: -3px; right: -3px; border-width: 3px 3px 0 0; border-radius: 0 6px 0 0; }\n        .qr-corner-bl { bottom: -3px; left: -3px; border-width: 0 0 3px 3px; border-radius: 0 0 0 6px; }\n\n        .qr-img-wrap {\n            width: 100%; height: 100%;\n            border-radius: 12px;\n            overflow: hidden;\n            background: #fff;\n            display: flex; align-items: center; justify-content: center;\n            position: relative;\n        }\n\n        #qrImage {\n            width: 100%; height: 100%;\n            object-fit: contain;\n            display: none;\n            opacity: 0;\n            transition: opacity 0.4s ease;\n        }\n\n        #qrImage.loaded { display: block; opacity: 1; }\n\n        /* Scan line */\n        .qr-scan-line {\n            position: absolute;\n            top: 0; left: 0; right: 0;\n            height: 3px;\n            background: linear-gradient(90deg, transparent, rgba(0,210,255,0.9), transparent);\n            box-shadow: 0 0 10px rgba(0,210,255,0.6);\n            border-radius: 2px;\n            animation: scanLine 2.5s ease-in-out infinite;\n            z-index: 3;\n            pointer-events: none;\n            display: none;\n        }\n\n        .qr-scan-line.active { display: block; }\n\n        @keyframes scanLine {\n            0%   { top: 0%;   opacity: 0; }\n            10%  { opacity: 1; }\n            90%  { opacity: 1; }\n            100% { top: 100%; opacity: 0; }\n        }\n\n        /* Skeleton */\n        .qr-skeleton {\n            width: 100%; height: 100%;\n            background: linear-gradient(110deg, #e0e0e0 8%, #f5f5f5 18%, #e0e0e0 33%);\n            background-size: 200% 100%;\n            animation: shimmer 1.4s linear infinite;\n            border-radius: 8px;\n            display: none;\n        }\n\n        .qr-skeleton.active { display: block; }\n\n        @keyframes shimmer {\n            0%   { background-position: -200% 0; }\n            100% { background-position:  200% 0; }\n        }\n\n        /* Placeholder */\n        .qr-placeholder {\n            display: flex;\n            flex-direction: column;\n            align-items: center;\n            gap: 10px;\n            color: var(--faint);\n            cursor: pointer;\n            width: 100%; height: 100%;\n            justify-content: center;\n            transition: opacity 0.3s;\n        }\n\n        .qr-placeholder:hover { opacity: 0.7; }\n\n        .qr-placeholder svg { width: 56px; height: 56px; opacity: 0.4; }\n\n        .qr-placeholder-text {\n            font-size: 0.75rem;\n            color: var(--faint);\n            letter-spacing: 0.05em;\n        }\n\n        /* Progress bar */\n        .qr-progress-wrap { margin-bottom: 20px; }\n\n        .qr-progress-label {\n            display: flex;\n            justify-content: space-between;\n            align-items: center;\n            margin-bottom: 8px;\n            font-size: 0.72rem;\n            color: var(--muted);\n            letter-spacing: 0.06em;\n            text-transform: uppercase;\n        }\n\n        .qr-countdown {\n            font-family: 'Playfair Display', serif;\n            font-size: 1.1rem;\n            color: var(--gold-light);\n            font-weight: 600;\n            min-width: 30px;\n            text-align: right;\n            transition: color 0.3s;\n        }\n\n        .qr-countdown.urgent { color: var(--rose); }\n\n        .qr-progress-bar-bg {\n            height: 5px;\n            background: rgba(255,255,255,0.06);\n            border-radius: 99px;\n            overflow: hidden;\n        }\n\n        .qr-progress-bar {\n            height: 100%;\n            border-radius: 99px;\n            background: linear-gradient(90deg, var(--gold), var(--primary));\n            box-shadow: 0 0 8px rgba(0,210,255,0.4);\n            transition: width 1s linear, background 0.3s;\n            width: 100%;\n        }\n\n        .qr-progress-bar.urgent {\n            background: linear-gradient(90deg, var(--rose), #ff4466);\n            box-shadow: 0 0 8px rgba(232,105,122,0.5);\n        }\n\n        .qr-status {\n            font-size: 0.8rem;\n            color: var(--muted);\n            margin-bottom: 20px;\n            min-height: 20px;\n            transition: color 0.3s;\n        }\n\n        /* Retry Button */\n        .qr-retry-btn {\n            display: none;\n            width: 100%;\n            background: transparent;\n            border: 1px solid var(--border-accent);\n            padding: 16px;\n            color: var(--gold-light);\n            font-family: 'DM Sans', sans-serif;\n            font-size: 0.85rem;\n            font-weight: 600;\n            letter-spacing: 0.1em;\n            text-transform: uppercase;\n            border-radius: 14px;\n            cursor: pointer;\n            transition: all 0.3s;\n        }\n\n        .qr-retry-btn:hover {\n            background: rgba(212,160,85,0.08);\n            border-color: var(--gold);\n            transform: translateY(-2px);\n            box-shadow: 0 8px 24px rgba(212,160,85,0.18);\n        }\n\n        .qr-retry-btn:active { transform: scale(0.97); }\n        .qr-retry-btn.visible { display: block; }\n\n        /* Footer */\n        .footer-bar {\n            text-align: center;\n            border-top: 1px solid var(--border);\n            padding: 28px 20px;\n            width: 100%;\n            position: relative;\n            z-index: 1;\n        }\n\n        .footer-brand {\n            font-family: 'Playfair Display', serif;\n            font-size: 1.1rem;\n            background: linear-gradient(135deg, var(--gold), var(--rose-light));\n            -webkit-background-clip: text;\n            -webkit-text-fill-color: transparent;\n            margin-bottom: 6px;\n        }\n\n        .footer-copy { font-size: 0.7rem; color: var(--faint); letter-spacing: 0.05em; }\n\n        /* SweetAlert2 */\n        .swal2-popup {\n            background: var(--card) !important;\n            border: 1px solid var(--border-accent) !important;\n            border-radius: 20px !important;\n            color: var(--text) !important;\n            font-family: 'DM Sans', sans-serif !important;\n        }\n        .swal2-title { color: var(--text) !important; font-family: 'Playfair Display', serif !important; }\n        .swal2-html-container { color: var(--muted) !important; }\n        .swal2-confirm {\n            background: linear-gradient(135deg, var(--gold), #b8853a) !important;\n            color: #0d0d0d !important;\n            font-weight: 700 !important;\n            border-radius: 12px !important;\n            letter-spacing: 0.08em !important;\n            font-family: 'DM Sans', sans-serif !important;\n        }\n\n        @media (max-width: 480px) {\n            .header { padding: 40px 16px 32px; }\n            .card, .qr-card { padding: 24px 18px; }\n            .qr-frame { width: 190px; height: 190px; }\n        }\n/* Video Background Styling */\n.video-background {\n    position: fixed;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    z-index: -1; /* අන්තර්ගතයට පිටුපසින් තැබීමට */\n    overflow: hidden;\n}\n\n#bgVideo {\n    position: absolute;\n    top: 50%;\n    left: 50%;\n    min-width: 100%;\n    min-height: 100%;\n    width: auto;\n    height: auto;\n    transform: translate(-50%, -50%);\n    object-fit: cover;\n}\n.video-overlay {\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    background: rgba(0, 0, 0, 0.6); \n}\n\n    </style>\n</head>\n<body>\n\n\n\n<!-- ══ LANGUAGE OVERLAY ══ -->\n<div id=\"langOverlay\" class=\"langOverlay\">\n    <div class=\"langBox fade-in\">\n        <p class=\"langBox-eyebrow\">✦ بوت الملك فارس ✦</p>\n        <h2>👑 Welcome</h2>\n        <p class=\"langBox-sub\">Select your language to continue</p>\n        <div class=\"lang-grid\">\n            <button class=\"langBtn\" onclick=\"initPage('si')\">\n                <span class=\"lang-flag\">🇱🇰</span>\n                <span style=\"font-size:1rem;font-weight:700;\">සිංහල</span>\n                <span class=\"lang-name\">Sinhala</span>\n            </button>\n            <button class=\"langBtn\" onclick=\"initPage('en')\">\n                <span class=\"lang-flag\">🇬🇧</span>\n                <span style=\"font-size:1rem;font-weight:700;\">English</span>\n                <span class=\"lang-name\">English</span>\n            </button>\n            <button class=\"langBtn\" onclick=\"initPage('ta')\">\n                <span class=\"lang-flag\">🇮🇳</span>\n                <span style=\"font-size:1rem;font-weight:700;\">தமிழ்</span>\n                <span class=\"lang-name\">Tamil</span>\n            </button>\n            <button class=\"langBtn\" onclick=\"initPage('ar')\">\n                <span class=\"lang-flag\">🇸🇦</span>\n                <span style=\"font-size:1rem;font-weight:700;\">العربية</span>\n                <span class=\"lang-name\">Arabic</span>\n            </button>\n        </div>\n    </div>\n</div>\n\n<!-- ══ MAIN BODY ══ -->\n<div id=\"mainBody\" class=\"mainBody\">\n\n    <header class=\"header fade-in\">\n        <p class=\"header-eyebrow\">✦ Device Linking Portal ✦</p>\n        <h1 id=\"titleText\"><span class=\"accent\">بوت الملك فارس</span></h1>\n<div class=\"header-divider\"></div>\n        <p class=\"header-sub\" id=\"headerSub\">Link your WhatsApp device below</p>\n    </header>\n\n    <div class=\"container\">\n\n        <div id=\"noticeNews\" class=\"noticeBox fade-in\" style=\"animation-delay:0.15s;\">\n            <span class=\"noticeBox-icon\">📢</span>\n            <span id=\"noticeText\"></span>\n        </div>\n\n        <!-- Tab Switcher -->\n        <div class=\"tab-switcher fade-in\" style=\"animation-delay:0.22s;\">\n            <div class=\"tab-pill\" id=\"tabPill\"></div>\n            <button class=\"tab-btn active\" id=\"tabPairing\" onclick=\"switchTab('pairing')\">\n                <span class=\"tab-icon\">🔗</span>\n                <span id=\"tabPairingLabel\">Pairing Code</span>\n            </button>\n            <button class=\"tab-btn\" id=\"tabQr\" onclick=\"switchTab('qr')\">\n                <span class=\"tab-icon\">📷</span>\n                <span id=\"tabQrLabel\">QR Code</span>\n            </button>\n        </div>\n\n        <div class=\"tab-content-wrap\">\n\n            <!-- ── PAIRING PANEL ── -->\n            <div id=\"panelPairing\" class=\"tab-panel visible fade-in\" style=\"animation-delay:0.28s;\">\n                <div class=\"card\">\n                    <div class=\"card-header\">\n                        <div class=\"card-header-icon\">🔐</div>\n                        <div>\n                            <div class=\"card-header-title\" id=\"loginHeader\"></div>\n                            <div class=\"card-header-sub\" id=\"loginSubText\"></div>\n                        </div>\n                    </div>\n                    <div class=\"inputGroup\">\n                        <label id=\"numLabel\"></label>\n                        <div class=\"input-wrap\">\n                            <span class=\"input-prefix\">📞</span>\n                            <input\n                                type=\"text\"\n                                id=\"phoneNum\"\n                                placeholder=\"947XXXXXXXX\"\ninputMode=\"numeric\"\n                                oninput=\"this.value = this.value.replace(/[^0-9+ ]/g, '')\"\n                            >\n                        </div>\n                    </div>\n                </div>\n                <button class=\"submitBtn\" id=\"submitBtn\" onclick=\"handleSubmit()\"></button>\n            </div>\n\n            <!-- ── QR PANEL ── -->\n            <div id=\"panelQr\" class=\"tab-panel hidden\">\n                <div class=\"qr-card\">\n\n                    <div class=\"qr-card-header\">\n                        <div class=\"qr-card-icon\">📷</div>\n                        <div>\n                            <div class=\"card-header-title\" id=\"qrHeader\">QR Code Login</div>\n                            <div class=\"card-header-sub\" id=\"qrSubText\">Scan with WhatsApp to connect</div>\n                        </div>\n                    </div>\n\n                    <!-- QR Frame -->\n                    <div class=\"qr-frame\">\n                        <div class=\"qr-corner-tr\"></div>\n                        <div class=\"qr-corner-bl\"></div>\n                        <div class=\"qr-img-wrap\" id=\"qrImgWrap\">\n                            <!-- Placeholder (click to load) -->\n                            <div class=\"qr-placeholder\" id=\"qrPlaceholder\" onclick=\"loadQr()\">\n                                <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\">\n                                    <rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/>\n                                    <rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/>\n                                    <rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>\n                                    <rect x=\"14\" y=\"14\" width=\"3\" height=\"3\" rx=\"0.5\"/>\n                                    <rect x=\"18\" y=\"14\" width=\"3\" height=\"3\" rx=\"0.5\"/>\n                                    <rect x=\"14\" y=\"18\" width=\"3\" height=\"3\" rx=\"0.5\"/>\n                                    <rect x=\"18\" y=\"18\" width=\"3\" height=\"3\" rx=\"0.5\"/>\n                                </svg>\n                                <span class=\"qr-placeholder-text\" id=\"qrPlaceholderText\">Tap to load QR</span>\n                            </div>\n                            <!-- Skeleton shimmer -->\n                            <div class=\"qr-skeleton\" id=\"qrSkeleton\"></div>\n                            <!-- QR Image -->\n                            <img id=\"qrImage\" alt=\"QR Code\" />\n                            <!-- Scan line overlay -->\n                            <div class=\"qr-scan-line\" id=\"qrScanLine\"></div>\n                        </div>\n                    </div>\n\n                    <!-- Countdown progress -->\n                    <div class=\"qr-progress-wrap\" id=\"qrProgressWrap\" style=\"display:none;\">\n                        <div class=\"qr-progress-label\">\n                            <span id=\"qrRefreshLabel\">Refreshing in</span>\n                            <span class=\"qr-countdown\" id=\"qrCountdown\">15</span>\n                        </div>\n                        <div class=\"qr-progress-bar-bg\">\n                            <div class=\"qr-progress-bar\" id=\"qrProgressBar\"></div>\n                        </div>\n                    </div>\n\n                    <p class=\"qr-status\" id=\"qrStatus\"></p>\n\n                    <button class=\"qr-retry-btn\" id=\"qrRetryBtn\" onclick=\"retryQr()\">\n                        ↺ &nbsp;<span id=\"qrRetryLabel\">Try Again</span>\n                    </button>\n\n                </div>\n            </div>\n\n        </div><!-- /tab-content-wrap -->\n    </div><!-- /container -->\n<footer class=\"footer-bar\">\n        <div class=\"footer-brand\">👑 بوت الملك فارس</div>\n        <div class=\"footer-copy\">© 2026 بوت الملك فارس · All rights reserved</div>\n    </footer>\n\n</div><!-- /mainBody -->\n\n<script>\n    /* ═══════════════════════════════════════════════\n       CONFIG\n    ═══════════════════════════════════════════════ */\n    const API = {\n        pairing : '/api/pairing',\n        qr      : '/api/qr',\n    };\n\n    const QR_INTERVAL  = 20;   // seconds between auto-refresh\n    const QR_MAX_RETRY = 4;    // max consecutive failures\n\n    /* ═══════════════════════════════════════════════\n       LANGUAGE TEXTS\n    ═══════════════════════════════════════════════ */\n    const langTexts = {\n        en: {\n            title: \"👑 بوت الملك فارس\",\n            headerSub: \"Link your WhatsApp device below\",\n            btn: \"🔗 Link Device\",\n            loginHeader: \"Connection Details\",\n            loginSub: \"Enter your WhatsApp number to receive a pairing code\",\n            numLabel: \"📞 WhatsApp Number\",\n            notice: \"After linking the device, it takes about 3 minutes for the bot to become active. Please stay tuned! ⏳✨\",\n            loading: \"⏳ Processing...\",\n            wait: \"Please wait while we connect...\",\n            invalidNum: \"Please enter a valid phone number!\",\n            fillAll: \"Please fill all required fields!\",\n            successTitle: \"🎉 Success!\",\n            successBody: \"Your Pairing Code is:\",\n            copyMsg: \"📋 Copied to your Clipboard!\",\n            failMsg: \"Connection failed. Please try again.\",\n            tabPairing: \"Pairing Code\",\n            tabQr: \"QR Code\",\n            qrHeader: \"QR Code Login\",\n            qrSub: \"Scan with WhatsApp to connect\",\n            qrPlaceholder: \"Tap to load QR\",\n            qrRefreshLabel: \"Refreshing in\",\n            qrRetryLabel: \"Try Again\",\n            qrLoading: \"Loading QR code...\",\n            qrLoaded: \"Scan this QR code with your WhatsApp\",\n            qrFailed: \"Failed to load QR. Please retry.\",\n            qrMaxRetry: \"Max retries reached. Please try again later.\",\n        },\n        si: {\n            title: \"👑 بوت الملك فارس\",\n            headerSub: \"ඔබේ WhatsApp සම්බන්ධ කරන්න\",\n            btn: \"🔗 සම්බන්ධ කරන්න\",\n            loginHeader: \"සම්බන්ධතාවය\",\n            loginSub: \"Pairing Code ලබා ගැනීමට අංකය ඇතුළත් කරන්න\",\n            numLabel: \"WhatsApp අංකය\",\n            notice: \"Bot Link Device කල පසු සක්‍රීය වීමට විනාඩි 3ක් ගතවේ. රැඳී සිටින්න! ⏳✨\",\n            loading: \"⏳ සැකසෙමින් ...\",\n            wait: \"සම්බන්ධ වන තෙක් රැඳී සිටින්න...\",\n            invalidNum: \"නිවැරදි දුරකථන අංකයක් ඇතුළත් කරන්න!\",\n            fillAll: \"සියලුම විස්තර පුරවන්න!\",\n            successTitle: \"🎉 සාර්ථකයි!\",\n            successBody: \"ඔබේ Pairing Code:\",\n            copyMsg: \"📋 Clipboard එකට පිටපත් විය!\",\n            failMsg: \"සම්බන්ධතාවය අසාර්ථකයි. නැවත උත්සාහ කරන්න.\",\n            tabPairing: \"Pairing Code\",\n            tabQr: \"QR Code\",\n            qrHeader: \"QR Code Login\",\n            qrSub: \"WhatsApp දී Scan කරන්න\",\n            qrPlaceholder: \"QR Load කරන්න\",\n            qrRefreshLabel: \"නැවත load වීමට\",\n            qrRetryLabel: \"නැවත උත්සාහ කරන්න\",\n            qrLoading: \"QR Code ලෝඩ් වෙමින්...\",\n            qrLoaded: \"WhatsApp දී මෙම QR Code Scan කරන්න\",\n            qrFailed: \"QR load අසාර්ථකයි. නැවත උත්සාහ කරන්න.\",\n            qrMaxRetry: \"උපරිම උත්සාහ ගණන ඉක්මවිය. පසුව නැවත උත්සාහ කරන්න.\",\n        },\n        ta: {\n            title: \"👑 بوت الملك فارس\",\n            headerSub: \"உங்கள் WhatsApp இணைக்கவும்\",\n            btn: \"🔗 இணைக்கவும்\",\n            loginHeader: \"இணைப்பு விவரங்கள்\",\n            loginSub: \"இணைப்பு குறியீட்டிற்கு உங்கள் எண்ணை உள்ளிடவும்\",\n            numLabel: \"வாட்ஸ்அப் எண்\",\n            notice: \"சாதனத்தை இணைத்த பிறகு, பாட் செயலில் வர சுமார் 3 நிமிடங்கள் ஆகும். காத்திருக்கவும்! ⏳✨\",\n            loading: \"⏳ செயலாக்கம்...\",\n            wait: \"காத்திருக்கவும்...\",\n            invalidNum: \"சரியான எண்ணை உள்ளிடவும்!\",\n            fillAll: \"விவரங்களை நிரப்பவும்!\",\n            successTitle: \"🎉 வெற்றி!\",\n            successBody: \"உங்கள் குறியீடு:\",\n            copyMsg: \"📋 நகலெடுக்கப்பட்டது!\",\n            failMsg: \"தோல்வி. மீண்டும் முயற்சிக்கவும்.\",\n            tabPairing: \"Pairing Code\",\n            tabQr: \"QR Code\",\n            qrHeader: \"QR Code உள்நுழைவு\",\n            qrSub: \"WhatsApp மூலம் ஸ்கேன் செய்யவும்\",\n            qrPlaceholder: \"QR ஏற்றவும்\",\n            qrRefreshLabel: \"புதுப்பிக்கிறது\",\n            qrRetryLabel: \"மீண்டும் முயற்சி\",\n            qrLoading: \"QR Code ஏற்றுகிறது...\",\n            qrLoaded: \"WhatsApp மூலம் இந்த QR ஸ்கேன் செய்யவும்\",\n            qrFailed: \"QR ஏற்றல் தோல்வி. மீண்டும் முயற்சி.\",\n            qrMaxRetry: \"அதிகபட்ச முயற்சிகள் தோல்வி.\",\n        },\n        ar: {\n            title: \"👑 بوت الملك فارس\",\n            headerSub: \"قم بربط جهاز WhatsApp الخاص بك\",\n            btn: \"🔗 ربط الجهاز\",\n            loginHeader: \"تفاصيل الاتصال\",\n            loginSub: \"أدخل رقمك لتلقي رمز الإقران\",\n            numLabel: \"رقم الواتساب\",\n            notice: \"بعد ربط الجهاز، يستغرق تفعيل البوت حوالي 3 دقائق. يرجى الانتظار! ⏳✨\",\n            loading: \"⏳ جاري المعالجة...\",\n            wait: \"يرجى الانتظار...\",\n            invalidNum: \"أدخل رقماً صحيحاً!\",\n            fillAll: \"يرجى ملء الحقول!\",\n            successTitle: \"🎉 نجاح!\",\n            successBody: \"رمز الاقتران الخاص بك:\",\n            copyMsg: \"📋 تم النسخ!\",\n            failMsg: \"فشل. حاول مرة أخرى.\",\n            tabPairing: \"رمز الإقران\",\n            tabQr: \"رمز QR\",\n            qrHeader: \"تسجيل الدخول بـ QR\",\n            qrSub: \"امسح باستخدام WhatsApp للاتصال\",\n            qrPlaceholder: \"انقر لتحميل QR\",\n            qrRefreshLabel: \"التحديث في\",\n            qrRetryLabel: \"حاول مجدداً\",\n            qrLoading: \"جاري تحميل QR...\",\n            qrLoaded: \"امسح رمز QR هذا باستخدام WhatsApp\",\n            qrFailed: \"فشل تحميل QR. حاول مجدداً.\",\n            qrMaxRetry: \"تم تجاوز الحد الأقصى للمحاولات.\",\n        }\n    };\n\n    /* ═══════════════════════════════════════════════\n       STATE\n    ═══════════════════════════════════════════════ */\n    let currentLang = 'en';\n    let currentTab  = 'pairing';\n\n    const qrState = {\n        countdownInt : null,\n        retryCount   : 0,\n        everLoaded   : false,\n        loading      : false,\n        secondsLeft  : QR_INTERVAL,\n    };\n\n    /* ═══════════════════════════════════════════════\n       INIT\n    ═══════════════════════════════════════════════ */\n    function initPage(lang) {\n        currentLang = lang;\n        document.getElementById('langOverlay').style.display = 'none';\n        const mb = document.getElementById('mainBody');\n        mb.style.display = 'flex';\n        updateTexts();\n    }\n\n    function updateTexts() {\n        const t = langTexts[currentLang];\n        document.getElementById('headerSub').innerText         = t.headerSub;\n        document.getElementById('loginHeader').innerText       = t.loginHeader;\n        document.getElementById('loginSubText').innerText      = t.loginSub;\n        document.getElementById('numLabel').innerText          = t.numLabel;\n        document.getElementById('noticeText').innerText        = t.notice;\n        document.getElementById('submitBtn').innerText         = t.btn;\n        document.getElementById('tabPairingLabel').innerText   = t.tabPairing;\n        document.getElementById('tabQrLabel').innerText        = t.tabQr;\n        document.getElementById('qrHeader').innerText          = t.qrHeader;\n        document.getElementById('qrSubText').innerText         = t.qrSub;\n        document.getElementById('qrPlaceholderText').innerText = t.qrPlaceholder;\n        document.getElementById('qrRefreshLabel').innerText    = t.qrRefreshLabel;\n        document.getElementById('qrRetryLabel').innerText      = t.qrRetryLabel;\n    }\n\n    /* ═══════════════════════════════════════════════\n       TAB SWITCHING\n    ═══════════════════════════════════════════════ */\n    function switchTab(tab) {\n        if (tab === currentTab) return;\n        currentTab = tab;\n\n        const pill         = document.getElementById('tabPill');\n        const btnPairing   = document.getElementById('tabPairing');\n        const btnQr        = document.getElementById('tabQr');\n        const panelPairing = document.getElementById('panelPairing');\n        const panelQr      = document.getElementById('panelQr');\n\n        if (tab === 'qr') {\n            // ── Move pill right ──\n            pill.classList.add('right');\n            btnPairing.classList.remove('active');\n            btnQr.classList.add('active');\n\n            // ── Show QR panel ──\n            panelPairing.classList.remove('visible');\n            panelPairing.classList.add('hidden');\n            panelQr.classList.remove('hidden');\n            panelQr.classList.add('visible');\n\n            // ── Auto-load QR immediately on tab switch ──\n            setTimeout(() => loadQr(), 150);\n\n        } else {\n            // ── Move pill left ──\n            pill.classList.remove('right');\n            btnQr.classList.remove('active');\n            btnPairing.classList.add('active');\n\n            panelQr.classList.remove('visible');\n            panelQr.classList.add('hidden');\n            panelPairing.classList.remove('hidden');\n            panelPairing.classList.add('visible');\n\n            // ── Stop countdown when leaving QR tab ──\n            clearInterval(qrState.countdownInt);\n        }\n    }\n\n    /* ═══════════════════════════════════════════════\n       QR HELPERS\n    ═══════════════════════════════════════════════ */\n    function setQrStatus(msg, color) {\n        const el = document.getElementById('qrStatus');\n        el.innerText = msg;\n        el.style.color = color || 'var(--muted)';\n    }\n\n    function showSkeleton(show) {\n        const skeleton     = document.getElementById('qrSkeleton');\n        const placeholder  = document.getElementById('qrPlaceholder');\n        skeleton.classList.toggle('active', show);\n        placeholder.style.display = show ? 'none' : 'flex';\n    }\n\n    function revealQrImage() {\n        const img      = document.getElementById('qrImage');\n        const scanLine = document.getElementById('qrScanLine');\n        const skeleton = document.getElementById('qrSkeleton');\n        const ph       = document.getElementById('qrPlaceholder');\n\n        skeleton.classList.remove('active');\n        ph.style.display = 'none';\n        img.style.display = 'block';\n\n        // Small tick so the browser paints display:block first\n        requestAnimationFrame(() => {\n            img.classList.add('loaded');\n            scanLine.classList.add('active');\n        });\n    }\n\n    function resetToPlaceholder() {\n        const img      = document.getElementById('qrImage');\n        const scanLine = document.getElementById('qrScanLine');\n        const skeleton = document.getElementById('qrSkeleton');\n        const ph       = document.getElementById('qrPlaceholder');\n\n        img.classList.remove('loaded');\n        img.style.display = 'none';\n        img.src = '';\n        scanLine.classList.remove('active');\n        skeleton.classList.remove('active');\n        ph.style.display = 'flex';\n    }\n\n    function startCountdown() {\n        const progressBar  = document.getElementById('qrProgressBar');\n        const countdownEl  = document.getElementById('qrCountdown');\n        const progressWrap = document.getElementById('qrProgressWrap');\n        const retryBtn     = document.getElementById('qrRetryBtn');\n\n        progressWrap.style.display = 'block';\n        retryBtn.classList.remove('visible');\n\n        qrState.secondsLeft = QR_INTERVAL;\n        progressBar.style.width = '100%';\n        progressBar.classList.remove('urgent');\n        countdownEl.classList.remove('urgent');\n        countdownEl.innerText = QR_INTERVAL;\n\n        clearInterval(qrState.countdownInt);\n        qrState.countdownInt = setInterval(() => {\n            qrState.secondsLeft--;\n            const pct = (qrState.secondsLeft / QR_INTERVAL) * 100;\n            progressBar.style.width = pct + '%';\n            countdownEl.innerText = qrState.secondsLeft;\n\n            if (qrState.secondsLeft <= 5) {\n                progressBar.classList.add('urgent');\n                countdownEl.classList.add('urgent');\n            }\n\n            if (qrState.secondsLeft <= 0) {\n                clearInterval(qrState.countdownInt);\n                loadQr(); // auto-refresh\n            }\n        }, 1000);\n    }\n\n    /* ═══════════════════════════════════════════════\n       LOAD QR  ← main fix here\n    ═══════════════════════════════════════════════ */\n    function loadQr() {\n        // Prevent double-load\n        if (qrState.loading) return;\n        qrState.loading = true;\n\n        const t        = langTexts[currentLang] || langTexts.en;\n        const retryBtn = document.getElementById('qrRetryBtn');\n        const img      = document.getElementById('qrImage');\n\n        clearInterval(qrState.countdownInt);\n        retryBtn.classList.remove('visible');\n        document.getElementById('qrProgressWrap').style.display = 'none';\n\n        // Reset image first\n        img.classList.remove('loaded');\n        img.style.display = 'none';\n        img.src = '';\n\n        showSkeleton(true);\n        setQrStatus(t.qrLoading);\n\n        // Bust cache with timestamp\n        const qrUrl = `${API.qr}?t=${Date.now()}`;\n\n        // ── KEY FIX: Set handlers BEFORE setting src ──\n        img.onload = () => {\n            qrState.loading    = false;\n            qrState.everLoaded = true;\n            qrState.retryCount = 0;\n            revealQrImage();\n            setQrStatus(t.qrLoaded, 'rgba(109,212,154,0.85)');\n            startCountdown();\n        };\n\n        img.onerror = () => {\n            qrState.loading = false;\n            qrState.retryCount++;\n            resetToPlaceholder();\n            document.getElementById('qrProgressWrap').style.display = 'none';\n\n            if (qrState.retryCount >= QR_MAX_RETRY) {\n                setQrStatus(t.qrMaxRetry, 'var(--rose)');\n            } else {\n                setQrStatus(t.qrFailed, 'var(--rose)');\n            }\n            retryBtn.classList.add('visible');\n        };\n\n        // Now set src → triggers load or error\n        img.src = qrUrl;\n    }\n\n    function retryQr() {\n        qrState.retryCount = 0;\n        qrState.loading    = false;\n        loadQr();\n    }\n\n    /* ═══════════════════════════════════════════════\n       POST HELPER\n    ═══════════════════════════════════════════════ */\n    async function post(endpoint, payload) {\n        const res = await fetch(endpoint, {\n            method : 'POST',\n            headers: { 'Content-Type': 'application/json' },\n            body   : JSON.stringify(payload),\n        });\n        if (!res.ok) {\n            const err = await res.json().catch(() => ({}));\n            throw new Error(err.error || `HTTP ${res.status}`);\n        }\n        return res.json();\n    }\n\n    /* ═══════════════════════════════════════════════\n       PAIRING CODE\n    ═══════════════════════════════════════════════ */\n    async function handleSubmit() {\n    const t = langTexts[currentLang];\n    // Input එකෙන් අගය ලබා ගැනීම\n    let phoneInput = document.getElementById('phoneNum').value;\n\n    // 1. හිස්තැන් (Spaces) සහ අනවශ්‍ය දේවල් අයින් කිරීම\n    let phone = phoneInput.replace(/\\s+/g, '');\n\n    // 2. '+' තිබේ නම් එය ඉවත් කිරීම\n    if (phone.startsWith('+')) {\n        phone = phone.substring(1);\n    }\n\n    // 3. අංකය '0' කින් පටන් ගනී නම් (උදා: 077...)\n    // එම 0 ඉවත් කර 94 එකතු කිරීම (ප්‍රතිඵලය: 9477...)\n    if (phone.startsWith('0')) {\n        phone = '94' + phone.substring(1);\n    }\n\n    // Validation\n    if (!phone) return Swal.fire('Error', t.fillAll, 'warning');\n    \n    // සාමාන්‍යයෙන් 94771234567 වැනි අංකයක දිග 11-12 කි.\n    if (phone.length < 10) return Swal.fire('Error', t.invalidNum, 'error');\n\n    Swal.fire({\n        title: t.loading,\n        text: t.wait,\n        allowOutsideClick: false,\n        background: 'var(--card)',\n        color: 'var(--text)',\n        didOpen: () => Swal.showLoading()\n    });\n\n    try {\n        // මෙතනදී 'phone' variable එක දැන් හරියටම 947XXXXXXXX ලෙස සකස් වී ඇත\n        const result = await post(API.pairing, { num: phone });\n        \n        if (result.success && result.code) {\n            await navigator.clipboard.writeText(result.code).catch(() => {});\n            Swal.fire({\n                title: t.successTitle,\n                html: `<div style=\"padding:10px 0;\">\n                            <p style=\"color:var(--muted);margin-bottom:6px;\">${t.successBody}</p>\n                            <b style=\"color:var(--gold-light);font-family:'Playfair Display',serif;font-size:2.4rem;letter-spacing:6px;display:block;margin:18px 0;text-shadow:0 0 20px rgba(212,160,85,0.4);\">${result.code}</b>\n                            <p style=\"font-size:0.83rem;color:#6dd49a;\">${t.copyMsg}</p>\n                        </div>`,\n                icon: 'success'\n            });\n        } else {\n            throw new Error(result.error || t.failMsg);\n        }\n    } catch (err) {\n        Swal.fire('Failed', err.message || t.failMsg, 'error');\n    }\n}\n</script>\n\n\n</body>\n</html>\n\n\n";
}

function buildLandingSectionHTML(sectionId = '') {
    const safeId = JSON.stringify(String(sectionId || ''));
    return buildLandingPageHTML().replace('</body>', `<script>window.__OPEN_SECTION__=${safeId};window.addEventListener('DOMContentLoaded',()=>{const target=window.__OPEN_SECTION__;if(target){setTimeout(()=>{document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'});},120);}});</script></body>`);
}

function buildPairPageHTML() {
    return buildLandingPageHTML();
}

app.get('/publish-now', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildLandingSectionHTML('publishBlock'));
});

app.get('/auto-save', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildLandingSectionHTML('autoSaveSection'));
});


app.get('/pair', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildLandingPageHTML());
});

app.post('/api/pair', async (req, res) => {
    try {
        const phone = normalizePhone(req.body?.phone || req.body?.num || '');
        if (!phone) return res.status(400).json({ success: false, error: 'رقم غير صالح' });
        if (pairingRequests.has(phone)) return res.status(409).json({ success: false, error: 'يوجد كود ربط جاري لهذا الرقم، انتظر قليلاً' });
        const sock = await startWhatsApp(phone, null, null);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (!sock || !sock.requestPairingCode) throw new Error('تعذر إنشاء جلسة الربط');
        const code = await sock.requestPairingCode(phone);
        schedulePairingTimeout(phone, null, getSessionPath(phone), sock);
        return res.json({ success: true, phone, code });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'فشل إنشاء كود الربط' });
    }
});


app.get('/api/pairing', (req, res) => {
    try {
        const phone = normalizePhone(req.query?.num || req.query?.phone || '');
        return res.json({
            success: true,
            ...buildPairingApiDescriptor(phone)
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Pairing info failed' });
    }
});

app.post('/api/pairing', async (req, res) => {
    try {
        const phone = normalizePhone(req.body?.num || req.body?.phone || '');
        if (!phone) return res.status(400).json({ success: false, error: 'رقم غير صالح' });
        if (pairingRequests.has(phone)) return res.status(409).json({ success: false, error: 'يوجد كود ربط جاري لهذا الرقم، انتظر قليلاً' });
        const sock = await startWhatsApp(phone, null, null);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (!sock || !sock.requestPairingCode) throw new Error('تعذر إنشاء جلسة الربط');
        const code = await sock.requestPairingCode(phone);
        schedulePairingTimeout(phone, null, getSessionPath(phone), sock);
        return res.json({ success: true, phone, num: phone, code });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'فشل إنشاء كود الربط' });
    }
});

const WEB_QR_SESSION_DIR = path.join(SESSIONS_DIR, '__web_qr__');
let webQrSession = {
    sock: null,
    qrText: '',
    updatedAt: 0,
    connected: false,
    booting: null
};

async function cleanupWebQrSession(removeFiles = false) {
    const sock = webQrSession.sock;
    webQrSession.sock = null;
    webQrSession.qrText = '';
    webQrSession.updatedAt = 0;
    webQrSession.connected = false;
    webQrSession.booting = null;
    if (sock) {
        try { sock.ws?.close?.(); } catch (_) {}
        try { sock.end?.(); } catch (_) {}
        try { await sock.logout?.(); } catch (_) {}
    }
    if (removeFiles) {
        try { fs.rmSync(WEB_QR_SESSION_DIR, { recursive: true, force: true }); } catch (_) {}
    }
}

function buildQrImageUrl(qrText) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(qrText)}`;
}

async function ensureWebQrSession(forceNew = false) {
    if (forceNew || webQrSession.connected || (webQrSession.updatedAt && Date.now() - webQrSession.updatedAt > 19000)) {
        await cleanupWebQrSession(true);
    }
    if (webQrSession.qrText && webQrSession.sock) {
        return webQrSession;
    }
    if (webQrSession.booting) {
        return webQrSession.booting;
    }

    webQrSession.booting = new Promise(async (resolve) => {
        try {
            ensureDir(WEB_QR_SESSION_DIR);
            const { state, saveCreds } = await useMultiFileAuthState(WEB_QR_SESSION_DIR);
            const { version } = await fetchLatestBaileysVersion();
            const sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                connectTimeoutMs: 90000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 15000,
                markOnlineOnConnect: false
            });
            webQrSession.sock = sock;

            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve(webQrSession);
            };
            const timer = setTimeout(finish, 15000);
            if (typeof timer.unref === 'function') timer.unref();

            sock.ev.on('creds.update', async () => {
                try { await saveCreds(); } catch (_) {}
            });
            sock.ev.on('connection.update', async (update) => {
                if (update?.qr) {
                    webQrSession.qrText = update.qr;
                    webQrSession.updatedAt = Date.now();
                    webQrSession.connected = false;
                    finish();
                }
                if (update?.connection === 'open') {
                    webQrSession.connected = true;
                    finish();
                }
                if (update?.connection === 'close') {
                    const statusCode = update?.lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        await cleanupWebQrSession(true);
                    }
                    finish();
                }
            });
        } catch (_) {
            resolve(webQrSession);
        }
    }).finally(() => {
        webQrSession.booting = null;
    });

    return webQrSession.booting;
}

app.get('/api/qr', async (req, res) => {
    try {
        const refresh = ['1', 'true', 'yes'].includes(String(req.query?.refresh || '').toLowerCase());
        const session = await ensureWebQrSession(refresh);
        if (!session?.qrText) {
            return res.status(503).send('QR not ready');
        }
        return res.redirect(buildQrImageUrl(session.qrText));
    } catch (error) {
        return res.status(500).send(error.message || 'QR failed');
    }
});


app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildLandingPageHTML());
});

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        sessions: getAllLinkedPhones().length,
        users: getAllUserIds().length,
        uptime: process.uptime(),
        mode: !TELEGRAM_ENABLED ? 'disabled' : USE_TELEGRAM_WEBHOOK ? 'webhook' : 'polling',
        baseUrl: PUBLIC_BASE_URL,
        webhookPath: TELEGRAM_ENABLED && USE_TELEGRAM_WEBHOOK ? TELEGRAM_WEBHOOK_PATH : null
    });
});

function isTelegramConflictError(error) {
    const message = String(error?.description || error?.message || '').toLowerCase();
    const errorCode = Number(error?.code || error?.response?.error_code || 0);
    return (
        errorCode === 409 ||
        message.includes('409') ||
        message.includes('conflict') ||
        message.includes('terminated by other getupdates request')
    );
}

async function initTelegramTransport() {
    if (!TELEGRAM_ENABLED) {
        return { enabled: false, mode: 'disabled' };
    }

    bot.botInfo = await bot.telegram.getMe();

    if (USE_TELEGRAM_WEBHOOK) {
        try {
            await bot.telegram.deleteWebhook({ drop_pending_updates: false });
        } catch (error) {
            console.error('Webhook Reset Warning:', error.message);
        }
        await bot.telegram.setWebhook(getTelegramWebhookUrl());
        console.log(`Telegram webhook connected: ${getTelegramWebhookUrl()}`);
        return { enabled: true, mode: 'webhook' };
    }

    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    } catch (error) {
        console.error('Webhook Delete Warning:', error.message);
    }

    try {
        await bot.launch({ dropPendingUpdates: false });
        console.log('Telegram polling started successfully');
        return { enabled: true, mode: 'polling' };
    } catch (error) {
        if (IS_RENDER_ENV && isTelegramConflictError(error)) {
            console.warn('Telegram polling conflict detected on Render. Switching to webhook mode automatically.');
            await bot.telegram.setWebhook(getTelegramWebhookUrl());
            console.log(`Telegram webhook connected (fallback): ${getTelegramWebhookUrl()}`);
            return { enabled: true, mode: 'webhook-fallback' };
        }
        throw error;
    }
}

const server = app.listen(APP_PORT, async () => {
    console.log(`Server running on port ${APP_PORT}`);
    markAnalyticsBoot();

    let telegramStatus = { enabled: false, mode: 'disabled' };
    try {
        telegramStatus = await initTelegramTransport();
    } catch (error) {
        console.error('Telegram Startup Warning:', error);
    }

    try {
        startSessionSupervisor();
        await startAllSavedSessions();
    } catch (error) {
        console.error('WhatsApp Session Bootstrap Warning:', error);
    }

    console.log(`Service linked successfully to ${PUBLIC_BASE_URL}`);
    console.log(`Storage root: ${STORAGE_ROOT}`);
    console.log(`Telegram transport mode: ${telegramStatus.mode}`);
});

let shuttingDown = false;

async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully...`);

    for (const timer of reconnectTimers.values()) {
        clearTimeout(timer);
    }
    reconnectTimers.clear();

    for (const phone of channelPromotionTimers.keys()) {
        clearChannelPromotionTimer(phone);
    }

    for (const pending of pairingRequests.values()) {
        if (pending?.timer) {
            clearTimeout(pending.timer);
        }
    }
    pairingRequests.clear();

    try {
        if (TELEGRAM_ENABLED && !USE_TELEGRAM_WEBHOOK) {
            bot.stop(signal);
        }
    } catch (error) {
        console.error('Telegram Stop Warning:', error.message);
    }

    try {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) return reject(error);
                resolve();
            });
        });
    } catch (error) {
        console.error('Server Close Warning:', error.message);
    }

    flushAnalyticsDB();
    process.exit(0);
}

process.once('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

process.once('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});


process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
