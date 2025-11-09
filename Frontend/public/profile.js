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
      showError('No user ID provided');
      return;
    }

    try {
      const profile = await api(`/api/profile/${userId}`);
      console.log('PROFILE data:', profile);

      const fallbackPhoto = '/default-avatar.png';
      const name = profile.displayName || profile.name || 'User';

      $('#userName').textContent = escapeHTML(name);

      // Profile photo
      const img = $('#profilePhoto');
      if (img) {
        img.src = profile.profilePhoto || fallbackPhoto;
        img.alt = `${name}'s profile photo`;
        img.classList.remove('hidden');
        img.onerror = () => {
          img.onerror = null;
          img.src = fallbackPhoto;
        };
      }

      // Email visibility
      if (profile.emailPublic && profile.email?.trim()) {
        $('#userEmailValue').textContent = escapeHTML(profile.email);
        $('#userEmail').classList.remove('hidden');
      }

      // Bio
      if (profile.bio?.trim()) {
        $('#userBio').textContent = escapeHTML(profile.bio);
        $('#userBio').classList.remove('hidden');
      }

      // Favorite Quote
      if (profile.favoriteQuote?.trim()) {
        $('#userQuoteText').textContent = escapeHTML(profile.favoriteQuote);
        $('#userQuoteBox').classList.remove('hidden');
      }

      // TODO: support userQuotesList if needed
    } catch (err) {
      console.error('[profile.js] Failed to load profile:', err);
      showError(err?.error || 'Failed to load user profile');
    }

    function showError(msg) {
      const el = $('#errorMsg');
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }
})();
