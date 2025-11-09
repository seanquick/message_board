// Frontend/public/profile.js

import { api, $, escapeHTML } from './main.js';

(async function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

  async function main() {
    // === 🔹 Setup & URL Params
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');
    const errorBox = $('#errorMsg');

    if (!userId) {
      return showError('No user ID provided.');
    }

    try {
      // === 🔹 Fetch Public Profile
      const profile = await api(`/api/profile/${userId}`);
      console.log('PROFILE data:', profile);

      // === 🔸 Handle Private or Missing Profile
      if (!profile || profile.profilePublic === false) {
        showError("This user's profile is private or does not exist.");
        return;
      }

      const fallbackPhoto = '/default-avatar.png';
      const displayName = escapeHTML(profile.displayName || profile.name || 'User');

      // === 🔸 Display Name
      const nameEl = $('#userName');
      if (nameEl) nameEl.textContent = displayName;

      // === 🔸 Profile Photo (with fallback)
      const img = $('#profilePhoto');
      if (img) {
        img.src = profile.profilePhotoUrl || profile.profilePhoto || fallbackPhoto;
        img.alt = `${displayName}'s profile photo`;
        img.classList.remove('hidden');
        img.onerror = () => {
          img.onerror = null;
          img.src = fallbackPhoto;
        };
      }

      // === 🔸 Email (only if public)
      const emailWrap = $('#userEmail');
      const emailVal = $('#userEmailValue');
      if (emailWrap && emailVal && profile.email) {
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

      // === 🔸 (Optional) Multiple Quotes
      const quotesBox = $('#userQuotesBox');
      const quotesList = $('#userQuotesList');
      if (quotesBox && quotesList && Array.isArray(profile.favoriteQuotes) && profile.favoriteQuotes.length > 0) {
        profile.favoriteQuotes.forEach(q => {
          const li = document.createElement('li');
          li.textContent = escapeHTML(q);
          quotesList.appendChild(li);
        });
        quotesBox.classList.remove('hidden');
      }

    } catch (err) {
      console.error('[profile.js] Failed to load profile:', err);

      // === 🔹 Handle 404 (private or not found)
      if (err?.status === 404) {
        showError("This user's profile is private or does not exist.");
      } else {
        showError(err?.error || 'Failed to load user profile.');
      }
    }

    // === 🔹 Shared Error Display
    function showError(msg) {
      if (!errorBox) return;
      errorBox.textContent = msg;
      errorBox.classList.remove('hidden');
    }
  }
})();
