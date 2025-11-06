// Frontend/public/users.js
import { api, escapeHTML } from './main.js';

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('usersList');
  const errBox   = document.getElementById('errorMsg');

  if (!container) return;

  try {
    const data = await api('/api/users', { method: 'GET' });
    const users = data.users || [];

    if (users.length === 0) {
      container.innerHTML = '<p>No users found.</p>';
      return;
    }

    container.innerHTML = users.map(u => `
      <a class="user-card" href="profile.html?id=${u._id}">
        <img src="${u.photoUrl}" alt="${escapeHTML(u.displayName || u.name)}'s photo" class="profile-photo" width="80" height="80">
        <div class="user-name">${escapeHTML(u.displayName || u.name)}</div>
      </a>
    `).join('');

  } catch (err) {
    console.error('[users.js] Failed to load users list:', err);
    if (errBox) {
      errBox.textContent = err?.error || 'Failed to load users';
      errBox.hidden = false;
    }
  }
});
