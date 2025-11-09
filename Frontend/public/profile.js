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
      const profile = await api(`/api/profile/${userId}`, { method: 'GET' });

      console.log('PROFILE data:', profile);

      // Name
      const nameEl = $('#userName');
      if (nameEl) {
        nameEl.textContent = escapeHTML(profile.displayName || profile.name || 'User');
      }

      // Profile photo
      const img = $('#profilePhoto');
      const fallback = '/default-avatar.png';
      let photoUrl = profile.profilePhoto || fallback;

      if (img) {
        img.src = photoUrl;
        img.alt = `${profile.displayName || profile.name || 'User'}'s photo`;
        img.hidden = false;

        img.onerror = () => {
          img.onerror = null;
          img.src = fallback;
        };
      }

      // Email
      if (profile.email) {
        const emailEl = $('#userEmail');
        const emailValue = $('#userEmailValue');
        if (emailEl && emailValue) {
          emailValue.textContent = profile.email;
          emailEl.hidden = false;
        }
      }

      // Bio
      if (profile.bio) {
        const bioEl = $('#userBio');
        if (bioEl) {
          bioEl.textContent = profile.bio;
          bioEl.hidden = false;
        }
      }

      // Favorite Quote
      if (profile.favoriteQuote) {
        const quoteBox = $('#userQuoteBox');
        const quoteText = $('#userQuoteText');
        if (quoteBox && quoteText) {
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
