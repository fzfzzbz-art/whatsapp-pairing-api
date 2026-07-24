const SettingsApp = (() => {
  const state = {
    phone: '',
    app: 'default',
    authenticated: false,
    settings: {},
    lastServerSnapshot: {},
    fieldLabels: {},
    sections: [],
    selectOptions: {},
    toggleFields: new Set(),
    site: { baseUrl: '', settingsPage: '/settings', pairingPage: '/pair' },
    dirty: false,
    pollingTimer: null,
  };

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));
  const fields = () => qsa('[data-key]');
  const uploaders = () => qsa('[data-upload-key]');
  const LONG_TEXT_FIELDS = new Set(['description', 'customMsg', 'antiLinkList', 'antiBadWords', 'aliveMsg', 'voiceFooter', 'excludeCallNumbers', 'customAutoReplies', 'gaGroupJid']);
  const IMAGE_FIELDS = new Set(['menu', 'alive', 'owner']);

  function normalizePhone(value) {
    return String(value || '').replace(/[^\d+]/g, '').trim();
  }

  function showToast(message, type = 'info') {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.className = `toast show ${type}`;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => {
      node.className = 'toast';
    }, 3500);
  }

  function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  function setLoginStatus(text, isError = false) {
    const node = document.getElementById('loginStatus');
    if (!node) return;
    node.textContent = text;
    node.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  }

  function setSaveStatus(text, isError = false) {
    const node = document.getElementById('saveStatus');
    if (!node) return;
    node.textContent = text;
    node.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  }

  function isToggleField(key) {
    return state.toggleFields.has(key);
  }

  function getFieldLabel(key) {
    return state.fieldLabels[key] || key;
  }

  function getFieldType(key) {
    if (IMAGE_FIELDS.has(key)) return 'image';
    if (isToggleField(key)) return 'toggle';
    if (state.selectOptions[key]) return 'select';
    if (LONG_TEXT_FIELDS.has(key)) return 'textarea';
    if (key === 'gaOpenTime' || key === 'gaCloseTime') return 'time';
    if (key === 'age' || key === 'antiWarnCount') return 'number';
    return 'text';
  }

  function currentPayload() {
    const payload = {};
    for (const field of fields()) {
      payload[field.dataset.key] = field.value;
    }
    return payload;
  }

  function setDirty(flag) {
    state.dirty = !!flag;
    const pill = document.getElementById('dirtyPill');
    if (!pill) return;
    pill.className = `pill ${state.dirty ? 'warn' : 'ok'}`;
    pill.textContent = state.dirty ? 'هناك تغييرات غير محفوظة' : 'جميع التغييرات محفوظة';
  }

  function syncDuplicateKeyFields(key, value, source) {
    for (const field of fields()) {
      if (field === source) continue;
      if (field.dataset.key === key) field.value = value;
    }
  }

  function buildFieldHTML(key) {
    const label = getFieldLabel(key);
    const type = getFieldType(key);
    const full = (type === 'textarea' || type === 'image') ? ' full' : '';

    if (type === 'image') {
      return `
        <div class="field full" data-field-wrapper="${key}">
          <label>${label}</label>
          <div class="upload-box">
            <img id="preview-${key}" class="img-preview" alt="${label}" />
            <input class="field-input" data-key="${key}" type="text" placeholder="رابط الصورة" />
            <input data-upload-key="${key}" type="file" accept="image/*" />
          </div>
        </div>`;
    }

    if (type === 'toggle') {
      return `
        <div class="field${full}">
          <label>${label}</label>
          <div class="toggle-wrap">
            <select class="field-input" data-key="${key}">
              <option value="on">تشغيل</option>
              <option value="off">إيقاف</option>
            </select>
            <span id="badge-${key}" class="toggle-badge toggle-off">OFF</span>
          </div>
        </div>`;
    }

    if (type === 'select') {
      const options = (state.selectOptions[key] || []).map((opt) => `<option value="${String(opt.value).replace(/"/g, '&quot;')}">${opt.label}</option>`).join('');
      return `
        <div class="field${full}">
          <label>${label}</label>
          <select class="field-input" data-key="${key}">${options}</select>
        </div>`;
    }

    if (type === 'textarea') {
      return `
        <div class="field${full}">
          <label>${label}</label>
          <textarea class="field-input" data-key="${key}" placeholder="${label}"></textarea>
        </div>`;
    }

    const inputType = type === 'number' ? 'number' : (type === 'time' ? 'time' : 'text');
    return `
      <div class="field${full}">
        <label>${label}</label>
        <input class="field-input" data-key="${key}" type="${inputType}" placeholder="${label}" />
      </div>`;
  }

  function renderSections() {
    const container = document.getElementById('sectionsContainer');
    if (!container) return;
    container.innerHTML = state.sections.map((section, index) => `
      <section class="section-card">
        <div class="section-head">
          <div>
            <h3>${section.label || section.key}</h3>
            <small>${section.key}</small>
          </div>
          <span class="pill ${index % 2 === 0 ? 'ok' : 'warn'}">${(section.fields || []).length} إعداد</span>
        </div>
        <div class="fields-grid">
          ${(section.fields || []).map((key) => buildFieldHTML(key)).join('')}
        </div>
      </section>
    `).join('');

    bindFieldTracking();
    bindUploaders();
  }

  function updateToggleBadge(key, value) {
    const badge = document.getElementById(`badge-${key}`);
    if (!badge) return;
    const isOn = String(value) === 'on';
    badge.className = `toggle-badge ${isOn ? 'toggle-on' : 'toggle-off'}`;
    badge.textContent = isOn ? 'ON' : 'OFF';
  }

  function applySettings(settings = {}, force = false) {
    if (state.dirty && !force) return;
    state.settings = { ...(settings || {}) };
    state.lastServerSnapshot = { ...(settings || {}) };
    for (const field of fields()) {
      const key = field.dataset.key;
      field.value = settings[key] ?? '';
      if (IMAGE_FIELDS.has(key)) {
        const img = document.getElementById(`preview-${key}`);
        if (img) img.src = settings[key] || '';
      }
      if (isToggleField(key)) updateToggleBadge(key, field.value);
    }
    setDirty(false);
  }

  function bindFieldTracking() {
    for (const field of fields()) {
      const updateDirtyState = () => {
        syncDuplicateKeyFields(field.dataset.key, field.value, field);
        if (IMAGE_FIELDS.has(field.dataset.key)) {
          const img = document.getElementById(`preview-${field.dataset.key}`);
          if (img) img.src = field.value || '';
        }
        if (isToggleField(field.dataset.key)) updateToggleBadge(field.dataset.key, field.value);
        const dirty = JSON.stringify(currentPayload()) !== JSON.stringify(state.lastServerSnapshot);
        setDirty(dirty);
      };
      field.addEventListener('input', updateDirtyState);
      field.addEventListener('change', updateDirtyState);
    }
  }

  async function uploadImage(fieldKey, file) {
    if (!state.phone || !file) return;
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch('/api/image/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ num: state.phone, fieldKey, image: base64 })
    });
    const data = await res.json();
    if (!res.ok || !data?.success) throw new Error(data?.error || 'فشل رفع الصورة');
    const target = qs(`[data-key="${fieldKey}"]`);
    if (target) {
      target.value = data.url || '';
      const img = document.getElementById(`preview-${fieldKey}`);
      if (img) img.src = data.url || '';
      setDirty(JSON.stringify(currentPayload()) !== JSON.stringify(state.lastServerSnapshot));
    }
    showToast(`تم رفع ${getFieldLabel(fieldKey)} بنجاح`, 'success');
  }

  function bindUploaders() {
    for (const input of uploaders()) {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          showToast('جارٍ رفع الصورة...', 'info');
          await uploadImage(input.dataset.uploadKey, file);
        } catch (error) {
          showToast(error.message || 'تعذر رفع الصورة', 'error');
        } finally {
          input.value = '';
        }
      });
    }
  }

  async function login() {
    const num = normalizePhone(qs('#loginNumber')?.value || '');
    const pass = String(qs('#loginPassword')?.value || '').trim();
    if (!num || !pass) {
      setLoginStatus('أدخل الرقم وكلمة المرور أولاً.', true);
      return;
    }
    const btn = qs('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'جارٍ التحقق...';
    setLoginStatus('يتم التحقق من بيانات الدخول...');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num, pass })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || data?.message || 'فشل تسجيل الدخول');
      state.phone = String(data.number || num);
      state.app = String(data.app || 'default');
      state.authenticated = true;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      setText('appPill', `APP: ${state.app}`);
      await refreshDashboard(true);
      startPolling();
      setSaveStatus('تم تحميل إعدادات الرقم بنجاح.');
    } catch (error) {
      setLoginStatus(error.message || 'فشل تسجيل الدخول.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'فتح الإعدادات';
    }
  }

  async function refreshDashboard(forceApply = false) {
    if (!state.phone) return;
    try {
      const res = await fetch(`/api/dashboard/load?num=${encodeURIComponent(state.phone)}&app=${encodeURIComponent(state.app)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'تعذر تحميل الإعدادات');
      const stats = data.stats || {};
      state.fieldLabels = data.fieldLabels || {};
      state.sections = data.sections || [];
      state.selectOptions = data.selectOptions || {};
      state.toggleFields = new Set(data.toggleFields || []);
      state.site = data.site || state.site;
      renderSections();
      applySettings(data.settings || {}, forceApply);
      setText('dashTitle', `إعدادات الرقم ${data.phone || state.phone}`);
      setText('dashNumber', data.phone || state.phone);
      setText('dashSession', stats.activeSessions > 0 ? 'متصل ويعمل الآن' : 'جلسة محفوظة وجاهزة');
      setText('dashBaseUrl', state.site.baseUrl || window.location.origin);
      setText('statLinked', Number(stats.linkedNumbers || 0));
      setText('statSessions', Number(stats.activeSessions || 0));
      setText('statUsers', Number(stats.totalUsers || 0));
      setText('statPoints', Number(stats.points || 0));
      const pairLinkBtn = document.getElementById('pairLinkBtn');
      if (pairLinkBtn) pairLinkBtn.href = state.site.pairingPage || '/pair';
      if (forceApply) setSaveStatus('تم مزامنة جميع الإعدادات من الخادم.');
    } catch (error) {
      setSaveStatus(error.message || 'فشل تحديث الإعدادات.', true);
    }
  }

  async function saveSettings() {
    if (!state.phone) return;
    const btn = qs('#saveBtn');
    const payload = currentPayload();
    btn.disabled = true;
    btn.textContent = 'جارٍ الحفظ...';
    setSaveStatus('يتم حفظ الإعدادات وتطبيقها على الرقم المربوط...');
    try {
      const res = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num: state.phone, app: state.app, ...payload })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'فشل الحفظ');
      applySettings(data.settings || payload, true);
      await refreshDashboard(true);
      setSaveStatus('تم حفظ جميع الإعدادات وتطبيقها على الرقم المربوط بنجاح.');
      showToast('تم حفظ الإعدادات بنجاح', 'success');
      setDirty(false);
    } catch (error) {
      setSaveStatus(error.message || 'فشل الحفظ.', true);
      showToast(error.message || 'فشل الحفظ', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'حفظ جميع الإعدادات';
    }
  }

  function resetForm() {
    applySettings(state.lastServerSnapshot, true);
    setSaveStatus('تمت إعادة الحقول إلى آخر نسخة محفوظة.');
    showToast('تم استرجاع آخر حفظ', 'info');
  }

  function logout() {
    stopPolling();
    state.phone = '';
    state.app = 'default';
    state.authenticated = false;
    state.settings = {};
    state.lastServerSnapshot = {};
    state.fieldLabels = {};
    state.sections = [];
    state.selectOptions = {};
    state.toggleFields = new Set();
    setDirty(false);
    document.getElementById('sectionsContainer').innerHTML = '';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'grid';
    qs('#loginPassword').value = '';
    setLoginStatus('تم تسجيل الخروج.');
  }

  function startPolling() {
    stopPolling();
    state.pollingTimer = setInterval(() => {
      if (!state.authenticated) return;
      refreshDashboard(false);
    }, 12000);
  }

  function stopPolling() {
    if (state.pollingTimer) {
      clearInterval(state.pollingTimer);
      state.pollingTimer = null;
    }
  }

  function bindClipboardButtons() {
    qs('#copySettingsBtn')?.addEventListener('click', async () => {
      const url = state.site.settingsPage || `${window.location.origin}/settings`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('تم نسخ رابط الإعدادات', 'success');
      } catch (_) {
        showToast('تعذر نسخ رابط الإعدادات', 'error');
      }
    });
    qs('#copyPairBtn')?.addEventListener('click', async () => {
      const url = state.site.pairingPage || `${window.location.origin}/pair`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('تم نسخ رابط الربط', 'success');
      } catch (_) {
        showToast('تعذر نسخ رابط الربط', 'error');
      }
    });
  }

  function bind() {
    qs('#loginBtn')?.addEventListener('click', login);
    qs('#saveBtn')?.addEventListener('click', saveSettings);
    qs('#resetBtn')?.addEventListener('click', resetForm);
    qs('#logoutBtn')?.addEventListener('click', logout);
    qs('#refreshBtn')?.addEventListener('click', () => refreshDashboard(true));
    qs('#loginPassword')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') login(); });
    qs('#loginNumber')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') login(); });
    bindClipboardButtons();
  }

  function init() {
    bind();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', SettingsApp.init);
