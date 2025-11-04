// Frontend/public/nav.js
// Inject site header, then signal 'nav:ready'

import { api } from './utils.js';

(async function initHeader() {
  // Global guard
  if (window.__NAV_INJECTED__) {
    document.dispatchEvent(new CustomEvent('nav:ready'));
    return;
  }
  window.__NAV_INJECTED__ = true;

  try {
    let header = document.querySelector('header.site-header');

    if (!header) {
      const res = await fetch('header.html', { cache: 'no-store', credentials: 'omit' });
      const html = await res.text();

      const wrap = document.createElement('div');
      wrap.innerHTML = html.trim();
      header = wrap.querySelector('header.site-header') || wrap.firstElementChild;

      if (header) {
        header.setAttribute('data-header-injected', '1');
        document.body.prepend(header);
      }
    } else {
      header.setAttribute('data-header-existing', '1');
    }

    // Inject profile links after header loads
    const user = await api('/api/users/profile', { method: 'GET' }).catch(() => null);

    if (user?._id) {
      const navRight = document.querySelector('.nav-right') || header.querySelector('.row');

      if (navRight) {
        const viewLink = document.createElement('a');
        viewLink.href = `profile.html?id=${user._id}`;
        viewLink.textContent = 'My Profile';
        viewLink.className = 'btn ghost';

        const editLink = document.createElement('a');
        editLink.href = 'account.html';
        editLink.textContent = 'Edit Profile';
        editLink.className = 'btn ghost';

        navRight.insertBefore(viewLink, navRight.querySelector('#logoutBtn'));
        navRight.insertBefore(editLink, navRight.querySelector('#logoutBtn'));
      }
    }

    // Logout button
    document.querySelector('#logoutBtn')?.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch (_) {}
      location.href = '/login.html';
    });

  } catch (e) {
    console.error('[nav] header inject failed:', e);
  } finally {
    document.dispatchEvent(new CustomEvent('nav:ready'));
  }
})();
