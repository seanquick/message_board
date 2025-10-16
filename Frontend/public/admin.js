// frontend/public/admin.js

import { api, escapeHTML, timeAgo, q, qa, refreshMe, me as meVar } from './main.js';

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

const state = {
  users: { page: 1, limit: 50, total: 0 },
  comments: { page: 1, limit: 50, total: 0 },
};

// --- METRICS ---
async function loadMetrics() {
  try {
    const { metrics } = await api(`/api/admin/metrics?t=${Date.now()}`);
    setText('#mUsers', metrics.users);
    setText('#mThreads', metrics.threads);
    setText('#mComments', metrics.comments);
    setText('#mReports', metrics.reports);
  } catch (e) {
    showErr(`Failed to load metrics: ${e?.error || e?.message}`);
  }
}

// --- USERS Section ---
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
    const users = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.users)
        ? payload.users
        : Array.isArray(payload.data)
          ? payload.data
          : [];

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
        const res = await api(`/api/admin/users/${id}/note`, { method: 'POST', body: { note: final } });
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
      const userObj = payload.user || { _id: uid };
      showUserContentModal(userObj, payload.threads || [], payload.comments || []);
  } catch (e) {
    showErr(`Failed to fetch user content: ${e?.error || e?.message}`);
  }
}

function showUserContentModal(user, threads, comments) {
  const modal = document.createElement('div');
  modal.className = 'user-content-modal';
  modal.style = 'position:fixed;top:10%;left:10%;width:80%;height:80%;background:white;overflow:auto;z-index:10000;padding:1rem;border:1px solid #ccc';

  const displayName = user.name || user.email || user._id;
  const displayEmail = user.email || '';

  modal.innerHTML = `
    <button class="close-modal" style="position:absolute;top:1rem;right:1rem">Close</button>
    <h2>User: ${escapeHTML(displayName)}</h2>
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




// --- THREADS Section ---
async function loadThreads() {
  const tbody = ensureTbody('#threadsTable');
  if (!tbody) return;
  try {
    const includeDeleted = q('#tIncludeDeleted')?.checked;
    const params = new URLSearchParams();
    params.set('t', String(Date.now()));
    if (includeDeleted) params.set('includeDeleted', '1');
    const url = `/api/admin/search?type=threads&${params.toString()}`;
    const resp = await api(url, { nocache: true, skipHtmlRedirect: true });
    const { results } = resp;
    tbody.innerHTML = '';
    if (!Array.isArray(results) || !results.length) {
      tbody.innerHTML = '<tr><td colspan="7">No threads found.</td></tr>';
      return;
    }
    for (const t of results) {
      const tr = document.createElement('tr');
      tr.dataset.id = t._id;
      const authorDisplay = t.author
        ? `${escapeHTML(t.author.name || '')} (${escapeHTML(t.author.email || '')})`
        : escapeHTML(t.authorId || '');
      tr.innerHTML = `
        <td>${new Date(t.createdAt).toLocaleString()}</td>
        <td>${escapeHTML(t.title || '(no title)')}</td>
        <td>${authorDisplay}</td>
        <td>${t.upvoteCount ?? t.upvotes ?? 0}</td>
        <td>${t.commentCount ?? ''}</td>
        <td>${escapeHTML(t.status || '')}</td>
        <td class="row gap-05">
          <button class="btn tiny viewThread">View</button>
          <button class="btn tiny pinBtn">Pin/Unpin</button>
          <button class="btn tiny lockBtn">Lock/Unlock</button>
          <button class="btn tiny deleteThread">Delete/Restore</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('.viewThread').forEach(btn => {
        btn.addEventListener('click', ev => {
          const tr = ev.currentTarget.closest('tr');
          const tid = tr.dataset.id;
          if (tid) {
            window.open(`thread.html?id=${encodeURIComponent(tid)}`, '_blank');
          }
        });
      });

    tbody.querySelectorAll('.pinBtn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const tr = ev.currentTarget.closest('tr');
      const tid = tr.dataset.id;
      const isNowPinned = !(tr.dataset.pinned === 'true');
      const note = prompt('Note (optional):');
      try {
        await api(`/api/admin/threads/${tid}/pin`, { method: 'POST', body: { pinned: isNowPinned, note } });
        loadThreads();
      } catch (e) {
        showErr(`Failed to pin/unpin: ${e?.error || e?.message}`);
      }
    }));
    tbody.querySelectorAll('.lockBtn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const tr = ev.currentTarget.closest('tr');
      const tid = tr.dataset.id;
      const isNowLocked = !(tr.dataset.locked === 'true');
      const note = prompt('Note (optional):');
      try {
        await api(`/api/admin/threads/${tid}/lock`, { method: 'POST', body: { locked: isNowLocked, note } });
        loadThreads();
      } catch (e) {
        showErr(`Failed to lock/unlock: ${e?.error || e?.message}`);
      }
    }));
    tbody.querySelectorAll('.deleteThread').forEach(btn => btn.addEventListener('click', async (ev) => {
      const tr = ev.currentTarget.closest('tr');
      const tid = tr.dataset.id;
      const isDeleted = !(tr.dataset.deleted === 'true');
      const note = prompt('Reason (optional):');
      try {
        await api(`/api/admin/threads/${tid}/delete`, { method: 'POST', body: { deleted: isDeleted, reason: note } });
        loadThreads();
      } catch (e) {
        showErr(`Failed to delete/restore: ${e?.error || e?.message}`);
      }
    }));
  } catch (e) {
    renderErrorRow('#threadsTable', `Error loading threads: ${e?.error || e?.message}`, 7);
  }
}

