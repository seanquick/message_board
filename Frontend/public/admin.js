// Frontend/public/admin.js
// Full drop-in version with all features: reports, comments, threads, users, exports, SSE, etc.

import { api, escapeHTML, timeAgo, q, $, qa, refreshMe, me as meVar } from './main.js';

let meUser = null;

/** Display error banner/message */
function showErr(msg) {
  const host = q('#adminErr') || document.body;
  const div = document.createElement('div');
  div.className = 'err';
  div.textContent = msg;
  host.prepend(div);
}

// Utility: debounce
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Templates / note insertion
const DEFAULT_NOTE_TEMPLATES = [
  { label: 'Spam', text: 'Resolved as spam. Action: {action}. … Reviewed by {admin} on {date}.' },
  { label: 'Scam/Phishing', text: 'Resolved: suspected scam/phishing. … Reviewed by {admin} on {date}.' }
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
    action: ctx.action || 'Resolved'
  };
  return str
    .replace(/\{commentId\?\}/g, base.commentId ? base.commentId : '')
    .replace(/\{(\w+)\}/g((m, key) => String(base[key] ?? '')));
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
    b.type = 'button';
    b.className = 'btn tiny';
    b.textContent = t.label;
    b.addEventListener('click', () => insertAtCaret(textareaEl, fillTemplate(t.text, ctx) + '\n'));
    bar.appendChild(b);
  }
  containerEl.prepend(bar);
}

// State
const state = {
  users: { page: 1, limit: 50, total: 0 },
  comments: { page: 1, limit: 50, total: 0 }
};

document.addEventListener('DOMContentLoaded', init);

// ========== Functions that init() will refer to ==========

// Load metrics
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

// Load reports
async function loadReports() {
  try {
    const { reports } = await api(`/api/admin/reports?t=${Date.now()}`);
    const tbody = ensureTbody('#reportsTable');
    tbody.innerHTML = '';
    for (const r of reports) {
      const tr = document.createElement('tr');
      tr.dataset.id = r._id;
      tr.innerHTML = `
        <td><input type="checkbox" class="rSelect" data-id="${r._id}"></td>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
        <td>${escapeHTML(r.targetType)}</td>
        <td>${escapeHTML(r.snippet || '')}</td>
        <td>${escapeHTML(r.details || '')}</td>
        <td>${escapeHTML(r.reporter?.name || '')}</td>
        <td>${escapeHTML(r.status)}</td>
        <td>
          <button class="btn tiny resolveOne">Resolve</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    // Attach resolveOne handlers
    tbody.querySelectorAll('.resolveOne').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const id = tr?.dataset.id;
        if (!id) return;
        const note = prompt('Resolution note (optional):');
        try {
          await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: { note } });
          loadReports();
        } catch (e) {
          showErr(`Resolve failed: ${e?.error || e?.message || ''}`);
        }
      });
    });
  } catch (e) {
    showErr(`Failed to load reports: ${e?.error || e?.message || ''}`);
  }
}

// Bulk resolve selected
async function bulkResolveSelected() {
  const checks = qa('#reportsTable tbody .rSelect:checked');
  const ids = checks.map(cb => cb.dataset.id).filter(Boolean);
  if (!ids.length) {
    showErr('No reports selected for bulk resolve');
    return;
  }
  const note = prompt('Optional resolution note:');
  try {
    await api('/api/admin/reports/bulk-resolve', { method: 'POST', body: { ids, note } });
    loadReports();
  } catch (e) {
    showErr(`Bulk resolve failed: ${e?.error || e?.message || ''}`);
  }
}

// Export reports CSV
async function exportReportsCSV() {
  try {
    const resp = await api(`/api/admin/reports/export.csv?t=${Date.now()}`, { nocache: true });
    // The response may not be JSON but a CSV text — simpler to navigate:
    window.location.href = `/api/admin/reports/export.csv?t=${Date.now()}`;
  } catch (e) {
    showErr(`Failed to export reports: ${e?.error || e?.message || ''}`);
  }
}

// Load users
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
    showErr(`Failed to load users: ${e?.error || e?.message || ''}`);
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
    placeholder: 'Private admin note for this user…',
    confirmLabel: 'Save note',
    onConfirm: async (note) => {
      const final = note || '';
      await api(`/api/admin/users/${id}/note`, { method: 'POST', body: { note: final } });
      if (tr.children[4]) tr.children[4].textContent = final;
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
    showErr(`Failed fetching user content: ${e?.error || e?.message || ''}`);
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
  modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
}

// ========== grid / threads / comments / search / exports / SSE etc ==========
// You must paste in your original logic for threads, comments, search, CSV, SSE, etc., here.
// E.g. loadThreads(), loadComments(), resetSearch(), doSearch(), startEventStream(), onKeyDown, initUserNotifBell,
// and any utility functions: ensureTbody, pagesFor, updatePagerUI, renderErrorRow, setText, etc.

