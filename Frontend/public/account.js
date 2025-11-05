// Frontend/public/account.js
import { api, $, refreshMe, me } from './main.js';

const q = sel => document.querySelector(sel);

async function loadMyProfile() {
  try {
    const resp = await api('/api/users/profile', { method: 'GET' });
    if (resp.displayName) q('#displayNameInput').value = resp.displayName;
    if (resp.bio) q('#bioInput').value = resp.bio;
    if (resp.favoriteQuote) q('#favoriteQuoteInput').value = resp.favoriteQuote;

    if (resp.profilePhoto) {
      const img = q('#profilePhotoPreview');
      img.src = resp.profilePhoto;
      img.hidden = false;
    }
  } catch (e) {
    console.error('Error loading profile:', e);
    q('#profileErr').textContent = e?.error || 'Failed to load profile';
    q('#profileErr').hidden = false;
  }
}

q('#profilePhotoInput')?.addEventListener('change', ev => {
  const file = ev.currentTarget.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = q('#profilePhotoPreview');
    img.src = e.target.result;
    img.hidden = false;
  };
  reader.readAsDataURL(file);
});

q('#profileForm')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  q('#profileErr').hidden = true;
  q('#saveMsg').hidden = true;

  try {
    let photoData = '';
    const fileInput = q('#profilePhotoInput');
    if (fileInput.files && fileInput.files[0]) {
      photoData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = err => reject(err);
        reader.readAsDataURL(fileInput.files[0]);
      });
    }

    const body = {
      displayName: q('#displayNameInput').value.trim(),
      bio: q('#bioInput').value.trim(),
      favoriteQuote: q('#favoriteQuoteInput').value.trim(),
      profilePhoto: photoData
    };

    await api('/api/users/profile', {
      method: 'POST',
      body
    });

    q('#saveMsg').hidden = false;
  } catch (e) {
    console.error('Error saving profile:', e);
    q('#profileErr').textContent = e?.error || 'Failed to save profile';
    q('#profileErr').hidden = false;
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const form = $('#pwForm');
  const msg = $('#msg');
  if (!form || !msg) return;

  await refreshMe(); // update nav

  // Redirect to login if not authenticated
  if (!me?.id) {
    window.location.href = '/login.html';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const oldPassword = $('#old')?.value || '';
    const newPassword = $('#nw')?.value || '';

    if (newPassword.length < 8) {
      msg.textContent = 'New password must be at least 8 characters.';
      msg.className = 'err';
      return;
    }

    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { oldPassword, newPassword }
      });
      msg.textContent = 'Password updated. You’re still logged in.';
      msg.className = 'ok';
      form.reset();
    } catch (err) {
      msg.textContent = err.message || 'Failed to update password.';
      msg.className = 'err';
    }
  });

  // Load profile info
  loadMyProfile();
});
