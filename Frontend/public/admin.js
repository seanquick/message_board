// frontend/public/admin.js
console.log('[admin.js] script loaded');

import { api, escapeHTML, timeAgo, q, qa, refreshMe, me as meVar } from './main.js';

let meUser = null;

function showErr(msg) {
  const el = document.getElementById('adminErr');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('active');
}


function clearErrs() {
  const el = document.getElementById('adminErr');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('active');
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
  if (section === 'comments') {
    const el = q('#cPageInfo');
    if (el) el.textContent = `${state.comments.page} / ${pages}`;
  }
}

// Shared helper to disable/enable a button
function setButtonState(btn, { disabled = false, text = null } = {}) {
  if (!btn) return;
  btn.disabled = disabled;
  if (text !== null) btn.textContent = text;
}

function renderErrorRow(tableSelector, msg, colspan = 5) {
  const tbody = ensureTbody(tableSelector);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="err">${escapeHTML(msg)}</td></tr>`;
}

const state = {
  users:    { page: 1, limit: 25, total: 0 },
  comments: { page: 1, limit: 25, total: 0 },
  threads:  { page: 1, limit: 25, total: 0 }
};


// --- METRICS ---
async function loadMetrics() {
  try {
    const { metrics } = await api(`/api/admin/metrics?t=${Date.now()}`, { nocache: true });
    setText('#mUsers',   metrics.users);
    setText('#mThreads', metrics.threads);
    setText('#mComments',metrics.comments);
    setText('#mReports', metrics.reports);
  } catch (e) {
    showErr(`Failed to load metrics: ${e?.error || e?.message}`);
  }
}

function setText(sel, text) {
  const el = q(sel);
  if (el) el.textContent = text;
}

// --- USERS Section ---
async function loadUsers() {
  clearErrs();
  const tbody = ensureTbody('#usersTable');
  if (!tbody) {
    showErr('No users table found');
    return;
  }

  try {
    const searchEl = q('#uSearch') || q('#userSearch');
    const qstr     = (searchEl?.value || '').trim();
    const params   = new URLSearchParams();
    if (qstr) params.set('q', qstr);
    params.set('page',  String(state.users.page));
    params.set('limit', String(state.users.limit));
    params.set('t',     String(Date.now()));

    const payload = await api(`/api/admin/users?${params.toString()}`, { nocache: true });
    const users   = Array.isArray(payload.users) ? payload.users : [];

    state.users.total = Number(payload?.total ?? users.length);
    const pages      = pagesFor(state.users);
    updatePagerUI('users', pages);

    tbody.innerHTML = '';
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
      return;
    }

    users.forEach(u => {
      const tr         = document.createElement('tr');
      tr.dataset.id    = u._id;
      const display    = u.name ? escapeHTML(u.name) : escapeHTML(u.email);
      const nameLink   = `<a href="#" class="user-link" data-uid="${escapeHTML(u._id)}">${display}</a>`;
      tr.innerHTML     = `
        <td>${nameLink}<br><span class="meta">${escapeHTML(u.email)}</span></td>
        <td>${escapeHTML(u.role || 'user')}</td>
        <td>${u.isBanned ? '<span class="danger">Banned</span>' : '<span class="ok">Active</span>'}</td>
        <td>${escapeHTML(timeAgo(u.createdAt || Date.now()))}</td>
        <td class="truncate">${escapeHTML(u.notes || '')}</td>
        <td class="row gap-05">
          <button class="btn tiny editNote">Edit Note</button>
          <button class="btn tiny toggleBan">${u.isBanned ? 'Unban' : 'Ban'}</button>
          <button class="btn tiny setRole" data-role="${escapeHTML(u.role === 'admin' ? 'user' : 'admin')}">
            ${u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
          </button>
          <button class="btn tiny deleteUser" style="color:red">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    bindUserActions(tbody);

  } catch (e) {
    showErr(`Failed to load users: ${e?.error || e?.message}`);
  }
}

function bindUserActions(tbody) {
  tbody.querySelectorAll('.editNote').forEach(btn   => btn.addEventListener('click',     onEditUserNote));
  tbody.querySelectorAll('.toggleBan').forEach(btn  => btn.addEventListener('click',     onToggleBan));
  tbody.querySelectorAll('.setRole').forEach(btn    => btn.addEventListener('click',     onSetRole));
  tbody.querySelectorAll('.deleteUser').forEach(btn => btn.addEventListener('click',     onDeleteUser));
  tbody.querySelectorAll('.user-link').forEach(link => link.addEventListener('click',    onUserLinkClick));
}

async function onToggleBan(ev) {
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset.id;
  if (!id) return;
  if (!confirm('Toggle ban for this user?')) return;

  try {
    const res = await api(`/api/admin/users/${encodeURIComponent(id)}/toggle-ban`, { method: 'POST' });
    const statusCell = tr.children[2];
    const btn        = tr.querySelector('.toggleBan');
    if (res.isBanned) {
      statusCell.innerHTML = '<span class="danger">Banned</span>';
      btn.textContent      = 'Unban';
    } else {
      statusCell.innerHTML = '<span class="ok">Active</span>';
      btn.textContent      = 'Ban';
    }
  } catch (e) {
    showErr(e?.message || 'Failed to toggle ban');
  }
}

