// Frontend/public/nav.js
// Inject site header, then signal 'nav:ready'

import { api } from './utils.js';

(async function initHeader() {
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

    // Fetch current user
    const user = await api('/api/users/profile', { method: 'GET' }).catch(() => null);

    if (user?._id) {
      const navRight = document.querySelector('.nav-right') || header.querySelector('.row');

      // Hide login/register
      document.getElementById('loginLink')?.classList.add('hidden');
      document.getElementById('registerLink')?.classList.add('hidden');

      // Show admin link if role is admin
      if (user.role === 'admin') {
        document.querySelector('a[href="admin.html"]')?.classList.remove('hidden');
      }

      // Add "My Profile" and "Edit Profile"
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

      // Show logout button
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.style.display = '';
        logoutBtn.addEventListener('click', async () => {
          try {
            await api('/api/auth/logout', { method: 'POST' });
          } catch (_) {}
          location.href = '/login.html';
        });
      }

      // === 🔔 Add notification bell ===
      const bell = document.createElement('a');
      bell.href = 'notifications.html';
      bell.className = 'btn ghost notification-bell';
      bell.innerHTML = '🔔';

      const countSpan = document.createElement('span');
      countSpan.className = 'notification-count';
      bell.appendChild(countSpan);
      navRight?.insertBefore(bell, navRight.firstChild);

      try {
        const unreadData = await api('/api/notifications/unread-count');
        if (unreadData?.count > 0) {
          countSpan.textContent = unreadData.count;
          countSpan.style.display = 'inline-block';
        } else {
          countSpan.style.display = 'none';
        }
      } catch (e) {
        console.warn('[nav] notification count fetch failed:', e);
      }
    }

  } catch (e) {
    console.error('[nav] header inject failed:', e);
  } finally {
    document.dispatchEvent(new CustomEvent('nav:ready'));
  }
})();
