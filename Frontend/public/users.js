// Frontend/public/users.js
import { api, $, escapeHTML } from './main.js';

// Wait until nav is ready
document.addEventListener('nav:ready', main);

async function main() {
  const listEl = $('usersList');
  const errorEl = $('errorMsg');
  if (!listEl || !errorEl) {
    console.warn('[users.js] Missing #usersList or #errorMsg');
    return;
  }

  // Loading message
  listEl.textContent = 'Loading users...';

  try {
    const result = await api('/api/users');
    console.log('USERS API result:', result);

    // ✅ Handle object wrapper
    const users = Array.isArray(result) ? result : result.users || [];

    listEl.textContent = '';

    if (users.length === 0) {
      showError('No public users found.');
      return;
    }

    const fallbackPhoto = '/default-avatar.png';
    const frag = document.createDocumentFragment();

    // Sort A→Z
    users.sort((a, b) =>
      (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
    );

    for (const user of users) {
      const card = document.createElement('a');
      card.href = `/profile.html?id=${user._id}`;
      card.className = 'user-card';

      const img = document.createElement('img');
      img.src = user.profilePhotoUrl || user.photoUrl || user.profilePhoto || fallbackPhoto;
      img.alt = `${user.displayName || 'User'}'s profile photo`;
      img.className = 'user-photo';
      img.onerror = () => (img.src = fallbackPhoto);

      const nameEl = document.createElement('p');
      nameEl.className = 'user-name';
      nameEl.textContent = escapeHTML(user.displayName || user.name || 'Unnamed User');

      card.append(img, nameEl);
      frag.appendChild(card);
    }

    listEl.appendChild(frag);
  } catch (err) {
    console.error('[users.js] Failed to fetch user list:', err);
    showError(err?.error || 'Unable to load user list.');
  }

  function showError(msg) {
    listEl.textContent = '';
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }
}
