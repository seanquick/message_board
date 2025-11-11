// Frontend/public/account.js
import { api, $, refreshMe, me } from './main.js';

const q = sel => document.querySelector(sel);

async function loadMyProfile() {
  // Only run on pages with the profile form
  if (!q('#profileForm')) return;

  try {
    const resp = await api('/api/users/profile', { method: 'GET' });

    q('#displayNameInput')?.value     = resp.displayName || '';
    q('#bioInput')?.value             = resp.bio || '';
    q('#favoriteQuoteInput')?.value   = resp.favoriteQuote || '';
    q('#profilePublicInput')?.checked = !!resp.profilePublic;
    q('#emailPublicInput')?.checked   = !!resp.emailPublic;

    if (resp.profilePhoto && q('#profilePhotoPreview')) {
      q('#profilePhotoPreview').src    = resp.profilePhoto;
      q('#profilePhotoPreview').hidden = false;
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
    if (img) {
      img.src = e.target.result;
      img.hidden = false;
    }
  };
  reader.readAsDataURL(file);
});

q('#profileForm')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  q('#profileErr')?.classList.add('hidden');
  q('#saveMsg')?.classList.add('hidden');

  try {
    let photoUrl = '';

    const fileInput = q('#profilePhotoInput');
    if (fileInput?.files?.[0]) {
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

    const body = {
      displayName:   (q('#displayNameInput')?.value || '').trim(),
      bio:           (q('#bioInput')?.value || '').trim(),
      favoriteQuote: (q('#favoriteQuoteInput')?.value || '').trim(),
      profilePhoto:  photoUrl,
      profilePublic: q('#profilePublicInput')?.checked || false,
      emailPublic:   q('#emailPublicInput')?.checked || false
    };


    await api('/api/users/profile', {
      method: 'POST',
      body
    });

    q('#saveMsg')?.classList.remove('hidden');

  } catch (e) {
    console.error('Error saving profile:', e);
    const errEl = q('#profileErr');
    if (errEl) {
      errEl.textContent = e?.message || 'Failed to save profile';
      errEl.classList.remove('hidden');
    }
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  await refreshMe();
  if (!me?.id) {
    window.location.href = '/login.html';
    return;
  }

  loadMyProfile();

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
