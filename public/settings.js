/* Settings dashboard — talks to /minibot/api/login + /minibot/api/settings/{load,save} */
const SETTINGS_API = {
  login: '/minibot/api/login',
  load: '/minibot/api/settings/load',
  save: '/minibot/api/settings/save'
};

const FIELDS = {
  // PROFILE
  name: 'Bot Name', from: 'Country / Region', age: 'Bot Age', prefix: 'Command Prefix',
  footer2: 'Footer', mode: 'Bot Mode', ownername: 'Owner Name', ownerNumber: 'Owner Number',
  description: 'Description', language: 'Language', aliveMsg: 'Alive Message',
  // AUTOMATION (boolean toggles)
  autoRead: 'Auto Read Messages', alwaysOnline: 'Always Online', autoTyping: 'Auto Typing',
  autoRecording: 'Auto Recording', ghostMode: 'Ghost Mode', autoSave: 'Auto Save Contacts/Messages',
  keepDeletedStatus: 'Keep Deleted Status', antiViewOnce: 'Anti View Once Bypass',
  autoReactScope: 'Auto React Scope — All chats', aiReplyScope: 'AI Reply Scope — All chats',
  // STATUS
  autoStatusRead: 'Auto-Read Statuses', autoStatusReact: 'Auto-React Statuses',
  autoPrivateReact: 'React to Private Statuses', statusReactionNotice: 'Reaction Notice',
  status_reaction: 'Auto-react Messages',
  current_emoji: 'Current Reaction Emoji', emojiMap: 'Per-Contact Emoji Map',
  // ANTI
  antiLink: 'Anti-Link', antiBadWord: 'Anti-Bad Words', antiBug: 'Anti-Bug',
  antiBot: 'Anti-Bot', antiMention: 'Anti-Mention', antiEdit: 'Anti-Edit',
  antiAction: 'Anti-Action', antiWarnCount: 'Warn Count Before Action',
  antiLinkList: 'Banned Links', antiBadWords: 'Banned Words',
  // AUTO REPLY
  customAutoReplies: 'Auto Reply List', auto_reply_enabled: 'AI Auto Reply Enabled',
  // IMAGES
  menu: 'Menu Image', alive: 'Alive Image', owner: 'Owner Image',
  statusCustomReact: 'Status Custom Emojis',
  // GROUP SCHEDULE
  gaGroupJid: 'Group JID', gaTimezone: 'Timezone', gaCloseTime: 'Close Time', gaOpenTime: 'Open Time',
  // API SYNC
  pair_code_api_url: 'Pair Code API URL', pair_code_api_method: 'Pair Code API Method',
  pair_code_api_token: 'Pair Code API Token', pair_code_api_number_field: 'Pair Code API Number Field',
  linked_number_sync_url: 'Linked Number Sync URL', linked_number_sync_method: 'Linked Number Sync Method',
  linked_number_sync_token: 'Sync Token', linked_number_sync_number_field: 'Sync Number Field'
};

function el(id) { return document.getElementById(id); }
function $(sel, root) { return (root || document).querySelector(sel); }

function setToast(msg, isErr = false) {
  const t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle('toast-err', isErr);
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}

function activeSection() {
  return document.querySelector('.nav-tab.active')?.dataset.section || 'secProfile';
}

function loadIntoForm(settings) {
  const all = (settings && typeof settings === 'object') ? settings : {};
  document.querySelectorAll('[data-key]').forEach(node => {
    const key = node.dataset.key;
    const type = node.dataset.type || (node.tagName === 'SELECT' ? 'select' : (node.type === 'checkbox' ? 'toggle' : 'text'));
    let val = all[key];
    if (typeof val === 'undefined' || val === null) val = node.tagName === 'INPUT' && node.type === 'checkbox' ? false : '';
    if (type === 'toggle') {
      node.checked = (val === true || val === 'on' || val === 'true' || val === 1);
    } else if (type === 'select') {
      node.value = String(val || node.value);
    } else if (key === 'emojiMap' && typeof val === 'object' && val) {
      node.value = Object.entries(val).map(([k, v]) => k + ':' + v).join(', ');
    } else if (key === 'customAutoReplies') {
      if (Array.isArray(val)) {
        node.value = val.map(p => `${p.keyword || p.trigger || ''} => ${p.reply || p.response || ''}`).join('\n');
      } else {
        node.value = String(val || '');
      }
    } else {
      node.value = String(val);
    }
  });
}

