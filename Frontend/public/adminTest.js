// Frontend/public/adminTest.js
import { apiFetch } from './main.js';

const tests = [
  {
    id: 'healthz',
    label: 'Health Check (/api/healthz)',
    async run() {
      const r = await fetch('/api/healthz');
      if (!r.ok) throw new Error('Status: ' + r.status);
      const j = await r.json();
      if (!j.ok) throw new Error('Invalid healthz payload');
    },
  },
  {
    id: 'csrf',
    label: 'CSRF Token Mint (/api/auth/csrf)',
    async run() {
      const r = await apiFetch('/api/auth/csrf');
      if (!r.ok) throw new Error('CSRF endpoint failed');
      const j = await r.json();
      if (!j.csrfToken) throw new Error('Missing token');
    },
  },
  {
    id: 'threads',
    label: 'List Threads (/api/threads)',
    async run() {
      const r = await apiFetch('/api/threads');
      if (!r.ok) throw new Error('Threads fetch failed');
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error('Expected array');
    },
  },
  {
    id: 'export',
    label: 'Export Threads JSON',
    async run() {
      const r = await apiFetch('/api/admin/export/threads?format=json');
      if (!r.ok) throw new Error('Export failed');
      const text = await r.text();
      if (!text.startsWith('[')) throw new Error('Malformed JSON');
    },
  },
  {
    id: 'auth-refresh',
    label: 'Silent Auth Refresh (/api/auth/refresh)',
    async run() {
      const r = await apiFetch('/api/auth/refresh', { method: 'POST' });
      if (!r.ok) throw new Error('Refresh failed');
    },
  },
];

function createTestUI() {
  const root = document.createElement('section');
  root.innerHTML = `<h2>🧪 Admin Test Mode</h2><div id="test-panel"></div><button id="run-tests">▶ Run All Tests</button>`;
  document.body.appendChild(root);

  const panel = root.querySelector('#test-panel');

  tests.forEach(test => {
    const row = document.createElement('div');
    row.className = 'test-row';
    row.innerHTML = `<span>${test.label}</span> <span id="status-${test.id}" class="status">⏳</span>`;
    panel.appendChild(row);
  });

  root.querySelector('#run-tests').addEventListener('click', async () => {
    for (const test of tests) {
      const status = document.getElementById(`status-${test.id}`);
      status.textContent = '⏳';
      status.className = 'status running';
      try {
        await test.run();
        status.textContent = '✅';
        status.className = 'status pass';
      } catch (err) {
        status.textContent = '❌';
        status.className = 'status fail';
        console.error(`Test "${test.label}" failed:`, err);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', createTestUI);
