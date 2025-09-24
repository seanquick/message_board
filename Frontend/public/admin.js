// Frontend/public/admin.js
// Admin dashboard — grouped reports + keyboard shortcuts + note templates + SSE + CSV + pagination + global search + notif bell
// Fully self-contained (drop-in).

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
  { label: 'Harassment', text: 'Resolved: harassment/abusive language toward another user. Action: {action}. Future incidents may lead to suspension. Reviewed by {admin} on {date}.' },
  { label: 'Off-topic', text: 'Resolved: off-topic for thread context. Action: {action}. Please keep discussion aligned with the thread subject. {threadId}' },
  { label: 'Illegal', text: 'Resolved: content reported for illegal/unsafe material. Action: {action}. Details recorded. Reviewed by {admin} on {date}.' },
  { label: 'NSFW', text: 'Resolved: NSFW/sexual content outside policy. Action: {action}. Reviewed by {admin} on {date}.' },
  { label: 'Duplicate', text: 'Resolved: duplicate of previously addressed content. Action: {action}. {targetType}={threadId}{commentId?} Reviewed by {admin} on {date}.' },
  { label: 'Personal info', text: 'Resolved: personal info/doxxing removed. Action: {action}. Reviewed by {admin} on {date}.' },
  { label: 'Scam/Phishing', text: 'Resolved: suspected scam/phishing. Links removed and user warned/blocked as appropriate. Action: {action}. Reviewed by {admin} on {date}.' }
];
function getNoteTemplates() {
  try { const raw = localStorage.getItem('modNoteTemplates'); const arr = raw ? JSON.parse(raw) : DEFAULT_NOTE_TEMPLATES; if (Array.isArray(arr) && arr.length) return arr; } catch {}
  return DEFAULT_NOTE_TEMPLATES;
}
function formatDate(d = new Date()) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d); }
  catch { return d.toISOString(); }
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
  await refreshMe(); meUser = meVar;

  // Auth guard
  try { await api(`/api/admin/ping?t=${Date.now()}`); }
  catch (e) {
    const msg = `Admin access required or session expired: ${e?.error || e?.message || ''}`;
    showErr(msg);
    renderErrorRow('#reportsTable', msg, 8);
    renderErrorRow('#threadsTable', msg, 7);
    renderErrorRow('#commentsTable', msg, 7);
    renderErrorRow('#usersTable', msg, 6);
    return;
  }

  // Wire UI
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

  // Notif bell for admins
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
  } catch (e) { showErr(`Failed to load metrics: ${e?.error || e?.message || ''}`); }
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
    const pages = pagesFor(state.users); updatePagerUI('users', pages);

    tbody.innerHTML = '';
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="6">No users found.</td></tr>'; return; }

    for (const u of users) {
      const tr = document.createElement('tr');
      tr.dataset.id = u._id || u.id || '';
      tr.innerHTML = `
        <td>${escapeHTML(u.name || '')}${u.email ? `<br><span class="meta">${escapeHTML(u.email)}</span>` : ''}</td>
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
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.editNote').forEach(btn => btn.addEventListener('click', onEditUserNote));
    tbody.querySelectorAll('.toggleBan').forEach(btn => btn.addEventListener('click', onToggleBan));
    tbody.querySelectorAll('.setRole').forEach(btn => btn.addEventListener('click', onSetRole));
  } catch (e) {
    renderErrorRow('#usersTable', `Failed to load users: ${e?.error || e?.message || ''}`, 6);
  }
}
async function onToggleBan(ev) {
  const tr = ev.currentTarget.closest('tr'); const id = tr?.dataset?.id;
  if (!id) return; if (!confirm('Toggle ban for this user?')) return;
  try {
    const res = await api(`/api/admin/users/${id}/toggle-ban`, { method: 'POST' });
    const statusCell = tr.children[2]; const btn = tr.querySelector('.toggleBan');
    if (res.isBanned) { statusCell.innerHTML = '<span class="danger">Banned</span>'; btn.textContent = 'Unban'; }
    else { statusCell.innerHTML = '<span class="ok">Active</span>'; btn.textContent = 'Ban'; }
  } catch (e) { alert(e.message || 'Failed to toggle ban'); }
}
async function onSetRole(ev) {
  const tr = ev.currentTarget.closest('tr'); const id = tr?.dataset?.id;
  const next = ev.currentTarget.getAttribute('data-role'); if (!id || !next) return;
  if (!confirm(`Set role to "${next}"?`)) return;
  try {
    const res = await api(`/api/admin/users/${id}/role`, { method: 'POST', body: { role: next } });
    tr.children[1].textContent = res.role;
    ev.currentTarget.setAttribute('data-role', res.role === 'admin' ? 'user' : 'admin');
    ev.currentTarget.textContent = res.role === 'admin' ? 'Revoke Admin' : 'Make Admin';
  } catch (e) { alert(e.message || 'Failed to set role'); }
}
async function onEditUserNote(ev) {
  const tr = ev.currentTarget.closest('tr'); if (!tr) return;
  const id = tr.dataset.id; const current = tr.children[4]?.textContent || '';
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

/* ============================== REPORTS (flat + grouped) ============================== */
async function loadReports() {
  const tbody = ensureTbody('#reportsTable');
  try {
    const statusSel = q('#rFilter') || q('#rStatus');
    const status = (statusSel?.value || 'open').toLowerCase();

    const grouped = !!q('#rGroup')?.checked;

    if (!grouped) {
      // ---- flat mode ----
      const url = `/api/admin/reports?status=${encodeURIComponent(status)}&t=${Date.now()}`;
      const payload = await api(url, { nocache: true });
      const reports = Array.isArray(payload?.reports) ? payload.reports : [];
      tbody.innerHTML = '';
      if (!reports.length) { tbody.innerHTML = '<tr><td colspan="8">No reports.</td></tr>'; return; }

      for (const r of reports) {
        const tr = document.createElement('tr');
        tr.dataset.id = r._id;
        tr.dataset.type = r.targetType;
        tr.dataset.threadId = r.threadId || '';
        tr.dataset.commentId = r.targetType === 'comment' ? (r.targetId || '') : '';
        tr.dataset.ownerId = r.targetOwnerId || '';
        tr.dataset.note = r.resolutionNote || '';
        tr.dataset.resolvedAt = r.resolvedAt || '';
        tr.dataset.resolvedBy = r.resolvedByName || r.resolvedByEmail || r.resolvedBy || '';
        tr.dataset.category = r.category || '';

        const threadId = r.threadId || (r.targetType === 'thread' ? r.targetId : null);
        const commentId = r.targetType === 'comment' ? r.targetId : null;
        const link = threadId
          ? `thread.html?id=${encodeURIComponent(threadId)}${commentId ? `&highlight=${encodeURIComponent(commentId)}#c-${encodeURIComponent(commentId)}` : ''}`
          : '#';

        const reasonHtml = [
          r.category ? `<span class="pill">${escapeHTML(r.category)}</span>` : '',
          r.details ? `<div class="meta">${escapeHTML(r.details)}</div>` : ''
        ].join('');

        const reporterHtml = [
          escapeHTML(r.reporter?.name || ''),
          r.reporter?.email ? `<div class="meta">${escapeHTML(r.reporter.email)}</div>` : ''
        ].join('');

        const statusHtml =
          r.status === 'resolved'
            ? `<span class="ok">Resolved</span> <button class="btn tiny viewNote">View note</button> <button class="btn tiny viewHistory">History</button>`
            : `<span class="pill">Open</span>`;

        let modBtns = `<a class="btn tiny openLink" href="${link}" target="_blank" rel="noopener">Open</a>`;
        if (r.targetType === 'thread') {
          const pinned = !!r.threadFlags?.pinned;
          const locked = !!r.threadFlags?.locked;
          const deleted = !!r.threadFlags?.isDeleted;
          modBtns += `
            <button class="btn tiny pinThread" data-next="${pinned ? '0':'1'}">${pinned ? 'Unpin':'Pin'}</button>
            <button class="btn tiny lockThread" data-next="${locked ? '0':'1'}">${locked ? 'Unlock':'Lock'}</button>
            <button class="btn tiny toggleThreadDelete" data-next="${deleted ? 'restore':'delete'}">${deleted ? 'Restore':'Delete'}</button>
            ${r.targetOwnerId ? `<button class="btn tiny banOwner">Toggle Ban Author</button>` : ''}
          `;
        } else if (r.targetType === 'comment') {
          const deleted = !!r.commentFlags?.isDeleted;
          modBtns += `
            <button class="btn tiny toggleCommentDelete" data-next="${deleted ? 'restore':'delete'}">${deleted ? 'Restore':'Delete'}</button>
            ${r.targetOwnerId ? `<button class="btn tiny banOwner">Toggle Ban Author</button>` : ''}
          `;
        }
        if (r.status !== 'resolved') modBtns += `<button class="btn tiny resolve">Resolve</button>`;

        tr.innerHTML = `
          <td><input type="checkbox" class="rSelect" aria-label="Select report"></td>
          <td>${timeAgo(r.createdAt)}</td>
          <td>${escapeHTML(r.targetType || '')}</td>
          <td class="truncate mono">
            ${link !== '#' ? `<a href="${link}" target="_blank" rel="noopener">${escapeHTML(r.snippet || '')}</a>` : escapeHTML(r.snippet || '')}
          </td>
          <td>${reasonHtml}</td>
          <td>${reporterHtml}</td>
          <td>${statusHtml}</td>
          <td>${modBtns}</td>
        `;
        tbody.appendChild(tr);
      }

      // events (flat)
      tbody.querySelectorAll('.resolve').forEach(btn => btn.addEventListener('click', (ev) => {
        const row = ev.currentTarget.closest('tr'); if (!row) return;
        showResolveEditor(row);
      }));
      tbody.querySelectorAll('.viewNote').forEach(btn => btn.addEventListener('click', (ev) => {
        const row = ev.currentTarget.closest('tr'); if (!row) return;
        const note = row.dataset.note || '';
        const meta = { at: row.dataset.resolvedAt || '', by: row.dataset.resolvedBy || '' };
        showNoteViewer(row, note, meta);
      }));
      tbody.querySelectorAll('.viewHistory').forEach(btn => btn.addEventListener('click', async (ev) => {
        const row = ev.currentTarget.closest('tr'); if (!row) return;
        await showHistoryViewer(row);
      }));

      tbody.querySelectorAll('.pinThread').forEach(btn => btn.addEventListener('click', onPinThread));
      tbody.querySelectorAll('.lockThread').forEach(btn => btn.addEventListener('click', onLockThread));
      tbody.querySelectorAll('.toggleThreadDelete').forEach(btn => btn.addEventListener('click', onToggleThreadDelete));
      tbody.querySelectorAll('.toggleCommentDelete').forEach(btn => btn.addEventListener('click', onToggleCommentDelete));
      tbody.querySelectorAll('.banOwner').forEach(btn => btn.addEventListener('click', onToggleBanOwner));

      tbody.querySelectorAll('.rSelect').forEach(cb => cb.addEventListener('change', updateSelectAllState));
      qa('#reportsTable tbody tr').forEach((tr, i) => tr.addEventListener('click', () => makeActive('reports', i)));
      updateSelectAllState();
      makeActive('reports', 0, false);
      return;
    }

    // ---- grouped mode ----
    await loadReportsGrouped(tbody, status);
  } catch (e) {
    renderErrorRow('#reportsTable', `Failed to load reports: ${e?.error || e?.message || ''}`, 8);
  }
}

async function loadReportsGrouped(tbody, status) {
  const url = `/api/admin/reports/grouped?status=${encodeURIComponent(status)}&t=${Date.now()}`;
  const payload = await api(url, { nocache: true });
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  tbody.innerHTML = '';
  if (!groups.length) { tbody.innerHTML = '<tr><td colspan="8">No reports.</td></tr>'; return; }

  for (const g of groups) {
    const tr = document.createElement('tr');
    tr.dataset.group = '1';
    tr.dataset.ids = JSON.stringify(g.ids || []);
    tr.dataset.type = g.targetType;
    tr.dataset.threadId = g.threadId || '';
    tr.dataset.commentId = g.commentId || '';
    tr.dataset.ownerId = g.targetOwnerId || '';
    tr.dataset.status = g.status || 'open';
    tr.dataset.category = g.category || '';

    const link = g.threadId
      ? `thread.html?id=${encodeURIComponent(g.threadId)}${g.commentId ? `&highlight=${encodeURIComponent(g.commentId)}#c-${encodeURIComponent(g.commentId)}` : ''}`
      : '#';

    const reasonHtml = [
      g.category ? `<span class="pill">${escapeHTML(g.category)}</span>` : '',
      g.reasons?.length ? `<div class="meta">${escapeHTML(g.reasons.slice(0,3).join(' • '))}${g.reasons.length>3 ? '…' : ''}</div>` : ''
    ].join('');

    const reporterHtml = [
      (g.reporters || []).slice(0,3).map(r => escapeHTML(r.name || r.email || '')).filter(Boolean).join(', '),
      g.reporterCount && g.reporterCount > 3 ? `<div class="meta">+${g.reporterCount - 3} more</div>` : ''
    ].filter(Boolean).join(' ');

    const statusHtml =
      g.status === 'resolved'
        ? `<span class="ok">Resolved</span>`
        : g.status === 'mixed'
        ? `<span class="pill">Mixed</span>`
        : `<span class="pill">Open</span>`;

    let modBtns = `<a class="btn tiny openLink" href="${link}" target="_blank" rel="noopener">Open</a>
                   <button class="btn tiny expand">Expand</button>`;
    if (g.targetType === 'thread') {
      const pinned = !!g.threadFlags?.pinned;
      const locked = !!g.threadFlags?.locked;
      const deleted = !!g.threadFlags?.isDeleted;
      modBtns += `
        <button class="btn tiny pinThread" data-next="${pinned ? '0':'1'}">${pinned ? 'Unpin':'Pin'}</button>
        <button class="btn tiny lockThread" data-next="${locked ? '0':'1'}">${locked ? 'Unlock':'Lock'}</button>
        <button class="btn tiny toggleThreadDelete" data-next="${deleted ? 'restore':'delete'}">${deleted ? 'Restore':'Delete'}</button>
        ${g.targetOwnerId ? `<button class="btn tiny banOwner">Toggle Ban Author</button>` : ''}
      `;
    } else if (g.targetType === 'comment') {
      const deleted = !!g.commentFlags?.isDeleted;
      modBtns += `
        <button class="btn tiny toggleCommentDelete" data-next="${deleted ? 'restore':'delete'}">${deleted ? 'Restore':'Delete'}</button>
        ${g.targetOwnerId ? `<button class="btn tiny banOwner">Toggle Ban Author</button>` : ''}
      `;
    }
    if (g.openCount > 0) modBtns += `<button class="btn tiny resolveGroup">Resolve group (${g.openCount})</button>`;

    tr.innerHTML = `
      <td><input type="checkbox" class="rSelect" aria-label="Select group"></td>
      <td>${timeAgo(g.latestAt)}</td>
      <td>${escapeHTML(g.targetType)}</td>
      <td class="truncate mono">
        ${link !== '#' ? `<a href="${link}" target="_blank" rel="noopener">${escapeHTML(g.snippet || '')}</a>` : escapeHTML(g.snippet || '')}
        <span class="pill" title="Reports in group">×${g.count}</span>
      </td>
      <td>${reasonHtml}</td>
      <td>${reporterHtml || ''}</td>
      <td>${statusHtml}</td>
      <td>${modBtns}</td>
    `;
    tbody.appendChild(tr);

    const sub = document.createElement('tr');
    sub.className = 'subRow';
    sub.style.display = 'none';
    sub.innerHTML = `<td colspan="8"><div class="subList">Loading…</div></td>`;
    tbody.appendChild(sub);
  }

  // events (grouped)
  tbody.querySelectorAll('.expand').forEach(btn => btn.addEventListener('click', onToggleGroupExpand));
  tbody.querySelectorAll('.resolveGroup').forEach(btn => btn.addEventListener('click', onResolveGroup));
  tbody.querySelectorAll('.pinThread').forEach(btn => btn.addEventListener('click', onPinThread));
  tbody.querySelectorAll('.lockThread').forEach(btn => btn.addEventListener('click', onLockThread));
  tbody.querySelectorAll('.toggleThreadDelete').forEach(btn => btn.addEventListener('click', onToggleThreadDelete));
  tbody.querySelectorAll('.toggleCommentDelete').forEach(btn => btn.addEventListener('click', onToggleCommentDelete));
  tbody.querySelectorAll('.banOwner').forEach(btn => btn.addEventListener('click', onToggleBanOwner));

  tbody.querySelectorAll('.rSelect').forEach(cb => cb.addEventListener('change', updateSelectAllState));
  qa('#reportsTable tbody tr').forEach((tr, i) => tr.addEventListener('click', () => makeActive('reports', tr.classList.contains('subRow') ? i-1 : i)));
  updateSelectAllState();
  makeActive('reports', 0, false);
}

/* --- expand a group into inline details --- */
async function onToggleGroupExpand(ev) {
  const row = ev.currentTarget.closest('tr');
  const next = row?.nextElementSibling;
  if (!next || !next.classList.contains('subRow')) return;

  if (next.style.display === 'none') {
    // open
    const ids = JSON.parse(row.dataset.ids || '[]');
    next.style.display = '';
    const box = next.querySelector('.subList');
    box.innerHTML = 'Loading…';
    try {
      const status = (q('#rFilter')?.value || 'open').toLowerCase();
      const payload = await api(`/api/admin/reports?status=${encodeURIComponent(status)}&t=${Date.now()}`, { nocache: true });
      const all = Array.isArray(payload?.reports) ? payload.reports : [];
      const details = all.filter(r => ids.includes(String(r._id)));
      box.innerHTML = details.length
        ? `
          <div class="meta" style="margin-bottom:.35rem">${details.length} item(s)</div>
          <ul style="margin:0; padding-left:1.1rem">
            ${details.map(r => `
              <li>
                <span class="mono">${escapeHTML(timeAgo(r.createdAt))}</span>
                — ${escapeHTML(r.reporter?.name || r.reporter?.email || 'Anonymous')}
                ${r.details ? ` • <span class="meta">${escapeHTML(r.details)}</span>` : ''}
                ${r.status === 'resolved' ? ` • <span class="ok">Resolved</span>` : ''}
              </li>
            `).join('')}
          </ul>
        ` : '<div class="meta">No detail available.</div>';
    } catch (e) {
      box.innerHTML = `<div class="danger">${escapeHTML(e?.error || e?.message || 'Failed to load group details')}</div>`;
    }
  } else {
    next.style.display = 'none';
  }
}

/* --- resolve group via bulk endpoint --- */
async function onResolveGroup(ev) {
  const row = ev.currentTarget.closest('tr');
  const ids = JSON.parse(row.dataset.ids || '[]');
  if (!ids.length) return;
  showModEditor(row, {
    title: `Resolve ${ids.length} report(s) in group`,
    placeholder: 'Add a resolution note for this group…',
    confirmLabel: 'Save & Resolve All',
    onConfirm: async (note) => {
      await api('/api/admin/reports/bulk-resolve', { method: 'POST', body: { ids, note } });
      await loadReports(); await loadMetrics();
    }
  });
}

/* --- bulk resolve (selected) --- */
function getSelectedReportIds() {
  const rows = qa('#reportsTable tbody .rSelect:checked').map(cb => cb.closest('tr')).filter(Boolean);
  const ids = [];
  for (const r of rows) {
    if (r.dataset.group === '1') {
      try { const arr = JSON.parse(r.dataset.ids || '[]'); ids.push(...arr); } catch {}
    } else {
      if (r.dataset.id) ids.push(r.dataset.id);
    }
  }
  return [...new Set(ids)];
}
async function bulkResolveSelected() {
  const ids = getSelectedReportIds();
  if (!ids.length) { alert('Select at least one report (or group) first.'); return; }
  const note = prompt('Add a resolution note for all selected (optional):', '') || '';
  try {
    await api('/api/admin/reports/bulk-resolve', { method: 'POST', body: { ids, note } });
    await loadReports(); await loadMetrics();
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to bulk resolve.');
  }
}
function updateSelectAllState() {
  const boxes = qa('#reportsTable tbody .rSelect');
  const all = boxes.length > 0 && boxes.every(cb => cb.checked);
  const hdr = q('#rSelectAll'); if (hdr) hdr.checked = all;
}

/* ----- inline resolve editor (single) ----- */
function ctxFromRow(row, action='Resolved') {
  return {
    action,
    targetType: row?.dataset?.type || '',
    threadId: row?.dataset?.threadId || '',
    commentId: row?.dataset?.commentId || '',
    category: row?.dataset?.category || ''
  };
}
function showResolveEditor(reportRow) {
  qa('#reportsTable tr.resolveNoteRow, #reportsTable tr.noteViewRow, #reportsTable tr.historyViewRow').forEach(r => r.remove());
  const cols = reportRow.children.length; const id = reportRow.dataset.id;
  const noteRow = document.createElement('tr');
  noteRow.className = 'resolveNoteRow';
  noteRow.innerHTML = `
    <td colspan="${cols}">
      <div class="noteBox" style="display:flex;gap:.5rem;align-items:flex-start">
        <div style="flex:1 1 auto">
          <textarea class="resolutionNote" placeholder="Add a note: what you did and why (optional)…" style="width:100%;min-height:110px"></textarea>
        </div>
        <div class="row gap-05" style="flex-shrink:0;display:flex;flex-direction:column">
          <button class="btn tiny confirmResolve">Save & Resolve</button>
          <button class="btn tiny cancelResolve">Cancel</button>
        </div>
      </div>
    </td>
  `;
  reportRow.insertAdjacentElement('afterend', noteRow);
  const textarea = noteRow.querySelector('.resolutionNote');
  renderTemplateChips(noteRow.querySelector('.noteBox'), textarea, ctxFromRow(reportRow, 'Resolved'));
  const btnSave = noteRow.querySelector('.confirmResolve'); const btnCancel = noteRow.querySelector('.cancelResolve');
  textarea?.focus();
  btnCancel?.addEventListener('click', () => noteRow.remove());
  btnSave?.addEventListener('click', async () => {
    const note = (textarea?.value || '').trim();
    btnSave.disabled = true; btnCancel.disabled = true; btnSave.textContent = 'Saving…';
    try {
      await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: { note } });
      noteRow.remove(); await loadReports(); await loadMetrics();
    } catch (e) {
      alert(e?.error || e?.detail || e?.message || 'Failed to resolve report.');
      btnSave.disabled = false; btnCancel.disabled = false; btnSave.textContent = 'Save & Resolve';
    }
  });
}

/* ----- note & history viewers (single report) ----- */
function showNoteViewer(reportRow, note, meta = {}) {
  qa('#reportsTable tr.noteViewRow, #reportsTable tr.resolveNoteRow, #reportsTable tr.historyViewRow').forEach(r => r.remove());
  const cols = reportRow.children.length;
  const created = meta.at ? timeAgo(meta.at) : '';
  const by = meta.by ? escapeHTML(String(meta.by)) : '';
  const row = document.createElement('tr');
  row.className = 'noteViewRow';
  row.innerHTML = `
    <td colspan="${cols}">
      <div class="noteBox" style="padding:.75rem;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa">
        <div class="meta" style="margin-bottom:.5rem;color:#6b7280;">
          <strong>Resolution note</strong>
          ${created ? ` • ${escapeHTML(created)}` : ''} ${by ? ` • by ${by}` : ''}
        </div>
        <div class="mono" style="white-space:pre-wrap">${escapeHTML(note || '(no note provided)')}</div>
        <div style="margin-top:.5rem"><button class="btn tiny closeNote">Close</button></div>
      </div>
    </td>
  `;
  reportRow.insertAdjacentElement('afterend', row);
  row.querySelector('.closeNote')?.addEventListener('click', () => row.remove());
}
async function showHistoryViewer(reportRow) {
  qa('#reportsTable tr.noteViewRow, #reportsTable tr.resolveNoteRow, #reportsTable tr.historyViewRow').forEach(r => r.remove());
  const id = reportRow.dataset.id; const cols = reportRow.children.length;
  let logs = [];
  try { const payload = await api(`/api/admin/reports/${encodeURIComponent(id)}/logs?t=${Date.now()}`, { nocache: true }); logs = Array.isArray(payload?.logs) ? payload.logs : []; }
  catch (e) { logs = [{ type:'error', note: e?.error || e?.message || 'Failed to load history', createdAt: new Date().toISOString(), actor:{} }]; }
  const row = document.createElement('tr');
  row.className = 'historyViewRow';
  row.innerHTML = `
    <td colspan="${cols}">
      <div style="padding:.75rem;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb">
        <div class="meta" style="margin-bottom:.5rem;color:#6b7280;"><strong>Moderation history</strong></div>
        ${logs.length ? '' : '<div class="meta">No history yet.</div>'}
        <ol style="margin:0;padding-left:1.25rem">
          ${logs.map(l => {
            const exact = l.createdAt ? new Date(l.createdAt).toISOString() : '';
            const who = l.actor?.name || l.actor?.email || '';
            const bulk = l.meta?.bulk ? '<span class="pill" style="margin-left:.35rem">bulk</span>' : '';
            const backfill = l.meta?.backfill ? '<span class="pill" style="margin-left:.35rem">backfill</span>' : '';
            return `
              <li style="margin:.35rem 0">
                <span class="mono" title="${escapeHTML(exact)}" style="color:#374151">${escapeHTML(timeAgo(l.createdAt))}</span>
                — <span class="pill" style="background:#eef">${escapeHTML(l.type)}</span>
                ${bulk}${backfill}
                ${who ? ` • <span class="meta">by ${escapeHTML(who)}</span>` : ''}
                ${l.note ? `<div class="mono" style="white-space:pre-wrap;margin-top:.25rem">${escapeHTML(l.note)}</div>` : ''}
              </li>
            `;
          }).join('')}
        </ol>
        <div style="margin-top:.5rem"><button class="btn tiny closeHistory">Close</button></div>
      </div>
    </td>
  `;
  reportRow.insertAdjacentElement('afterend', row);
  row.querySelector('.closeHistory')?.addEventListener('click', () => row.remove());
}

/* ---------- Reusable inline editor (moderation actions) ---------- */
function closeAllInlineEditors() {
  qa('#reportsTable tr.modEditorRow, #threadsTable tr.modEditorRow, #reportsTable tr.resolveNoteRow, #reportsTable tr.noteViewRow, #reportsTable tr.historyViewRow')
    .forEach(r => r.remove());
}
function showModEditor(hostRow, {
  title = 'Confirm action',
  placeholder = 'Optional note…',
  confirmLabel = 'Confirm',
  includeTextarea = true,
  onConfirm = async () => {}
} = {}) {
  closeAllInlineEditors();
  const cols = hostRow.children.length || 1;
  const row = document.createElement('tr');
  row.className = 'modEditorRow';
  row.innerHTML = `
    <td colspan="${cols}">
      <div class="noteBox" style="display:flex;gap:.5rem;align-items:flex-start;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;padding:.75rem;">
        <div style="flex:1 1 auto">
          <div class="meta" style="margin-bottom:.5rem;color:#6b7280;"><strong>${escapeHTML(title)}</strong></div>
          ${includeTextarea ? `<textarea class="modNote" placeholder="${escapeHTML(placeholder)}" style="width:100%;min-height:110px"></textarea>` : ''}
        </div>
        <div class="row gap-05" style="flex-shrink:0;display:flex;flex-direction:column;gap:.5rem">
          <button class="btn tiny confirmMod">${escapeHTML(confirmLabel)}</button>
          <button class="btn tiny cancelMod">Cancel</button>
        </div>
      </div>
    </td>
  `;
  hostRow.insertAdjacentElement('afterend', row);
  const $confirm = row.querySelector('.confirmMod'); const $cancel  = row.querySelector('.cancelMod'); const $note = row.querySelector('.modNote');
  if ($note) {
    const actionWord = (confirmLabel || '').replace(/^Save &\s*/i,'') || 'Confirm';
    renderTemplateChips(row.querySelector('.noteBox'), $note, ctxFromRow(hostRow, actionWord));
  }
  $cancel?.addEventListener('click', () => row.remove());
  $confirm?.addEventListener('click', async () => {
    const note = includeTextarea ? ($note?.value || '').trim() : '';
    $confirm.disabled = true; $cancel.disabled = true; $confirm.textContent = 'Saving…';
    try { await onConfirm(note); row.remove(); } catch (e) {
      alert(e?.error || e?.message || 'Failed to complete action');
      $confirm.disabled = false; $cancel.disabled = false; $confirm.textContent = confirmLabel;
    }
  });
  if ($note) setTimeout(() => $note?.focus(), 10);
}

/* ----- report row handlers (thread/comment actions) ----- */
async function onPinThread(ev)        { await modThreadBtn(ev, 'Pin',   'pin',   'pinned'); }
async function onLockThread(ev)       { await modThreadBtn(ev, 'Lock',  'lock',  'locked'); }
async function onToggleThreadDelete(ev){ await modThreadBtn(ev, 'Delete','delete','deleted', true); }
async function modThreadBtn(ev, label, endpoint, jsonKey, deleteToggle=false) {
  const tr = ev.currentTarget.closest('tr'); if (!tr) return;
  const isGroup = tr.dataset.group === '1';
  const id = isGroup ? tr.dataset.threadId : (tr.dataset.threadId || tr.dataset.id);
  if (!id) return;

  const attr = (ev.currentTarget.getAttribute('data-next') || '').toLowerCase();
  const next = deleteToggle
    ? (attr === 'delete' || attr === '1' || attr === 'true')   // delete/restore buttons
    : (attr === '1' || attr === 'true');                       // pin/lock buttons

  const action = deleteToggle
    ? (next ? 'Delete' : 'Restore')
    : (next ? label : `Un${label.toLowerCase()}`);

  showModEditor(tr, {
    title: `${action} thread`,
    placeholder: `Optional note for ${action.toLowerCase()}…`,
    confirmLabel: `Save & ${action}`,
    onConfirm: async (note) => {
      const body = deleteToggle ? { deleted: next, reason: note } : { [jsonKey]: next, note };
      await api(`/api/admin/threads/${id}/${endpoint}`, { method: 'POST', body });
      await loadReports(); await loadThreads(); await loadMetrics();
    }
  });
}
async function onToggleCommentDelete(ev) {
  const tr = ev.currentTarget.closest('tr'); if (!tr) return;
  const id = tr.dataset.commentId;
  const attr = (ev.currentTarget.getAttribute('data-next') || '').toLowerCase();
  const willDelete = (attr === 'delete' || attr === '1' || attr === 'true');
  const action = willDelete ? 'Delete' : 'Restore';

  showModEditor(tr, {
    title: `${action} comment`,
    placeholder: willDelete ? 'Reason for delete (optional)…' : 'Reason for restore (optional)…',
    confirmLabel: `Save & ${action}`,
    onConfirm: async (note) => {
      await api(`/api/admin/comments/${id}/delete`, { method: 'POST', body: { deleted: willDelete, reason: note } });
      await loadReports(); await loadMetrics();
    }
  });
}
async function onToggleBanOwner(ev) {
  const tr = ev.currentTarget.closest('tr'); if (!tr) return;
  const id = tr.dataset.ownerId; if (!id) return alert('No content author found.');
  showModEditor(tr, {
    title: 'Toggle ban for content author',
    includeTextarea: false,
    confirmLabel: 'Confirm',
    onConfirm: async () => { await api(`/api/admin/users/${id}/toggle-ban`, { method: 'POST' }); await loadReports(); await loadUsers(); }
  });
}

/* ============================== THREADS ============================== */
async function loadThreads() {
  const tbody = ensureTbody('#threadsTable');
  try {
    const includeDeleted = q('#tIncludeDeleted')?.checked ? 1 : 0;
    const url = `/api/threads?includeDeleted=${includeDeleted}&t=${Date.now()}`;
    const payload = await api(url, { nocache: true });
    const items = Array.isArray(payload) ? payload : (payload?.threads || []);
    tbody.innerHTML = '';

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="7">No threads.</td></tr>`;
      return;
    }

    for (const t of items) {
      const link = `thread.html?id=${encodeURIComponent(t._id)}`;
      const titleHtml = `<a href="${link}" target="_blank" rel="noopener">${escapeHTML(t.title || '(untitled)')}</a>`;
      const authorName = t.author?.name || t.user?.name || t.author_display || t.authorName || '';
      const pinned = !!(t.isPinned || t.pinned);
      const locked = !!(t.isLocked || t.locked);
      const deleted = !!t.isDeleted;

      const badges = [
        pinned ? '<span class="pill">Pinned</span>' : '',
        locked ? '<span class="pill">Locked</span>' : '',
        deleted ? '<span class="danger">Deleted</span>' : '<span class="ok">Active</span>'
      ].filter(Boolean).join(' ');

      const tr = document.createElement('tr');
      tr.dataset.id = t._id;

      tr.innerHTML = `
        <td>${timeAgo(t.createdAt)}</td>
        <td class="truncate">${titleHtml}</td>
        <td>${escapeHTML(authorName)}</td>
        <td>${Number(t.upvoteCount || 0)}</td>
        <td>${Number(t.commentCount || 0)}</td>
        <td>${badges}</td>
        <td>
          <a class="btn tiny openLink" href="${link}" target="_blank" rel="noopener">Open</a>
          <button class="btn tiny historyThreadTbl">History</button>
          <button class="btn tiny pinThreadTbl" data-next="${pinned ? '0':'1'}">${pinned ? 'Unpin':'Pin'}</button>
          <button class="btn tiny lockThreadTbl" data-next="${locked ? '0':'1'}">${locked ? 'Unlock':'Lock'}</button>
          <button class="btn tiny toggleThreadDeleteTbl" data-next="${deleted ? 'restore':'delete'}">${deleted ? 'Restore':'Delete'}</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.historyThreadTbl').forEach(btn => btn.addEventListener('click', onHistoryThreadTbl));
    tbody.querySelectorAll('.pinThreadTbl').forEach(btn => btn.addEventListener('click', onPinThreadTbl));
    tbody.querySelectorAll('.lockThreadTbl').forEach(btn => btn.addEventListener('click', onLockThreadTbl));
    tbody.querySelectorAll('.toggleThreadDeleteTbl').forEach(btn => btn.addEventListener('click', onToggleThreadDeleteTbl));
    qa('#threadsTable tbody tr').forEach((tr, i) => tr.addEventListener('click', () => makeActive('threads', i)));
    makeActive('threads', 0, false);
  } catch (e) {
    renderErrorRow('#threadsTable', `Failed to load threads: ${e?.error || e?.message || ''}`, 7);
  }
}
async function onHistoryThreadTbl(ev) {
  const tr = ev.currentTarget.closest('tr'); if (!tr) return;
  const id = tr.dataset.id; if (!id) return;
  await showThreadHistoryViewer(tr, id);
}
async function onPinThreadTbl(ev)        { await modThreadTblBtn(ev, 'Pin',   'pin',   'pinned'); }
async function onLockThreadTbl(ev)       { await modThreadTblBtn(ev, 'Lock',  'lock',  'locked'); }
async function onToggleThreadDeleteTbl(ev){ await modThreadTblBtn(ev, 'Delete','delete','deleted', true); }
async function modThreadTblBtn(ev, label, endpoint, jsonKey, deleteToggle=false) {
  const tr = ev.currentTarget.closest('tr'); if (!tr) return;
  const id = tr.dataset.id; if (!id) return;

  const attr = (ev.currentTarget.getAttribute('data-next') || '').toLowerCase();
  const next = deleteToggle
    ? (attr === 'delete' || attr === '1' || attr === 'true')   // delete/restore buttons
    : (attr === '1' || attr === 'true');                       // pin/lock buttons

  const action = deleteToggle
    ? (next ? 'Delete' : 'Restore')
    : (next ? label : `Un${label.toLowerCase()}`);

  showModEditor(tr, {
    title: `${action} thread`,
    placeholder: `Optional note for ${action.toLowerCase()}…`,
    confirmLabel: `Save & ${action}`,
    onConfirm: async (note) => {
      const body = deleteToggle ? { deleted: next, reason: note } : { [jsonKey]: next, note };
      await api(`/api/admin/threads/${id}/${endpoint}`, { method: 'POST', body });
      await loadThreads(); await loadMetrics();
    }
  });
}
async function showThreadHistoryViewer(hostRow, threadId) {
  // close any open inline editors / viewers in threads table
  qa('#threadsTable tr.modEditorRow, #threadsTable tr.threadHistoryRow').forEach(r => r.remove());
  const cols = hostRow.children.length;
  const row = document.createElement('tr');
  row.className = 'threadHistoryRow';
  row.innerHTML = `
    <td colspan="${cols}">
      <div style="padding:.75rem;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb">
        <div class="meta" style="margin-bottom:.5rem;color:#6b7280;"><strong>Thread moderation history</strong></div>
        <div class="thBox mono">Loading…</div>
        <div style="margin-top:.5rem"><button class="btn tiny closeTH">Close</button></div>
      </div>
    </td>
  `;
  hostRow.insertAdjacentElement('afterend', row);
  row.querySelector('.closeTH')?.addEventListener('click', () => row.remove());

  try {
    const payload = await api(`/api/admin/threads/${encodeURIComponent(threadId)}/logs?t=${Date.now()}`, { nocache: true });
    const logs = Array.isArray(payload?.logs) ? payload.logs : [];
    const box = row.querySelector('.thBox');
    if (!logs.length) {
      box.innerHTML = `<div class="meta">No history yet.</div>`;
      return;
    }
    box.innerHTML = `
      <ol style="margin:0;padding-left:1.25rem">
        ${logs.map(l => {
          const exact = l.createdAt ? new Date(l.createdAt).toISOString() : '';
          const who = l.actor?.name || l.actor?.email || '';
          const flags = [
            l.meta?.bulk ? 'bulk' : '',
            l.meta?.backfill ? 'backfill' : ''
          ].filter(Boolean).map(s => `<span class="pill" style="margin-left:.35rem">${escapeHTML(s)}</span>`).join('');
          return `
            <li style="margin:.35rem 0">
              <span class="mono" title="${escapeHTML(exact)}" style="color:#374151">${escapeHTML(timeAgo(l.createdAt))}</span>
              — <span class="pill" style="background:#eef">${escapeHTML(l.type)}</span>${flags}
              ${who ? ` • <span class="meta">by ${escapeHTML(who)}</span>` : ''}
              ${l.note ? `<div class="mono" style="white-space:pre-wrap;margin-top:.25rem">${escapeHTML(l.note)}</div>` : ''}
            </li>
          `;
        }).join('')}
      </ol>
    `;
  } catch (e) {
    const box = row.querySelector('.thBox');
    box.innerHTML = `<div class="danger">${escapeHTML(e?.error || e?.message || 'Failed to load history')}</div>`;
  }
}

/* ============================== COMMENTS ============================== */
async function loadComments() {
  const tbody = ensureTbody('#commentsTable');
  try {
    const params = new URLSearchParams();
    if (q('#cIncludeDeleted')?.checked) params.set('includeDeleted', '1');
    params.set('page', String(state.comments.page));
    params.set('limit', String(state.comments.limit));
    params.set('t', String(Date.now()));

    const payload = await api(`/api/admin/comments?${params.toString()}`, { nocache: true });
    const comments = Array.isArray(payload?.comments) ? payload.comments : (Array.isArray(payload) ? payload : []);
    state.comments.total = Number(payload?.total ?? comments.length ?? 0);
    const pages = pagesFor(state.comments); updatePagerUI('comments', pages);

    tbody.innerHTML = '';
    if (!comments.length) { tbody.innerHTML = '<tr><td colspan="7">No comments.</td></tr>'; return; }

    for (const c of comments) {
      const tr = document.createElement('tr');
      tr.dataset.id = c._id;
      tr.innerHTML = `
        <td>${timeAgo(c.createdAt)}</td>
        <td class="truncate">${escapeHTML(c.body || '')}</td>
        <td>${escapeHTML(c.author_name || c.author_display || '')}</td>
        <td>${escapeHTML(String(c.thread || ''))}</td>
        <td>${Number(c.upvoteCount || c.score || 0)}</td>
        <td>${c.isDeleted ? '<span class="danger">Deleted</span>' : '<span class="ok">Active</span>'}</td>
        <td></td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    renderErrorRow('#commentsTable', `Failed to load comments: ${e?.error || e?.message || ''}`, 7);
  }
}

