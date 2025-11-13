// Frontend/public/auth-ui.js
// Shared auth logic for login/register/forgot/reset (CSP-safe)

const $  = (s, r = document) => r.querySelector(s);
const qs = () => new URLSearchParams(location.search);

function safeNext(def = 'threads.html') {
  const p = qs().get('next') || '';
  if (!p) return def;
  if (/^https?:\/\//i.test(p) || p.startsWith('//')) return def; // prevent open redirects
  return p;
}

function readCookie(name) {
  return document.cookie.split('; ').reduce((acc, pair) => {
    const [k, v] = pair.split('=');
    return k === name ? decodeURIComponent(v) : acc;
  }, '');
}


async function ensureCsrf() {
  try { await fetch('/api/auth/csrf', { credentials: 'include' }); } catch {}
  return readCookie('csrf') || '';
}

function setMsg(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

/* =========================== LOGIN =========================== */
async function initLogin() {
  const form = $('#loginForm');
  if (!form) return;

  const next = safeNext();
  $('#next')?.setAttribute('value', next);
  $('#linkForgot')?.setAttribute('href', 'forgot.html?next=' + encodeURIComponent(next));
  $('#linkRegister')?.setAttribute('href', 'register.html?next=' + encodeURIComponent(next));
  $('#linkBack')?.setAttribute('href', next);

  let csrf = await ensureCsrf();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('#err', '');

    const email = $('#email')?.value.trim();
    const password = $('#password')?.value || '';
    if (!email || !password) {
      setMsg('#err', 'Please enter your email and password.');
      return;
    }

    const btn = e.submitter;
    const txt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Login failed.');

      location.href = next || 'threads.html';
    } catch (err) {
        console.error('[initLogin] Error:', err);
      const msg = err.message || 'Could not sign in.';
      setMsg('#err', msg);

      // Show resend link if the error looks like “verify your email”
      if (msg.toLowerCase().includes('verify your email')) {
        const errEl = $('#err');
        if (errEl) {
          const link = document.createElement('a');
          link.href = '#';
          link.textContent = 'Resend verification email';
          link.style.display = 'block';
          link.style.marginTop = '0.5rem';
          link.className = 'link';
          link.addEventListener('click', (ev) => {
            ev.preventDefault();
            const promptEl = $('#resendPrompt');
            if (promptEl) promptEl.classList.remove('hidden');
            const inputEl = $('#resendEmailInput');
            if (inputEl) inputEl.value = email; // prefill with the same email
            if (inputEl) inputEl.focus();
          });
          errEl.appendChild(link);
        }
      }

      csrf = await ensureCsrf();
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  });

  // UX: Enter key
  ['email','password'].forEach(id => {
    $(`#${id}`)?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') form?.requestSubmit();
    });
  });
}


/* ========================= REGISTER ========================== */
async function initRegister() {
  const form = $('#regForm');
  if (!form) return;

  const next = safeNext();
  $('#next')?.setAttribute('value', next);
  $('#linkLogin')?.setAttribute('href', 'login.html?next=' + encodeURIComponent(next));
  $('#linkBack')?.setAttribute('href', next);

  const terms = $('#termsCheckbox');
  const submitBtn = $('#submitBtn');

  // 🔹 Enable/disable button until guidelines accepted
  if (terms && submitBtn) {
    submitBtn.disabled = !terms.checked;
    terms.addEventListener('change', () => {
      submitBtn.disabled = !terms.checked;
    });
  }

  let csrf = await ensureCsrf();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('#err', '');

    const name = $('#name')?.value.trim();
    const email = $('#email')?.value.trim();
    const pw = $('#password')?.value || '';

    if (!name || name.length < 2) return setMsg('#err', 'Please enter your name.');
    if (!email || !email.includes('@')) return setMsg('#err', 'Please enter a valid email.');
    if (pw.length < 8) return setMsg('#err', 'Password must be at least 8 characters.');
    if (!terms?.checked) return setMsg('#err', 'You must accept the Community Guidelines.');

    const btn = e.submitter;
    const txt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        credentials: 'include',
        body: JSON.stringify({ name, email, password: pw, acceptedGuidelines: true })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Registration failed.');

      // ✅ Redirect new users to profile setup
      location.href = '/account.html';
    } catch (err) {
        console.error('[initLogin] Error:', err);   
      setMsg('#err', err.message || 'Could not create account.');
      csrf = await ensureCsrf();
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  });
}

/* =========================== FORGOT ========================== */
async function initForgot() {
  const form = $('#forgotForm');
  if (!form) return;

  const next = safeNext();
  $('#loginLink')?.setAttribute('href', 'login.html?next=' + encodeURIComponent(next));
  $('#backLink')?.setAttribute('href', next);

  let csrf = await ensureCsrf();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('#err', '');
    setMsg('#ok', '');

    const email = $('#email')?.value.trim();
    if (!email || !email.includes('@')) {
      setMsg('#err', 'Please enter a valid email.');
      return;
    }

    const btn = e.submitter;
    const txt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Request failed.');
      setMsg('#ok', 'If that email exists, we just sent a reset link. Please check your inbox.');
    } catch (err) {
        console.error('[initLogin] Error:', err);
      setMsg('#err', err.message || 'Could not send reset email.');
      csrf = await ensureCsrf();
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  });
}

/* ============================ RESET ========================== */
async function initReset() {
  const form = $('#resetForm');
  if (!form) return;

  const p = qs();
  const token = p.get('token') || '';
  const email = p.get('email') || '';
  const next = safeNext();

  $('#token')?.setAttribute('value', token);
  $('#email')?.setAttribute('value', email);
  $('#next')?.setAttribute('value', next);
  $('#toLogin')?.setAttribute('href', 'login.html?next=' + encodeURIComponent(next));
  $('#backLink')?.setAttribute('href', next);

  if (!token) {
    setMsg('#err', 'This page must be opened from a valid reset link.');
    const btn = $('#resetForm button[type="submit"]');
    if (btn) btn.disabled = true;
    return;
  }

  let csrf = await ensureCsrf();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('#err', '');
    setMsg('#ok', '');

    const pw = $('#password')?.value || '';
    const pw2 = $('#password2')?.value || '';
    if (pw.length < 8) return setMsg('#err', 'Password must be at least 8 characters.');
    if (pw !== pw2) return setMsg('#err', 'Passwords do not match.');

    const btn = e.submitter;
    const txt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Updating…';

    try {
      const body = { token, password: pw };
      if (email) body.email = email;

      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Reset failed.');
      setMsg('#ok', 'Password updated. Redirecting to sign in…');
      setTimeout(() => { location.href = 'login.html?next=' + encodeURIComponent(next); }, 900);
    } catch (err) {
        console.error('[initLogin] Error:', err);
      setMsg('#err', err.message || 'Could not update password.');
      csrf = await ensureCsrf();
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  });
}

/* ============================ BOOT =========================== */
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initRegister();
  initForgot();
  initReset();
});

export { ensureCsrf };