// --- COMMENTS Section ---
async function loadComments() {
  const tbody = ensureTbody('#commentsTable');
  if (!tbody) return;
  try {
    const includeDeleted = q('#cIncludeDeleted')?.checked;
    const params = new URLSearchParams();
    params.set('t', String(Date.now()));
    if (includeDeleted) params.set('includeDeleted', '1');
    const url = `/api/admin/search?type=comments&${params.toString()}`;
    const resp = await api(url, { nocache: true, skipHtmlRedirect: true });
    const { results } = resp;
    tbody.innerHTML = '';
    if (!Array.isArray(results) || !results.length) {
      tbody.innerHTML = '<tr><td colspan="7">No comments found.</td></tr>';
      return;
    }
    for (const c of results) {
      const tr = document.createElement('tr');
      tr.dataset.id = c._id;
      const authorDisplay = c.author
        ? `${escapeHTML(c.author.name || '')} (${escapeHTML(c.author.email || '')})`
        : escapeHTML(c.authorId || '');
      tr.innerHTML = `
        <td>${new Date(c.createdAt).toLocaleString()}</td>
        <td>${escapeHTML(c.snippet || '')}</td>
        <td>${authorDisplay}</td>
        <td>${escapeHTML(c.thread || '')}</td>
        <td>${c.upvoteCount ?? 0}</td>
        <td>${escapeHTML(c.isDeleted ? 'Deleted' : '')}</td>
        <td class="row gap-05">
          <button class="btn tiny viewComment">View</button>
          <button class="btn tiny delRestoreComment">Delete/Restore</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.viewComment').forEach(btn => {
      btn.addEventListener('click', ev => {
        const tr = ev.currentTarget.closest('tr');
        const tid = tr.querySelector('td:nth-child(4)')?.textContent?.trim();
        if (tid) {
          window.open(`thread.html?id=${encodeURIComponent(tid)}`, '_blank');
        }
      });
    });

    tbody.querySelectorAll('.delRestoreComment').forEach(btn => btn.addEventListener('click', async (ev) => {
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
    }));
  } catch (e) {
    renderErrorRow('#commentsTable', `Error loading comments: ${e?.error || e?.message}`, 7);
  }
}
 
// --- REPORTS Section ---
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
    const url = `/api/admin/${path}?${params.toString()}`;
    const resp = await api(url, { nocache: true, skipHtmlRedirect: true });
    const list = resp[group ? 'groups' : 'reports'];
    tbody.innerHTML = '';
    if (!Array.isArray(list) || !list.length) {
      tbody.innerHTML = '<tr><td colspan="9">No reports found.</td></tr>';
      return;
    }
    for (const r of list) {
      const tr = document.createElement('tr');
      const reportId = r._id || (r.ids && r.ids.length ? r.ids[0] : '');
      tr.dataset.id = reportId;
      const reporterName = r.reporter?.name || r.reporter?.email || '(unknown)';
      tr.innerHTML = `
        <td><input type="checkbox" class="rSelect" data-id="${reportId}"></td>
        <td>${new Date(r.latestAt || r.createdAt).toLocaleString()}</td>
        <td>${escapeHTML(r.targetType || '')}</td>
        <td>${escapeHTML(r.snippet || '')}</td>
        <td>${escapeHTML(r.category || '')}</td>
        <td>${escapeHTML(reporterName)}</td>
        <td>${escapeHTML(r.status || '')}</td>
        <td>
          <button class="btn tiny viewReport">View</button>
          <button class="btn tiny resolveOne">Resolve</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.viewReport').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const tr = btn.closest('tr');
        const id = tr?.dataset.id;
        if (id) openReportDetail(id);
      });
    });

    tbody.querySelectorAll('.resolveOne').forEach(btn => {
      btn.addEventListener('click', async ev => {
        ev.stopPropagation();
        const tr = btn.closest('tr');
        const id = tr?.dataset.id;
        const note = prompt('Resolution note (optional):');
        if (!id) return;
        try {
          const res = await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: { resolutionNote: note || '' } });
          if (res.ok) {
            loadReports();
          } else {
            showErr(`Resolve failed: ${res.error || 'Unknown'}`);
          }
        } catch (e) {
          showErr(`Resolve error: ${e?.message || e}`);
        }
      });
    });

  } catch (e) {
    renderErrorRow('#reportsTable', `Error loading reports: ${e?.error || e?.message}`, 9);
  }
}

