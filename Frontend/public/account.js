// Frontend/public/account.js
import { api, $, refreshMe } from './main.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Only run on pages that actually have the form
  const form = $('#pwForm');
  const msg  = $('#msg');
  if (!form || !msg) return;

  await refreshMe(); // update nav

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const oldPassword = $('#old')?.value || '';
    const newPassword = $('#nw')?.value || '';

    if (newPassword.length < 8) {
      msg.textContent = 'New password must be at least 8 characters.';
      msg.className = 'err';
      return;
    }

    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { oldPassword, newPassword }
      });
      msg.textContent = 'Password updated. You’re still logged in.';
      msg.className = 'ok';
      form.reset();
    } catch (err) {
      msg.textContent = err.message || 'Failed to update password.';
      msg.className = 'err';
    }
  });
});
