// Frontend/public/main.js

/* ---------------- HTTP helper + silent refresh for admin routes ---------------- */
const JSON_HEADERS = { 'Content-Type': 'application/json' };


function makeUrl(url, params = {}) {
  const keys = Object.keys(params);
  if (keys.length === 0) return url;
  const esc = encodeURIComponent;
  const query = keys
    .map(k => `${esc(k)}=${esc(params[k])}`)
    .join('&');
  return url + (url.includes('?') ? '&' : '?') + query;
}

export async function api(url, opts = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
    params = {},        // new: support query params
    nocache = false,
    skipHtmlRedirect = false
  } = opts;

  const finalHeaders = { ...JSON_HEADERS, ...headers };
  const upper = String(method).toUpperCase();

  if (!['GET', 'HEAD', 'OPTIONS'].includes(upper)) {
    const csrf = getCsrfToken();
    if (csrf) {
      finalHeaders['X‑CSRF‑Token'] = csrf;
    }
  }

  const fullUrl = makeUrl(url, params);

  async function doFetch() {
    return fetch(fullUrl, {
      method: upper,
      headers: finalHeaders,
      credentials: 'include',
      cache:   nocache ? 'no-store' : 'default',
      body:    body ? JSON.stringify(body) : undefined
    });
  }

  let res = await doFetch();

  if (res.status === 401 && fullUrl.startsWith('/api/admin/')) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      res = await doFetch();
    }
  }

  const ct     = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const isHtml = ct.includes('text/html');
  const text   = await res.text();

  if (!skipHtmlRedirect && isHtml &&
      (text.includes('<title>Sign in') ||
       (text.includes('input') && text.includes('password') && text.includes('email'))) ) {
    console.warn('🔒 Detected login HTML in api response — redirecting to login.');
    window.location.href = '/login.html';
    return {};
  }

  const data = isJson ? JSON.parse(text) : text;
  if (!res.ok) {
    const err = (typeof data === 'object' && data) ? data : { error: String(data || 'Request failed') };
    throw err;
  }
  return data;
}

async function tryRefreshSession() {
  try {
    const r = await fetch('/api/auth/refresh', {
      method:      'POST',
      credentials: 'include',
      headers:      { 'Content-Type': 'application/json' }
    });
    return r.ok;
  } catch (e) {
    console.error('Silent admin refresh failed:', e);
    return false;
  }
}

/* ---------------- Auth state ---------------- */
export let me = null;
export async function refreshMe() {
  try {
    const data = await api('/api/auth/me', { nocache: true });
    me = data?.user ?? null;
  } catch {
    me = null;
  }
  updateNav();
  return me;
}

/* ---------------- Tiny DOM helpers ---------------- */
export const $  = id  => document.getElementById(id);
export const q  = sel => document.querySelector(sel);
export const qa = sel => Array.from(document.querySelectorAll(sel));

export function escapeHTML(s = '') {
  return String(s)
    .replaceAll('&',  '&amp;')
    .replaceAll('<',  '&lt;')
    .replaceAll('>',  '&gt;')
    .replaceAll('"',  '&quot;')
    .replaceAll("'", '&#039;');
}

export function timeAgo(v) {
  const d = (typeof v === 'string' || typeof v === 'number')
            ? new Date(v)
            : (v instanceof Date ? v : new Date());
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s/60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h/24); if (d2 < 7) return `${d2}d ago`;
  return d.toLocaleDateString();
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' +
    name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function getCsrfToken() {
  return getCookie('csrf') || '';
}

/* ---------------- Nav + admin link hiding ---------------- */
function navRoot() {
  return document.querySelector('header nav') || document.querySelector('nav');
}

function navRight() {
  const nav = navRoot();
  if (!nav) return null;
  let right = nav.querySelector('.nav-right');
  if (!right) {
    right = document.createElement('div');
    right.className = 'nav-right row items-center gap-075';
    nav.appendChild(right);
  }
  return right;
}

function keepFirst(selector) {
  const nodes = qa(selector);
  if (nodes.length <= 1) return nodes[0] || null;
  for (let i = 1; i < nodes.length; i++) nodes[i].remove();
  return nodes[0];
}

function ensureLogin() {
  const right = navRight();
  if (!right) return null;
  let a = keepFirst('#loginLink') || keepFirst('a[href$="login.html"]');
  if (!a) {
    a = document.createElement('a');
    a.href = 'login.html';
    a.textContent = 'Login';
    right.appendChild(a);
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
    right.appendChild(a);
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
    right.appendChild(b);
  }
  if (!b.dataset.wired) {
    b.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        console.warn('[logout] error:', err);
      } finally {
        me = null;
        updateNav();
        window.location.replace('login.html');
      }
    });
    b.dataset.wired = '1';
  }
  return b;
}

function ensureAdminLink() {
  const nav = navRoot();
  if (!nav) return null;
  const left = nav.querySelector('.nav-left') || nav;
  let a = left.querySelector('a[href$="admin.html"]');
  if (!a) {
    a = document.createElement('a');
    a.href = 'admin.html';
    a.textContent = 'Admin';
    a.classList.add('admin-link', 'hidden');
    left.appendChild(a);
  }
  return a;
}

function ensureControls() {
  if (!navRoot()) return;
  ensureAdminLink();
  const login    = ensureLogin();
  const register = ensureRegister();
  const logout   = ensureLogout();
  return { login, register, logout };
}

function updateNav() {
  const controls = ensureControls();
  if (!controls) return;
  const { login, register, logout } = controls;
  const adminLink = document.querySelector('a[href$="admin.html"]');
  const loggedIn = !!me;

  if (logout)   logout.style.display   = loggedIn ? 'inline-block' : 'none';
  if (login)    login.style.display    = loggedIn ? 'none'       : 'inline-block';
  if (register) register.style.display = loggedIn ? 'none'       : 'inline-block';

  if (adminLink) {
    if (me?.role === 'admin') {
      adminLink.classList.remove('hidden');
      adminLink.style.display = 'inline-block';
    } else {
      adminLink.classList.add('hidden');
      adminLink.style.display = 'none';
    }
  }
}

/* ---------------- Boot + mutation observer ---------------- */
let started = false;
function start() {
  if (started) return;
  started = true;

  ensureControls();
  refreshMe();

  setTimeout(() => { ensureControls(); updateNav(); }, 50);
  setTimeout(() => { ensureControls(); updateNav(); }, 200);

  const mo = new MutationObserver(() => {
    keepFirst('#logoutBtn');
    keepFirst('#loginLink');
    keepFirst('#registerLink');
    updateNav();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

document.addEventListener('nav:ready', () => {
  ensureControls();
  updateNav();
});

/* ---------------- Debug helper ---------------- */
window.__authDebug = () => ({
  me,
  hasLogin:     !!$('#loginLink'),
  hasRegister:  !!$('#registerLink'),
  hasLogout:    !!$('#logoutBtn'),
  adminVisible: !document.querySelector('a[href$="admin.html"]')?.classList.contains('hidden')
});

/* ✅ Export alias for compatibility */
export const apiFetch = api;
