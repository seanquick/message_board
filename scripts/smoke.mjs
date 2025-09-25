// scripts/smoke.mjs
// Node 18+ has global fetch
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';

const checks = [
  { path: '/', ok: (s) => s === 200 || s === 302, label: 'root' },
  { path: '/login.html', ok: (s) => s === 200, label: 'login page' },
  { path: '/api/threads', ok: (s, body) => s === 200 && (body.threads || Array.isArray(body)), label: 'threads API' },
];

function log(ok, msg) {
  console.log(`${ok ? '✅' : '❌'} ${msg}`);
}

(async () => {
  try {
    for (const c of checks) {
      const res = await fetch(`${BASE}${c.path}`, { method: 'GET' });
      let body = {};
      try { body = await res.clone().json(); } catch {}
      const pass = c.ok(res.status, body);
      log(pass, c.label);
      if (!pass) {
        console.error('   ↳ status:', res.status, ' body:', body);
        process.exit(1);
      }
    }
    console.log('✅ Smoke tests passed');
    process.exit(0);
  } catch (e) {
    console.error('❌ Smoke failed:', e.message);
    process.exit(1);
  }
})();
