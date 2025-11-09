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
      const profile = await api(`/api/users/${userId}`, { method: 'GET' });
      console.log('PROFILE data:', profile);

      // Name
      const nameEl = $('#userName');
      if (nameEl) {
        nameEl.textContent = escapeHTML(profile.displayName || profile.name || 'User');
      }

      // Profile Photo
      const img = $('#profilePhoto');
      const fallback = '/default-avatar.png';
      let photo = profile.profilePhotoUrl || profile.profilePhoto;
      if (!photo || !photo.trim()) photo = fallback;

      if (img) {
        img.src = photo;
        img.alt = `${profile.displayName || profile.name || 'User'}'s photo`;
        img.hidden = false;

        img.onerror = () => {
          img.onerror = null;
          img.src = fallback;
        };
      }

      // Bio
      const bioEl = $('#userBio');
      if (bioEl) {
        if (profile.bio?.trim()) {
          bioEl.textContent = profile.bio;
          bioEl.hidden = false;
        } else {
          bioEl.hidden = true;
        }
      }

      // Favorite Quote
      const quoteText = $('#userQuoteText');
      const quoteBox = $('#userQuoteBox');
      if (quoteBox && quoteText) {
        if (profile.favoriteQuote?.trim()) {
          quoteText.textContent = profile.favoriteQuote;
          quoteBox.hidden = false;
        } else {
          quoteBox.hidden = true;
        }
      }

      // Email
      let emailEl = $('#userEmail');
      if (!emailEl) {
        emailEl = document.createElement('p');
        emailEl.id = 'userEmail';
        emailEl.className = 'profile-email';
        document.querySelector('.profile-info')?.appendChild(emailEl);
      }
      if (profile.email?.trim()) {
        emailEl.textContent = `Email: ${profile.email}`;
        emailEl.hidden = false;
      } else {
        emailEl.hidden = true;
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
