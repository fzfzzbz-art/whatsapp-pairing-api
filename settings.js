"use strict";

const DEFAULT_LINKED_WELCOME_MESSAGE = [
    '🔐 بيانات دخول لوحة إعدادات الرقم',
    '',
    '📱 الرقم: {phone}',
    '🗝️ كلمة السر: {password}',
    '',
    'هذه الكلمة خاصة بهذا الرقم فقط.'
].join('\n');

function buildPhoneSettingsAccessMessage({ phone = '', password = '' } = {}) {
    const cleanPhone = String(phone || '').trim();
    const cleanPassword = String(password || '').trim();
    return [
        '🔐 بيانات دخول لوحة إعدادات الرقم',
        '',
        `📱 الرقم: ${cleanPhone}`,
        `🗝️ كلمة السر: ${cleanPassword}`,
        '',
        'هذه الكلمة خاصة بهذا الرقم فقط.'
    ].join('\n');
}

module.exports = {
    DEFAULT_LINKED_WELCOME_MESSAGE,
    buildPhoneSettingsAccessMessage
};
