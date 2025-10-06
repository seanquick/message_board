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

function formatDate(d = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

function fillTemplate(str, ctx = {}) {
  const base = {
    admin: meUser?.name || meUser?.email || 'admin',
    date: formatDate(new Date()),
    targetType: ctx.targetType || '',
    threadId: ctx.threadId || '',
    commentId: ctx.commentId || '',
    category: ctx.category || '',
    action: ctx.action || 'Resolved',
  };
  const s1 = str.replace(/\{commentId\?\}/g, base.commentId ? base.commentId : '');
  return s1.replace(/\{(\w+)\}/g, (_m, key) => String(base[key] ?? ''));
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
  if (section === 'comments') {
    const el = q('#cPageInfo');
    if (el) el.textContent = `${state.comments.page} / ${pages}`;
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

/**** State for pagination etc ****/
const state = {
  users: { page: 1, limit: 50, total: 0 },
  comments: { page: 1, limit: 50, total: 0 }
};

/**** --- USERS section --- ****/

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
          <button class="btn tiny editNote">Edit Note</button>
          <button class="btn tiny toggleBan">${u.isBanned ? 'Unban' : 'Ban'}</button>
          <button class="btn tiny setRole" data-role="${u.role === 'admin' ? 'user' : 'admin'}">
            ${u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
          </button>
          <button class="btn tiny deleteUser" style="color:red">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.editNote').forEach(btn => btn.addEventListener('click', onEditUserNote));
    tbody.querySelectorAll('.toggleBan').forEach(btn => btn.addEventListener('click', onToggleBan));
    tbody.querySelectorAll('.setRole').forEach(btn => btn.addEventListener('click', onSetRole));
    tbody.querySelectorAll('.deleteUser').forEach(btn => btn.addEventListener('click', onDeleteUser));
    tbody.querySelectorAll('.user-link').forEach(a => a.addEventListener('click', onUserLinkClick));

  } catch (e) {
    showErr(`Failed to load users: ${e?.error || e?.message}`);
  }
}

async function onToggleBan(ev) {
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset.id;
  if (!id) return;
  if (!confirm('Toggle ban for this user?')) return;

  try {
    const res = await api(`/api/admin/users/${id}/toggle-ban`, { method: 'POST' });
    const statusCell = tr.children[2];
    const btn = tr.querySelector('.toggleBan');
    if (res.isBanned) {
      statusCell.innerHTML = '<span class="danger">Banned</span>';
      btn.textContent = 'Unban';
    } else {
      statusCell.innerHTML = '<span class="ok">Active</span>';
      btn.textContent = 'Ban';
    }
  } catch (e) {
    showErr(e?.message || 'Failed to toggle ban');
  }
}

async function onSetRole(ev) {
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset.id;
  const next = ev.currentTarget.getAttribute('data-role');
  if (!id || !next) return;
  if (!confirm(`Set role to "${next}"?`)) return;

  try {
    const res = await api(`/api/admin/users/${id}/role`, { method: 'POST', body: { role: next } });
    tr.children[1].textContent = res.role;
    ev.currentTarget.setAttribute('data-role', res.role === 'admin' ? 'user' : 'admin');
    ev.currentTarget.textContent = res.role === 'admin' ? 'Revoke Admin' : 'Make Admin';
  } catch (e) {
    showErr(e?.message || 'Failed to set role');
  }
}

async function onEditUserNote(ev) {
  const tr = ev.currentTarget.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;

  showModEditor(tr, {
    title: 'Edit user note',
    placeholder: 'Private admin note…',
    confirmLabel: 'Save note',
    onConfirm: async (note) => {
      const final = note || '';
      try {
        await api(`/api/admin/users/${id}/note`, { method: 'POST', body: { note: final } });
        if (tr.children[4]) tr.children[4].textContent = final;
      } catch (e) {
        showErr(e?.message || 'Failed to save note');
      }
    }
  });
}

async function onDeleteUser(ev) {
  ev.stopPropagation();
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset.id;
  if (!id) return;
  if (!confirm('Are you sure you want to delete this user?')) return;

  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    tr.remove();
  } catch (e) {
    showErr(e?.error || e?.message || 'Failed to delete user');
  }
}

async function onUserLinkClick(ev) {
  ev.preventDefault();
  const a = ev.currentTarget;
  const uid = a.dataset.uid;
  if (!uid) return;

  try {
    const payload = await api(`/api/admin/users/${uid}/content`);
    showUserContentModal(uid, payload.threads || [], payload.comments || []);
  } catch (e) {
    showErr(`Failed to fetch user content: ${e?.error || e?.message}`);
  }
}

function showUserContentModal(uid, threads, comments) {
  const modal = document.createElement('div');
  modal.className = 'user-content-modal';
  modal.style = 'position:fixed;top:10%;left:10%;width:80%;height:80%;background:white;overflow:auto;z-index:10000;padding:1rem;border:1px solid #ccc';
  modal.innerHTML = `
    <button class="close-modal" style="position:absolute;top:1rem;right:1rem">Close</button>
    <h2>User: ${escapeHTML(uid)}</h2>
    <h3>Threads (${threads.length})</h3>
    ${threads.map(t => `<div><a href="thread.html?id=${encodeURIComponent(t._id)}" target="_blank">${escapeHTML(t.title || '(untitled)')}</a></div>`).join('')}
    <h3>Comments (${comments.length})</h3>
    ${comments.map(c => `<div>${escapeHTML(c.body || '')} <em>(thread: ${escapeHTML(String(c.thread))})</em></div>`).join('')}
  `;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
}

/**** --- THREADS section (admin controls) ****/

async function loadThreads() {
  const tbody = ensureTbody('#threadsTable');
  if (!tbody) return;
  try {
    const includeDeleted = q('#tIncludeDeleted')?.checked;
    const params = new URLSearchParams();
    params.set('t', String(Date.now()));
    if (includeDeleted) params.set('includeDeleted', '1');
    const { results } = await api(`/api/admin/search?type=threads&${params.toString()}`, { nocache: true });
    tbody.innerHTML = '';
    if (!Array.isArray(results) || !results.length) {
      tbody.innerHTML = '<tr><td colspan="7">No threads found.</td></tr>';
      return;
    }
    for (const t of results) {
      const tr = document.createElement('tr');
      tr.dataset.id = t._id;
      tr.innerHTML = `
        <td>${new Date(t.createdAt).toLocaleString()}</td>
        <td>${escapeHTML(t.title || '(no title)')}</td>
        <td>${escapeHTML(t.authorId || '')}</td>
        <td>${t.upvotes || 0}</td>
        <td>${escapeHTML(String(t.comments || ''))}</td>
        <td>${t.status || ''}</td>
        <td class="row gap-05">
          <button class="btn tiny pinBtn">Pin/Unpin</button>
          <button class="btn tiny lockBtn">Lock/Unlock</button>
          <button class="btn tiny deleteThread">Delete/Restore</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    // Attach thread action handlers
    tbody.querySelectorAll('.pinBtn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const tid = tr.dataset.id;
        const isNowPinned = ! (tr.dataset.pinned === 'true');
        const note = prompt('Note (optional):');
        try {
          await api(`/api/admin/threads/${tid}/pin`, { method: 'POST', body: { pinned: isNowPinned, note } });
          loadThreads();
        } catch (e) {
          showErr(`Failed to pin/unpin: ${e?.error || e?.message}`);
        }
      });
    });
    tbody.querySelectorAll('.lockBtn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const tid = tr.dataset.id;
        const isNowLocked = ! (tr.dataset.locked === 'true');
        const note = prompt('Note (optional):');
        try {
          await api(`/api/admin/threads/${tid}/lock`, { method: 'POST', body: { locked: isNowLocked, note } });
          loadThreads();
        } catch (e) {
          showErr(`Failed to lock/unlock: ${e?.error || e?.message}`);
        }
      });
    });
    tbody.querySelectorAll('.deleteThread').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const tid = tr.dataset.id;
        const isDeleted = !(tr.dataset.deleted === 'true');
        const note = prompt('Note (optional):');
        try {
          await api(`/api/admin/threads/${tid}/delete`, { method: 'POST', body: { deleted: isDeleted, reason: note } });
          loadThreads();
        } catch (e) {
          showErr(`Failed to delete/restore: ${e?.error || e?.message}`);
        }
      });
    });
  } catch (e) {
    renderErrorRow('#threadsTable', `Error loading threads: ${e?.error || e?.message}`, 7);
  }
}

/**** --- COMMENTS section (moderation) ****/

async function loadComments() {
  const tbody = ensureTbody('#commentsTable');
  if (!tbody) return;
  try {
    const includeDeleted = q('#cIncludeDeleted')?.checked;
    const params = new URLSearchParams();
    params.set('t', String(Date.now()));
    if (includeDeleted) params.set('includeDeleted', '1');
    const { results } = await api(`/api/admin/search?type=comments&${params.toString()}`, { nocache: true });
    tbody.innerHTML = '';
    if (!Array.isArray(results) || !results.length) {
      tbody.innerHTML = '<tr><td colspan="7">No comments found.</td></tr>';
      return;
    }
    for (const c of results) {
      const tr = document.createElement('tr');
      tr.dataset.id = c._id;
      tr.innerHTML = `
        <td>${new Date(c.createdAt).toLocaleString()}</td>
        <td>${escapeHTML(c.snippet || '')}</td>
        <td>${escapeHTML(c.authorId || '')}</td>
        <td>${escapeHTML(c.thread || '')}</td>
        <td>${c.upvotes || 0}</td>
        <td>${c.status || ''}</td>
        <td><button class="btn tiny delRestoreComment">Delete/Restore</button></td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('.delRestoreComment').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const cid = tr.dataset.id;
        const toDeleted = !(tr.dataset.deleted === 'true');
        const reason = prompt('Reason (optional):');
        try {
          await api(`/api/admin/comments/${cid}/delete`, { method: 'POST', body: { deleted: toDeleted, reason } });
          loadComments();
        } catch (e) {
          showErr(`Failed comment delete/restore: ${e?.error || e?.message}`);
        }
      });
    });
  } catch (e) {
    renderErrorRow('#commentsTable', `Error loading comments: ${e?.error || e?.message}`, 7);
  }
}