async function openReportDetail(reportId) {
  try {
    const resp = await api(`/api/admin/reports/${reportId}?t=${Date.now()}`, {
      nocache: true,
      skipHtmlRedirect: true
    });

    const report = resp.report;
    if (!report) {
      showErr('Report not found');
      return;
    }

    let original = null;
    let originalMeta = null;

    if (report.targetType === 'thread') {
      original = await api(`/api/threads/${report.targetId}`, { skipHtmlRedirect: true });
      originalMeta = original.thread ?? original;
    } else if (report.targetType === 'comment') {
      original = await api(`/api/comments/${report.targetId}`, { skipHtmlRedirect: true });
      originalMeta = original.comment ?? original;
    }

    showReportDetailModal(report, originalMeta);
  } catch (e) {
    console.error('openReportDetail error', e);
    showErr(`Failed to load report detail: ${e?.error || e?.message}`);
  }
}

function showReportDetailModal(report, original) {
  const modal = q('#adminReportModal');
  if (!modal) {
    console.error('Modal container not found in DOM');
    return;
  }
  const backdrop = modal.querySelector('.report-backdrop');
  const body = modal.querySelector('#reportDetailBody');
  const btnClose = modal.querySelector('#adminReportClose');
  if (!backdrop || !body || !btnClose) {
    console.error('Modal structure invalid');
    return;
  }

  backdrop.style.display = 'flex';
  btnClose.onclick = () => { backdrop.style.display = 'none'; };

  const reporterName = report.reporter?.name || report.reporter?.email || report.reporterId || '(unknown)';
  const createdAt = new Date(report.createdAt).toLocaleString();
  const updatedAt = report.updatedAt ? new Date(report.updatedAt).toLocaleString() : null;

  const category = escapeHTML(report.category || '');
  const details = escapeHTML(report.details || '');
  const status = escapeHTML(report.status || '');
  const resolutionNote = escapeHTML(report.resolutionNote || '');

  let originalHtml = '';
  if (original) {
    const titleOrSnippet = original.title
      ? original.title
      : original.snippet
        ? original.snippet
        : original.body || original.content || '(no content)';

    let origAuthor = '(unknown)';
    if (original.author && typeof original.author === 'object') {
      origAuthor = original.author.name || original.author.email || String(original.author._id || '');
    } else if (typeof original.author === 'string') {
      origAuthor = original.author;
    }

    if (report.targetType === 'thread') {
      originalHtml += `<p><strong>Thread title:</strong> <a href="thread.html?id=${encodeURIComponent(original._id)}" target="_blank">${escapeHTML(titleOrSnippet)}</a></p>`;
      originalHtml += `<p><strong>Author:</strong> ${escapeHTML(origAuthor)}</p>`;
      originalHtml += `<div style="padding:.75rem; border:1px solid #ccc; border-radius:4px; margin-top:.5rem;">
          <pre style="white-space:pre-wrap;">${escapeHTML(original.body || original.content || '')}</pre>
        </div>`;
    } else if (report.targetType === 'comment') {
      originalHtml += `<p><strong>Author:</strong> ${escapeHTML(origAuthor)}</p>`;
      if (original.thread) {
        originalHtml += `<p><strong>Thread:</strong> <a href="thread.html?id=${encodeURIComponent(original.thread)}" target="_blank">${escapeHTML(String(original.thread))}</a></p>`;
      }
      originalHtml += `<div style="padding:.75rem; border:1px solid #ccc; border-radius:4px; margin-top:.5rem;">
          <pre style="white-space:pre-wrap;">${escapeHTML(original.body || original.content || '')}</pre>
        </div>`;
    } else {
      originalHtml = `<em>(Original content unavailable or unknown type)</em>`;
    }
  } else {
    originalHtml = `<em>(Original content not found)</em>`;
  }

  const resolveBtnHtml = (report.status !== 'resolved' && report.status !== 'closed')
    ? `<button id="modalResolveBtn" class="btn tiny" style="margin-top: 1rem;">Resolve</button>`
    : '';

  body.innerHTML = `
    <p><strong>Reporter:</strong> ${escapeHTML(reporterName)}</p>
    <p><strong>Created At:</strong> ${createdAt}</p>
    ${updatedAt ? `<p><strong>Last Updated:</strong> ${updatedAt}</p>` : ''}
    <p><strong>Category:</strong> ${category}</p>
    <p><strong>Details:</strong></p>
    <div style="padding:.5rem; border:1px solid #ddd; border-radius:4px; background:#f9f9f9;">
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
        const res = await api(`/api/admin/reports/${report._id}/resolve`, {
          method: 'POST',
          body: { resolutionNote: note || '' }
        });
        if (res.ok || res.report) {
          backdrop.style.display = 'none';
          loadReports();
        } else {
          showErr(`Resolve failed: ${res.error || 'Unknown'}`);
        }
      } catch (e) {
        showErr(`Resolve error: ${e?.error || e?.message || e}`);
      }
    };
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
    await api('/api/admin/reports/resolve', { method: 'POST', body: { reportIds: ids, resolutionNote: note || '' } });
    loadReports();
  } catch (e) {
    showErr(`Bulk resolve failed: ${e?.error || e?.message}`);
  }
}

function exportCommentsCSV() {
  window.location.href = `/api/admin/comments/export.csv?t=${Date.now()}`;
}

function exportUsersCSV() {
  window.location.href = `/api/admin/users/export.csv?t=${Date.now()}`;
}

function exportReportsCSV() {
  window.location.href = `/api/admin/reports/export.csv?t=${Date.now()}`;
}

// --- SEARCH ---
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

  const resp = await api(`/api/admin/search?${params.toString()}`, { nocache: true, skipHtmlRedirect: true });
  const { results } = resp;

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

// --- INIT ---
async function init() {
  console.log('admin init running');
  try {
    await refreshMe();
    meUser = meVar;

    await api(`/api/admin/ping?t=${Date.now()}`);

    q('#uRefresh')?.addEventListener('click', () => { state.users.page = 1; loadUsers(); });
    q('#uSearch')?.addEventListener('input', debounce(() => { state.users.page = 1; loadUsers(); }));

    q('#tRefresh')?.addEventListener('click', loadThreads);
    q('#tIncludeDeleted')?.addEventListener('change', loadThreads);

    q('#cRefresh')?.addEventListener('click', loadComments);
    q('#cIncludeDeleted')?.addEventListener('change', loadComments);

    q('#rRefresh')?.addEventListener('click', loadReports);
    q('#rGroup')?.addEventListener('change', loadReports);
    q('#rFilter')?.addEventListener('change', loadReports);
    q('#rBulkResolve')?.addEventListener('click', bulkResolveSelected);

    q('#rExport')?.addEventListener('click', exportReportsCSV);
    q('#cExport')?.addEventListener('click', exportCommentsCSV);
    q('#uExport')?.addEventListener('click', exportUsersCSV);

    q('#rSelectAll')?.addEventListener('change', () => {
      const checked = q('#rSelectAll')?.checked;
      qa('#reportsTable tbody .rSelect').forEach(cb => { cb.checked = !!checked; });
    });

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
