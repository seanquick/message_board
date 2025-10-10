// frontend/public/thread.js

import { api, escapeHTML, timeAgo, q, $, qa, me, refreshMe } from './main.js';
import { initReportUI, openReportModal } from './report.js';

let THREAD_ID = null;
let THREAD = null;

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

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(location.search);
  THREAD_ID = params.get('id') || '';
  if (!THREAD_ID) return showFatal('Missing thread id.');

  try { await refreshMe(); } catch {}

  ensureScaffold();

  try {
    renderLoading();
    const { thread, comments } = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true });
    THREAD = thread ?? null;
    if (!THREAD) return showFatal('Thread not found.');

    renderThread(THREAD);
    renderCommentsTree(comments || []);
  } catch (e) {
    showFatal(e?.error || e?.message || 'Failed to load thread.');
  }

  bindComposer();
  initReportUI();
}

function ensureScaffold() {
  const main = document.querySelector('main') || document.body;

  let header = q('#threadHeader');
  if (!header) {
    header = document.createElement('section');
    header.id = 'threadHeader';
    header.className = 'card';
    header.innerHTML = `
      <header class="toolbar between">
        <h1 id="threadTitle" class="minw-0"></h1>
        <div id="threadBadges" class="row items-center" style="gap:.4rem"></div>
      </header>
      <div id="threadMeta" class="meta" style="margin-top:.25rem"></div>
      <div id="threadBody" class="mt-1"></div>
      <div id="lockBanner" class="lockBanner" style="display:none"></div>
      <div id="threadToolbar" class="row" style="gap:.5rem; margin-top:.75rem"></div>
    `;
    main.prepend(header);
  }

  if (!q('#comments')) {
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = `
      <h2 style="margin-top:0">Comments</h2>
      <div id="comments"></div>
    `;
    main.appendChild(sec);
  }

  if (!q('#replyForm')) {
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = `
      <h3 style="margin-top:0">Add a comment</h3>
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
  }
}

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

  const author = escapeHTML(t.author_display || 'Unknown');
  const when = timeAgo(t.createdAt);
  const upvotes = Number(t.upvoteCount ?? t.thumbsUp ?? t.upvotes ?? t.score ?? 0);
  safeSetHTML('#threadMeta', `${author} • ${when} • ▲ ${upvotes}`);

  safeSetHTML('#threadBody', safeParagraphs(t.body ?? t.content ?? ''));

  const isLocked = !!(t.flags?.locked || t.isLocked || t.locked);
  const lockBanner = q('#lockBanner');
  const replyForm = q('#replyForm');
  const replyBody = q('#replyBody');
  const loginHint = q('#loginHint');
  const cancelBtn = q('#cancelReply');

  safeShow(loginHint, !me?.uid);

  if (isLocked) {
    if (lockBanner) {
      lockBanner.innerHTML = `
        <div class="row items-center" style="gap:.4rem;color:#334155;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:.5rem .75rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9z" fill="#334155"/></svg>
          <strong>Thread locked.</strong>
          <span class="meta">New comments are disabled.</span>
        </div>
      `;
    }
    safeShow(lockBanner, true);
    replyForm?.classList.add('disabled');
    if (replyBody) {
      replyBody.setAttribute('disabled', 'true');
      replyBody.placeholder = 'Thread is locked.';
    }
    if (cancelBtn) cancelBtn.setAttribute('disabled', 'true');
  } else {
    safeShow(lockBanner, false);
    replyForm?.classList.remove('disabled');
    if (replyBody) replyBody.removeAttribute('disabled');
    if (cancelBtn) cancelBtn.removeAttribute('disabled');
  }

  buildToolbar();
}

function buildToolbar() {
  const host = q('#threadToolbar');
  if (!host) return;

  const loggedIn = !!me?.uid;
  // Author ID: ensure THREAD has an author id field (e.g. THREAD.author or THREAD.authorId)
  const isOwn = loggedIn && (me.uid === THREAD.author || me.uid === THREAD.authorId);
  const canReport = loggedIn && !isOwn;

  const tooltip = !loggedIn
    ? 'Login required'
    : (isOwn ? 'Cannot report your own thread' : 'Report this thread');

  host.innerHTML = `
    <button id="threadUpvote" class="btn tiny" ${!loggedIn ? 'disabled' : ''} title="${loggedIn ? 'Upvote' : 'Login required'}">
      ▲ Upvote <span id="threadUpCount" class="mono">${Number(THREAD.upvoteCount || 0)}</span>
    </button>
    <button id="threadReport" class="btn tiny danger" ${canReport ? '' : 'disabled'} title="${tooltip}">
      Report
    </button>
  `;

  $('#threadUpvote')?.addEventListener('click', onUpvoteThread);
  $('#threadReport')?.addEventListener('click', onReportThread);
}

async function onUpvoteThread() {
  try {
    const res = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}/upvote`, { method: 'POST' });
    safeSetText('#threadUpCount', Number(res?.upvoteCount || 0));
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to upvote.');
  }
}

function onReportThread() {
  openReportModal('thread', THREAD_ID);
}

