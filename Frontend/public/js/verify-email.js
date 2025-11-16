// verify-email.js
import { q } from './main.js';
import { apiPost } from './auth-ui.js';

const url = new URL(window.location.href);
const token = url.searchParams.get('token');
const email = url.searchParams.get('email');

const msg = q('#message');

(async () => {
  if (!token || !email) {
    msg.textContent = 'Invalid verification link.';
    return;
  }

  try {
    const res = await apiPost('/api/auth/verify-email', { token, email });
    if (res?.error) throw new Error(res.error);
    msg.textContent = '✅ Your email has been verified. You may now sign in.';
  } catch (err) {
    console.error('[verify-email] error:', err);
    msg.textContent = '❌ Verification failed. The link may have expired or is invalid.';
  }
})();
