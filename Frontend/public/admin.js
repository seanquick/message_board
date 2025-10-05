// Frontend/public/admin.js
// Admin dashboard — grouped reports + keyboard shortcuts + note templates + SSE + CSV + pagination + global search + notif bell + user delete & content view

import { api, escapeHTML, timeAgo, q, $, qa, refreshMe, me as meVar } from './main.js';

let meUser = null;

// -------- Global error surface --------
window.addEventListener('error', (e) => {
  const msg = e?.error?.message || e?.message || 'Script error';
  showErr(`[JS] ${msg}`);
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e?.reason?.error || e?.reason?.message || String(e.reason || 'Promise error');
  showErr(`[Promise] ${msg}`);
});

// ---------- Templates ----------
const DEFAULT_NOTE_TEMPLATES = [
  { label: 'Spam', text: 'Resolved as spam. Action: {action}. Content contained solicitation/repetitive promos. {targetType}={threadId}{commentId?} Reviewed by {admin} on {date}.' },
  // ... (rest unchanged) ...
  { label: 'Scam/Phishing', text: 'Resolved: suspected scam/phishing. Links removed and user warned/blocked as appropriate. Action: {action}. Reviewed by {admin} on {date}.' }
];
function getNoteTemplates() {
  try {
    const raw = localStorage.getItem('modNoteTemplates');
    const arr = raw ? JSON.parse(raw) : DEFAULT_NOTE_TEMPLATES;
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {}
  return DEFAULT_NOTE_TEMPLATES;
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
  return str
    .replace(/\{commentId\?\}/g, base.commentId ? base.commentId : '')
    .replace(/\{(\w+)\}/g, (_m, key) => String(base[key] ?? ''));
}
function insertAtCaret(textarea, text) {
  textarea.focus();
  const s = textarea.selectionStart ?? textarea.value.length;
  const e = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, s) + text + textarea.value.slice(e);
  const pos = s + text.length;
  textarea.setSelectionRange(pos, pos);
}
function renderTemplateChips(containerEl, textareaEl, ctx = {}) {
  const tpls = getNoteTemplates();
  if (!tpls.length || !containerEl || !textareaEl) return;
  const bar = document.createElement('div');
  bar.className = 'tplBar';
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.5rem';
  for (const t of tpls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn tiny'; b.textContent = t.label;
    b.addEventListener('click', () => insertAtCaret(textareaEl, fillTemplate(t.text, ctx) + '\n'));
    bar.appendChild(b);
  }
  containerEl.prepend(bar);
}

// ---------- State ----------
const state = {
  users:    { page: 1, limit: 50, total: 0 },
  comments: { page: 1, limit: 50, total: 0 },
  ui:       { activeTable: 'reports', activeRow: 0 }
};

document.addEventListener('DOMContentLoaded', init);

/* ============================== INIT ============================== */
async function init() {
  await refreshMe();
  meUser = meVar;

  // Auth / refresh guard logic
  try {
    await api(`/api/admin/ping?t=${Date.now()}`);
  } catch (e) {
    const firstErr = String(e?.error || e?.message || '');
    if (/revoked|expired|token/i.test(firstErr)) {
      let refreshed = false;
      try {
        await api('/api/auth/refresh', { method: 'POST' });
        refreshed = true;
      } catch (exAuth) {
        try {
          await api('/api/admin/refresh', { method: 'POST' });
          refreshed = true;
        } catch (exAdmin) {
          // neither worked
        }
      }
      if (refreshed) {
        await api(`/api/admin/ping?t=${Date.now()}`);
      } else {
        throw new Error('Could not refresh session as admin');
      }
    } else {
      throw e;
    }
  }

  // Wire UI event listeners
  q('#refreshMetrics')?.addEventListener('click', loadMetrics);

  // Reports
  q('#rFilter')?.addEventListener('change', loadReports);
  q('#rRefresh')?.addEventListener('click', loadReports);
  q('#rGroup')?.addEventListener('change', loadReports);
  q('#rBulkResolve')?.addEventListener('click', bulkResolveSelected);
  q('#rExport')?.addEventListener('click', exportReportsCSV);
  q('#rSelectAll')?.addEventListener('change', () => {
    const checked = q('#rSelectAll')?.checked;
    qa('#reportsTable tbody .rSelect').forEach(cb => { cb.checked = !!checked; });
  });

  // Users
  (q('#uSearch') || q('#userSearch'))?.addEventListener('input', debounce(() => { state.users.page = 1; loadUsers(); }, 300));
  q('#uRefresh')?.addEventListener('click', () => { state.users.page = 1; loadUsers(); });
  q('#uPageSize')?.addEventListener('change', () => { state.users.limit = +q('#uPageSize').value || 50; state.users.page = 1; loadUsers(); });
  q('#uPrev')?.addEventListener('click', () => { if (state.users.page > 1) { state.users.page--; loadUsers(); } });
  q('#uNext')?.addEventListener('click', () => { const pages = pagesFor(state.users); if (state.users.page < pages) { state.users.page++; loadUsers(); } });
  q('#uExport')?.addEventListener('click', exportUsersCSV);

  // Comments
  q('#cIncludeDeleted')?.addEventListener('change', () => { state.comments.page = 1; loadComments(); });
  q('#cRefresh')?.addEventListener('click', () => { state.comments.page = 1; loadComments(); });
  q('#cPageSize')?.addEventListener('change', () => { state.comments.limit = +q('#cPageSize').value || 50; state.comments.page = 1; loadComments(); });
  q('#cPrev')?.addEventListener('click', () => { if (state.comments.page > 1) { state.comments.page--; loadComments(); } });
  q('#cNext')?.addEventListener('click', () => { const pages = pagesFor(state.comments); if (state.comments.page < pages) { state.comments.page++; loadComments(); } });
  q('#cExport')?.addEventListener('click', exportCommentsCSV);

  // Threads
  q('#tIncludeDeleted')?.addEventListener('change', loadThreads);
  q('#tRefresh')?.addEventListener('click', loadThreads);

  // Global Search
  q('#sGo')?.addEventListener('click', doSearch);
  q('#sReset')?.addEventListener('click', resetSearch);
  q('#sQ')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  // Keyboard + SSE
  q('#kbdHelpClose')?.addEventListener('click', () => toggleKbdHelp(false));
  document.addEventListener('keydown', onKeyDown);
  startEventStream();

  // Notification bell (admin too)
  initUserNotifBell();

  // Initial loads
  loadMetrics().catch(console.error);
  loadThreads().catch(console.error);
  loadComments().catch(console.error);
  loadReports().catch(console.error);
  loadUsers().catch(console.error);
}

