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

/* --- Comments List & Pagination Logic --- */
async function loadComments(reset = false) {
  if (commentState.loading) return;
  commentState.loading = true;

  if (reset) {
    commentState.comments   = [];
    commentState.nextCursor = null;
    commentState.hasMore    = false;
    safeSetHTML('#comments', `<div class="skeleton"><div class="bar"></div><div class="bar short"></div><div class="bar"></div></div>`);
  }

  const params = new URLSearchParams();
  params.set('limit', String(commentState.limit));
  if (commentState.nextCursor) params.set('after', commentState.nextCursor);
  params.set('t', String(Date.now()));

  try {
    console.log('[thread.js] loadComments request for thread', THREAD_ID);
    const resp = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}/comments?${params.toString()}`, { nocache: true, skipHtmlRedirect: true });
    console.log('[thread.js] loadComments response:', resp);
    const newComments = Array.isArray(resp?.comments) ? resp.comments : [];
    const hasMore     = !!resp?.hasMore;
    const nextCursor  = resp?.nextCursor || null;

    commentState.comments   = reset ? newComments : commentState.comments.concat(newComments);
    commentState.hasMore    = hasMore;
    commentState.nextCursor = nextCursor;

    renderCommentsTree(commentState.comments);
    renderLoadMoreCommentsButton();
    initReportUI();
  } catch (e) {
    console.error('[thread.js] loadComments error', e);
    safeSetHTML('#comments', `<div class="err">${escapeHTML(e?.error || e?.message || 'Failed to load comments.')}</div>`);
  } finally {
    commentState.loading = false;
  }
}

function renderLoadMoreCommentsButton() {
  const btn = q('#loadMoreCommentsBtn');
  if (!btn) return;
  if (commentState.hasMore) {
    btn.style.display = '';
    btn.disabled     = commentState.loading;
  } else {
    btn.style.display = 'none';
  }
}

function renderCommentsTree(nodes = []) {
  const host = q('#comments');
  if (!host) return;

  if (!nodes.length) {
    host.innerHTML = `<div class="empty">No comments yet.</div>`;
    renderLoadMoreCommentsButton();
    return;
  }

  host.innerHTML = '';
  for (const c of nodes) host.appendChild(renderCommentNode(c));

  host.querySelectorAll('.replyBtn').forEach(b => b.addEventListener('click', onReplyClick));
  host.querySelectorAll('.c-upvote').forEach(b => b.addEventListener('click', onUpvoteComment));
  host.querySelectorAll('.c-report').forEach(b => {
    const cid = b.dataset.commentId;
    if (!b.disabled && cid) b.addEventListener('click', () => openReportModal('comment', cid));
  });

  renderLoadMoreCommentsButton();
}

function renderCommentNode(c) {
  const el = document.createElement('article');
  el.className = 'comment';
  el.id = `c-${escapeAttr(String(c._id))}`;
  el.dataset.id = String(c._id);
  const isDeleted = !!c.isDeleted;

  const author = escapeHTML(c.author_display || 'Unknown');
  const when = timeAgo(c.createdAt);
  const up = Number(c.upvoteCount ?? c.score ?? 0);
  const body = isDeleted ? '<em class="meta">[deleted]</em>' : escapeHTML(c.body || '');

  const loggedIn = !!me?.id;
  const isOwn = loggedIn && (String(c.authorId) === String(me.id));
  const canReport = loggedIn && !isOwn;

  const tooltip = !loggedIn
    ? 'Login required'
    : (isOwn ? 'Cannot report your own comment' : 'Report this comment');

  let editedHtml = '';
  if (!isDeleted && c.editedAt) {
    editedHtml = `<div class="meta" style="font-size:.85rem; color:var(--muted)">
      Edited • ${timeAgo(c.editedAt)}
      ${c.editedBy ? ` by ${escapeHTML(c.editedByName || c.editedBy)}` : ''}
    </div>`;
  }

  const childrenHTML = Array.isArray(c.children) && c.children.length
    ? `<div class="children">${c.children.map(renderCommentChildHTML).join('')}</div>`
    : '';

  el.innerHTML = `
    <header class="meta">${author} • ${when}</header>
    <div class="c-body">${body}</div>
    ${editedHtml}
    <div class="row wrap" style="gap:.5rem; margin-top:.35rem">
      <button class="btn tiny c-upvote"${isDeleted ? ' disabled':''}>▲ ${up}</button>
      <button class="btn tiny replyBtn"${isDeleted ? ' disabled':''}>Reply</button>
      <button class="btn tiny danger c-report"${canReport ? '' : ' disabled'} title="${escapeAttr(tooltip)}" data-comment-id="${escapeAttr(c._id)}">
        Report
      </button>
    </div>
    ${childrenHTML}
  `;
  return el;
}

function renderCommentChildHTML(child) {
  const id = escapeAttr(String(child._id));
  const author = escapeHTML(child.author_display || 'Unknown');
  const when = timeAgo(child.createdAt);
  const up = Number(child.upvoteCount ?? child.score ?? 0);
  const body = !!child.isDeleted ? '<em class="meta">[deleted]</em>' : escapeHTML(child.body || '');

  const loggedIn = !!me?.id;
  const isOwn = loggedIn && (String(child.authorId) === String(me.id));
  const canReport = loggedIn && !isOwn;

  const tooltip = !loggedIn
    ? 'Login required'
    : (isOwn ? 'Cannot report your own comment' : 'Report this comment');

  let editedHtml = '';
  if (!child.isDeleted && child.editedAt) {
    editedHtml = `<div class="meta" style="font-size:.85rem; color:var(--muted)">
      Edited • ${timeAgo(child.editedAt)}
      ${child.editedBy ? ` by ${escapeHTML(child.editedByName || child.editedBy)}` : ''}
    </div>`;
  }

  return `
    <article class="comment" id="c-${id}" data-id="${id}">
      <header class="meta">${author} • ${when}</header>
      <div class="c-body">${body}</div>
      ${editedHtml}
      <div class="row wrap" style="gap:.5rem; margin-top:.35rem">
        <button class="btn tiny c‑upvote"${child.isDeleted ? ' disabled':''}>▲ ${up}</button>
        <button class="btn tiny replyBtn"${child.isDeleted ? ' disabled':''}>Reply</button>
        <button class="btn tiny danger c‑report"${canReport ? '' : ' disabled'} title="${escapeAttr(tooltip)}" data-comment-id="${escapeAttr(child._id)}">
          Report
        </button>
      </div>
    </article>
  `;
}

/* --- Reply / Composer Logic --- */
function onReplyClick(ev) {
  const commentId = ev.currentTarget.closest('.comment')?.dataset.id;
  if (commentId) {
    q('#parentId').value = commentId;
    q('#replyingTo').textContent = 'Replying…';
    safeShow('#replyingTo', true);
    safeShow('#cancelReply', true);
    q('#replyBody')?.focus();
  }
}
function clearReplyTarget() {
  q('#parentId').value = '';
  q('#replyingTo').textContent = '';
  safeShow('#replyingTo', false);
  safeShow('#cancelReply', false);
}
function bindComposer() {
  const form = q('#replyForm');
  if (!form) return;

  $('#cancelReply')?.addEventListener('click', clearReplyTarget);

  form.addEventListener('submit', async ev => {
    ev.preventDefault();

    if (THREAD.flags?.locked || THREAD.isLocked || THREAD.locked) {
      alert('Thread is locked. New comments are disabled.');
      return;
    }

    const body = (q('#replyBody')?.value || '').trim();
    const parentId = (q('#parentId')?.value || '').trim();
    const isAnonymous = !!q('#isAnonymous')?.checked;

    if (!me?.id) {
      alert('Please log in to comment.');
      return;
    }
    if (!body) {
      alert('Comment cannot be empty.');
      return;
    }

    const payload = { body, isAnonymous };
    if (parentId) payload.parentId = parentId;

    try {
      console.log('[thread.js] Posting comment payload:', payload);
      await api(`/api/comments/${encodeURIComponent(THREAD_ID)}`, {
        method: 'POST',
        body: payload
      });
      q('#replyBody').value = '';
      clearReplyTarget();
      await loadComments(true);
      initReportUI();
    } catch (e) {
      console.error('[thread.js] Post comment error', e);
      const msg = e?.error || e?.message || 'Failed to post comment.';
      if (/locked|forbidden|423/i.test(msg)) {
        alert('Thread is locked. New comments are disabled.');
      } else {
        alert(msg);
      }
    }
  });
}
function onUpvoteComment(ev) {
  const commentId = ev.currentTarget.closest('.comment')?.dataset.id;
  if (!commentId) return;

  api(`/api/comments/${encodeURIComponent(commentId)}/upvote`, { method: 'POST' })
    .then(res => {
      if (res?.ok && typeof res.upvoteCount === 'number')
        ev.currentTarget.innerHTML = `▲ ${res.upvoteCount}`;
    })
    .catch(err => {
      console.error('Upvote comment failed', err);
      alert('Failed to upvote comment.');
    });
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
  safeSetHTML('#threadMeta', `${escapeHTML(t.author_display || 'Unknown')} • ${timeAgo(t.createdAt)} • ▲ ${Number(t.upvoteCount ?? 0)}`);
  safeSetHTML('#threadBody', safeParagraphs(t.body ?? ''));
  buildToolbar();
}
function buildToolbar() {
  const host = q('#threadToolbar');
  if (!host) return;
  const loggedIn = !!me?.id;
  const isOwn = loggedIn && (me.id === THREAD.author || me.id === THREAD.authorId);
  const canReport = loggedIn && !isOwn;
  host.innerHTML = `
    <button id="threadUpvote" class="btn tiny"${!loggedIn ? ' disabled':''}>▲ Upvote <span id="threadUpCount" class="mono">${Number(THREAD.upvoteCount || 0)}</span></button>
    <button id="reportThreadBtn" class="btn tiny danger"${canReport ? '' : ' disabled'} data-thread-id="${escapeAttr(THREAD._id)}">Report Thread</button>
  `;
  $('#threadUpvote')?.addEventListener('click', onUpvoteThread);
  $('#reportThreadBtn')?.addEventListener('click', () => canReport && openReportModal('thread', THREAD_ID));
}
async function onUpvoteThread() {
  try {
    const res = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}/upvote`, { method: 'POST' });
    safeSetText('#threadUpCount', Number(res?.upvoteCount || 0));
  } catch (e) {
    console.error('[thread.js] Upvote thread error', e);
    alert('Failed to upvote.');
  }
}

