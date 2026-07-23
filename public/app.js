/* Pair page controller — talks to /api/pair and /api/pairing/status */
const API = {
  pair: '/api/pair',
  pairStatus: '/api/pairing/status',
  pairInfo: '/api/pairing'
};

let CURRENT_PAIR_JOB = null;
let TIMER_INTERVAL = null;

function el(id) { return document.getElementById(id); }

function showError(msg) {
  const box = el('errBox');
  box.textContent = '❌ ' + msg;
  box.classList.add('visible');
  setTimeout(() => box.classList.remove('visible'), 6000);
}

function clearTimer() {
  if (TIMER_INTERVAL) { clearInterval(TIMER_INTERVAL); TIMER_INTERVAL = null; }
}

function startCountdown(seconds) {
  clearTimer();
  let left = Math.max(10, Number(seconds) || 60);
  const num = el('timer');
  if (!num) return;
  num.textContent = left;
  TIMER_INTERVAL = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearTimer();
      num.textContent = '0';
      Swal.fire({ icon: 'info', title: '⏰ Code expired', text: 'Generate a new pair code to continue.', timer: 3000 });
      const card = el('codeCard'); if (card) card.classList.remove('visible');
      return;
    }
    num.textContent = left;
  }, 1000);
}

async function copyCode() {
  const code = el('pairCode').textContent.trim();
  if (!code || code === '——') return;
  try {
    await navigator.clipboard.writeText(code.replace(/\s/g, ''));
    const btn = el('copyBtn');
    const prev = btn.textContent;
    btn.textContent = '✅ Copied';
    setTimeout(() => { btn.textContent = prev; }, 1500);
  } catch (_) {
    Swal.fire({ icon: 'info', title: 'Code', html: `<b style="font-size:2rem; color: #00d2ff; letter-spacing: 6px;">${code}</b>` });
  }
}

async function pollPairStatus(phone, jobStart) {
  try {
    const res = await fetch(`${API.pairStatus}?phone=${encodeURIComponent(phone)}`, { headers: { 'accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) {
      const pending = el('pendingBar');
      if (pending) pending.style.display = 'none';
      if (data.lastError || data.timedOut) {
        showError(data.lastError || 'Pairing attempt ended without producing a code. Try again.');
      }
      return data;
    }
    if (data.code) {
      el('pairCode').textContent = data.code;
      el('codeCard').classList.add('visible');
      const expiresIn = data.expiresIn || Math.max(15, Math.round((data.expiresAt - Date.now()) / 1000));
      startCountdown(expiresIn);
      const pending = el('pendingBar'); if (pending) pending.style.display = 'flex';
    }
    if (data.status === 'connected') {
      const statusBar = el('statusBar'); if (statusBar) statusBar.style.display = 'flex';
      el('livePhone').textContent = phone;
      const pending = el('pendingBar'); if (pending) pending.style.display = 'none';
      clearTimer();
      Swal.fire({ icon: 'success', title: '✅ WhatsApp Connected!', text: 'Bot is now running for ' + phone, timer: 4000 });
    }
    return data;
  } catch (err) {
    console.warn('poll error', err);
    return null;
  }
}

async function generatePairCode() {
  const phoneRaw = el('phoneInput').value.trim();
  const phone = phoneRaw.replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (!phone || phone.length < 8) { showError('الرجاء إدخال الرقم مع رمز الدولة بدون + وبدون مسافات.'); return; }
  if (!el('agree').checked) { showError('يجب الموافقة على الشروط للمتابعة.'); return; }

  const btn = el('generateBtn');
  btn.disabled = true; btn.innerHTML = '<span>⏳</span> جاري إنشاء الكود...';

  try {
    const res = await fetch(API.pair, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, num: phone, phoneNumber: phone })
    });
    const data = await res.json();

    if (!res.ok || data.success === false) {
      const already = (data.error || '').includes('already') || data.status === 'already_linked';
      if (already) {
        el('codeCard').classList.add('visible');
        el('pairCode').textContent = data.code || (data.status === 'already_linked' ? 'مربوط ✓' : '——');
        el('pendingBar').style.display = 'none';
        el('statusBar').style.display = 'flex';
        el('livePhone').textContent = phone;
        Swal.fire({ icon: 'success', title: 'مربوط بالفعل', text: data.message || 'الرقم مربوط بالفعل على نفس الجلسة.' });
        return;
      }
      showError(data.error || ('فشل إنشاء كود (' + res.status + ')'));
      return;
    }

    if (data.code) {
      el('pairCode').textContent = data.code;
      el('codeCard').classList.add('visible');
      startCountdown(60);
      el('pendingBar').style.display = 'flex';
    } else {
      CURRENT_PAIR_JOB = { jobId: data.jobId, phone, requestedAt: Date.now() };
      el('pairCode').textContent = 'جاري الإنشاء…';
      el('codeCard').classList.add('visible');
      el('pendingBar').style.display = 'flex';
      let tries = 0;
      const iv = setInterval(async () => {
        tries++;
        const res2 = await pollPairStatus(phone);
        if (res2?.code || res2?.status === 'connected' || tries > 12) clearInterval(iv);
      }, 1500);
    }
  } catch (err) {
    showError('تعذر الاتصال بالخادم: ' + (err.message || err));
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>⚡</span> Generate Pair Code';
  }
}

el('phoneInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') generatePairCode(); });

(async function init() {
  try {
    const res = await fetch(API.pairInfo, { headers: { 'accept': 'application/json' } });
    const data = await res.json();
    if (data?.success && data.alreadyLinkedPhones?.length) {
      const list = [...new Set(data.alreadyLinkedPhones)];
      const html = list.map(p => `<div class="status-bar" style="margin-top:10px"><div class="ic">✅</div><div class="txt"><b>${p}</b> مربوط بالفعل</div></div>`).join('');
      const hero = document.querySelector('.layout');
      if (hero) hero.insertAdjacentHTML('afterend', html);
    }
  } catch (_) {}
})();