/* ============================== METRICS ============================== */
async function loadMetrics() {
  try {
    const { metrics } = await api(`/api/admin/metrics?t=${Date.now()}`);
    setText('#mUsers', metrics.users);
    setText('#mThreads', metrics.threads);
    setText('#mComments', metrics.comments);
    setText('#mReports', metrics.reports);
  } catch (e) {
    showErr(`Failed to load metrics: ${e?.error || e?.message || ''}`);
  }
}

/* ============================== USERS ============================== */
async function loadUsers() {
  const tbody = ensureTbody('#usersTable');
  try {
    const searchEl = q('#uSearch') || q('#userSearch');
    const qstr = (searchEl?.value || '').trim();
    const params = new URLSearchParams();
    if (qstr) params.set('q', qstr);
    params.set('page', String(state.users.page));
    params.set('limit', String(state.users.limit));
    params.set('t', String(Date.now()));

    const payload = await api(`/api/admin/users?${params.toString()}`, { nocache: true });
    const users =
      Array.isArray(payload) ? payload :
      Array.isArray(payload?.users) ? payload.users :
      Array.isArray(payload?.data)  ? payload.data  : [];

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
      tr.dataset.id = u._id || u.id || '';
      // Name / email clickable link
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
    renderErrorRow('#usersTable', `Failed to load users: ${e?.error || e?.message || ''}`, 7);
  }
}

async function onToggleBan(ev) {
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset?.id;
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
    alert(e.message || 'Failed to toggle ban');
  }
}

async function onSetRole(ev) {
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset?.id;
  const next = ev.currentTarget.getAttribute('data-role');
  if (!id || !next) return;
  if (!confirm(`Set role to "${next}"?`)) return;
  try {
    const res = await api(`/api/admin/users/${id}/role`, { method: 'POST', body: { role: next } });
    tr.children[1].textContent = res.role;
    ev.currentTarget.setAttribute('data-role', res.role === 'admin' ? 'user' : 'admin');
    ev.currentTarget.textContent = res.role === 'admin' ? 'Revoke Admin' : 'Make Admin';
  } catch (e) {
    alert(e.message || 'Failed to set role');
  }
}

async function onEditUserNote(ev) {
  const tr = ev.currentTarget.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;
  const current = tr.children[4]?.textContent || '';
  showModEditor(tr, {
    title: 'Edit user note',
    placeholder: 'Private admin note for this user…',
    confirmLabel: 'Save note',
    onConfirm: async (note) => {
      const finalNote = note || '';
      await api(`/api/admin/users/${id}/note`, { method: 'POST', body: { note: finalNote } });
      if (tr.children[4]) tr.children[4].textContent = finalNote;
    }
  });
}

async function onDeleteUser(ev) {
  ev.stopPropagation();
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset.id;
  if (!id) return;
  if (!confirm('Are you sure you want to delete this user? This may be irreversible.')) return;
  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    tr.remove();
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to delete user');
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
    showErr(`Failed to fetch user content: ${e?.error || e?.message || ''}`);
  }
}

function showUserContentModal(uid, threads, comments) {
  const modal = document.createElement('div');
  modal.className = 'user-content-modal';
  modal.style = 'position:fixed;top:10%;left:10%;width:80%;height:80%;background:white;overflow:auto;z-index:10000;padding:1rem;border:1px solid #ccc';
  modal.innerHTML = `
    <button class="close-modal" style="position:absolute;top:1rem;right:1rem">Close</button>
    <h2>Content for user ${escapeHTML(uid)}</h2>
    <h3>Threads (${threads.length})</h3>
    ${threads.map(t => `<div><a href="thread.html?id=${encodeURIComponent(t._id)}" target="_blank">${escapeHTML(t.title || '(untitled)')}</a></div>`).join('')}
    <h3>Comments (${comments.length})</h3>
    ${comments.map(c => `<div>${escapeHTML(c.body || '')} <em>(thread: ${escapeHTML(String(c.thread))})</em></div>`).join('')}
  `;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal')?.addEventListener('click', () => {
    modal.remove();
  });
}

/* ============================== REPORTS (flat + grouped) ============================== */
// ... (rest of your original code, unchanged) ...

// (I am not rewriting the rest of your large code here to avoid duplication, but you should keep all your existing logic for reports, threads, comments, search, CSV, SSE, keyboard shortcuts etc.)

// Ensure shared utility functions remain (pagesFor, updatePagerUI, ensureTbody, renderErrorRow, setText, showErr, debounce) as in your original file.