/* ============================== GLOBAL SEARCH (admin) ============================== */
async function doSearch() {
  const tbody = ensureTbody('#searchTable');
  try {
    const params = new URLSearchParams();
    const qv = (q('#sQ')?.value || '').trim();
    const type = (q('#sType')?.value || 'all');
    const status = (q('#sStatus')?.value || '').trim();
    const from = q('#sFrom')?.value || '';
    const to   = q('#sTo')?.value || '';
    const minUp = q('#sMinUp')?.value || '';
    const category = (q('#sCategory')?.value || '').trim();
    if (qv) params.set('q', qv);
    params.set('type', type);
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (minUp) params.set('minUp', minUp);
    if (category) params.set('category', category);
    params.set('limit', '200');
    params.set('t', String(Date.now()));

    tbody.innerHTML = `<tr><td colspan="6" class="empty">Searching…</td></tr>`;
    const payload = await api(`/api/admin/search?${params.toString()}`, { nocache: true });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    tbody.innerHTML = '';
    if (!results.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty">No results.</td></tr>`; return; }

    for (const r of results) {
      const tr = document.createElement('tr');
      const statusCell =
        r.type === 'user' ? `${escapeHTML(r.role || '')} • ${r.status === 'banned' ? '<span class="danger">Banned</span>' : '<span class="ok">Active</span>'}` :
        r.type === 'report' ? `${escapeHTML(r.category || '')} • ${(r.status === 'resolved') ? '<span class="ok">Resolved</span>' : '<span class="pill">Open</span>'}` :
        r.status ? escapeHTML(r.status) : '';

      tr.innerHTML = `
        <td>${timeAgo(r.createdAt)}</td>
        <td>${escapeHTML(r.type)}</td>
        <td class="truncate">
          <div class="row" style="gap:.35rem;align-items:center">
            ${r.type === 'thread' && r.flags?.pinned ? '<span class="pill">Pinned</span>' : ''}
            ${r.type === 'thread' && r.flags?.locked ? '<span class="pill">Locked</span>' : ''}
            <strong>${escapeHTML(r.title || '(untitled)')}</strong>
          </div>
          ${r.snippet ? `<div class="meta mono">${escapeHTML(r.snippet)}</div>` : ''}
        </td>
        <td>${statusCell}</td>
        <td>${r.upvotes != null ? Number(r.upvotes) : ''}</td>
        <td>${r.link ? `<a class="btn tiny" target="_blank" rel="noopener" href="${r.link}">Open</a>` : ''}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    renderErrorRow('#searchTable', `Search failed: ${e?.error || e?.message || ''}`, 6);
  }
}
function resetSearch() {
  ['#sQ','#sType','#sStatus','#sFrom','#sTo','#sMinUp','#sCategory'].forEach(sel => {
    const el = q(sel); if (!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  const tbody = ensureTbody('#searchTable');
  tbody.innerHTML = `<tr><td colspan="6" class="empty">Enter a query and press Search.</td></tr>`;
}

/* ============================== CSV export ============================== */
function exportReportsCSV() {
  const status = q('#rFilter')?.value || 'open';
  const url = `/api/admin/reports/export.csv?status=${encodeURIComponent(status)}&t=${Date.now()}`;
  window.open(url, '_blank');
}
function exportUsersCSV() {
  const qstr = (q('#uSearch')?.value || '').trim();
  const p = new URLSearchParams();
  if (qstr) p.set('q', qstr);
  p.set('limit', '10000');
  p.set('t', String(Date.now()));
  window.open(`/api/admin/users/export.csv?${p.toString()}`, '_blank');
}
function exportCommentsCSV() {
  const p = new URLSearchParams();
  p.set('includeDeleted', q('#cIncludeDeleted')?.checked ? '1' : '0');
  p.set('limit', '10000');
  p.set('t', String(Date.now()));
  window.open(`/api/admin/comments/export.csv?${p.toString()}`, '_blank');
}

/* ============================== SSE live updates ============================== */
let _es, _esReloadReports, _esReloadMetrics, _esReloadComments, _esReloadUsers;
function startEventStream() {
  try {
    if (_es) _es.close();
    _esReloadReports = debounce(() => { loadReports(); loadMetrics(); }, 300);
    _esReloadMetrics = debounce(() => { loadMetrics(); }, 300);
    _esReloadComments = debounce(() => { loadComments(); }, 300);
    _esReloadUsers = debounce(() => { loadUsers(); }, 300);

    _es = new EventSource('/api/admin/stream'); // ok if 404; onerror is ignored
    _es.addEventListener('hello', () => {});
    _es.addEventListener('ping', () => {});
    _es.addEventListener('report:created', _esReloadReports);
    _es.addEventListener('report:resolved', _esReloadReports);
    _es.addEventListener('reports:bulk_resolved', _esReloadReports);
    _es.addEventListener('report:note_added', _esReloadReports);
    _es.addEventListener('thread:updated', () => { loadThreads(); });
    _es.addEventListener('comment:updated', _esReloadComments);
    _es.addEventListener('user:updated', _esReloadUsers);
    _es.onerror = () => {};
  } catch {}
}

/* ============================== Keyboard shortcuts ============================== */
function onKeyDown(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (e.key === '?') { toggleKbdHelp(); return; }
  if (e.key === 'j' || e.key === 'ArrowDown') { moveSelection(1); e.preventDefault(); return; }
  if (e.key === 'k' || e.key === 'ArrowUp')   { moveSelection(-1); e.preventDefault(); return; }

  const table = state.ui.activeTable || 'reports';
  const idx = state.ui.activeRow || 0;

  if (table === 'reports') {
    const rows = qa('#reportsTable tbody tr').filter(r => !r.classList.contains('subRow'));
    const row = rows[idx]; if (!row) return;

    if (e.key === 'o' || e.key === 'Enter') { row.querySelector('.openLink')?.click(); e.preventDefault(); return; }
    if (e.key === 'r') { (row.querySelector('.resolve') || row.querySelector('.resolveGroup'))?.click(); e.preventDefault(); return; }
    if (e.key === 'v') { row.querySelector('.viewNote')?.click(); e.preventDefault(); return; }
    if (e.key === 'h') { row.querySelector('.viewHistory')?.click(); e.preventDefault(); return; }
    if (e.key === 'p') { row.querySelector('.pinThread')?.click(); e.preventDefault(); return; }
    if (e.key === 'l') { row.querySelector('.lockThread')?.click(); e.preventDefault(); return; }
    if (e.key === 'd') {
      (row.querySelector('.toggleThreadDelete') || row.querySelector('.toggleCommentDelete'))?.click();
      e.preventDefault(); return;
    }
    if (e.key === 'b') { row.querySelector('.banOwner')?.click(); e.preventDefault(); return; }
  } else if (table === 'threads') {
    const rows = qa('#threadsTable tbody tr');
    const row = rows[idx]; if (!row) return;
    if (e.key === 'o' || e.key === 'Enter') { row.querySelector('.openLink')?.click(); e.preventDefault(); return; }
    if (e.key === 'h') { row.querySelector('.historyThreadTbl')?.click(); e.preventDefault(); return; }
    if (e.key === 'p') { row.querySelector('.pinThreadTbl')?.click(); e.preventDefault(); return; }
    if (e.key === 'l') { row.querySelector('.lockThreadTbl')?.click(); e.preventDefault(); return; }
    if (e.key === 'd') { row.querySelector('.toggleThreadDeleteTbl')?.click(); e.preventDefault(); return; }
  }
}
function toggleKbdHelp(force) {
  const el = q('#kbdHelp');
  if (!el) return;
  const show = typeof force === 'boolean' ? force : (el.style.display === 'none');
  el.style.display = show ? 'grid' : 'none';
}
function moveSelection(delta) {
  const table = state.ui.activeTable || 'reports';
  const rows = qa(`${table === 'reports' ? '#reportsTable' : '#threadsTable'} tbody tr`).filter(r => !r.classList.contains('subRow'));
  if (!rows.length) return;
  let idx = state.ui.activeRow || 0;
  idx = Math.max(0, Math.min(rows.length - 1, idx + delta));
  makeActive(table, idx);
}
function makeActive(table, index, scrollIntoView = true) {
  state.ui.activeTable = table;
  state.ui.activeRow = index;
  qa('#reportsTable tbody tr, #threadsTable tbody tr').forEach(r => r.classList.remove('activeRow'));
  const rows = qa(`${table === 'reports' ? '#reportsTable' : '#threadsTable'} tbody tr`).filter(r => !r.classList.contains('subRow'));
  const row = rows[index]; if (!row) return;
  row.classList.add('activeRow');
  if (scrollIntoView) row.scrollIntoView({ block: 'nearest' });
}

/* ============================== In-app notif bell (admin too) ============================== */
async function initUserNotifBell() {
  const bell = q('#notifBell'); const badge = q('#notifCount');
  if (!bell || !badge) return;
  try {
    const data = await api('/api/notifications?limit=1', { nocache: true });
    const unread = Number(data?.unread || 0);
    if (unread > 0) { badge.textContent = String(unread); badge.style.display = 'inline-block'; }
    // SSE stream bumps
    const es = new EventSource('/api/notifications/stream');
    es.addEventListener('notif', (ev) => {
      try {
        const payload = JSON.parse(ev.data || '{}');
        const u = Number(payload.unread || 0);
        if (u > 0) { badge.textContent = String(u); badge.style.display = 'inline-block'; }
        else { badge.style.display = 'none'; }
      } catch {}
    });
    es.onerror = () => {};
  } catch {}
}

/* ============================== Shared utils ============================== */
function pagesFor(s) { const total = Math.max(0, Number(s.total || 0)); const limit = Math.max(1, Number(s.limit || 50)); return Math.max(1, Math.ceil(total / limit)); }
function updatePagerUI(section, pages) {
  const s = state[section];
  const start = s.total ? (s.page - 1) * s.limit + 1 : 0;
  const end = s.total ? Math.min(s.page * s.limit, s.total) : 0;

  if (section === 'users') {
    setText('#uPageInfo', s.total ? `Showing ${start}–${end} of ${s.total}` : '—');
    const prev = q('#uPrev'), next = q('#uNext');
    if (prev) prev.disabled = (s.page <= 1);
    if (next) next.disabled = (s.page >= pages);
  } else if (section === 'comments') {
    setText('#cPageInfo', s.total ? `Showing ${start}–${end} of ${s.total}` : '—');
    const prev = q('#cPrev'), next = q('#cNext');
    if (prev) prev.disabled = (s.page <= 1);
    if (next) next.disabled = (s.page >= pages);
  }
}
function ensureTbody(tableSel) {
  const table = q(tableSel); let tbody = table?.querySelector('tbody');
  if (!tbody && table) { tbody = document.createElement('tbody'); table.appendChild(tbody); }
  return tbody;
}
function renderErrorRow(tableSel, message, colspanGuess = null) {
  const table = q(tableSel); if (!table) return;
  const tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
  const cols = colspanGuess || (table.querySelectorAll('thead th')?.length || 1);
  tbody.innerHTML = `<tr><td colspan="${cols}" class="empty">${escapeHTML(message)}</td></tr>`;
}
function setText(sel, val) { const el = document.querySelector(sel); if (el) el.textContent = String(val); }
function showErr(msg) { const host = document.getElementById('adminErr') || document.body; const box = document.createElement('div'); box.className = 'err'; box.textContent = msg; host.prepend(box); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