async function onSetRole(ev) {
  const tr   = ev.currentTarget.closest('tr');
  const id   = tr?.dataset.id;
  const next = ev.currentTarget.getAttribute('data-role');
  if (!id || !next) return;
  if (!confirm(`Set role to "${next}"?`)) return;

  try {
    const res = await api(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: 'POST', body: { role: next } });
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
    title:        'Edit user note',
    placeholder:  'Private admin note…',
    confirmLabel: 'Save note',
    onConfirm:    async (note) => {
      const final = note || '';
      try {
        const res = await api(`/api/admin/users/${encodeURIComponent(id)}/note`, { method: 'POST', body: { note: final } });
        tr.children[4].textContent = final;
      } catch (e) {
        showErr(e?.message || 'Failed to save note');
      }
    }
  });
}

async function onDeleteUser(ev) {
  const tr = ev.currentTarget.closest('tr');
  const id = tr?.dataset.id;
  if (!id || !confirm('Are you sure you want to delete this user?')) return;

  try {
    await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    tr.remove();
  } catch (e) {
    showErr(e?.error || e?.message || 'Failed to delete user');
  }
}

async function onUserLinkClick(ev) {
  ev.preventDefault();
  const uid = ev.currentTarget.dataset.uid;
  if (!uid) return;

  try {
    const payload = await api(`/api/admin/users/${encodeURIComponent(uid)}/content`);
    const user    = payload.user    || { _id: uid };
    const threads = payload.threads || [];
    const comments= payload.comments|| [];
    showUserContentModal(user, threads, comments);
  } catch (e) {
    showErr(`Failed to fetch user content: ${e?.error || e?.message}`);
  }
}

function showUserContentModal(user, threads, comments) {
  const modal = document.createElement('div');
  modal.className = 'user-content-modal';
  Object.assign(modal.style, {
    position:   'fixed',
    top:        '10%',
    left:       '10%',
    width:      '80%',
    height:     '80%',
    background: 'white',
    overflow:   'auto',
    zIndex:     10000,
    padding:    '1rem',
    border:     '1px solid #ccc',
  });

  const displayName  = escapeHTML(user.name  || user.email || user._id);
  const displayEmail = user.email || '';

  modal.innerHTML = `
    <button class="close-modal" style="position:absolute;top:1rem;right:1rem">Close</button>
    <h2>User: ${displayName}</h2>
    ${displayEmail ? `<div style="margin-bottom:1rem;">${escapeHTML(displayEmail)}</div>` : ''}
    <h3>Threads (${threads.length})</h3>
    ${threads.map(t => `
      <div>
        <a href="thread.html?id=${encodeURIComponent(t._id)}" target="_blank">${escapeHTML(t.title || '(untitled)')}</a>
        — ${new Date(t.createdAt).toLocaleString()}
      </div>
    `).join('')}
    <h3>Comments (${comments.length})</h3>
    ${comments.map(c => `
      <div>
        <a href="thread.html?id=${encodeURIComponent(c.thread)}" target="_blank">${escapeHTML(c.snippet || c.body || '(no content)')}</a>
        — <em>${new Date(c.createdAt).toLocaleString()}</em>
      </div>
    `).join('')}
  `;

  document.body.appendChild(modal);
  modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
}

