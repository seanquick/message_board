// Frontend/public/profile.js

import { api, $, escapeHTML } from './main.js';

// === 🔧 Delay until DOM is fully parsed and nav.js finishes injecting
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(main, 50);
});

async function main() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');
  const errorBox = $('#errorMsg');

  if (!userId) {
    return showError('No user ID provided.');
  }

  try {
    const profile = await api(`/api/profile/${userId}`);
    console.log('PROFILE data:', profile);

    console.log('[DOM CHECK]', {
      nameEl: !!$('#userName'),
      photoEl: !!$('#profilePhoto'),
      emailWrap: !!$('#userEmail'),
      emailVal: !!$('#userEmailValue'),
      bioEl: !!$('#userBio'),
      quoteBox: !!$('#userQuoteBox'),
      quoteText: !!$('#userQuoteText'),
    });

    if (!profile || profile.profilePublic === false) {
      return showError("This user's profile is private or does not exist.");
    }

    const fallbackPhoto = '/default-avatar.png';
    const displayName = escapeHTML(profile.displayName || profile.name || 'User');

    const nameEl = $('#userName');
    if (nameEl) nameEl.textContent = displayName;

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

    const emailWrap = $('#userEmail');
    const emailVal = $('#userEmailValue');
    if (emailWrap && emailVal && profile.email?.trim()) {
      emailVal.textContent = escapeHTML(profile.email);
      emailWrap.classList.remove('hidden');
    }

    const bioEl = $('#userBio');
    if (bioEl && profile.bio?.trim()) {
      bioEl.textContent = escapeHTML(profile.bio);
      bioEl.classList.remove('hidden');
    }

    const quoteBox = $('#userQuoteBox');
    const quoteText = $('#userQuoteText');
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

  function showError(msg) {
    const el = $('#errorMsg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}
