import re
from pathlib import Path

repo = Path('/home/user/whatsapp-pairing-api')
bot_core = repo / 'bot_core.py'
text = bot_core.read_text(encoding='utf-8')

new_embedded_server = r'''EMBEDDED_SERVER_JS = r''' + "'''" + r'''const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ROOT_INDEX_FILE = path.join(ROOT_DIR, 'index.js');

if (!fs.existsSync(ROOT_INDEX_FILE)) {
  throw new Error(`Root index.js was not found at ${ROOT_INDEX_FILE}`);
}

const companionPort = String(process.env.COMPANION_PORT || process.env.PAIRING_SERVER_PORT || process.env.PORT || '3100').trim() || '3100';
process.chdir(ROOT_DIR);
process.env.PORT = companionPort;
process.env.PAIRING_SERVER_PORT = companionPort;
process.env.COMPANION_PORT = companionPort;
process.env.BOT_TOKEN = '';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_ENABLED = 'false';
process.env.DISABLE_TELEGRAM = 'true';
process.env.IS_EMBEDDED_COMPANION = 'true';

require(ROOT_INDEX_FILE);
'''" + "'''"

pattern = re.compile(r"EMBEDDED_SERVER_JS = r'''[\s\S]*?'''\n\n(?=EMBEDDED_[A-Z0-9_]+\s*=)")
new_text, count = pattern.subn(new_embedded_server + "\n\n", text, count=1)
if count != 1:
    raise SystemExit(f'Failed to replace EMBEDDED_SERVER_JS block: {count}')

bot_core.write_text(new_text, encoding='utf-8')

settings_js = repo / 'commands' / 'settings.js'
settings_js.write_text("""const fs = require('fs');
const path = require('path');

function readJsonSafe(filePath, fallback) {
    try {
        const txt = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(txt);
    } catch (_) {
        return fallback;
    }
}

function normalizePhone(value = '') {
    return String(value || '').replace(/\\D/g, '');
}

function getSessionProfileDir(phone = '') {
    const normalizedPhone = normalizePhone(phone);
    return normalizedPhone ? path.join(process.cwd(), 'sessions', normalizedPhone, 'profile') : '';
}

function getCredentialsFile(phone = '') {
    const profileDir = getSessionProfileDir(phone);
    return profileDir ? path.join(profileDir, 'phone-settings-credentials.json') : '';
}

function collectPasswords(node, bucket = [], appId = '') {
    if (!node) return bucket;
    if (Array.isArray(node)) {
        for (const item of node) collectPasswords(item, bucket, appId);
        return bucket;
    }
    if (typeof node !== 'object') return bucket;

    for (const [key, value] of Object.entries(node)) {
        const normalizedKey = String(key || '').toLowerCase();
        if (value && typeof value === 'object') {
            if (typeof value.password === 'string' && value.password.trim()) {
                bucket.push({
                    appId: String(value.appId || key || appId || 'default').trim() || 'default',
                    password: String(value.password).trim()
                });
            }
            collectPasswords(value, bucket, key || appId);
            continue;
        }
        if (['password', 'pass', 'pwd', 'site_password', 'settings_password'].includes(normalizedKey) && String(value || '').trim()) {
            bucket.push({
                appId: String(appId || 'default').trim() || 'default',
                password: String(value).trim()
            });
        }
    }
    return bucket;
}

function getPhoneSettingsAccess(phone = '') {
    const credentialsFile = getCredentialsFile(phone);
    if (!credentialsFile || !fs.existsSync(credentialsFile)) {
        return { password: '', appId: '', source: '' };
    }

    const parsed = readJsonSafe(credentialsFile, {});
    const found = collectPasswords(parsed, []);
    const unique = found.filter((entry, index, arr) => {
        const signature = `${entry.appId}::${entry.password}`;
        return arr.findIndex((item) => `${item.appId}::${item.password}` === signature) === index;
    });
    const preferred = unique[0] || { password: '', appId: '' };
    return {
        password: String(preferred.password || '').trim(),
        appId: String(preferred.appId || '').trim() || 'default',
        source: credentialsFile
    };
}

const isOwnerOrSudo = require('../lib/isOwner');

async function settingsCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { text: 'Only bot owner can use this command!' }, { quoted: message });
            return;
        }

        const isGroup = chatId.endsWith('@g.us');
        const dataDir = './data';

        const mode = readJsonSafe(`${dataDir}/messageCount.json`, { isPublic: true });
        const autoStatus = readJsonSafe(`${dataDir}/autoStatus.json`, { enabled: false });
        const autoread = readJsonSafe(`${dataDir}/autoread.json`, { enabled: false });
        const autotyping = readJsonSafe(`${dataDir}/autotyping.json`, { enabled: false });
        const pmblocker = readJsonSafe(`${dataDir}/pmblocker.json`, { enabled: false });
        const anticall = readJsonSafe(`${dataDir}/anticall.json`, { enabled: false });
        const userGroupData = readJsonSafe(`${dataDir}/userGroupData.json`, {
            antilink: {}, antibadword: {}, welcome: {}, goodbye: {}, chatbot: {}, antitag: {}
        });
        const autoReaction = Boolean(userGroupData.autoReaction);

        const currentPhone = normalizePhone(sock?.user?.id || sock?.authState?.creds?.me?.id || senderId || '');
        const access = getPhoneSettingsAccess(currentPhone);

        const groupId = isGroup ? chatId : null;
        const antilinkOn = groupId ? Boolean(userGroupData.antilink && userGroupData.antilink[groupId]) : false;
        const antibadwordOn = groupId ? Boolean(userGroupData.antibadword && userGroupData.antibadword[groupId]) : false;
        const welcomeOn = groupId ? Boolean(userGroupData.welcome && userGroupData.welcome[groupId]) : false;
        const goodbyeOn = groupId ? Boolean(userGroupData.goodbye && userGroupData.goodbye[groupId]) : false;
        const chatbotOn = groupId ? Boolean(userGroupData.chatbot && userGroupData.chatbot[groupId]) : false;
        const antitagCfg = groupId ? (userGroupData.antitag && userGroupData.antitag[groupId]) : null;

        const lines = [];
        lines.push('*BOT SETTINGS*');
        lines.push('');
        if (currentPhone) lines.push(`• Linked Number: ${currentPhone}`);
        lines.push(`• Mode: ${mode.isPublic ? 'Public' : 'Private'}`);
        lines.push(`• Auto Status: ${autoStatus.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Autoread: ${autoread.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Autotyping: ${autotyping.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• PM Blocker: ${pmblocker.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Anticall: ${anticall.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Auto Reaction: ${autoReaction ? 'ON' : 'OFF'}`);

        if (access.password) {
            lines.push('');
            lines.push('*PHONE SETTINGS ACCESS*');
            lines.push(`• App ID: ${access.appId || 'default'}`);
            lines.push(`• Password: ${access.password}`);
            lines.push(`• كلمة السر: ${access.password}`);
        }

        if (groupId) {
            lines.push('');
            lines.push(`Group: ${groupId}`);
            if (antilinkOn) {
                const al = userGroupData.antilink[groupId];
                lines.push(`• Antilink: ON (action: ${al.action || 'delete'})`);
            } else {
                lines.push('• Antilink: OFF');
            }
            if (antibadwordOn) {
                const ab = userGroupData.antibadword[groupId];
                lines.push(`• Antibadword: ON (action: ${ab.action || 'delete'})`);
            } else {
                lines.push('• Antibadword: OFF');
            }
            lines.push(`• Welcome: ${welcomeOn ? 'ON' : 'OFF'}`);
            lines.push(`• Goodbye: ${goodbyeOn ? 'ON' : 'OFF'}`);
            lines.push(`• Chatbot: ${chatbotOn ? 'ON' : 'OFF'}`);
            if (antitagCfg && antitagCfg.enabled) {
                lines.push(`• Antitag: ON (action: ${antitagCfg.action || 'delete'})`);
            } else {
                lines.push('• Antitag: OFF');
            }
        } else {
            lines.push('');
            lines.push('Note: Per-group settings will be shown when used inside a group.');
        }

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
    } catch (error) {
        console.error('Error in settings command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to read settings.' }, { quoted: message });
    }
}

module.exports = settingsCommand;
""", encoding='utf-8')

print('Patched bot_core.py and commands/settings.js')