/**** --- REPORTS section (list, resolve, export) ****/

async function loadReports() {
  const tbody = ensureTbody('#reportsTable');
  if (!tbody) return;
  try {
    const status = q('#rFilter')?.value || 'open';
    const group = q('#rGroup')?.checked;
    const params = new URLSearchParams();
    params.set('t', String(Date.now()));
    params.set('status', status);
    const path = group ? 'reports/grouped' : 'reports';
    const { [group ? 'groups' : 'reports']: list } = await api(`/api/admin/${path}?${params.toString()}`, { nocache: true });
    tbody.innerHTML = '';
    if (!Array.isArray(list) || !list.length) {
      tbody.innerHTML = '<tr><td colspan="8">No reports found.</td></tr>';
      return;
    }
    for (const r of list) {
      const tr = document.createElement('tr');
      tr.dataset.id = r._id || r.ids?.[0] || '';
      tr.innerHTML = `
        <td><input type="checkbox" class="rSelect" data-id="${r._id}"></td>
        <td>${new Date(r.latestAt ? new Date(r.latestAt) : r.createdAt).toLocaleString()}</td>
        <td>${escapeHTML(r.targetType || '')}</td>
        <td>${escapeHTML(r.snippet || '')}</td>
        <td>${escapeHTML(r.category || '')}</td>
        <td>${escapeHTML(r.reporterCount?.toString() || '')}</td>
        <td>${escapeHTML(r.status || '')}</td>
        <td><button class="btn tiny resolveOne">Resolve</button></td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('.resolveOne').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const id = tr.dataset.id;
        const note = prompt('Resolution note (optional):');
        try {
          await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: { note } });
          loadReports();
        } catch (e) {
          showErr(`Resolve failed: ${e?.error || e?.message}`);
        }
      });
    });
  } catch (e) {
    renderErrorRow('#reportsTable', `Error loading reports: ${e?.error || e?.message}`, 8);
  }
}

async function bulkResolveSelected() {
  const cbs = qa('#reportsTable tbody .rSelect:checked');
  const ids = cbs.map(cb => cb.dataset.id).filter(Boolean);
  if (!ids.length) {
    showErr('No reports selected.');
    return;
  }
  const note = prompt('Optional resolution note:');
  try {
    await api('/api/admin/reports/bulk-resolve', { method: 'POST', body: { ids, note } });
    loadReports();
  } catch (e) {
    showErr(`Bulk resolve failed: ${e?.error || e?.message}`);
  }
}

function exportReportsCSV() {
  window.location.href = `/api/admin/reports/export.csv?t=${Date.now()}`;
}

/**** --- GLOBAL SEARCH section --- ****/

async function doSearch() {
  const qstr = (q('#sQ')?.value || '').trim();
  const type = (q('#sType')?.value || 'all').toLowerCase();
  const status = (q('#sStatus')?.value || '').toLowerCase();
  const from = q('#sFrom')?.value;
  const to = q('#sTo')?.value;
  const minUp = q('#sMinUp')?.value;
  const category = q('#sCategory')?.value;

  const params = new URLSearchParams();
  params.set('t', String(Date.now()));
  if (qstr) params.set('q', qstr);
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (minUp) params.set('minUp', minUp);
  if (category) params.set('category', category);

  const { results } = await api(`/api/admin/search?${params.toString()}`, { nocache: true });
  const tbody = ensureTbody('#searchTable');
  tbody.innerHTML = '';
  if (!Array.isArray(results) || !results.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No results</td></tr>';
    return;
  }
  for (const r of results) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.createdAt).toLocaleString()}</td>
      <td>${escapeHTML(r.type || '')}</td>
      <td>${escapeHTML(r.title || '')}</td>
      <td>${escapeHTML(r.snippet || '')}</td>
      <td>${escapeHTML(String(r.upvotes || ''))}</td>
      <td>${escapeHTML(r.link || '')}</td>
    `;
    tbody.appendChild(tr);
  }
}

/**** --- SSE / Notifications / Live Updates --- ****/

const _clients = new Set();
function sseWrite(res, type, data) {
  try {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {}
}
function broadcast(type, data) {
  for (const res of _clients) {
    sseWrite(res, type, data);
  }
}
function startEventStream() {
  const evtSource = new EventSource(`/api/admin/stream`);
  evtSource.onmessage = (ev) => {
    // default “message” event
  };
  evtSource.addEventListener('thread:updated', ev => {
    loadThreads();
  });
  evtSource.addEventListener('comment:updated', ev => {
    loadComments();
  });
  evtSource.addEventListener('report:resolved', ev => {
    loadReports();
  });
  evtSource.addEventListener('reports:bulk_resolved', ev => {
    loadReports();
  });
}

/**** --- INIT and wiring UI --- ****/

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

    // Users UI events
    q('#uRefresh')?.addEventListener('click', () => {
      state.users.page = 1;
      loadUsers();
    });
    q('#uSearch')?.addEventListener('input', debounce(() => {
      state.users.page = 1;
      loadUsers();
    }));

    // Threads UI
    q('#tRefresh')?.addEventListener('click', loadThreads);
    q('#tIncludeDeleted')?.addEventListener('change', loadThreads);

    // Comments UI
    q('#cRefresh')?.addEventListener('click', loadComments);
    q('#cIncludeDeleted')?.addEventListener('change', loadComments);

    // Reports UI
    q('#rRefresh')?.addEventListener('click', loadReports);
    q('#rGroup')?.addEventListener('change', loadReports);
    q('#rFilter')?.addEventListener('change', loadReports);
    q('#rBulkResolve')?.addEventListener('click', bulkResolveSelected);
    q('#rExport')?.addEventListener('click', exportReportsCSV);
    q('#rSelectAll')?.addEventListener('change', () => {
      const checked = q('#rSelectAll')?.checked;
      qa('#reportsTable tbody .rSelect').forEach(cb => { cb.checked = !!checked; });
    });

    // Search UI
    q('#sGo')?.addEventListener('click', doSearch);
    q('#sReset')?.addEventListener('click', () => {
      q('#sQ').value = '';
      q('#sType').value = 'all';
      q('#sStatus').value = '';
      q('#sFrom').value = '';
      q('#sTo').value = '';
      q('#sMinUp').value = '';
      q('#sCategory').value = '';
      doSearch();
    });
    q('#sQ')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    // Start live updates
    startEventStream();

    // Initial loads
    loadMetrics().catch(console.error);
    loadThreads().catch(console.error);
    loadComments().catch(console.error);
    loadReports().catch(console.error);
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
