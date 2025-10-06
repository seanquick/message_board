// Frontend/public/adminThreads.js
import { api, escapeHTML, timeAgo, q, $, qa } from './main.js';

export async function initAdminThreads() {
  try {
    await loadAdminThreads();
  } catch (e) {
    renderAdminThreadsError(e?.error || e?.message || 'Failed to load admin threads.');
  }
}

async function loadAdminThreads() {
  const tbody = q('#threadsTable tbody');
  if (!tbody) {
    console.error('AdminThreads: no #threadsTable tbody in DOM');
    return;
  }
  const includeDeleted = q('#tIncludeDeleted')?.checked;
  const params = new URLSearchParams();
  params.set('type', 'threads');
  params.set('t', String(Date.now()));
  if (includeDeleted) params.set('includeDeleted', '1');

  const result = await api(`/api/admin/search?${params.toString()}`, { nocache: true });
  const threads = Array.isArray(result?.results) ? result.results : [];

  tbody.innerHTML = '';
  if (!threads.length) {
    tbody.innerHTML = '<tr><td colspan="7">No threads found.</td></tr>';
    return;
  }

  for (const t of threads) {
    const tr = document.createElement('tr');
    tr.dataset.id = t._id;
    tr.innerHTML = `
      <td>${new Date(t.createdAt).toLocaleString()}</td>
      <td>${escapeHTML(t.title || '(untitled)')}</td>
      <td>${escapeHTML(t.authorId || '')}</td>
      <td>${t.upvotes || 0}</td>
      <td>${escapeHTML(String(t.comments || ''))}</td>
      <td>${escapeHTML(t.status || '')}</td>
      <td class="row gap-05">
        <button class="btn tiny pinBtn">Pin/Unpin</button>
        <button class="btn tiny lockBtn">Lock/Unlock</button>
        <button class="btn tiny deleteThread">Delete/Restore</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // attach handlers
  tbody.querySelectorAll('.pinBtn').forEach(btn => btn.addEventListener('click', onPinToggle));
  tbody.querySelectorAll('.lockBtn').forEach(btn => btn.addEventListener('click', onLockToggle));
  tbody.querySelectorAll('.deleteThread').forEach(btn => btn.addEventListener('click', onDeleteToggle));
}

function renderAdminThreadsError(msg) {
  const tbody = q('#threadsTable tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="err">${escapeHTML(msg)}</td></tr>`;
}

/** Handlers **/

async function onPinToggle(ev) {
  const tr = ev.currentTarget.closest('tr');
  const tid = tr.dataset.id;
  const note = prompt('Pin/Unpin note (optional):');
  const pinned = true; // toggle logic could inspect UI
  try {
    await api(`/api/admin/threads/${tid}/pin`, { method: 'POST', body: { pinned, note } });
    await loadAdminThreads();
  } catch (e) {
    showThreadActionError(e);
  }
}

async function onLockToggle(ev) {
  const tr = ev.currentTarget.closest('tr');
  const tid = tr.dataset.id;
  const note = prompt('Lock/Unlock note (optional):');
  const locked = true; // toggle logic should inspect UI
  try {
    await api(`/api/admin/threads/${tid}/lock`, { method: 'POST', body: { locked, note } });
    await loadAdminThreads();
  } catch (e) {
    showThreadActionError(e);
  }
}

async function onDeleteToggle(ev) {
  const tr = ev.currentTarget.closest('tr');
  const tid = tr.dataset.id;
  const note = prompt('Delete/Restore note (optional):');
  const deleted = true; // toggle logic should inspect UI
  try {
    await api(`/api/admin/threads/${tid}/delete`, { method: 'POST', body: { deleted, reason: note } });
    await loadAdminThreads();
  } catch (e) {
    showThreadActionError(e);
  }
}

function showThreadActionError(e) {
  const msg = e?.error || e?.message || 'Thread action failed';
  alert(msg);
}
