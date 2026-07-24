const PairingUI = (() => {
  const CODE_EXPIRY_SECONDS = 90;
  const state = {
    code: '',
    qrLoaded: false,
    countdownTimer: null,
    countdownLeft: CODE_EXPIRY_SECONDS,
  };

  const els = {
    phone: () => document.getElementById('phone'),
    terms: () => document.getElementById('terms'),
    pairBtn: () => document.getElementById('pairBtn'),
    pairStatus: () => document.getElementById('pairStatus'),
    pairCodeBox: () => document.getElementById('pairCodeBox'),
    pairCodeValue: () => document.getElementById('pairCodeValue'),
    copyCodeBtn: () => document.getElementById('copyCodeBtn'),
    loadQrBtn: () => document.getElementById('loadQrBtn'),
    qrImage: () => document.getElementById('qrImage'),
    qrBox: () => document.getElementById('qrBox'),
    qrPlaceholder: () => document.getElementById('qrPlaceholder'),
    toast: () => document.getElementById('toast'),
  };

  function setStatus(text, isError = false) {
    const node = els.pairStatus();
    if (!node) return;
    node.textContent = text;
    node.style.color = isError ? '#ff9c9c' : 'var(--muted)';
  }

  function toast(message, type = 'info') {
    const node = els.toast();
    if (!node) return;
    node.textContent = message;
    node.className = `toast show ${type === 'error' ? 'error' : ''}`.trim();
    clearTimeout(node._timer);
    node._timer = setTimeout(() => {
      node.className = 'toast';
    }, 4000);
  }

  function normalizePhone(phone) {
    return String(phone || '').replace(/[^\d+]/g, '').trim();
  }

  async function loadSummary() {
    try {
      const res = await fetch('/api/linking-site/summary', { cache: 'no-store' });
      const data = await res.json();
      if (!data?.success) return;
      setText('statBots', data.activeBots ?? '--');
      setText('statNumbers', data.totalLinkedNumbers ?? '--');
      setText('statUsers', data.totalUsers ?? '--');
      setText('statUptime', '99.9%');
    } catch (_) {}
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function clearCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  function startCountdown() {
    clearCountdown();
    state.countdownLeft = CODE_EXPIRY_SECONDS;
    setText('timer', String(state.countdownLeft));
    state.countdownTimer = setInterval(() => {
      state.countdownLeft -= 1;
      setText('timer', String(Math.max(0, state.countdownLeft)));
      if (state.countdownLeft > 0) return;
      clearCountdown();
      setStatus('Pair code expired. Generate a fresh code to continue.', true);
      toast('Pair code expired. Generate a fresh code.', 'error');
    }, 1000);
  }

  async function generatePairCode() {
    const phone = normalizePhone(els.phone()?.value || '');
    if (!phone) {
      setStatus('Enter your WhatsApp number first.', true);
      toast('Enter your WhatsApp number first.', 'error');
      return;
    }
    if (!els.terms()?.checked) {
      setStatus('Accept the usage confirmation before generating the code.', true);
      toast('Accept the usage confirmation first.', 'error');
      return;
    }

    const btn = els.pairBtn();
    btn.disabled = true;
    btn.textContent = 'Generating…';
    setStatus('Generating your pair code securely...');

    try {
      const res = await fetch('/api/pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, num: phone })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || 'Failed to generate pair code');
      }
      state.code = String(data.code || '').trim();
      els.pairCodeValue().textContent = state.code || '--------';
      els.pairCodeBox().classList.add('show');
      startCountdown();
      setStatus(`Pair code ready for ${phone}. It stays valid for about ${CODE_EXPIRY_SECONDS} seconds.`);
      toast('Pair code generated successfully.');
    } catch (error) {
      setStatus(error.message || 'Failed to generate pair code.', true);
      toast(error.message || 'Failed to generate pair code.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate pair code';
    }
  }

  async function copyCode() {
    if (!state.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      toast('Pair code copied.');
    } catch (_) {
      toast('Could not copy automatically. Copy it manually.', 'error');
    }
  }

  function loadQr() {
    const img = els.qrImage();
    const btn = els.loadQrBtn();
    if (!img || !btn) return;
    btn.disabled = true;
    btn.textContent = 'Loading QR…';
    setStatus('Loading live QR...');
    img.onload = () => {
      els.qrBox()?.classList.add('loaded');
      if (els.qrPlaceholder()) els.qrPlaceholder().style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Refresh QR code';
      setStatus('QR loaded. Scan it from WhatsApp linked devices.');
    };
    img.onerror = () => {
      btn.disabled = false;
      btn.textContent = 'Load QR code';
      setStatus('Could not load QR right now.', true);
      toast('Could not load QR right now.', 'error');
    };
    img.src = `/api/qr?t=${Date.now()}`;
  }

  function bind() {
    els.pairBtn()?.addEventListener('click', generatePairCode);
    els.copyCodeBtn()?.addEventListener('click', copyCode);
    els.loadQrBtn()?.addEventListener('click', loadQr);
  }

  function init() {
    bind();
    loadSummary();
    setInterval(loadSummary, 20000);
    setText('timer', String(CODE_EXPIRY_SECONDS));
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', PairingUI.init);