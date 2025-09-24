/**
 * auth-ui.js
 * Shared header auth controls for ALL pages:
 * - Shows Login/Register when logged out
 * - Shows Account/Logout when logged in
 * - Handles logout click (POST /api/auth/logout)
 *
 * Usage:
 *  - Include <script type="module" src="auth-ui.js"></script> on pages with a nav
 *  - Ensure your HTML has elements with ids: authLink, regLink, accountLink, logoutBtn
 */

import { api, me } from './main.js';

// Shortcuts to elements (may be missing on some pages; that's OK)
const $ = (id) => document.getElementById(id);
const authLink = $('authLink');
const regLink = $('regLink');
const accountLink = $('accountLink');
const logoutBtn = $('logoutBtn');

window.addEventListener('DOMContentLoaded', initAuthUI);

async function initAuthUI() {
  try {
    const { user } = await api('/api/auth/me').catch(() => ({ user: null }));

    const loggedIn = !!user;

    // Toggle visibility based on auth state
    toggle(authLink, !loggedIn);
    toggle(regLink, !loggedIn);
    toggle(accountLink, loggedIn);
    toggle(logoutBtn, loggedIn);

    // Wire logout if button exists
    if (logoutBtn) {
      logoutBtn.addEventListener('click', onLogout);
    }
  } catch (e) {
    // If /me fails, default to logged-out UI
    toggle(authLink, true);
    toggle(regLink, true);
    toggle(accountLink, false);
    toggle(logoutBtn, false);
    console.warn('[auth-ui] /me failed:', e?.message || e);
  }
}

/** Helper to show/hide */
function toggle(el, show) {
  if (!el) return;
  el.style.display = show ? '' : 'none';
}

/** POST /logout then reload the page */
async function onLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    console.warn('[auth-ui] logout error:', e?.message || e);
  } finally {
    // Reload to reset page state (composer visibility, etc.)
    window.location.reload();
  }
}
