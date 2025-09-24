// Frontend/public/reset.js
import { api, q } from './main.js';

const params = new URLSearchParams(location.search);
const token = params.get('token') || '';

const form = q('#resetForm');
const passEl = q('#password');
const confEl = q('#confirm');
const okEl = q('#ok');
const errEl = q('#err');

if (!token) {
  errEl.textContent = 'Missing or invalid reset link.';
}

form?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  errEl.textContent = '';
  okEl.classList.add('hidden');

  const pw = passEl.value || '';
  const cf = confEl.value || '';
  if (pw.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    return;
  }
  if (pw !== cf) {
    errEl.textContent = 'Passwords do not match.';
    return;
  }
  if (!token) {
    errEl.textContent = 'Missing or invalid reset link.';
    return;
  }

  try {
    await api('/api/auth/reset', { method: 'POST', body: { token, password: pw } });
    okEl.classList.remove('hidden');
    setTimeout(() => (window.location.href = 'threads.html'), 1000);
  } catch (e) {
    errEl.textContent = e.message || 'Failed to reset password.';
  }
});
