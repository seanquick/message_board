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

  const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'text/csv' }, credentials: 'include' });
    if (!resp.ok) {
      const text = await resp.text();
      alert('Export failed: ' + text);
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

  document.getElementById('rExport')?.addEventListener('click', () => {
  triggerExportResource('reports', 'csv');
});

document.getElementById('cExport')?.addEventListener('click', () => {
  triggerExportResource('comments', 'csv');
});

document.getElementById('uExport')?.addEventListener('click', () => {
  triggerExportResource('users', 'csv');
});

});
