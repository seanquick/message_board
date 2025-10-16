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
      // Accept either csrfToken or token (whichever your backend uses)
      if (!j.csrfToken && !j.token) {
        console.error('CSRF response:', j);
        throw new Error('Missing token field');
      }
    },
  },
  {
    id: 'threads',
    label: 'List Threads (/api/threads)',
    async run() {
      const r = await apiFetch('/api/threads', { skipHtmlRedirect: true });
      let j;
      if (typeof r.json === 'function') {
        if (!r.ok) throw new Error('Threads fetch failed: ' + r.status);
        j = await r.json();
      } else {
        j = r;
      }
      let arr;
      if (Array.isArray(j)) {
        arr = j;
      } else if (Array.isArray(j.threads)) {
        arr = j.threads;
      } else if (Array.isArray(j.data)) {
        arr = j.data;
      } else {
        console.error('Threads response:', j);
        throw new Error('Expected array or object containing array');
      }
      // Optionally check length or type
    },
  },
  {
    id: 'export',
    label: 'Export Threads JSON',
    async run() {
      const r = await apiFetch('/api/admin/export/threads?format=json', { skipHtmlRedirect: true });
      let text;
      if (typeof r.text === 'function') {
        text = await r.text();
      } else {
        text = JSON.stringify(r);
      }
      if (text.trim().startsWith('<')) {
        console.error('Export JSON response (HTML):', text.slice(0,200));
        throw new Error('Got HTML instead of JSON');
      }
      if (!text.trim().startsWith('[')) {
        console.error('Malformed JSON:', text.slice(0,200));
        throw new Error('Malformed JSON: ' + text.slice(0,100));
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
        if (!r.ok && !r.success) {
          console.error('Refresh response:', r);
          throw new Error('Refresh failed');
        }
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