function readForm() {
  const out = {};
  document.querySelectorAll('[data-key]').forEach(node => {
    const key = node.dataset.key;
    const type = node.dataset.type || (node.tagName === 'SELECT' ? 'select' : (node.type === 'checkbox' ? 'toggle' : 'text'));
    let val;
    if (type === 'toggle') val = node.checked;
    else val = node.value;
    if (key === 'emojiMap' && typeof val === 'string' && val.trim()) {
      const map = {};
      val.split(/[,\n]/).forEach(p => {
        const [k, v] = p.split(':').map(s => s.trim());
        if (k && v) map[k.replace(/\D/g, '')] = v;
      });
      out[key] = map;
    } else if (key === 'customAutoReplies' && typeof val === 'string') {
      out[key] = val;
    } else {
      out[key] = val;
    }
  });
  return out;
}

function switchTab(sectionId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.section === sectionId));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === sectionId));
}

document.querySelectorAll('.nav-tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.section));
});

async function login() {
  const phone = el('phoneInput').value.trim().replace(/[^0-9]/g, '').replace(/^0+/, '');
  const password = el('passwordInput').value.trim();
  if (!phone || phone.length < 8) { setToast('أدخل الرقم بشكل صحيح.', true); return; }
  if (!password) { setToast('أدخل كلمة المرور.', true); return; }
  const btn = el('accessBtn'); btn.disabled = true; btn.textContent = '⏳ جاري التحقق...';
  try {
    const res = await fetch(SETTINGS_API.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password, app: 'default' })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setToast(data.error || 'فشل الدخول. تحقق من الرقم وكلمة المرور.', true);
      return;
    }
    localStorage.setItem('wa_session', JSON.stringify({ phone, password, app: 'default' }));
    await hydrate();
  } catch (err) {
    setToast('فشل الاتصال بالخادم.', true);
  } finally {
    btn.disabled = false; btn.textContent = '🤖 Access Bot Settings';
  }
}

async function hydrate() {
  const stored = JSON.parse(localStorage.getItem('wa_session') || 'null');
  if (!stored) return;
  el('loginScreen').style.display = 'none';
  el('dashScreen').style.display = 'block';
  el('linkLogout').style.display = 'inline-flex';
  el('dashboardPhone').textContent = stored.phone;
  await loadSettings(stored);
}

async function loadSettings(stored) {
  try {
    const res = await fetch(`${SETTINGS_API.load}?phone=${encodeURIComponent(stored.phone)}&app=${encodeURIComponent(stored.app || 'default')}`);
    const data = await res.json();
    if (res.ok && data.success) {
      loadIntoForm(data.settings || {});
      setToast(`✓ Loaded settings for ${stored.phone}`);
    } else {
      setToast(data.error || 'تعذر تحميل الإعدادات.', true);
    }
  } catch (err) {
    setToast('فشل تحميل الإعدادات.', true);
  }
}

async function saveAll() {
  const stored = JSON.parse(localStorage.getItem('wa_session') || 'null');
  if (!stored) { setToast('انتهت الجلسة، ارجع لشاشة الدخول.', true); return; }
  const payload = readForm();
  try {
    const res = await fetch(SETTINGS_API.save, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: stored.phone, app: stored.app || 'default', settings: payload })
    });
    const data = await res.json();
    if (res.ok && data.success) { setToast('✓ تم حفظ الإعدادات بنجاح.'); }
    else { setToast(data.error || 'فشل الحفظ.', true); }
  } catch (err) { setToast('فشل الاتصال بالخادم.', true); }
}

function logout() {
  localStorage.removeItem('wa_session');
  el('loginScreen').style.display = 'flex';
  el('dashScreen').style.display = 'none';
  el('linkLogout').style.display = 'none';
  el('passwordInput').value = '';
}

window.addEventListener('DOMContentLoaded', () => {
  hydrate().catch(() => {});
});