/* --- Scaffold Markup --- */
function ensureScaffold() {
  const main = document.querySelector('main') || document.body;
  if (!q('#threadHeader')) {
    const header = document.createElement('section');
    header.id = 'threadHeader';
    header.className = 'card';
    header.innerHTML = `
      <header class="toolbar between">
        <h1 id="threadTitle"></h1>
        <div id="threadBadges" class="row"></div>
      </header>
      <div id="threadMeta" class="meta" style="margin-top:.25rem"></div>
      <div id="threadBody" style="margin-top:.75rem"></div>
      <div id="lockBanner" style="display:none;margin-top:.75rem"></div>
      <div id="threadToolbar" class="row" style="gap:.5rem;margin-top:.75rem"></div>
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
      <button id="loadMoreCommentsBtn" class="btn ghost mt-1" style="display:none">Load More</button>
      <div class="composer">
        <form id="replyForm">
          <div id="replyingTo" class="meta" style="display:none"></div>
          <textarea name="body" id="replyBody" placeholder="Write a comment…"></textarea>
          <input type="hidden" name="parentId" id="parentId" />
          <div class="row between">
            <label><input type="checkbox" id="isAnonymous" /> <span>Post as Anonymous</span></label>
            <div class="row" style="gap:.5rem">
              <button type="button" id="cancelReply" class="btn tiny" style="display:none">Cancel</button>
              <button type="submit" class="btn tiny primary">Post</button>
            </div>
          </div>
        </form>
      </div>
    `;
    main.appendChild(sec);
    q('#loadMoreCommentsBtn')?.addEventListener('click', () => loadComments(false));
  }
}

