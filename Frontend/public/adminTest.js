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
      const r = await apiFetch('/api/auth/csrf', { skipHtmlRedirect: true });
      let j;
      if (typeof r.json === 'function') {
        j = await r.json();
      } else {
        j = r;
      }
      if (!j.csrfToken) throw new Error('Missing token');
    },
  },
  {
    id: 'threads',
    label: 'List Threads (/api/threads)',
    async run() {
      const r = await apiFetch('/api/threads', { skipHtmlRedirect: true });
      let data;
      if (typeof r.json === 'function') {
        if (!r.ok) throw new Error('Threads fetch failed: ' + r.status);
        data = await r.json();
      } else {
        data = r;
      }
      if (!Array.isArray(data)) throw new Error('Expected array, got ' + typeof data);
    },
  },
  {
    id: 'export',
    label: 'Export Threads JSON',
    async run() {
      const r = await apiFetch('/api/admin/export/threads?format=json', { skipHtmlRedirect: true });
      let result;
      if (typeof r.text === 'function') {
        result = await r.text();
      } else {
        result = JSON.stringify(r);
      }
      if (!result.trim().startsWith('[')) {
        throw new Error('Malformed JSON: ' + result.slice(0, 100));
      }
    },
  },
  {
    id: 'auth-refresh',
    label: 'Silent Auth Refresh (/api/auth/refresh)',
    async run() {
      const r = await apiFetch('/api/auth/refresh', { method: 'POST', skipHtmlRedirect: true });
      if (typeof r.json === 'function') {
        if (!r.ok) throw new Error('Refresh failed: ' + r.status);
      } else {
        // assume r is parsed JSON with success indicator
        if (!r.ok && !r.success) throw new Error('Refresh failed');
      }
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
      const statusEl = document.getElementById(`status-${test.id}`);
      statusEl.textContent = '⏳';
      statusEl.className = 'status running';
      try {
        await test.run();
        statusEl.textContent = '✅';
        statusEl.className = 'status pass';
      } catch (err) {
        statusEl.textContent = '❌';
        statusEl.className = 'status fail';
        console.error(`Test "${test.label}" failed:`, err);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', createTestUI);