// --- THREADS Section (with pagination + show deleted + page size) ---
async function loadThreads({ page = 1 } = {}) {
  clearErrs();
  const tbody = ensureTbody('#threadsTable');
  if (!tbody) return;

  try {
    const includeDeleted = q('#tIncludeDeleted')?.checked;
    const limit = parseInt(q('#tPageSize')?.value || 50);
    const url = `/api/admin/threads`;
      const resp = await api(url, {
        method: 'POST',
        body: {
          page,
          limit,
          includeDeleted
        },
        nocache: true,
        skipHtmlRedirect: true
      });


    const threads = Array.isArray(resp.threads) ? resp.threads : [];
    const { totalPages = 1, totalCount = 0 } = resp.pagination || {};

    tbody.innerHTML = '';
    if (!threads.length) {
      tbody.innerHTML = '<tr><td colspan="8">No threads found.</td></tr>';
      return;
    }

    threads.forEach(t => {
      const tr = document.createElement('tr');
      tr.dataset.id = t._id;

      const publicAuthor = t.isAnonymous
        ? 'Anonymous'
        : (t.author_name || (t.author?.name || ''));

      const internalAuthor = t.realAuthor
        ? (t.realAuthor.name || t.realAuthor.email || '')
        : '';

      const displayAuthor = t.isAnonymous
        ? `${publicAuthor} (internal: ${escapeHTML(internalAuthor)})`
        : escapeHTML(publicAuthor);

      tr.innerHTML = `
        <td><input type="checkbox" class="bulkSelectThread" /></td>
        <td>${escapeHTML(new Date(t.createdAt || Date.now()).toLocaleString())}</td>
        <td>${escapeHTML(t.title || '(no title)')}</td>
        <td>${displayAuthor}</td>
        <td>${Number(t.upvoteCount ?? t.upvotes ?? 0)}</td>
        <td>${Number(t.commentCount ?? 0)}</td>
        <td>${escapeHTML(t.status || '')}</td>
        <td class="row gap-05">
          <button class="btn tiny viewThread">View</button>
          <button class="btn tiny pinBtn">Pin/Unpin</button>
          <button class="btn tiny lockBtn">Lock/Unlock</button>
          <button class="btn tiny deleteThread">Delete/Restore</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    renderThreadPagination(page, totalPages, totalCount);

    state.threads.page = page;
    state.threads.total = totalCount;
    state.threads.totalPages = totalPages;

    // Disable Prev/Next if at edge
    const tPrev = q('#tPrev');
      if (tPrev) tPrev.disabled = page <= 1;

    const tNext = q('#tNext');
      if (tNext) tNext.disabled = page >= totalPages;


    // ✅ Update page info label
    const info = q('#tPageInfo');
    if (info) {
      info.textContent = `Page ${page} of ${totalPages} (${totalCount} threads)`;
    }

    bindThreadActions(tbody);

  } catch (e) {
    renderErrorRow('#threadsTable', `Error loading threads: ${e?.error || e?.message}`, 8);
  }
}


// ===== BULK ACTIONS: Threads =====
function bindThreadBulkActions() {
  // 🟢 Select All Toggle
  q('#tSelectAll')?.addEventListener('change', ev => {
    const checked = ev.currentTarget.checked;
    qa('#threadsTable tbody tr input.bulkSelectThread').forEach(cb => {
      cb.checked = checked;
    });
  });

  // 🟥 Delete Selected Threads
  q('#tBulkDelete')?.addEventListener('click', async () => {
    const ids = Array.from(qa('#threadsTable tbody tr input.bulkSelectThread:checked'))
      .map(cb => cb.closest('tr')?.dataset.id)
      .filter(Boolean);

    console.log('[Thread Bulk Delete] Selected IDs:', ids);

    if (!ids.length) {
      alert('No threads selected');
      return;
    }

    const reason = prompt('Reason for delete (optional):');
    try {
      const result = await api('/api/admin/threads/bulk-delete',   {
        method: 'POST',
        body: { ids, restore: false, reason }
      });

      console.log('[Thread Bulk Delete] Response:', result);
      await loadThreads({ page: state.threads.page });
    } catch (e) {
      console.error('[Thread Bulk Delete] Error:', e);
      showErr(`Bulk threads delete failed: ${e?.error || e?.message}`);
    }
  });

  // ✅ Restore Selected Threads
  q('#tBulkRestore')?.addEventListener('click', async () => {
    const ids = Array.from(qa('#threadsTable tbody tr input.bulkSelectThread:checked'))
      .map(cb => cb.closest('tr')?.dataset.id)
      .filter(Boolean);

    console.log('[Thread Bulk Restore] Selected IDs:', ids);

    if (!ids.length) {
      alert('No threads selected');
      return;
    }

    try {
      const result = await api('/api/admin/threads/bulk-delete',   {
        method: 'POST',
        body: { ids, restore: true }
      });

      console.log('[Thread Bulk Restore] Response:', result);
      await loadThreads({ page: state.threads.page });
    } catch (e) {
      console.error('[Thread Bulk Restore] Error:', e);
      showErr(`Bulk threads restore failed: ${e?.error || e?.message}`);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // call the binding functions once the DOM is ready
  try {
    bindThreadBulkActions();
    bindCommentBulkActions();
    console.log('[Admin Init] Bulk actions bound');
  } catch (e) {
    console.error('[Admin Init] Binding bulk actions error:', e);
  }
});


function renderThreadPagination(currentPage, totalPages, totalCount) {
  const container = q('#threadsPagination');
  if (!container) return;

  container.innerHTML = '';

  if (totalPages <= 1) return; // no pagination needed

  const createBtn = (label, page, disabled = false) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'btn tiny';
    if (disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => loadThreads({ page }));
    }
    return btn;
  };

  container.appendChild(createBtn('⟨ Prev', currentPage - 1, currentPage <= 1));

  for (let p = 1; p <= totalPages; p++) {
    const btn = createBtn(p, p, false);
    if (p === currentPage) btn.classList.add('active');
    container.appendChild(btn);
  }

  container.appendChild(createBtn('Next ⟩', currentPage + 1, currentPage >= totalPages));
}


function bindThreadActions(tbody) {
  tbody.querySelectorAll('.viewThread').forEach(btn => btn.addEventListener('click', ev => {
    const tr = ev.currentTarget.closest('tr');
    const tid = tr?.dataset.id;
    if (tid) window.open(`thread.html?id=${encodeURIComponent(tid)}`, '_blank');
  }));

  tbody.querySelectorAll('.pinBtn').forEach(btn => btn.addEventListener('click', async ev => {
    const tr   = ev.currentTarget.closest('tr');
    const tid  = tr?.dataset.id;
    if (!tid) return;
    const note = prompt('Note (optional):');
    try {
      await api(`/api/admin/threads/${encodeURIComponent(tid)}/pin`, { method: 'POST', body: { note } });
      loadThreads({ page: state.threads.page });
    } catch (e) {
      showErr(`Failed to pin/unpin: ${e?.error || e?.message}`);
    }
  }));

  tbody.querySelectorAll('.lockBtn').forEach(btn => btn.addEventListener('click', async ev => {
    const tr  = ev.currentTarget.closest('tr');
    const tid = tr?.dataset.id;
    if (!tid) return;
    const note = prompt('Note (optional):');
    try {
      await api(`/api/admin/threads/${encodeURIComponent(tid)}/lock`, { method: 'POST', body: { note } });
      loadThreads({ page: state.threads.page });
    } catch (e) {
      showErr(`Failed to lock/unlock: ${e?.error || e?.message}`);
    }
  }));

  tbody.querySelectorAll('.deleteThread').forEach(btn => btn.addEventListener('click', async ev => {
    const tr     = ev.currentTarget.closest('tr');
    const tid    = tr?.dataset.id;
    if (!tid) return;
    const reason = prompt('Reason (optional):');
    try {
      await api(`/api/admin/threads/${encodeURIComponent(tid)}/delete`, { method: 'POST', body: { reason } });
      loadThreads({ page: state.threads.page });
    } catch (e) {
      showErr(`Failed to delete/restore: ${e?.error || e?.message}`);
    }
  }));
}

// ===== LOAD ADMIN COMMENTS (with Pagination + Show Deleted + Page Size) =====
async function loadAdminComments({ page = state.comments.page || 1 } = {}) {
  clearErrs();

  const tbody = ensureTbody('#commentsTable');
  if (!tbody) return;

  try {
    const includeDeleted = q('#cIncludeDeleted')?.checked;
    const limit = parseInt(q('#cPageSize')?.value || state.comments.limit || 50, 10);

    // ✅ Build request to backend
    const resp = await api('/api/admin/comments', {
      method: 'POST',
      body: {
        page,
        limit,
        includeDeleted
      },
      nocache: true,
      skipHtmlRedirect: true
    });

    console.log('[AdminComments] API Response:', resp);

    const comments = Array.isArray(resp.comments) ? resp.comments : [];
    const { totalPages = 1, totalCount = 0 } = resp.pagination || {};

    // Clear table
    tbody.innerHTML = '';

    if (!comments.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No comments found.</td></tr>`;
      q('#cPageInfo').textContent = `0 results`;
      q('#cPrev')?.setAttribute('disabled', true);
      q('#cNext')?.setAttribute('disabled', true);
      return;
    }

    // ✅ Render rows
    comments.forEach(c => {
      const tr = document.createElement('tr');
      tr.dataset.id = c._id;
      tr.dataset.deleted = !!c.isDeleted;

      const publicAuthor = c.isAnonymous
        ? 'Anonymous'
        : (c.author_name || (c.author?.name || ''));
      const internalAuthor = c.realAuthor
        ? (c.realAuthor.name || c.realAuthor.email || '')
        : '';
      const displayAuthor = c.isAnonymous
        ? `${publicAuthor} (internal: ${escapeHTML(internalAuthor)})`
        : escapeHTML(publicAuthor);

      tr.innerHTML = `
        <td><input type="checkbox" class="bulkSelectComment" /></td>
        <td>${escapeHTML(new Date(c.createdAt || Date.now()).toLocaleString())}</td>
        <td>${escapeHTML(c.snippet || '(no snippet)')}</td>
        <td>${displayAuthor}</td>
        <td>${escapeHTML(String(c.thread || ''))}</td>
        <td>${Number(c.upvoteCount ?? 0)}</td>
        <td>${c.isDeleted ? 'Deleted' : 'Active'}</td>
        <td class="row gap-05">
          <button class="btn tiny viewComment">View</button>
          <button class="btn tiny delRestoreComment">Delete/Restore</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // ✅ Update pagination state
    state.comments.page = page;
    state.comments.limit = limit;
    state.comments.total = totalCount;
    state.comments.totalPages = totalPages;

    // ✅ Update info label
    q('#cPageInfo').textContent = `Page ${page} of ${totalPages} (${totalCount} comments)`;

    // ✅ Enable/disable pagination buttons
    q('#cPrev')?.toggleAttribute('disabled', page <= 1);
    q('#cNext')?.toggleAttribute('disabled', page >= totalPages);

    // ✅ Bind per-row admin actions
    bindCommentAdminActions(tbody);

  } catch (e) {
    console.error('[AdminComments] Error loading comments:', e);
    renderErrorRow('#commentsTable', `Error loading comments: ${e?.error || e?.message}`, 8);
  }
}



// ===== BULK ACTIONS: Comments =====
function bindCommentBulkActions() {
  // 🟢 Select All Toggle for comments
  q('#cSelectAll')?.addEventListener('change', ev => {
    const checked = ev.currentTarget.checked;
    qa('#commentsTable tbody tr input.bulkSelectComment').forEach(cb => {
      cb.checked = checked;
    });
  });

  // 🟥 Delete Selected Comments
  q('#cBulkDelete')?.addEventListener('click', async () => {
    const ids = Array.from(qa('#commentsTable tbody tr input.bulkSelectComment:checked'))
      .map(cb => cb.closest('tr')?.dataset.id)
      .filter(Boolean);

    console.log('[Comment Bulk Delete] Selected IDs:', ids);

    if (!ids.length) {
      alert('No comments selected');
      return;
    }

    const reason = prompt('Reason for delete (optional):');
    try {
      const result = await api('/api/admin/comments/bulk-delete', {
        method: 'POST',
        body: { ids, restore: false, reason }
      });

      console.log('[Comment Bulk Delete] Response:', result);
      await loadAdminComments();
    } catch (e) {
      console.error('[Comment Bulk Delete] Error:', e);
      showErr(`Bulk comments delete failed: ${e?.error || e?.message}`);
    }
  });

  // ✅ Restore Selected Comments
  q('#cBulkRestore')?.addEventListener('click', async () => {
    const ids = Array.from(qa('#commentsTable tbody tr input.bulkSelectComment:checked'))
      .map(cb => cb.closest('tr')?.dataset.id)
      .filter(Boolean);

    console.log('[Comment Bulk Restore] Selected IDs:', ids);

    if (!ids.length) {
      alert('No comments selected');
      return;
    }

    try {
      const result = await api('/api/admin/comments/bulk-delete', {
        method: 'POST',
        body: { ids, restore: true }
      });

      console.log('[Comment Bulk Restore] Response:', result);
      await loadAdminComments();
    } catch (e) {
      console.error('[Comment Bulk Restore] Error:', e);
      showErr(`Bulk comments restore failed: ${e?.error || e?.message}`);
    }
  });
}



function bindCommentAdminActions(tbody) {
  tbody.querySelectorAll('.viewComment').forEach(btn => btn.addEventListener('click', ev => {
    const tr = ev.currentTarget.closest('tr');
    const tid= tr.querySelector('td:nth-child(4)')?.textContent?.trim();
    if (tid) window.open(`thread.html?id=${encodeURIComponent(tid)}`, '_blank');
  }));

  tbody.querySelectorAll('.replyComment').forEach(btn => btn.addEventListener('click', ev => {
    const tr = ev.currentTarget.closest('tr');
    const cid= tr?.dataset.id;
    if (cid) showReplyEditor(tr, cid);
  }));

  tbody.querySelectorAll('.editComment').forEach(btn => btn.addEventListener('click', ev => {
    const tr    = ev.currentTarget.closest('tr');
    const cid   = tr?.dataset.id;
    const body  = tr.querySelector('td:nth-child(2)')?.textContent?.trim() || '';
    if (cid) showEditEditor(tr, cid, body);
  }));

  tbody.querySelectorAll('.delRestoreComment').forEach(btn => btn.addEventListener('click', async ev => {
    const tr  = ev.currentTarget.closest('tr');
    const cid = tr?.dataset.id;
    if (!cid) return;
    const toDeleted = !(tr.dataset.deleted === 'true');
    const reason    = prompt('Reason (optional):');
    try {
      await api(`/api/admin/comments/${encodeURIComponent(cid)}/delete`, { method: 'POST', body: { reason } });
      loadAdminComments();
    } catch (e) {
      showErr(`Failed comment delete/restore: ${e?.error || e?.message}`);
    }
  }));
}

// --- REPORTS Section ---
async function loadReports() {
  clearErrs();
  const tbody = ensureTbody('#reportsTable');
  if (!tbody) return;

  try {
    const status = q('#rFilter')?.value || 'open';
    const group  = q('#rGroup')?.checked;
    const params= new URLSearchParams();
    params.set('t', String(Date.now()));
    params.set('status', status);
    const path = group ? 'reports/grouped' : 'reports';
    const url  = `/api/admin/${path}?${params.toString()}`;
    const resp = await api(url, { nocache: true, skipHtmlRedirect: true });
    const list = resp[group ? 'groups' : 'reports'] || [];

    tbody.innerHTML = '';
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="9">No reports found.</td></tr>';
      return;
    }

    list.forEach(r => {
      const tr        = document.createElement('tr');
      const reportId  = r._id || (Array.isArray(r.ids) ? r.ids[0] : '');
      tr.dataset.id   = reportId;
      const reporter  = r.reporter?.name || r.reporter?.email || r.reporterId || '';
      tr.innerHTML    = `
        <td><input type="checkbox" class="rSelect" data-id="${escapeHTML(reportId)}"></td>
        <td>${escapeHTML(new Date(r.latestAt || r.createdAt || Date.now()).toLocaleString())}</td>
        <td>${escapeHTML(r.targetType || '')}</td>
        <td>${escapeHTML(r.snippet || '')}</td>
        <td>${escapeHTML(r.category || '')}</td>
        <td>${escapeHTML(reporter)}</td>
        <td>${escapeHTML(r.status || '')}</td>
        <td class="row gap-05">
          <button class="btn tiny viewReport">View</button>
          <button class="btn tiny resolveOne">Resolve</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    bindReportActions(tbody);

  } catch (e) {
    renderErrorRow('#reportsTable', `Error loading reports: ${e?.error || e?.message}`, 9);
  }
}

function bindReportActions(tbody) {
  tbody.querySelectorAll('.viewReport').forEach(btn => btn.addEventListener('click', ev => {
    const tr = ev.currentTarget.closest('tr');
    const id = tr?.dataset.id;
    if (id) openReportDetail(id);
  }));

  tbody.querySelectorAll('.resolveOne').forEach(btn => btn.addEventListener('click', async ev => {
    const tr = ev.currentTarget.closest('tr');
    const id = tr?.dataset.id;
    if (!id) return;
    const note = prompt('Resolution note (optional):');
    try {
      const res = await api(`/api/admin/reports/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: { resolutionNote: note || '' } });
      if (res.ok) loadReports();
      else showErr(`Resolve failed: ${res.error || 'Unknown'}`);
    } catch (e) {
      showErr(`Resolve error: ${e?.error || e?.message}`);
    }
  }));
}

async function openReportDetail(reportId) {
  try {
    const resp = await api(`/api/admin/reports/${encodeURIComponent(reportId)}?t=${Date.now()}`, { nocache: true, skipHtmlRedirect: true });
    const report = resp.report;
    if (!report) {
      showErr('Report not found');
      return;
    }

    let original = null;
    if (report.targetType === 'thread') {
      const r2 = await api(`/api/threads/${encodeURIComponent(report.targetId)}`, { skipHtmlRedirect: true });
      original   = r2.thread || r2;
    } else if (report.targetType === 'comment') {
      const r2 = await api(`/api/comments/${encodeURIComponent(report.targetId)}`, { skipHtmlRedirect: true });
      original   = r2.comment || r2;
    }

    showReportDetailModal(report, original);

  } catch (e) {
    showErr(`Failed to load report detail: ${e?.error || e?.message}`);
  }
}

function showReportDetailModal(report, original) {
  const modal = q('#adminReportModal');
  if (!modal) {
    showErr('Modal container not found');
    return;
  }
  const backdrop = modal.querySelector('.report-backdrop');
  const body     = modal.querySelector('#reportDetailBody');
  const btnClose = modal.querySelector('#adminReportClose');
  if (!backdrop || !body || !btnClose) {
    showErr('Modal structure invalid');
    return;
  }

  backdrop.style.display = 'flex';
  btnClose.onclick = () => { backdrop.style.display = 'none'; };

  const reporterName  = report.reporter?.name || report.reporter?.email || report.reporterId || '';
  const createdAt     = new Date(report.createdAt).toLocaleString();
  const updatedAt     = report.updatedAt ? new Date(report.updatedAt).toLocaleString() : '';
  const category      = escapeHTML(report.category || '');
  const details       = escapeHTML(report.details || '');
  const status        = escapeHTML(report.status || '');
  const resolutionNote= escapeHTML(report.resolutionNote || '');

  let originalHtml = '';
  if (original) {
    const titleOrSnippet = original.title ? original.title : original.snippet ? original.snippet : original.body || original.content || '(no content)';
    const origAuthor     = (original.author && typeof original.author === 'object')
                           ? (original.author.name || original.author.email || String(original.author._id || ''))
                           : (original.author || '');

    if (report.targetType === 'thread') {
      originalHtml += `<p><strong>Thread title:</strong> <a href="thread.html?id=${encodeURIComponent(original._id)}" target="_blank">${escapeHTML(titleOrSnippet)}</a></p>`;
      originalHtml += `<p><strong>Author:</strong> ${escapeHTML(origAuthor)}</p>`;
      originalHtml += `<div style="padding:.75rem;border:1px solid #ccc;border-radius:4px;margin-top:.5rem;">
        <pre style="white-space:pre-wrap;">${escapeHTML(original.body || original.content || '')}</pre>
      </div>`;
    } else if (report.targetType === 'comment') {
      originalHtml += `<p><strong>Author:</strong> ${escapeHTML(origAuthor)}</p>`;
      if (original.thread) {
        originalHtml += `<p><strong>Thread:</strong> <a href="thread.html?id=${encodeURIComponent(original.thread)}" target="_blank">${escapeHTML(String(original.thread))}</a></p>`;
      }
      originalHtml += `<div style="padding:.75rem;border:1px solid #ccc;border-radius:4px;margin-top:.5rem;">
        <pre style="white-space:pre-wrap;">${escapeHTML(original.body || original.content || '')}</pre>
      </div>`;
    } else {
      originalHtml = `<em>(Original content unavailable or unknown type)</em>`;
    }
  } else {
    originalHtml = `<em>(Original content not found)</em>`;
  }

  const resolveBtnHtml = (report.status !== 'resolved' && report.status !== 'closed') 
    ? `<button id="modalResolveBtn" class="btn tiny" style="margin-top:1rem;">Resolve</button>` 
    : '';

  body.innerHTML = `
    <p><strong>Reporter:</strong> ${escapeHTML(reporterName)}</p>
    <p><strong>Created At:</strong> ${createdAt}</p>
    ${updatedAt ? `<p><strong>Last Updated:</strong> ${updatedAt}</p>` : ''}
    <p><strong>Category:</strong> ${category}</p>
    <p><strong>Details:</strong></p>
    <div style="padding:.5rem;border:1px solid #ddd;border-radius:4px;background:#f9f9f9;">
      <pre style="white-space:pre-wrap;">${details}</pre>
    </div>
    <p><strong>Status:</strong> ${status}</p>
    ${resolutionNote ? `<p><strong>Resolution Note:</strong> ${resolutionNote}</p>` : ''}
    <hr/>
    <h4>Original ${escapeHTML(report.targetType)}</h4>
    ${originalHtml}
    ${resolveBtnHtml}
  `;

  const modalResolveBtn = modal.querySelector('#modalResolveBtn');
  if (modalResolveBtn) {
    modalResolveBtn.onclick = async () => {
      const note = prompt('Resolution note (optional):');
      try {
        const res = await api(`/api/admin/reports/${encodeURIComponent(report._id)}/resolve`, {
          method: 'POST', body: { resolutionNote: note || '' }
        });
        if (res.ok) {
          backdrop.style.display = 'none';
          loadReports();
        } else {
          showErr(`Resolve failed: ${res.error || 'Unknown'}`);
        }
      } catch (e) {
        showErr(`Resolve error: ${e?.error || e?.message}`);
      }
    };
  }
}

// Bulk resolve action
async function bulkResolveSelected() {
  const cbs = qa('#reportsTable tbody .rSelect:checked');
  const ids = cbs.map(cb => cb.dataset.id).filter(Boolean);
  if (!ids.length) {
    showErr('No reports selected.');
    return;
  }
  const note = prompt('Optional resolution note:');
  try {
    await api('/api/admin/reports/resolve', { method: 'POST', body: { reportIds: ids, resolutionNote: note || '' } });
    loadReports();
  } catch (e) {
    showErr(`Bulk resolve failed: ${e?.error || e?.message}`);
  }
}

function exportCSV(path) {
  window.location.href = `/api/admin/${path}/export.csv?t=${Date.now()}`;
}

// ===== SEARCH (Admin UI) =====
function bindSearchForm() {
  const btn = document.querySelector('#sGo');
  if (btn) {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      console.log('[AdminSearch] Search button clicked');
      doSearch();
    });
  } else {
    console.warn('[AdminSearch] #sGo button not found');
  }

  const resetBtn = document.querySelector('#sReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      document.querySelector('#sQ').value        = '';
      document.querySelector('#sType').value     = 'all';
      document.querySelector('#sStatus').value   = '';
      document.querySelector('#sFrom').value     = '';
      document.querySelector('#sTo').value       = '';
      document.querySelector('#sMinUp').value    = '';
      document.querySelector('#sCategory').value = '';
      console.log('[AdminSearch] Reset search filters');
      doSearch();
    });
  }

  const qInput = document.querySelector('#sQ');
  if (qInput) {
    qInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        console.log('[AdminSearch] Enter pressed in search field');
        doSearch();
      }
    });
  }
}

// ===== INIT (Admin UI) =====
async function init() {
  console.log('[admin.js] init start');

  await refreshMe();
  meUser = meVar;

  q('#uRefresh')?.addEventListener('click', () => {
    state.users.page = 1;
    loadUsers();
  });
  q('#uSearch')?.addEventListener('input', debounce(() => {
    state.users.page = 1;
    loadUsers();
  }));

  // THREAD CONTROLS
  q('#tRefresh')?.addEventListener('click', () => loadThreads({ page: 1 }));
  q('#tPageSize')?.addEventListener('change', () => loadThreads({ page: 1 }));
  q('#tIncludeDeleted')?.addEventListener('change', () => loadThreads({ page: 1 }));

  // ✅ Pagination controls (TOP ONLY)
  q('#tPrev')?.addEventListener('click', () => {
    if (state.threads.page > 1) {
      state.threads.page--;
      loadThreads({ page: state.threads.page });
    }
  });

  q('#tNext')?.addEventListener('click', () => {
    if (state.threads.page < state.threads.totalPages) {
      state.threads.page++;
      loadThreads({ page: state.threads.page });
    }
  });

  // COMMENT CONTROLS
  q('#cPageSize')?.addEventListener('change', () => loadAdminComments({ page: 1 }));
  q('#cIncludeDeleted')?.addEventListener('change', () => loadAdminComments({ page: 1 }));
  q('#cPrev')?.addEventListener('click', () => { if (state.comments.page > 1) {state.comments.page--; loadAdminComments({ page: state.comments.page }); } });
  q('#cNext')?.addEventListener('click', () => { if (state.comments.page < state.comments.totalPages) {state.comments.page++; loadAdminComments({ page: state.comments.page }); } });


  // REPORT CONTROLS
  q('#rRefresh')?.addEventListener('click', loadReports);
  q('#rGroup')?.addEventListener('change', loadReports);
  q('#rFilter')?.addEventListener('change', loadReports);
  q('#rBulkResolve')?.addEventListener('click', bulkResolveSelected);

  // EXPORTS
  q('#rExport')?.addEventListener('click', () => exportCSV('reports'));
  q('#cExport')?.addEventListener('click', () => exportCSV('comments'));
  q('#uExport')?.addEventListener('click', () => exportCSV('users'));

  // SELECT ALL FOR REPORTS
  q('#rSelectAll')?.addEventListener('change', () => {
    const checked = q('#rSelectAll')?.checked;
    qa('#reportsTable tbody .rSelect').forEach(cb => {
      cb.checked = !!checked;
    });
  });

  // GLOBAL SEARCH FORM
  bindSearchForm();

  // INITIAL LOADS
  await loadMetrics();
  await loadUsers();
  await loadThreads({ page: state.threads.page });
  await loadAdminComments();
  await loadReports();

  console.log('[admin.js] init complete');
}

// ===== COMMENT PAGINATION (admin) =====
function renderCommentPagination(currentPage, totalPages, totalCount) {
  const container = document.getElementById('commentsPagination');
  if (!container) return;

  container.innerHTML = ''; // Clear previous buttons

  const makeBtn = (text, page, disabled = false, bold = false) => {
    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    if (bold) btn.style.fontWeight = 'bold';
    btn.disabled = disabled;
    btn.textContent = text;
    if (!disabled) {
      btn.addEventListener('click', () => {
        loadAdminComments({ page });
      });
    }
    return btn;
  };

  if (totalPages <= 1) return;

  container.appendChild(makeBtn('❮ Prev', currentPage - 1, currentPage <= 1));
  for (let i = 1; i <= totalPages; i++) {
    container.appendChild(makeBtn(String(i), i, false, i === currentPage));
  }
  container.appendChild(makeBtn('Next ❯', currentPage + 1, currentPage >= totalPages));
}


async function doSearch() {
  clearErrs();

  const qStr     = (q('#sQ')?.value || '').trim();
  const type     = (q('#sType')?.value || 'all').toLowerCase();
  const status   = (q('#sStatus')?.value || '').toLowerCase();
  const from     = q('#sFrom')?.value;
  const to       = q('#sTo')?.value;
  const minUp    = q('#sMinUp')?.value;
  const category = q('#sCategory')?.value;

  if (!qStr) {
    showErr('Please enter a search term.');
    return;
  }

  const params = new URLSearchParams();
  params.set('q', qStr);
  params.set('type', type);
  params.set('t', String(Date.now()));

  if (status)   params.set('status', status);
  if (from)     params.set('from', from);
  if (to)       params.set('to',   to);
  if (minUp)    params.set('minUp', minUp);
  if (category) params.set('category', category);

  try {
    console.log('[AdminSearch] Fetching:', `/api/admin/search?${params.toString()}`);
    const resp    = await api(`/api/admin/search?${params.toString()}`, { nocache: true, skipHtmlRedirect: true });
    const results = resp.results || [];
    console.log('[AdminSearch] Results:', results);

    const tbody = ensureTbody('#searchTable');
    if (!tbody) {
      showErr('Results table body not found');
      return;
    }

    tbody.innerHTML = '';
    if (!results.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No results found for "${escapeHTML(qStr)}"</td></tr>`;
      return;
    }

    // Row building
    results.forEach(r => {
      console.log('Row data:', r);

      // Determine display for “public author”
      const publicAuthor = r.isAnonymous
        ? 'Anonymous'
        : (r.author?.name || r.author?.email || r.author_name || '—');

      // Determine “real” author (internal/admin only)
      const realAuthorName = r.realAuthor?.name || r.realAuthor?.email || '—';

      // Build “Anon / Real Author” display
      const anonInfo = r.isAnonymous
        ? `Yes → ${realAuthorName}`
        : `No → ${realAuthorName}`;

      // Build link
      let linkHref = '#';
      if (r.type === 'thread' && r._id) {
        linkHref = `thread.html?id=${encodeURIComponent(r._id)}`;
      } else if (r.type === 'comment' && r._id) {
        linkHref = `thread.html?id=${encodeURIComponent(r.thread)}&comment=${encodeURIComponent(r._id)}`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHTML(new Date(r.createdAt || Date.now()).toLocaleString())}</td>
        <td>${escapeHTML(r.type || '')}</td>
        <td>${escapeHTML(r.title || r.snippet || '(no title)')}</td>
        <td>${escapeHTML(publicAuthor)}</td>
        <td>${escapeHTML(anonInfo)}</td>
        <td>${escapeHTML(String(r.upvoteCount ?? r.upvotes ?? ''))}</td>
        <td><a href="${escapeHTML(linkHref)}" target="_blank">View</a></td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('[AdminSearch] Failed:', err);
    showErr(`Search failed: ${err?.error || err?.message || 'Unknown error'}`);
  }
}


// Run init when DOM is ready
document.addEventListener('DOMContentLoaded', init);

