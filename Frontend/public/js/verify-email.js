// public/js/verify-email.js

console.log('[verify-email] script loaded');

const url = new URL(window.location.href);
const token = url.searchParams.get('token');
const email = url.searchParams.get('email');
const msg = document.querySelector('#message');

console.log('[verify-email] Parsed params:', { token, email });

(async () => {
  if (!token || !email) {
    msg.textContent = '❌ Invalid verification link.';
    console.warn('[verify-email] Missing token or email');
    return;
  }

  try {
    console.log('[verify-email] Sending verification request...');
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email })
    });

    const data = await res.json();
    console.log('[verify-email] Response:', data);

    if (data?.ok) {
      msg.innerHTML = '✅ Your email has been verified. You may now <a href="/login.html">sign in</a>.';
    } else {
      msg.textContent = `❌ ${data?.error || 'Verification failed.'}`;
    }
  } catch (err) {
    console.error('[verify-email] error:', err);
    msg.textContent = '❌ An error occurred during verification.';
  }
})();
