const { AsyncLocalStorage } = require('async_hooks');

const legacySettingsContext = new AsyncLocalStorage();

const settings = {
  packname: 'Knight Bot',
  author: '‎',
  botName: 'Knight Bot',
  botOwner: 'Professor', // غيّر الاسم كما تريد
  ownerNumber: '919876543210', // غيّر الرقم بدون + وبدون مسافات
  giphyApiKey: 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq',
  commandMode: 'public',
  maxStoreMessages: 10,
  storeWriteInterval: 10000,
  description: 'بوت واتساب لإدارة المجموعات والتحميل من السوشل ميديا والذكاء الاصطناعي.',
  version: '3.0.8',
  repoUrl: 'https://t.me/Faresw_bot',
  channelLink: 'https://whatsapp.com/channel/0029Vb8jjfWCRs1sVz0x1w3v',
  updateZipUrl: 'https://github.com/faresjahsh/Knightbot-MD/archive/refs/heads/main.zip',
};

let ownerNumberValue = String(settings.ownerNumber || '');
let botOwnerValue = String(settings.botOwner || '');

Object.defineProperty(settings, 'ownerNumber', {
  enumerable: true,
  configurable: true,
  get() {
    const context = legacySettingsContext.getStore();
    return String(context?.ownerNumber || ownerNumberValue || '');
  },
  set(value) {
    ownerNumberValue = String(value || '');
  }
});

Object.defineProperty(settings, 'botOwner', {
  enumerable: true,
  configurable: true,
  get() {
    const context = legacySettingsContext.getStore();
    return String(context?.botOwner || botOwnerValue || '');
  },
  set(value) {
    botOwnerValue = String(value || '');
  }
});

Object.defineProperty(settings, '__runWithContext', {
  enumerable: false,
  configurable: false,
  writable: false,
  value(context = {}, task = async () => undefined) {
    return legacySettingsContext.run({
      ownerNumber: context?.ownerNumber ? String(context.ownerNumber) : ownerNumberValue,
      botOwner: context?.botOwner ? String(context.botOwner) : botOwnerValue
    }, task);
  }
});

module.exports = settings;
