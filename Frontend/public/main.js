// Frontend/public/main.js
// Robust helpers + nav that self-heals AND de-duplicates controls.

/* ---------------- HTTP helper ---------------- */
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function api(url, opts = {}) {
  const { method = 'GET', body, headers = {}, nocache = false } = opts;
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };

  // Attach CSRF header for mutating requests
  const upper = String(method).toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(upper)) {
    const csrf = getCsrfToken();
    if (csrf) finalHeaders['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(url, {
    method: upper,
    headers: finalHeaders,
    credentials: 'include',
    cache: nocache ? 'no-store' : 'default',
    body: body ? JSON.stringify(body) : undefined
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const err = (typeof data === 'object' && data) ? data : { error: String(data || 'Request failed') };
    throw err;
  }
  return data;
}


/* ---------------- Auth state ---------------- */
export let me = null;
export async function refreshMe() {
  try {
    const data = await api('/api/auth/me', { nocache: true });
    me = data?.user ?? null;
  } catch { me = null; }
  updateNav();
  return me;
}

/* ---------------- Tiny DOM helpers ---------------- */
export const $  = (id)  => document.getElementById(id);
export const q  = (sel) => document.querySelector(sel);
export const qa = (sel) => Array.from(document.querySelectorAll(sel));

export function escapeHTML(s = '') {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function timeAgo(v) {
  const d = typeof v === 'string' || typeof v === 'number' ? new Date(v)
        : v instanceof Date ? v : new Date();
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24); if (d2 < 7) return `${d2}d ago`;
  return d.toLocaleDateString();
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function getCsrfToken() {
  return getCookie('csrfToken') || '';
}

/* ---------------- Nav: self-heal + de-dupe ---------------- */
 function navRoot() {
   // Prefer header > nav; fallback to first nav; DO NOT create a new header here.
   return document.querySelector('header nav') || document.querySelector('nav');
 }

 function navRight() {
   const nav = navRoot();
   if (!nav) return null; // wait for nav.js to inject header
   let right = nav.querySelector('.nav-right');
   if (!right) {
     right = document.createElement('div');
     right.className = 'nav-right row items-center gap-075';
     nav.appendChild(right);
   }
   return right;
 }

/** Keep only the first of a selector; remove the rest (de-dupe). */
function keepFirst(selector) {
  const nodes = qa(selector);
  if (nodes.length <= 1) return nodes[0] || null;
  for (let i = 1; i < nodes.length; i++) nodes[i].remove();
  return nodes[0];
}

/** Find or create a control. De-dupes before returning. */
function ensureLogin() {
  const right = navRight();
  if (!right) return null;
  let a = keepFirst('#loginLink') || keepFirst('a[href$="login.html"]');
  if (!a) {
    a = document.createElement('a');
    a.href = 'login.html';
    a.textContent = 'Login';
    navRight().appendChild(a);
  }
  a.id = 'loginLink';
  return a;
}
function ensureRegister() {
  const right = navRight();
  if (!right) return null;
  let a = keepFirst('#registerLink') || keepFirst('a[href$="register.html"]');
  if (!a) {
    a = document.createElement('a');
    a.href = 'register.html';
    a.textContent = 'Register';
    navRight().appendChild(a);
  }
  a.id = 'registerLink';
  return a;
}

function ensureLogout() {
  const right = navRight();
  if (!right) return null;

  let b = keepFirst('#logoutBtn');
  if (!b) {
    b = document.createElement('button');
    b.id = 'logoutBtn';
    b.className = 'btn';
    b.textContent = 'Logout';
    b.style.display = 'none';
    navRight().appendChild(b);
  }

  if (!b.dataset.wired) {
    b.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        console.warn('[logout] error (continuing to login):', err);
      } finally {
        me = null;
        updateNav();
        window.location.replace('login.html');
      }
    });
    b.dataset.wired = '1';
  }

  // ✅ Always return the button, even if it was already wired
  return b;
}

  
 
/** Ensure an Admin link exists (we only toggle visibility later). */
function ensureAdminLink() {
  const nav = navRoot();
  if (!nav) return null; // header/nav not ready yet; we'll try again on 'nav:ready'

  const left = nav.querySelector('.nav-left') || nav;
  let a = left.querySelector('a[href$="admin.html"]');
  if (!a) {
    a = document.createElement('a');
    a.href = 'admin.html';
    a.textContent = 'Admin';
    a.classList.add('hidden'); // hidden until role=admin
    left.appendChild(a);
  }
  return a;
}

function ensureControls() {
  // Header/nav may not be injected yet; bail and try again when we get 'nav:ready'
  if (!navRoot()) return;
  ensureAdminLink();
  const login    = ensureLogin();
  const register = ensureRegister();
  const logout   = ensureLogout();
  return { login, register, logout };
}

function updateNav() {
  const controls = ensureControls();
  if (!controls) return; // nav/header not ready yet; will run again on 'nav:ready'
  const { login, register, logout } = controls;
//  const { login, register, logout } = ensureControls();
  const adminLink = document.querySelector('a[href$="admin.html"]');
  const loggedIn = !!me;

  if (logout)  logout.style.display    = loggedIn ? 'inline-block' : 'none';
  if (login)   login.style.display     = loggedIn ? 'none' : 'inline-block';
  if (register)register.style.display  = loggedIn ? 'none' : 'inline-block';

  if (adminLink) {
    if (me?.role === 'admin') adminLink.classList.remove('hidden');
    else                      adminLink.classList.add('hidden');
  }
}

/* ---------------- Boot + observers ---------------- */
let started = false;
function start() {
  if (started) return;
  started = true;

  // Initial ensure + fetch auth
  ensureControls();
  refreshMe();

  // Retry shortly (covers late header injection)
  setTimeout(() => { ensureControls(); updateNav(); }, 50);
  setTimeout(() => { ensureControls(); updateNav(); }, 200);

  // Observe DOM: if header/nav changes, re-ensure and re-toggle
  const mo = new MutationObserver(() => {
    // De-dupe on any header/nav change
    keepFirst('#logoutBtn');
    keepFirst('#loginLink');
    keepFirst('#registerLink');
    updateNav();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

// document.addEventListener('DOMContentLoaded', start);
 if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', start);
 } else {
   // DOM is already parsed; run immediately
   start();
 }

// If nav.js injects header.html, it will dispatch this event:
document.addEventListener('nav:ready', () => { ensureControls(); updateNav(); });

/* ---------------- Debug helper ---------------- */
window.__authDebug = () => ({
  me,
  hasLogin: !!$('#loginLink'),
  hasRegister: !!$('#registerLink'),
  hasLogout: !!$('#logoutBtn'),
  adminVisible: !document.querySelector('a[href$="admin.html"]')?.classList?.contains('hidden')
});
