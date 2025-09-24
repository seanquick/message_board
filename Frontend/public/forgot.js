// Frontend/public/forgot.js
import { api, q } from './main.js';

const form = q('#forgotForm');
const emailEl = q('#email');
const msgEl = q('#msg');
const errEl = q('#err');

form?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  errEl.textContent = '';
  msgEl.classList.add('hidden');

  const email = emailEl.value.trim();
  if (!email) {
    errEl.textContent = 'Please enter your email.';
    return;
  }

  try {
    await api('/api/auth/forgot', { method: 'POST', body: { email } });
    msgEl.classList.remove('hidden');
  } catch (e) {
    // We still show the success message to avoid account enumeration
    msgEl.classList.remove('hidden');
  }
});
