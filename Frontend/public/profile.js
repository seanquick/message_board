// profile.js
import { api } from './_utils.js';

const q = sel => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const userId = params.get('id');

async function loadProfile() {
  if (!userId) {
    q('#errorMsg').textContent = 'Missing user ID.';
    q('#errorMsg').hidden = false;
    return;
  }

  try {
    const profile = await api(`/api/users/${encodeURIComponent(userId)}`);

    q('#userName').textContent = profile.displayName || profile.name || 'Unnamed User';

    if (profile.profilePhoto) {
      const img = q('#profilePhoto');
      img.src = profile.profilePhoto;
      img.alt = `${profile.displayName || profile.name || 'User'}'s photo`;
      img.hidden = false;
    }

    if (profile.bio) {
      q('#userBio').textContent = profile.bio;
      q('#userBio').hidden = false;
    }

    if (profile.favoriteQuote) {
      q('#userQuoteText').textContent = profile.favoriteQuote;
      q('#userQuoteBox').hidden = false;
    }

    if (Array.isArray(profile.otherQuotes) && profile.otherQuotes.length) {
      const list = q('#userQuotesList');
      list.innerHTML = '';
      profile.otherQuotes.forEach(qt => {
        const li = document.createElement('li');
        li.textContent = qt;
        list.appendChild(li);
      });
      q('#userQuotesBox').hidden = false;
    }
  } catch (err) {
    console.error('Error loading profile:', err);
    q('#errorMsg').textContent = err?.error || 'Failed to load profile';
    q('#errorMsg').hidden = false;
  }
}

loadProfile();
