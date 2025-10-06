// Frontend/public/adminExport.js
import { api, apiFetch } from './main.js';

async function triggerExportResource(resource, format) {
  let url;
  // Map resource to backend endpoint
  switch (resource) {
    case 'reports':
      // backend: /api/admin/reports/export.csv
      url = `/api/admin/reports/export.csv`;
      break;
    case 'comments':
      url = `/api/admin/comments/export.csv`;
      break;
    case 'users':
      url = `/api/admin/users/export.csv`;
      break;
    default:
      console.warn('No export support for resource:', resource);
      return;
  }
  if (format === 'json') {
    // backend does not have JSON export for those; fallback or alert
    alert('JSON export not supported currently');
    return;
  }
  // append cache‑buster
  url += `?t=${Date.now()}`;

  const resp = await apiFetch(url, { method: 'GET', headers: { 'Accept': 'text/csv' } });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    alert('Export failed: ' + (err.error || resp.status));
    return;
  }
  const blob = await resp.blob();
  const ext = 'csv';
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${resource}.${ext}`;
  a.click();
  URL.revokeObjectURL(downloadUrl);
}

document.addEventListener('DOMContentLoaded', () => {
  const resources = ['reports', 'comments', 'users'];
  const container = document.getElementById('export-container');
  if (!container) return;
  resources.forEach(resource => {
    const btn = document.createElement('button');
    btn.textContent = `Export ${resource.toUpperCase()}`;
    btn.addEventListener('click', () => triggerExportResource(resource, 'csv'));
    container.appendChild(btn);
  });
});
