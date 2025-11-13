// Frontend/public/login.js
// Handles login logic and enhanced email verification prompt

const $ = (s, r = document) => r.querySelector(s);
const getCookie = (name) =>
  document.cookie.split('; ').find((x) => x.startsWith(name + '='))?.split('=')[1];

function showErr(msg) {
  const el = $('#err');
  if (!el) return;

  el.innerHTML = ''; // Clear previous content
  el.textContent = msg || 'Something went wrong.';
  el.style.display = '';

  // Show "Resend verification" link if needed
  if (msg && msg.toLowerCase().includes('verify your email')) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Resend verification email';
    link.style.display = 'block';
    link.style.marginTop = '0.5rem';
    link.className = 'link';
    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      $('#resendPrompt')?.classList.remove('hidden');
      $('#resendEmailInput')?.focus();
    });
    el.appendChild(link);
  }
}

async function seedCsrfIfMissing() {
  try {
    if (!getCookie('csrf')) {
      await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'same-origin',
      }).catch(() => {});
    }
  } catch {}
}

async function postJSON(url, body) {
  const csrf = getCookie('csrf');
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  let data = null;
  try {
    data = await res.clone().json();
  } catch {
    data = { error: await res.text().catch(() => 'Request failed') };
  }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

document.addEventListener('DOMContentLoaded', async () => {
  const form = $('#loginForm');
  const btn = $('#submitBtn');
  const err = $('#err');

  await seedCsrfIfMissing();

  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (err) {
      err.style.display = 'none';
      err.textContent = '';
    }

    const email = $('#email')?.value.trim();
    const password = $('#password')?.value || '';

    if (!email || !password) {
      showErr('Please enter email and password.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      await postJSON('/api/auth/login', { email, password });
      location.href = 'threads.html';
    } catch (ex) {
      showErr(ex?.message || 'Sign-in failed');
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  // UX: Enter key
  ['email', 'password'].forEach((id) => {
    $(`#${id}`)?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') form?.requestSubmit();
    });
  });

  // ===== Resend verification logic =====
  const resendPrompt = $('#resendPrompt');
  const resendEmailInput = $('#resendEmailInput');
  const resendMsg = $('#resendMsg');
  const resendSubmitBtn = $('#resendSubmitBtn');
  const resendCancelBtn = $('#resendCancelBtn');

  resendCancelBtn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    resendPrompt?.classList.add('hidden');
    resendEmailInput.value = '';
    resendMsg.textContent = '';
  });

  resendSubmitBtn?.addEventListener('click', async (ev) => {
    console.log('[resend] Clicked Send with:', email);
    ev.preventDefault();
    const email = resendEmailInput?.value.trim();
    if (!email) {
      resendMsg.textContent = 'Please enter your email.';
      return;
    }

    resendSubmitBtn.disabled = true;
    resendSubmitBtn.textContent = 'Sending…';

    try {
      const resp = await postJSON('/api/auth/resend-verification', { email });
      resendMsg.textContent = resp.message || 'Verification email sent. Check your inbox.';
    } catch (err) {
      resendMsg.textContent = err?.message || 'Failed to resend verification email.';
    } finally {
      resendSubmitBtn.disabled = false;
      resendSubmitBtn.textContent = 'Send';
    }
  });
});