function renderCommentsTree(nodes = []) {
  const host = q('#comments');
  if (!host) return;
  if (!nodes.length) {
    host.innerHTML = `<div class="empty">No comments yet.</div>`;
    return;
  }
  host.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const n of nodes) {
    frag.appendChild(renderCommentNode(n));
  }
  host.appendChild(frag);

  host.querySelectorAll('.replyBtn').forEach(b => b.addEventListener('click', onReplyClick));
  host.querySelectorAll('.c-upvote').forEach(b => b.addEventListener('click', onUpvoteComment));
  host.querySelectorAll('.c-report').forEach(b => b.addEventListener('click', onReportComment));
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

  const loggedIn = !!me?.uid;
  const isOwnComment = loggedIn && (c.authorId === me.uid);
  const canReport = loggedIn && !isOwnComment;
  const tooltip = !loggedIn
    ? 'Login required'
    : (isOwnComment ? 'Cannot report your own comment' : 'Report this comment');

  const actions = `
    <div class="row wrap" style="gap:.5rem; margin-top:.35rem">
      <button class="btn tiny c-upvote" ${isDeleted ? 'disabled' : ''}>▲ ${up}</button>
      <button class="btn tiny replyBtn" ${isDeleted ? 'disabled' : ''}>Reply</button>
      <button class="btn tiny danger c-report" ${canReport ? '' : 'disabled'} title="${tooltip}" data-comment-id="${c._id}">
        Report
      </button>
    </div>
  `;

  const childrenHTML = Array.isArray(c.children) && c.children.length
    ? `<div class="children">${c.children.map(renderCommentChildHTML).join('')}</div>`
    : '';

  el.innerHTML = `
    <header class="meta">${author} • ${when}</header>
    <div class="c-body">${body}</div>
    ${actions}
    ${childrenHTML}
  `;
  return el;
}

function renderCommentChildHTML(child) {
  const id = escapeAttr(String(child._id));
  const author = escapeHTML(child.author_display || 'Unknown');
  const when = timeAgo(child.createdAt);
  const up = Number(child.upvoteCount ?? child.score ?? 0);
  const isDeleted = !!child.isDeleted;
  const body = isDeleted ? '<em class="meta">[deleted]</em>' : escapeHTML(child.body || '');

  const loggedIn = !!me?.uid;
  const isOwnComment = loggedIn && (child.authorId === me.uid);
  const canReport = loggedIn && !isOwnComment;
  const tooltip = !loggedIn
    ? 'Login required'
    : (isOwnComment ? 'Cannot report your own comment' : 'Report this comment');

  return `
    <article class="comment" id="c-${id}" data-id="${id}">
      <header class="meta">${author} • ${when}</header>
      <div class="c-body">${body}</div>
      <div class="row wrap" style="gap:.5rem; margin-top:.35rem">
        <button class="btn tiny c-upvote" ${isDeleted ? 'disabled' : ''}>▲ ${up}</button>
        <button class="btn tiny replyBtn" ${isDeleted ? 'disabled' : ''}>Reply</button>
        <button class="btn tiny danger c-report" ${canReport ? '' : 'disabled'} title="${tooltip}" data-comment-id="${child._id}">
          Report
        </button>
      </div>
    </article>
  `;
}

function bindComposer() {
  const form = q('#replyForm');
  if (!form) return;

  $('#cancelReply')?.addEventListener('click', clearReplyTarget);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const body = (q('#replyBody')?.value || '').trim();
    const parentId = (q('#parentId')?.value || '').trim();
    const isAnonymous = !!q('#isAnonymous')?.checked;

    if (!me?.uid) return alert('Please log in to comment.');
    if (!body) return alert('Comment cannot be empty.');

    try {
      const payload = { body, isAnonymous };
      if (parentId) payload.parentId = parentId;
      await api(`/api/comments/${encodeURIComponent(THREAD_ID)}`, { method: 'POST', body: payload });
      q('#replyBody').value = '';
      clearReplyTarget();

      const fresh = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true });
      renderCommentsTree(fresh.comments || []);
      initReportUI();
    } catch (e) {
      const msg = e?.error || e?.message || 'Failed to post comment.';
      if (/locked|forbidden|banned|423/i.test(msg)) {
        alert('Thread is locked. New comments are disabled.');
      } else {
        alert(msg);
      }
    }
  });
}

function onReplyClick(ev) {
  const node = ev.currentTarget.closest('.comment');
  if (!node) return;
  const id = node.dataset.id;
  const byline = node.querySelector('header.meta')?.textContent || '';
  const pid = q('#parentId'); if (pid) pid.value = id;
  const rto = q('#replyingTo');
  if (rto) {
    rto.textContent = `Replying to: ${byline}`;
    safeShow(rto, true);
  }
  safeShow('#cancelReply', true);
  q('#replyBody')?.focus({ preventScroll: false });
  q('#replyForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearReplyTarget() {
  const pid = q('#parentId'); if (pid) pid.value = '';
  safeSetText('#replyingTo', '');
  safeShow('#replyingTo', false);
  safeShow('#cancelReply', false);
}

async function onUpvoteComment(ev) {
  const node = ev.currentTarget.closest('.comment');
  if (!node) return;
  const id = node.dataset.id;
  try {
    const res = await api(`/api/comments/${encodeURIComponent(id)}/upvote`, { method: 'POST' });
    const btn = node.querySelector('.c-upvote');
    if (btn) btn.textContent = `▲ ${Number(res?.upvoteCount || 0)}`;
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to upvote comment.');
  }
}

function onReportComment(ev) {
  const btn = ev.currentTarget.closest('button.c-report');
  if (!btn) return;
  const cid = btn.dataset.commentId;
  openReportModal('comment', cid);
}

function showFatal(msg) {
  const main = document.querySelector('main') || document.body;
  main.innerHTML = `<div class="err" role="alert">${escapeHTML(msg)}</div>`;
}

function safeParagraphs(text) {
  const t = String(text || '');
  if (!t.trim()) return '<p class="meta">(no content)</p>';
  return t.split(/\n{2,}/g).map(p => `<p>${escapeHTML(p)}</p>`).join('\n');
}

function pinBadge() {
  return `<span class="badge pin" title="Pinned">📌</span>`;
}
function lockBadge() {
  return `<span class="badge lock" title="Locked">🔒</span>`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