/* --- Entry Point --- */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(location.search);
  THREAD_ID = params.get('id') || '';
  if (!THREAD_ID) return showFatal('Missing thread id.');

  console.log('[thread.js:init] THREAD_ID =', THREAD_ID);
  console.log('[thread.js:init] Cookies =', document.cookie);

  try {
    await refreshMe();
    console.log('[thread.js:init] after refreshMe, me =', me);
  } catch (err) {
    console.warn('[thread.js:init] refreshMe failed:', err);
  }

  if (!me?.id) {
    console.error('[thread.js:init] Not logged in — redirecting soon');
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;background:#ffcccc;
      color:#000;padding:10px;z-index:9999;text-align:center;font-weight:bold;
    `;
    overlay.textContent = '⚠️ Not logged in — redirecting to login in 3 seconds…';
    document.body.appendChild(overlay);

    await new Promise(resolve => setTimeout(resolve, 3000));
    window.location.href = '/login.html';
    return;
  }

  ensureScaffold();
  renderLoading();

  try {
    console.log('[thread.js:init] Fetching thread data…');
    const resp = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true, skipHtmlRedirect: true });
    console.log('[thread.js:init] thread API response:', resp);

    THREAD = resp.thread ?? null;
    if (!THREAD) return showFatal('Thread not found.');

    renderThread(THREAD);

    if (THREAD.flags?.locked || THREAD.isLocked || THREAD.locked) {
      safeSetHTML('#lockBanner', `<strong>Notice:</strong> This thread is locked — no new comments allowed.`);
      safeShow('#lockBanner', true);
      safeShow('#replyForm', false);
    } else {
      safeShow('#lockBanner', false);
      safeShow('#replyForm', true);
    }

    await loadComments(true);
    bindComposer();
    initReportUI();
    console.log('[thread.js:init] Complete: thread & comments loaded.');
  } catch (e) {
    console.error('[thread.js:init] Error loading thread:', e);
    showFatal(e?.error || e?.message || 'Failed to load thread.');
  }
}
