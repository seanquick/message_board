// frontend/public/thread.js

import { api, escapeHTML, timeAgo, q, $, me, refreshMe } from './main.js';
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

  try {
    await refreshMe();
    console.log('me after refresh:', me);
  } catch (err) {
    console.warn('refreshMe failed', err);
  }

  ensureScaffold();

  try {
    renderLoading();
    const resp = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true });
    console.log('thread API response:', resp);
    THREAD = resp.thread ?? null;
    const comments = resp.comments ?? [];
    if (!THREAD) return showFatal('Thread not found.');

    renderThread(THREAD);
    renderCommentsTree(comments);
  } catch (e) {
    console.error('error loading thread:', e);
    showFatal(e?.error || e?.message || 'Failed to load thread.');
  }

  bindComposer();
  initReportUI();
}

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
      <div id="lockBanner" style="display:none; margin-top:.75rem"></div>
      <div id="threadToolbar" class="row" style="gap:.5rem; margin-top:.75rem"></div>
    `;
    main.prepend(header);
  }

  if (!q('#comments')) {
    const sec = document.createElement('section');
    sec.id = 'commentsSection';
    sec.className = 'card';
    sec.innerHTML = `
      <h2>Comments</h2>
      <div id="comments"></div>
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

  buildToolbar();
}

function buildToolbar() {
  const host = q('#threadToolbar');
  if (!host) return;

  const loggedIn = !!me?.uid;
  const isOwn = loggedIn && (me.uid === THREAD.author || me.uid === THREAD.authorId);
  const canReport = loggedIn && !isOwn;

  const tooltip = !loggedIn
    ? 'Login required'
    : (isOwn ? 'Cannot report your own thread' : 'Report this thread');

  host.innerHTML = `
    <button id="threadUpvote" class="btn tiny" ${!loggedIn ? 'disabled' : ''} title="${loggedIn ? 'Upvote' : 'Login required'}">
      ▲ Upvote <span id="threadUpCount" class="mono">${Number(THREAD.upvoteCount || 0)}</span>
    </button>
    <button id="reportThreadBtn" class="btn tiny danger" ${canReport ? '' : 'disabled'} title="${tooltip}" data-thread-id="${THREAD._id}">
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

function renderCommentsTree(nodes = []) {
  const host = q('#comments');
  if (!host) {
    console.warn('No #comments element in DOM');
    return;
  }
  if (!nodes.length) {
    host.innerHTML = `<div class="empty">No comments yet.</div>`;
    return;
  }
  host.innerHTML = '';
  for (const c of nodes) {
    host.appendChild(renderCommentNode(c));
  }

  host.querySelectorAll('.replyBtn').forEach(b => b.addEventListener('click', onReplyClick));
  host.querySelectorAll('.c-upvote').forEach(b => b.addEventListener('click', onUpvoteComment));
  host.querySelectorAll('.c-report').forEach(b => {
    b.addEventListener('click', ev => {
      const btn = ev.currentTarget;
      const cid = btn.dataset.commentId;
      if (!btn.disabled && cid) {
        openReportModal('comment', cid);
      } else {
        console.log('Comment report disabled:', btn.title);
      }
    });
  });
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
      <button class="btn tiny danger c-report" ${canReport ? '' : 'disabled'} title="${tooltip}" data-comment-id="${c._id}">Report</button>
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
        <button class="btn tiny danger c-report" ${canReport ? '' : 'disabled'} title="${tooltip}" data-comment-id="${child._id}">Report</button>
      </div>
    </article>
  `;
}

function bindComposer() {
  const form = q('#replyForm');
  if (!form) return;

  $('#cancelReply')?.addEventListener('click', clearReplyTarget);

  form.addEventListener('submit', async ev => {
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

      const r = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true });
      const newComments = r.comments ?? [];
      renderCommentsTree(newComments);
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
  return t.split(/\n{2,}/g).map(p => `<p>${escapeHTML(p)}</p>`).join('\n');
}

function pinBadge() {
  return `<span class="badge pin" title="Pinned">📌</span>`;
}
function lockBadge() {
  return `<span class="badge lock" title="Locked">🔒</span>`;
}
