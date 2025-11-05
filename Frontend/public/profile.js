// Frontend/public/profile.js
import { api, $, escapeHTML } from './main.js';

(async function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

  async function main() {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');

    if (!userId) {
      const errBox = $('#errorMsg');
      if (errBox) {
        errBox.textContent = 'No user ID provided';
        errBox.hidden = false;
      }
      return;
    }

    try {
      const profile = await api(`/api/users/${userId}`);

      const nameEl = $('#userName');
      if (nameEl) {
        nameEl.textContent = escapeHTML(profile.displayName || profile.name || 'User');
      }

      const img = $('#profilePhoto');
      if (img) {
        img.src = profile.profilePhoto || '/default-avatar.png';
        img.alt = `${profile.displayName || profile.name || 'User'}'s photo`;
        img.hidden = false;

        img.onerror = () => {
          img.onerror = null;
          img.src = '/default-avatar.png';
        };
      }

      if (profile.bio) {
        const bioEl = $('#userBio');
        if (bioEl) {
          bioEl.textContent = profile.bio;
          bioEl.hidden = false;
        }
      }

      if (profile.favoriteQuote) {
        const quoteText = $('#userQuoteText');
        const quoteBox = $('#userQuoteBox');
        if (quoteText && quoteBox) {
          quoteText.textContent = profile.favoriteQuote;
          quoteBox.hidden = false;
        }
      }

    } catch (err) {
      console.error('[profile.js] Failed to load profile:', err);
      const errBox = $('#errorMsg');
      if (errBox) {
        errBox.textContent = err?.error || 'Failed to load user profile';
        errBox.hidden = false;
      }
    }
  }
})();
