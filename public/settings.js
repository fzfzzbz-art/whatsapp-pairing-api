const SettingsApp = (() => {
  const state = {
    phone: '',
    app: 'default',
    authenticated: false,
    settings: {},
    lastServerSnapshot: {},
    dirty: false,
    pollingTimer: null,
  };

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));
  const fields = () => qsa('[data-key]');

  function normalizePhone(value) {
    return String(value || '').replace(/[^\d+]/g, '').trim();
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

  function setDirty(flag) {
    state.dirty = !!flag;
    const pill = document.getElementById('dirtyPill');
    if (!pill) return;
    pill.className = `pill ${state.dirty ? '' : 'ok'}`.trim();
    pill.textContent = state.dirty ? 'Unsaved changes pending' : 'All changes synced';
  }

  function currentPayload() {
    const payload = {};
    for (const field of fields()) {
      payload[field.dataset.key] = field.value;
    }
    return payload;
  }

  function applySettings(settings = {}, force = false) {
    if (state.dirty && !force) return;
    state.settings = { ...(settings || {}) };
    state.lastServerSnapshot = { ...(settings || {}) };
    for (const field of fields()) {
      const key = field.dataset.key;
      field.value = settings[key] ?? '';
    }
    setDirty(false);
  }

  function syncDuplicateKeyFields(key, value, source) {
    for (const field of fields()) {
      if (field === source) continue;
      if (field.dataset.key === key) field.value = value;
    }
  }

  function bindFieldTracking() {
    for (const field of fields()) {
      const updateDirtyState = () => {
        syncDuplicateKeyFields(field.dataset.key, field.value, field);
        const current = currentPayload();
        const dirty = JSON.stringify(current) !== JSON.stringify(state.lastServerSnapshot);
        setDirty(dirty);
      };
      field.addEventListener('input', updateDirtyState);
      field.addEventListener('change', updateDirtyState);
    }
  }

  async function login() {
    const num = normalizePhone(qs('#loginNumber')?.value || '');
    const pass = String(qs('#loginPassword')?.value || '').trim();
    if (!num || !pass) {
      setLoginStatus('Enter both the WhatsApp number and password.', true);
      return;
    }
    const btn = qs('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    setLoginStatus('Checking your request securely...');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num, pass })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || data?.message || 'Login failed');
      state.phone = String(data.number || num);
      state.app = String(data.app || 'default');
      state.authenticated = true;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      setText('dashTitle', `Settings for ${state.phone}`);
      setText('dashApp', `App: ${state.app}`);
      await refreshDashboard(true);
      startPolling();
      setSaveStatus('Settings loaded successfully from the linked number profile.');
    } catch (error) {
      setLoginStatus(error.message || 'Login failed.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Open settings';
    }
  }

  async function refreshDashboard(forceApply = false) {
    if (!state.phone) return;
    try {
      const res = await fetch(`/api/dashboard/load?num=${encodeURIComponent(state.phone)}&app=${encodeURIComponent(state.app)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not load dashboard');
      const stats = data.stats || {};
      const settings = data.settings || {};
      setText('dashTitle', `Settings for ${state.phone}`);
      setText('dashApp', `App: ${data.app || state.app}`);
      setText('dashOwner', `Owner: ${stats.ownerId || 'Not linked to a Telegram owner'}`);
      setText('dashSession', `Session: ${stats.activeSessions > 0 ? 'Online' : 'Saved profile'}`);
      setText('statLinked', Number(stats.linkedNumbers || 0));
      setText('statSessions', Number(stats.activeSessions || 0));
      setText('statUsers', Number(stats.totalUsers || 0));
      setText('statPoints', Number(stats.points || 0));
      applySettings(settings, forceApply);
      if (forceApply) setSaveStatus('Settings loaded successfully.');
    } catch (error) {
      setSaveStatus(error.message || 'Failed to refresh settings.', true);
    }
  }

  async function saveSettings() {
    if (!state.phone) return;
    const btn = qs('#saveBtn');
    const payload = currentPayload();
    btn.disabled = true;
    btn.textContent = 'Saving…';
    setSaveStatus('Saving all settings and applying them to the linked number...');
    try {
      const res = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num: state.phone, app: state.app, ...payload })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Save failed');
      applySettings(data.settings || payload, true);
      await refreshDashboard(true);
      setSaveStatus('تم حفظ الإعدادات بنجاح وتم تطبيقها على الرقم المربوط.');
      setDirty(false);
    } catch (error) {
      setSaveStatus(error.message || 'Save failed.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save all settings';
    }
  }

  function resetForm() {
    applySettings(state.lastServerSnapshot, true);
    setSaveStatus('Form reset to the last saved settings.');
  }

  function logout() {
    stopPolling();
    state.phone = '';
    state.app = 'default';
    state.authenticated = false;
    state.settings = {};
    state.lastServerSnapshot = {};
    setDirty(false);
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'grid';
    qs('#loginPassword').value = '';
    setLoginStatus('Ready to verify securely.');
  }

  function switchTab(tab) {
    qsa('.side-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    qsa('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
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

  function bind() {
    qs('#loginBtn')?.addEventListener('click', login);
    qs('#saveBtn')?.addEventListener('click', saveSettings);
    qs('#resetBtn')?.addEventListener('click', resetForm);
    qs('#logoutBtn')?.addEventListener('click', logout);
    qs('#refreshBtn')?.addEventListener('click', () => refreshDashboard(true));
    qsa('.side-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    bindFieldTracking();

    qs('#loginPassword')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login();
    });
    qs('#loginNumber')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login();
    });
  }

  function init() {
    bind();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', SettingsApp.init);