// Frontend/public/profile.js

import { api, $, escapeHTML } from './main.js';

(async function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

  async function main() {
    // === 🔹 Setup
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');
    const errorBox = $('#errorMsg');

    if (!userId) {
      return showError('No user ID provided.');
    }

    try {
      // === 🔹 Fetch Profile
      const profile = await api(`/api/profile/${userId}`);
      console.log('PROFILE data:', profile);

      // === 🔹 Debug: DOM element check
      console.log('[DOM CHECK]', {
        nameEl: !!$('#userName'),
        photoEl: !!$('#profilePhoto'),
        emailWrap: !!$('#userEmail'),
        emailVal: !!$('#userEmailValue'),
        bioEl: !!$('#userBio'),
        quoteBox: !!$('#userQuoteBox'),
        quoteText: !!$('#userQuoteText'),
      });

      // === 🔸 Profile not public (backend should block it, but double check)
      if (!profile || profile.profilePublic === false) {
        return showError("This user's profile is private or does not exist.");
      }

      const fallbackPhoto = '/default-avatar.png';
      const displayName = escapeHTML(profile.displayName || profile.name || 'User');

      // === 🔸 Name
      const nameEl = $('#userName');
      if (nameEl) nameEl.textContent = displayName;

      // === 🔸 Photo
      const img = $('#profilePhoto');
      if (img) {
        img.src = profile.profilePhotoUrl || fallbackPhoto;
        img.alt = `${displayName}'s profile photo`;
        img.classList.remove('hidden');
        img.onerror = () => {
          img.onerror = null;
          img.src = fallbackPhoto;
        };
      }

      // === 🔸 Email
      const emailWrap = $('#userEmail');
      const emailVal = $('#userEmailValue');
      if (emailWrap && emailVal && profile.email?.trim()) {
        emailVal.textContent = escapeHTML(profile.email);
        emailWrap.classList.remove('hidden');
      }

      // === 🔸 Bio
      const bioEl = $('#userBio');
      if (bioEl && profile.bio?.trim()) {
        bioEl.textContent = escapeHTML(profile.bio);
        bioEl.classList.remove('hidden');
      }

      // === 🔸 Favorite Quote
      const quoteBox = $('#userQuoteBox');
      const quoteText = $('#userQuoteText');
      if (quoteBox && quoteText && profile.favoriteQuote?.trim()) {
        quoteText.textContent = escapeHTML(profile.favoriteQuote);
        quoteBox.classList.remove('hidden');
      }

    } catch (err) {
      console.error('[profile.js] Failed to load profile:', err);

      // === 🔹 Handle 404 or private profile response
      if (err?.status === 404) {
        showError("This user's profile is private or does not exist.");
      } else {
        showError(err?.error || 'Failed to load user profile.');
      }
    }

    // === 🔹 Error helper
    function showError(msg) {
      const el = $('#errorMsg');
      if (!el) return;
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }
})();
