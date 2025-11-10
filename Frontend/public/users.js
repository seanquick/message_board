// Frontend/public/users.js

import { api, $, escapeHTML } from './main.js';

document.addEventListener('nav:ready', main);

async function main() {
  const listEl = $('usersList');
  const errorEl = $('errorMsg');

  if (!listEl || !errorEl) {
    console.warn('[users.js] Required DOM nodes missing');
    return;
  }

  // Show loading indicator
  listEl.textContent = 'Loading users…';

  try {
    const users = await api('/api/users');
    listEl.textContent = '';  // clear loading text

    if (!Array.isArray(users) || users.length === 0) {
      showError('No public users found.');
      return;
    }

    const fallbackPhoto = '/default-avatar.png';

    // Filter for public profiles, then optionally sort
    const publicUsers = users.filter(u => u.profilePublic);
    publicUsers.sort((a, b) => {
      const na = (a.displayName || '').toLowerCase();
      const nb = (b.displayName || '').toLowerCase();
      return na.localeCompare(nb);
    });

    if (publicUsers.length === 0) {
      showError('No public profiles to display.');
      return;
    }

    const frag = document.createDocumentFragment();

    publicUsers.forEach(user => {
      const card = document.createElement('a');
      card.href = `/profile.html?id=${user._id}`;
      card.className = 'user-card';

      const img = document.createElement('img');
      img.src = user.profilePhotoUrl || user.profilePhoto || fallbackPhoto;
      img.alt = `${user.displayName || 'User'}'s profile photo`;
      img.className = 'user-photo';
      img.onerror = () => {
        img.onerror = null;
        img.src = fallbackPhoto;
      };

      const name = document.createElement('p');
      name.className = 'user-name';
      name.textContent = escapeHTML(user.displayName || 'Unnamed User');

      card.appendChild(img);
      card.appendChild(name);
      frag.appendChild(card);
    });

    listEl.appendChild(frag);

  } catch (err) {
    console.error('[users.js] Failed to fetch user list:', err);
    showError(err?.error || 'Unable to load user list.');
  }

  function showError(msg) {
    listEl.textContent = ''; // clear list area
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }
}
