// Frontend/public/register.js
// Handles registration + required Guidelines acceptance (CSP-safe).
import { api, q } from './main.js';

const form   = q('#regForm');
const nameEl = q('#name');
const mailEl = q('#email');
const passEl = q('#password');
const agree  = q('#agree');
const errEl  = q('#err');
const btnEl  = q('#go');

form?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  errEl.textContent = '';

  const name  = (nameEl.value || '').trim();
  const email = (mailEl.value || '').trim();
  const password = passEl.value || '';
  const acceptedGuidelines = !!agree.checked;

  if (!name || !email || !password) {
    errEl.textContent = 'Please fill all fields.';
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    return;
  }
  if (!acceptedGuidelines) {
    errEl.textContent = 'You must agree to the Community Guidelines.';
    return;
  }

  btnEl.disabled = true;
  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: { name, email, password, acceptedGuidelines }
    });
    window.location.href = 'threads.html';
  } catch (e) {
    errEl.textContent = e.message || 'Registration failed.';
  } finally {
    btnEl.disabled = false;
  }
});
