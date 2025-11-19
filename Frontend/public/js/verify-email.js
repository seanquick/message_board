// public/js/verify-email.js

const url = new URL(window.location.href);
const token = url.searchParams.get('token');
const email = url.searchParams.get('email');
const msg = document.querySelector('#message');

(async () => {
  if (!token || !email) {
    msg.textContent = '❌ Invalid verification link.';
    return;
  }

  try {
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email })
    });

    const data = await res.json();

    if (data?.ok) {
      msg.textContent = '✅ Your email has been verified. You may now sign in.';
    } else {
      msg.textContent = `❌ ${data?.error || 'Verification failed.'}`;
    }
  } catch (err) {
    console.error('[verify-email] error:', err);
    msg.textContent = '❌ An error occurred during verification.';
  }
})();
