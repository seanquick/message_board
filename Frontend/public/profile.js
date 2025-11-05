// Frontend/public/profile.js
import { api, $, escapeHTML } from './main.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');

  if (!userId) {
    $('#errorMsg').textContent = 'No user ID provided';
    $('#errorMsg').hidden = false;
    return;
  }

  try {
    const profile = await api(`/api/users/${userId}`);

    $('#userName').textContent = escapeHTML(profile.displayName || profile.name || 'User');

    const img = $('#profilePhoto');
    img.src = profile.profilePhoto || '/default-avatar.png';
    img.alt = `${profile.displayName || profile.name || 'User'}'s photo`;
    img.hidden = false;

    img.onerror = () => {
      img.onerror = null;
      img.src = '/default-avatar.png';
    };

    if (profile.bio) {
      $('#userBio').textContent = profile.bio;
      $('#userBio').hidden = false;
    }

    if (profile.favoriteQuote) {
      $('#userQuoteText').textContent = profile.favoriteQuote;
      $('#userQuoteBox').hidden = false;
    }

  } catch (err) {
    console.error('[profile.js] Failed to load profile:', err);
    $('#errorMsg').textContent = err?.error || 'Failed to load user profile';
    $('#errorMsg').hidden = false;
  }
});
