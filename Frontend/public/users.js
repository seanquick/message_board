// Frontend/public/users.js
import { api, $, escapeHTML } from './main.js';

(async function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

  async function main() {
    const listEl = $('#usersList');
    const errorEl = $('#errorMsg');

    try {
      const users = await api('/api/users');

      if (!Array.isArray(users) || users.length === 0) {
        showError('No public users found.');
        return;
      }

      const fallbackPhoto = '/default-avatar.png';
      const frag = document.createDocumentFragment();

      for (const user of users) {
        if (!user.profilePublic) continue;

        const card = document.createElement('a');
        card.href = `/profile.html?id=${user._id}`;
        card.className = 'user-card';

        const img = document.createElement('img');
        img.src = user.profilePhoto || fallbackPhoto;
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
      }

      if (frag.children.length === 0) {
        showError('No public profiles to display.');
      } else {
        listEl.appendChild(frag);
      }
    } catch (err) {
      console.error('[users.js] Failed to fetch user list:', err);
      showError(err?.error || 'Unable to load user list.');
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }
  }
})();
