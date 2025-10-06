// Frontend/public/admin.js
import { api, escapeHTML, timeAgo, q, $, qa, refreshMe, me as meVar } from './main.js';

let meUser = null;

function showErr(msg) {
  const host = q('#adminErr') || document.body;
  const div = document.createElement('div');
  div.className = 'err';
  div.textContent = msg;
  host.prepend(div);
}

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function ensureTbody(selector) {
  const tbl = q(selector);
  if (!tbl) return null;
  let tb = tbl.querySelector('tbody');
  if (!tb) {
    tb = document.createElement('tbody');
    tbl.appendChild(tb);
  }
  return tb;
}

function pagesFor(p) {
  if (!p.limit || !p.total) return 1;
  return Math.ceil(p.total / p.limit);
}

function updatePagerUI(section, pages) {
  if (section === 'users') {
    const el = q('#uPageInfo');
    if (el) el.textContent = `${state.users.page} / ${pages}`;
  }
}

function setText(selector, text) {
  const el = q(selector);
  if (el) el.textContent = text;
}

function renderErrorRow(tableSelector, msg, colspan = 5) {
  const tbody = ensureTbody(tableSelector);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="err">${escapeHTML(msg)}</td></tr>`;
}

const state = {
  users: { page: 1, limit: 50, total: 0 }
};

async function loadUsers() {
  const tbody = ensureTbody('#usersTable');
  if (!tbody) {
    console.error('No usersTable in DOM');
    return;
  }

  try {
    const searchEl = q('#uSearch') || q('#userSearch');
    const qstr = (searchEl?.value || '').trim();
    const params = new URLSearchParams();
    if (qstr) params.set('q', qstr);
    params.set('page', String(state.users.page));
    params.set('limit', String(state.users.limit));
    params.set('t', String(Date.now()));

    const payload = await api(`/api/admin/users?${params.toString()}`, { nocache: true });
    const users = Array.isArray(payload) ? payload :
      Array.isArray(payload?.users) ? payload.users :
      Array.isArray(payload?.data) ? payload.data : [];

    state.users.total = Number(payload?.total ?? users.length ?? 0);
    const pages = pagesFor(state.users);
    updatePagerUI('users', pages);

    tbody.innerHTML = '';
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7">No users found.</td></tr>';
      return;
    }

    for (const u of users) {
      const tr = document.createElement('tr');
      tr.dataset.id = u._id;
      const nameLink = u.name
        ? `<a href="#" class="user-link" data-uid="${u._id}">${escapeHTML(u.name)}</a>`
        : `<a href="#" class="user-link" data-uid="${u._id}">${escapeHTML(u.email)}</a>`;
      tr.innerHTML = `
        <td>${nameLink}<br><span class="meta">${escapeHTML(u.email)}</span></td>
        <td>${escapeHTML(u.role || 'user')}</td>
        <td>${u.isBanned ? '<span class="danger">Banned</span>' : '<span class="ok">Active</span>'}</td>
        <td>${timeAgo(u.createdAt || Date.now())}</td>
        <td class="truncate">${escapeHTML(u.notes || '')}</td>
        <td class="row gap-05">
          <button class="btn tiny deleteUser">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.deleteUser').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const id = tr?.dataset.id;
        if (!id) return;
        if (!confirm('Delete user?')) return;
        try {
          await api(`/api/admin/users/${id}`, { method: 'DELETE' });
          tr.remove();
        } catch (e) {
          showErr(`Failed to delete user: ${e?.error || e?.message}`);
        }
      });
    });

  } catch (e) {
    showErr(`Failed to load users: ${e?.error || e?.message}`);
  }
}

async function init() {
  try {
    await refreshMe();
    meUser = meVar;

    try {
      await api(`/api/admin/ping?t=${Date.now()}`);
    } catch (e) {
      const errMsg = String(e?.error || e?.message || '');
      if (/revoked|expired|token/i.test(errMsg)) {
        let refreshed = false;
        try { await api('/api/auth/refresh', { method: 'POST' }); refreshed = true; }
        catch {
          try { await api('/api/admin/refresh', { method: 'POST' }); refreshed = true; } catch {}
        }
        if (refreshed) {
          await api(`/api/admin/ping?t=${Date.now()}`);
        } else {
          throw new Error('Could not refresh as admin');
        }
      } else {
        throw e;
      }
    }

    q('#uRefresh')?.addEventListener('click', () => {
      state.users.page = 1;
      loadUsers();
    });

    q('#uSearch')?.addEventListener('input', debounce(() => {
      state.users.page = 1;
      loadUsers();
    }));

    loadUsers().catch(console.error);

  } catch (err) {
    showErr(`Init failed: ${err?.message || err}`);
    console.error('Init error', err);
  }
}

if (document.readyState !== 'loading') {
  init();
}
document.addEventListener('DOMContentLoaded', init);
