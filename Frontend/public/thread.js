// frontend/public/thread.js

import { api, escapeHTML, timeAgo, q, $, me, refreshMe } from './main.js';
import { initReportUI, openReportModal } from './report.js';

let THREAD_ID  = null;
let THREAD     = null;
let commentState = {
  comments:   [],
  nextCursor: null,
  hasMore:    false,
  loading:    false,
  limit:      20
};

/* --- Helpers --- */
function safeShow(selOrEl, visible = true) {
  const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
  if (el) el.style.display = visible ? '' : 'none';
}
function safeSetText(selOrEl, text = '') {
  const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
  if (el) el.textContent = text;
}
function safeSetHTML(selOrEl, html = '') {
  const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
  if (el) el.innerHTML = html;
}
function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function showFatal(msg) {
  const main = document.querySelector('main') || document.body;
  main.innerHTML = `<div class="err" role="alert">${escapeHTML(msg)}</div>`;
}
function safeParagraphs(text) {
  const t = String(text || '');
  if (!t.trim()) return '<p class="meta">(no content)</p>';
  return t.split(/\n{2,}/g)
    .map(p => `<p>${escapeHTML(p)}</p>`)
    .join('\n');
}
function pinBadge() {
  return `<span class="badge pin" title="Pinned">📌</span>`;
}
function lockBadge() {
  return `<span class="badge lock" title="Locked">🔒</span>`;
}

/* --- Entry Point --- */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(location.search);
  THREAD_ID = params.get('id') || '';
  if (!THREAD_ID) return showFatal('Missing thread id.');

  try {
    await refreshMe();
  } catch (err) {
    console.warn('refreshMe failed', err);
  }

  // ✅ NEW: ensure login before proceeding
  if (!me) {
    console.warn('Not logged in — redirecting to login.html');
    window.location.href = '/login.html';
    return;
  }

  ensureScaffold();

  try {
    renderLoading();
    const resp = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true });
    THREAD = resp.thread ?? null;
    if (!THREAD) return showFatal('Thread not found.');

    renderThread(THREAD);

    // If thread is locked: disable composer
    if (THREAD.flags?.locked || THREAD.isLocked || THREAD.locked) {
      safeSetHTML('#lockBanner', `<strong>Notice:</strong> This thread is locked — no new comments allowed.`);
      safeShow('#lockBanner', true);
      safeShow('#replyForm', false);
    } else {
      safeShow('#lockBanner', false);
      safeShow('#replyForm', true);
    }

    // load initial batch of comments
    await loadComments(true);

    bindComposer();
    initReportUI();
  } catch (e) {
    console.error('error loading thread:', e);
    showFatal(e?.error || e?.message || 'Failed to load thread.');
  }
}

/* --- Scaffold Markup --- */
function ensureScaffold() {
  const main = document.querySelector('main') || document.body;

  if (!q('#threadHeader')) {
    const header = document.createElement('section');
    header.id    = 'threadHeader';
    header.className = 'card';
    header.innerHTML = `
      <header class="toolbar between">
        <h1 id="threadTitle"></h1>
        <div id="threadBadges" class="row"></div>
      </header>
      <div id="threadMeta" class="meta" style="margin-top:.25rem"></div>
      <div id="threadBody" style="margin-top:.75rem"></div>
      <div id="lockBanner" style="display:none; margin-top:.75rem"></div>
      <div id="threadToolbar" class="row" style="gap:.5rem; margin-top:.75rem"></div>
    `;
    main.prepend(header);
  }

  if (!q('#commentsSection')) {
    const sec = document.createElement('section');
    sec.id = 'commentsSection';
    sec.className = 'card mt-2';
    sec.innerHTML = `
      <h2>Comments</h2>
      <div id="comments"></div>
      <button id="loadMoreCommentsBtn" class="btn ghost mt-1" style="display:none">Load More Comments</button>
      <div class="composer">
        <form id="replyForm">
          <div id="replyingTo" class="meta" style="display:none; margin-bottom:.35rem"></div>
          <textarea name="body" id="replyBody" placeholder="Write a comment…"></textarea>
          <input type="hidden" name="parentId" id="parentId" />
          <div class="row" style="margin-top:.5rem; justify-content:space-between">
            <label class="inline">
              <input type="checkbox" id="isAnonymous" name="isAnonymous" />
              <span>Post as Anonymous</span>
            </label>
            <div class="row" style="gap:.5rem">
              <button type="button" id="cancelReply" class="btn tiny" style="display:none">Cancel reply</button>
              <button type="submit" class="btn tiny primary">Post comment</button>
            </div>
          </div>
        </form>
        <div id="loginHint" class="meta" style="display:none; margin-top:.5rem">Please log in to comment.</div>
      </div>
    `;
    main.appendChild(sec);

    // Bind Load More button
    q('#loadMoreCommentsBtn')?.addEventListener('click', () => loadComments(false));
  }
}

/* --- Thread Rendering --- */
function renderLoading() {
  safeSetText('#threadTitle', 'Loading…');
  const body = q('#threadBody');
  if (body) {
    body.innerHTML = `<div class="skeleton"><div class="bar"></div><div class="bar short"></div><div class="bar"></div></div>`;
  }
}

function renderThread(t) {
  safeSetHTML('#threadTitle', escapeHTML(t.title || '(untitled)'));

  const badges = [];
  if (t.flags?.pinned || t.isPinned || t.pinned) badges.push(pinBadge());
  if (t.flags?.locked || t.isLocked || t.locked) badges.push(lockBadge());
  safeSetHTML('#threadBadges', badges.join(''));

  const author  = escapeHTML(t.author_display || 'Unknown');
  const when    = timeAgo(t.createdAt);
  const upvotes = Number(t.upvoteCount ?? t.thumbsUp ?? t.upvotes ?? t.score ?? 0);
  safeSetHTML('#threadMeta', `${author} • ${when} • ▲ ${upvotes}`);

  safeSetHTML('#threadBody', safeParagraphs(t.body ?? t.content ?? ''));

  buildToolbar();
}

/* --- Toolbar with Report / Upvote --- */
function buildToolbar() {
  const host     = q('#threadToolbar');
  if (!host) return;

  const loggedIn  = !!me?.id;
  const isOwn     = loggedIn && (me.id === THREAD.author || me.id === THREAD.authorId);
  const canReport = loggedIn && !isOwn;

  const tooltip = !loggedIn
    ? 'Login required'
    : (isOwn ? 'Cannot report your own thread' : 'Report this thread');

  host.innerHTML = `
    <button id="threadUpvote" class="btn tiny"${!loggedIn ? ' disabled':''} title="${escapeAttr(loggedIn ? 'Upvote':'Login required')}">
      ▲ Upvote <span id="threadUpCount" class="mono">${Number(THREAD.upvoteCount || 0)}</span>
    </button>
    <button id="reportThreadBtn" class="btn tiny danger"${canReport ? '' : ' disabled'} title="${escapeAttr(tooltip)}" data-thread-id="${escapeAttr(THREAD._id)}">
      Report Thread
    </button>
  `;

  $('#threadUpvote')?.addEventListener('click', onUpvoteThread);
  $('#reportThreadBtn')?.addEventListener('click', () => {
    if (canReport) {
      openReportModal('thread', THREAD_ID);
    } else {
      console.log('Report disabled:', tooltip);
    }
  });
}

async function onUpvoteThread() {
  try {
    const res = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}/upvote`, { method: 'POST' });
    safeSetText('#threadUpCount', Number(res?.upvoteCount || 0));
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to upvote.');
  }
}

/* --- Comments List & Pagination Logic --- */
// (unchanged from your version)
