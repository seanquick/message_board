// Frontend/public/login.js
// External login script (CSP-friendly). Seeds CSRF, submits login, shows clear errors.

const $ = (s, r=document) => r.querySelector(s);
const getCookie = (name) => document.cookie.split('; ').find(x => x.startsWith(name+'='))?.split('=')[1];

function showErr(msg) {
  const el = $('#topErr');
  if (!el) return;

  el.innerHTML = ''; // Clear previous content
  el.textContent = msg || 'Something went wrong.';
  el.style.display = '';

  // If the message includes email verification, show a helpful link
  if (msg && msg.toLowerCase().includes('verify your email')) {
    const link = document.createElement('a');
    link.href = 'resend-verification.html';
    link.textContent = 'Resend verification email';
    link.style.display = 'block';
    link.style.marginTop = '0.5rem';
    el.appendChild(link);
  }
}


async function seedCsrfIfMissing() {
  try {
    if (!getCookie('csrf')) {
      await fetch('/api/auth/csrf', { method: 'GET', credentials: 'same-origin' }).catch(()=>{});
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
      ...(csrf ? { 'x-csrf-token': csrf } : {})
    },
    body: JSON.stringify(body || {})
  });
  let data = null;
  try { data = await res.clone().json(); } catch { data = { error: await res.text().catch(()=> 'Request failed') }; }
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

document.addEventListener('DOMContentLoaded', async () => {
  const form = $('#loginForm');
  const btn  = $('#submitBtn');
  const err  = $('#topErr');

  // If CSP blocked inline JS before, this file running is our sign things are good.
  if (err) { err.style.display = 'none'; err.textContent = ''; }

  await seedCsrfIfMissing();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (err) { err.style.display = 'none'; err.textContent = ''; }

    const email = $('#email')?.value.trim();
    const password = $('#password')?.value || '';

    if (!email || !password) {
      showErr('Please enter email and password.');
      return;
    }

    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await postJSON('/api/auth/login', { email, password });
      location.href = 'threads.html';
    } catch (ex) {
      showErr(ex?.message || 'Sign-in failed');
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });

  // UX: Enter key
  ['email','password'].forEach(id => {
    $(`#${id}`)?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') form?.requestSubmit();
    });
  });
});
