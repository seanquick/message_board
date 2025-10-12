// frontend/public/adminReports.js

import { api, escapeHTML, q, $, qa } from './main.js';

async function loadReports(status = 'open') {
  try {
    const resp = await api(`/api/admin/reports?status=${encodeURIComponent(status)}`);
    const { reports } = resp;
    renderReportsTable(reports);
  } catch (e) {
    console.error('loadReports error', e);
    const tbl = q('#reportsTableBody');
    if (tbl) tbl.innerHTML = `<tr><td colspan="8" class="err">Error loading reports</td></tr>`;
  }
}

function renderReportsTable(reports) {
  const tbody = q('#reportsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const r of reports) {
    const reporterName = r.reporter?.name || r.reporter?.email || '(unknown)';
    const when = new Date(r.createdAt).toLocaleString();
    const snippet = escapeHTML(r.snippet || '');
    const status = escapeHTML(r.status || '');
    const category = escapeHTML(r.category || '');
    const resolutionNote = escapeHTML(r.resolutionNote || '');

    const tr = document.createElement('tr');
    tr.dataset.reportId = r._id;

    tr.innerHTML = `
      <td>${when}</td>
      <td>${escapeHTML(r.targetType)}</td>
      <td>${snippet}</td>
      <td>${category}</td>
      <td>${reporterName}</td>
      <td>${status}</td>
      <td>
        <button class="btn tiny view-report">View</button>
        <button class="btn tiny primary resolve-report">Resolve</button>
      </td>
    `;

    tbody.appendChild(tr);
  }

  // Attach event listeners
  tbody.querySelectorAll('.resolve-report').forEach(btn => {
    btn.addEventListener('click', async ev => {
      ev.stopPropagation();
      const tr = btn.closest('tr');
      const rid = tr?.dataset.reportId;
      const note = prompt('Resolution note (optional):');
      if (!rid) return;
      try {
        const res = await api(`/api/admin/reports/${rid}/resolve`, {
          method: 'POST',
          body: { resolutionNote: note || '' }
        });
        if (res.ok) {
          // Remove row from UI
          tr.remove();
        } else {
          alert('Failed to resolve: ' + (res.error || 'Unknown'));
        }
      } catch (err) {
        console.error('resolve error', err);
        alert('Error resolving report');
      }
    });
  });

  tbody.querySelectorAll('.view-report').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      const tr = btn.closest('tr');
      const rid = tr?.dataset.reportId;
      if (rid) openReportDetail(rid);
    });
  });
}

/** Opens a modal or separate section showing full report + original content */
async function openReportDetail(reportId) {
  try {
    const resp = await api(`/api/admin/reports?status=all`); 
    // Or a more specific endpoint to fetch just one report by id
    const { reports } = resp;
    const report = reports.find(r => r._id === reportId);
    if (!report) {
      return alert('Report not found');
    }

    // Fetch original thread/comment
    let original = null;
    if (report.targetType === 'thread') {
      original = await api(`/api/threads/${report.targetId}`);
    } else if (report.targetType === 'comment') {
      original = await api(`/api/comments/${report.targetId}`);
    }

    showReportModal(report, original);
  } catch (e) {
    console.error('view report error', e);
    alert('Error loading report details');
  }
}

function showReportModal(report, original) {
  // Create or reuse a modal in DOM
  let mod = q('#adminReportModal');
  if (!mod) {
    mod = document.createElement('div');
    mod.id = 'adminReportModal';
    mod.innerHTML = `
      <div class="report-backdrop" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); display:none; align-items:center; justify-content:center; z-index:9999;">
        <div class="report-dialog" style="background:#fff; border-radius:8px; padding:1rem; max-width:640px; box-shadow:0 4px 16px rgba(0,0,0,0.2);">
          <header><h3>Report Detail</h3></header>
          <section id="reportDetailBody" style="margin-top:1rem;"></section>
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

  btnClose.onclick = () => {
    backdrop.style.display = 'none';
  };

  // Fill in content
  body.innerHTML = `
    <p><strong>Report by:</strong> ${escapeHTML(report.reporter?.name || report.reporter?.email || '(unknown)')}</p>
    <p><strong>When:</strong> ${new Date(report.createdAt).toLocaleString()}</p>
    <p><strong>Category:</strong> ${escapeHTML(report.category)}</p>
    <p><strong>Details:</strong> ${escapeHTML(report.details || '')}</p>
    <hr/>
    <h4>Original ${escapeHTML(report.targetType)}</h4>
    <div style="padding:.5rem; border:1px solid #ccc; border-radius:4px;">
      ${original
        ? `<p>${escapeHTML(original.body || original.content || '')}</p>`
        : `<em>(original content not found)</em>`
      }
    </div>
  `;
}

// When page loads
document.addEventListener('DOMContentLoaded', () => {
  loadReports();
  $('#reportStatusFilter')?.addEventListener('change', () => {
    const st = $('#reportStatusFilter').value;
    loadReports(st);
  });
});
