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
      if (!photoUrl || photoUrl.trim() === '') {
        photoUrl = fallback;
      }

      if (img) {
        img.src = photoUrl;
        img.alt = `${profile.displayName || profile.name || 'User'}'s photo`;
        img.hidden = false;
        img.style.display = 'block';

        img.onerror = () => {
          img.onerror = null;
          img.src = fallback;
          img.style.display = 'block';
        };
      }

      // Email
      const emailEl   = $('#userEmail');
      const emailVal  = $('#userEmailValue');
      if (emailEl && emailVal) {
        if (profile.email?.trim()) {
          emailVal.textContent = escapeHTML(profile.email);
          emailEl.hidden = false;
        } else {
          emailEl.hidden = true;
        }
      }

      // Bio
      const bioEl = $('#userBio');
      if (bioEl) {
        if (profile.bio?.trim()) {
          bioEl.textContent = escapeHTML(profile.bio);
          bioEl.hidden = false;
        } else {
          bioEl.hidden = true;
        }
      }

      // Favorite Quote
      const quoteBox  = $('#userQuoteBox');
      const quoteText = $('#userQuoteText');
      if (quoteBox && quoteText) {
        if (profile.favoriteQuote?.trim()) {
          quoteText.textContent = escapeHTML(profile.favoriteQuote);
          quoteBox.hidden = false;
        } else {
          quoteBox.hidden = true;
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
