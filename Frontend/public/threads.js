// Frontend/public/threads.js
import { api, escapeHTML, timeAgo, q } from './main.js';
import { openReportModal } from './report.js';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  wireCreateThreadForm(); // Attach thread creation logic
  renderSkeleton();

  try {
    const payload = await api('/api/threads', { nocache: true });
    const threads = Array.isArray(payload?.threads) ? payload.threads : [];

    for (const t of threads) {
      t.isPinned = !!(t.isPinned || t.pinned);
      t.isLocked = !!(t.isLocked || t.locked);
      t.upvoteCount = Number(t.upvoteCount ?? t.thumbsUp ?? t.upvotes ?? t.score ?? 0);
    }

    const tableBody = q('#threadsTable tbody');
    if (tableBody) {
      renderTable(tableBody, threads);
    } else {
      const listHost = ensureListHost();
      renderCards(listHost, threads);
    }
  } catch (e) {
    renderError(e?.error || e?.message || 'Failed to load threads.');
  }
}

function wireCreateThreadForm() {
  const btn = q('button#createThreadBtn') || q('button[type="submit"]');
  if (!btn) return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const titleEl = q('input[name="title"]');
    const bodyEl = q('textarea[name="body"]');
    const anonEl = q('input[name="anonymous"]');

    const title = titleEl?.value.trim();
    const body = bodyEl?.value.trim();
    const anonymous = !!anonEl?.checked;

    if (!title || !body) {
      alert('Please enter a title and body for your thread.');
      return;
    }

    try {
      const thread = await api('/api/threads', {
        method: 'POST',
        body: { title, body, anonymous }
      });

      const id = thread?._id || thread?.id || thread?.thread?._id || thread?.thread?.id;
        if (id) {
          window.location.href = `thread.html?id=${encodeURIComponent(id)}`;
        } else {
          alert('Thread created but no ID returned.');
        }

    } catch (e) {
      console.error('Thread creation failed', e);
      alert(`Failed to create thread: ${e?.error || e?.message}`);
    }
  });
}

function ensureListHost() {
  let host = q('#threadsList');
  if (!host) {
    host = document.createElement('div');
    host.id = 'threadsList';
    host.className = 'threads-grid';
    const main = document.querySelector('main') || document.body;
    main.appendChild(host);
  }
  return host;
}

function renderCards(host, threads) {
  if (!threads.length) {
    host.innerHTML = `<div class="empty">No threads yet.</div>`;
    return;
  }

  host.innerHTML = '';
  for (const t of threads) {
    const url = `thread.html?id=${encodeURIComponent(String(t._id || t.id))}`;
    const snippet = (t.body || '').slice(0, 220);
    const badges = [];
    if (t.isPinned) badges.push(pinBadge());
    if (t.isLocked) badges.push(lockBadge());

    const card = document.createElement('article');
    card.className = 'thread-card';
    card.innerHTML = `
      <header class="row between">
        <h3 class="title">
          <a class="thread-link" href="${url}">${escapeHTML(t.title || '(untitled)')}</a>
        </h3>
        <div class="badges">${badges.join('')}</div>
      </header>

      <p class="snippet">${escapeHTML(snippet)}</p>

      <footer class="meta row wrap" style="align-items: center; gap: .5rem;">
        <span>${escapeHTML(t.author_display || 'Unknown')}</span>
        <span aria-hidden="true">•</span>
        <span>${timeAgo(t.createdAt)}</span>
        <span aria-hidden="true">•</span>
        <span title="Upvotes">▲ ${Number(t.upvoteCount || 0)}</span>
        <span aria-hidden="true">•</span>
        <span title="Comments">💬 ${Number(t.commentCount || 0)}</span>
        ${t.isLocked ? `<span class="badge lock small">Locked</span>` : ''}
        <button class="btn tiny danger report-thread" data-thread-id="${t._id}">Report</button>
      </footer>
    `;

    host.appendChild(card);
  }

  document.querySelectorAll('.report-thread').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      const tid = btn.dataset.threadId;
      if (tid) {
        openReportModal('thread', tid);
      }
    });
  });
}

function renderTable(tbody, threads) {
  tbody.innerHTML = '';
  if (!threads.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No threads yet.</td></tr>`;
    return;
  }

  for (const t of threads) {
    const url = `thread.html?id=${encodeURIComponent(String(t._1 || t._id || t.id))}`;
    const titleHtml = `
      <a class="thread-link" href="${url}">${escapeHTML(t.title || '(untitled)')}</a>
      ${t.isPinned ? pinBadge() : ''}
      ${t.isLocked ? `<span class="badge lock small">Locked</span>` : ''}
    `;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="when">${timeAgo(t.createdAt)}</td>
      <td class="title">${titleHtml}</td>
      <td class="author">${escapeHTML(t.author_display || 'Unknown')}</td>
      <td class="up">${Number(t.upvoteCount || 0)}</td>
      <td class="com">${Number(t.commentCount || 0)}</td>
      <td class="status">
        ${t.isPinned ? '<span class="ok">Pinned</span>' : ''}
        <button class="btn tiny danger report-thread" data-thread-id="${t._id}">Report</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  document.querySelectorAll('.report-thread').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      const tid = btn.dataset.threadId;
      if (tid) openReportModal('thread', tid);
    });
  });
}

function renderSkeleton() {
  const host = q('#threadsList') || q('#threadsTable tbody') || ensureListHost();
  host.innerHTML = `
    <div class="skeleton">
      <div class="bar"></div>
      <div class="bar short"></div>
      <div class="bar"></div>
    </div>
  `;
}

function renderError(msg) {
  const host = q('#threadsList') || q('#threadsTable tbody') || ensureListHost();
  host.innerHTML = `<div class="err">${escapeHTML(msg)}</div>`;
}

function pinBadge() {
  return `
    <span class="badge pin" title="Pinned">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14 2l-2 2 2 5-4 4-3-3-2 2 7 7 2-2-3-3 4-4 5 2 2-2-8-8z" fill="currentColor"/>
      </svg>
      Pinned
    </span>
  `;
}

function lockBadge() {
  return `
    <span class="badge lock" title="Locked">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9z" fill="currentColor"/>
      </svg>
      Locked
    </span>
  `;
}
