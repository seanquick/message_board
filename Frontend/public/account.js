// Frontend/public/account.js
import { api, $, refreshMe, me } from './main.js';

const q = sel => document.querySelector(sel);

async function loadMyProfile() {
  try {
    const resp = await api('/api/users/profile', { method: 'GET' });

    if (resp.displayName)     q('#displayNameInput').value   = resp.displayName;
    if (resp.bio)             q('#bioInput').value           = resp.bio;
    if (resp.favoriteQuote)   q('#favoriteQuoteInput').value = resp.favoriteQuote;

    // Set privacy toggles
    q('#profilePublicInput').checked = !!resp.profilePublic;
    q('#emailPublicInput').checked   = !!resp.emailPublic;

    if (resp.profilePhoto) {
      const img = q('#profilePhotoPreview');
      img.src = resp.profilePhoto;
      img.hidden = false;
    }

  } catch (e) {
    console.error('Error loading profile:', e);
    const errEl = q('#profileErr');
    if (errEl) {
      errEl.textContent = e?.error || 'Failed to load profile';
      errEl.hidden = false;
    }
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
  q('#saveMsg').hidden   = true;

  try {
    let photoUrl = '';

    // If a new photo file is selected, upload it first
    const fileInput = q('#profilePhotoInput');
    if (fileInput.files && fileInput.files[0]) {
      const formData = new FormData();
      formData.append('profilePhoto', fileInput.files[0]);

      const uploadResp = await fetch('/api/users/profile/photo', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) throw new Error(uploadData.error || 'Photo upload failed');
      photoUrl = uploadData.profilePhotoUrl || '';
    }

    // Prepare body with new profile data + privacy flags
    const body = {
      displayName:   q('#displayNameInput').value.trim(),
      bio:           q('#bioInput').value.trim(),
      favoriteQuote: q('#favoriteQuoteInput').value.trim(),
      profilePhoto:  photoUrl,                       // will be empty string if none uploaded
      profilePublic: q('#profilePublicInput').checked,
      emailPublic:   q('#emailPublicInput').checked
    };

    await api('/api/users/profile', {
      method: 'POST',
      body
    });

    q('#saveMsg').hidden = false;

  } catch (e) {
    console.error('Error saving profile:', e);
    const errEl = q('#profileErr');
    if (errEl) {
      errEl.textContent = e?.message || 'Failed to save profile';
      errEl.hidden = false;
    }
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  // First ensure user is authenticated
  await refreshMe();
  if (!me?.id) {
    window.location.href = '/login.html';
    return;
  }

  // Load profile side data
  loadMyProfile();

  // Also ensure password form logic still works (if present)
  const pwForm = $('#pwForm');
  const msg    = $('#msg');
  if (pwForm && msg) {
    pwForm.addEventListener('submit', async e => {
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
        pwForm.reset();
      } catch (err) {
        msg.textContent = err.message || 'Failed to update password.';
        msg.className = 'err';
      }
    });
  }
});
