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

    const errBox = $('#errorMsg');
    if (!userId) {
      if (errBox) {
        errBox.textContent = 'No user ID provided';
        errBox.hidden = false;
      }
      return;
    }

    try {
      const profile = await api(`/api/users/${userId}`);

      // Set name
      const nameEl = $('#userName');
      if (nameEl) {
        nameEl.textContent = escapeHTML(profile.displayName || profile.name || 'User');
      }

    // Profile photo logic
    const img = $('#profilePhoto');
    const fallback = '/default-avatar.png';
    let profilePhotoUrl = (profile.profilePhotoUrl || profile.profilePhoto || '').trim();

    // If empty or invalid, use fallback
    if (!profilePhotoUrl || profilePhotoUrl === 'undefined') {
    profilePhotoUrl = fallback;
    }

    if (img) {
    img.alt = `${profile.displayName || profile.name || 'User'}'s photo`;

    img.onload = () => {
        img.hidden = false;
    };

    img.onerror = () => {
        console.warn('Image failed to load, using fallback');
        img.onerror = null;
        img.src = fallback;
    };

    img.src = profilePhotoUrl;
    }


      // Bio
      if (profile.bio) {
        const bioEl = $('#userBio');
        if (bioEl) {
          bioEl.textContent = profile.bio;
          bioEl.hidden = false;
        }
      }

      // Favorite quote
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
      if (errBox) {
        errBox.textContent = err?.error || 'Failed to load user profile';
        errBox.hidden = false;
      }
    }
  }
})();
