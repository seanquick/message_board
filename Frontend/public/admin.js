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

/* Global state (for pagination etc) */
const state = {
  users: { page: 1, limit: 50, total: 0 },
  comments: { page: 1, limit: 50, total: 0 },
};

/* --- Metrics --- */
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

/* --- USERS Section (unchanged) --- */
// ... your existing code for loadUsers, onToggleBan, onSetRole, onEditUserNote, onDeleteUser, onUserLinkClick, showUserContentModal ...
// (I will not repeat that here — keep your existing, working code.)

/* --- THREADS Section (unchanged) --- */
// ... your existing loadThreads, etc ...

/* --- COMMENTS Section (unchanged) --- */
// ... your existing loadComments, etc ...

/* --- REPORTS Section: full new implementation --- */

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
    console.log('loadReports fetch url:', url);
    const resp = await api(url, { nocache: true });
    console.log('loadReports response:', resp);
    const list = resp[group ? 'groups' : 'reports'];
    tbody.innerHTML = '';
    if (!Array.isArray(list) || !list.length) {
      tbody.innerHTML = '<tr><td colspan="9">No reports found.</td></tr>';
      return;
    }
    for (const r of list) {
      const tr = document.createElement('tr');
      tr.dataset.id = r._id || (r.ids ? r.ids[0] : '');
      const reporterName = r.reporter?.name || r.reporter?.email || '(unknown)';
      tr.innerHTML = `
        <td><input type="checkbox" class="rSelect" data-id="${r._id}"></td>
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

    // Attach view listeners
    tbody.querySelectorAll('.viewReport').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const tr = btn.closest('tr');
        const id = tr?.dataset.id;
        if (id) {
          openReportDetail(id);
        }
      });
    });

    // Attach resolve listeners
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
    const resp = await api(`/api/admin/reports/${reportId}?t=${Date.now()}`);
    const report = resp.report;
    if (!report) {
      showErr('Report not found');
      return;
    }
    let original = null;
    if (report.targetType === 'thread') {
      original = await api(`/api/threads/${report.targetId}`);
    } else if (report.targetType === 'comment') {
      original = await api(`/api/comments/${report.targetId}`);
    }
    showReportDetailModal(report, original);
  } catch (e) {
    console.error('openReportDetail error', e);
    showErr(`Failed to load report detail: ${e?.error || e?.message}`);
  }
}

function showReportDetailModal(report, original) {
  let mod = q('#adminReportModal');
  if (!mod) {
    mod = document.createElement('div');
    mod.id = 'adminReportModal';
    mod.innerHTML = `
      <div class="report-backdrop" style="
        position:fixed; inset:0; background:rgba(0,0,0,0.5);
        display:none; align-items:center; justify-content:center; z-index:9999;
      ">
        <div class="report-dialog" style="
          background:#fff; border-radius:8px; padding:1rem; max-width:680px;
          box-shadow:0 4px 16px rgba(0,0,0,0.2);
        ">
          <header><h3>Report Detail</h3></header>
          <section id="reportDetailBody" style="margin-top:1rem; max-height:60vh; overflow:auto;"></section>
          <div style="text-align:right; margin-top:1rem;">
            <button id="adminReportClose" class="btn tiny">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(mod);
  }

  const backdrop = mod.querySelector('.report-backdrop');
  const body = mod.querySelector('#reportDetailBody');
  const btnClose = mod.querySelector('#adminReportClose');
  if (!backdrop || !body || !btnClose) return;

  backdrop.style.display = 'flex';
  btnClose.onclick = () => { backdrop.style.display = 'none'; };

  const reporterName = report.reporter?.name || report.reporter?.email || '(unknown)';
  const when = new Date(report.createdAt).toLocaleString();
  const category = escapeHTML(report.category || '');
  const details = escapeHTML(report.details || '');

  body.innerHTML = `
    <p><strong>Reporter:</strong> ${reporterName}</p>
    <p><strong>Date:</strong> ${when}</p>
    <p><strong>Category:</strong> ${category}</p>
    <p><strong>Details:</strong> ${details}</p>
    <hr/>
    <h4>Original ${escapeHTML(report.targetType)}</h4>
    <div style="padding:.75rem; border:1px solid #ccc; border-radius:4px;">
      ${ original
        ? `<pre style="white-space:pre-wrap;">${escapeHTML(original.body || original.content || '')}</pre>`
        : `<em>(original content not found)</em>` }
    </div>
  `;
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

function exportReportsCSV() {
  window.location.href = `/api/admin/reports/export.csv?t=${Date.now()}`;
}

/* --- Global Search (unchanged) --- */
// ... your existing doSearch logic, etc ...

function startEventStream() {
  // your SSE logic or no-op
}

async function init() {
  console.log('admin init running');
  try {
    await refreshMe();
    meUser = meVar;

    // ping / admin auth check logic (unchanged)
    try {
      await api(`/api/admin/ping?t=${Date.now()}`);
    } catch (e) {
      // logic you have for token refresh etc...
      throw e;
    }

    // Attach event listeners (existing + new)
    q('#uRefresh')?.addEventListener('click', () => {
      state.users.page = 1;
      loadUsers();
    });
    q('#uSearch')?.addEventListener('input', debounce(() => {
      state.users.page = 1;
      loadUsers();
    }));

    q('#tRefresh')?.addEventListener('click', loadThreads);
    q('#tIncludeDeleted')?.addEventListener('change', loadThreads);

    q('#cRefresh')?.addEventListener('click', loadComments);
    q('#cIncludeDeleted')?.addEventListener('change', loadComments);

    q('#rRefresh')?.addEventListener('click', loadReports);
    q('#rGroup')?.addEventListener('change', loadReports);
    q('#rFilter')?.addEventListener('change', loadReports);
    q('#rBulkResolve')?.addEventListener('click', bulkResolveSelected);
    q('#rExport')?.addEventListener('click', exportReportsCSV);
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

    // startEventStream(); // optional

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
