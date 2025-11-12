// Frontend/public/profile.js
// Handles public user profile rendering on /profile.html
// Depends on main.js for api(), $, and escapeHTML()

import { api, $, escapeHTML } from './main.js';

/* 
  🔹 Wait for nav.js to finish injecting the header
  before running main() — ensures consistent DOM state.
*/
document.addEventListener('nav:ready', main);

async function main() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');
  const errorBox = $('errorMsg');

  if (!userId) {
    return showError('No user ID provided.');
  }

  try {
    // === Fetch the user profile data ===
    const profile = await api(`/api/profile/${userId}`);
    console.log('PROFILE data:', profile);

    // === Validate visibility ===
    if (!profile || profile.profilePublic === false) {
      return showError("This user's profile is private or does not exist.");
    }

    // === Display Name ===
    const displayName = escapeHTML(profile.displayName || profile.name || 'User');
    const nameEl = $('userName');
    if (nameEl) nameEl.textContent = displayName;

    // === Email (if public) ===
    const emailWrap = $('userEmail');
    const emailVal = $('userEmailValue');
    if (emailWrap && emailVal && profile.email?.trim()) {
      emailVal.textContent = escapeHTML(profile.email);
      emailWrap.classList.remove('hidden');
    }

    // === Bio ===
    const bioEl = $('userBio');
    if (bioEl && profile.bio?.trim()) {
      bioEl.textContent = escapeHTML(profile.bio);
      bioEl.classList.remove('hidden');
    }

    // === Favorite Quote ===
    const quoteBox = $('userQuoteBox');
    const quoteText = $('userQuoteText');
    if (quoteBox && quoteText && profile.favoriteQuote?.trim()) {
      quoteText.textContent = escapeHTML(profile.favoriteQuote);
      quoteBox.classList.remove('hidden');
    }

  } catch (err) {
    console.error('[profile.js] Failed to load profile:', err);
    if (err?.status === 404) {
      showError("This user's profile is private or does not exist.");
    } else {
      showError(err?.error || 'Failed to load user profile.');
    }
  }

  // === Error Display Helper ===
  function showError(msg) {
    const el = $('errorMsg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}
