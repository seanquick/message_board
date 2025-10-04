// Frontend/public/adminExport.js
import { apiFetch } from './main.js';  // your helper

async function triggerExport(model, format) {
  const resp = await apiFetch(`/api/admin/export/${model}?format=${format}`, {
    method: 'GET',
    headers: {
      'Accept': format === 'json' ? 'application/json' : 'text/csv'
    }
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    alert('Export failed: ' + (err.error || resp.status));
    return;
  }
  const blob = await resp.blob();
  const ext = format === 'csv' ? 'csv' : 'json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${model}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

// Attach to UI buttons
document.addEventListener('DOMContentLoaded', () => {
  const models = ['threads','comments','users','reports','modlogs'];
  const container = document.getElementById('export-container');
  models.forEach(model => {
    ['json','csv'].forEach(format => {
      const btn = document.createElement('button');
      btn.textContent = `Export ${model.toUpperCase()} (${format})`;
      btn.addEventListener('click', () => triggerExport(model, format));
      container.appendChild(btn);
    });
  });
});
