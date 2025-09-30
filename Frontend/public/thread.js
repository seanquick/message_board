// Frontend/public/thread.js
import { api, escapeHTML, timeAgo, q, $, qa, me, refreshMe } from './main.js';

let THREAD_ID = null;
let THREAD = null;

// ---- null-safe DOM helpers (drop-in) ----
function safeShow(selOrEl, visible = true) {
  const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
  if (el) el.style.display = visible ? '' : 'none';
}
function safeSetText(selOrEl, text = '') {
  const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
  if (el) el.textContent = text;
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Parse thread id
  const params = new URLSearchParams(location.search);
  THREAD_ID = params.get('id') || '';
  if (!THREAD_ID) return showFatal('Missing thread id.');

  // Warm up auth state (to show/hide composer hint)
  try { await refreshMe(); } catch {}

  // Ensure basic containers exist (works on bare thread.html too)
  ensureScaffold();

  // Load & render
  try {
    renderLoading();
    const { thread, comments } = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true });
    THREAD = thread || null;
    if (!THREAD) return showFatal('Thread not found.');

    renderThread(THREAD);
    renderCommentsTree(comments || []);

    // Highlight a comment if requested
    const highlight = params.get('highlight');
    if (highlight) highlightComment(highlight);
  } catch (e) {
    showFatal(e?.error || e?.message || 'Failed to load thread.');
  }

  // Wire composer
  bindComposer();
  // Wire toolbar actions
  bindToolbar();
}

/* =========================================================================
   Scaffold (creates containers if they don't exist)
   ========================================================================= */
function ensureScaffold() {
  const main = document.querySelector('main') || document.body;

  // Header area
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

  // Comments list
  if (!q('#comments')) {
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = `
      <h2 style="margin-top:0">Comments</h2>
      <div id="comments"></div>
    `;
    main.appendChild(sec);
  }

  // Composer (use existing if page has it)
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

/* =========================================================================
   Render: Thread header
   ========================================================================= */
function renderLoading() {
  setText('#threadTitle', 'Loading…');
  const body = q('#threadBody');
  if (body) {
    body.innerHTML = `<div class="skeleton">
      <div class="bar"></div><div class="bar short"></div><div class="bar"></div>
    </div>`;
  }
}

function renderThread(t) {
  // Title + badges
  const title = t.title || '(untitled)';
  setHTML('#threadTitle', escapeHTML(title));

  const badges = [];
  if (t.flags?.pinned || t.isPinned || t.pinned) badges.push(pinBadge());
  if (t.flags?.locked || t.isLocked || t.locked) badges.push(lockBadge());
  setHTML('#threadBadges', badges.join(''));

  // Meta
  const author = escapeHTML(t.author_display || 'Unknown');
  const when = timeAgo(t.createdAt);
  const upvotes = Number(t.upvoteCount ?? t.thumbsUp ?? t.upvotes ?? t.score ?? 0);
  setHTML('#threadMeta', `${author} • ${when} • ▲ ${upvotes}`);

  // Body
  setHTML('#threadBody', safeParagraphs(t.body ?? t.content ?? ''));

  // Lock banner + composer state
  const isLocked = !!(t.flags?.locked || t.isLocked || t.locked);
  const lockBanner = q('#lockBanner');
  const replyForm  = q('#replyForm');
  const replyBody  = q('#replyBody');
  const loginHint  = q('#loginHint');
  const cancelBtn  = q('#cancelReply');

  // Login hint shows only if not logged in
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
    if (replyForm) replyForm.classList.add('disabled');
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

  // Toolbar
  buildToolbar({ upvotes, isLocked });
}

function buildToolbar({ upvotes, isLocked }) {
  const host = q('#threadToolbar');
  if (!host) return;
  const canInteract = !!me?.uid;

  host.innerHTML = `
    <button id="threadUpvote" class="btn tiny" ${!canInteract ? 'disabled' : ''} title="${canInteract ? 'Upvote' : 'Login required'}">
      ▲ Upvote <span id="threadUpCount" class="mono">${upvotes}</span>
    </button>
    <button id="threadReport" class="btn tiny danger" ${!canInteract ? 'disabled' : ''} title="${canInteract ? 'Report' : 'Login required'}">
      Report
    </button>
  `;

  $('#threadUpvote')?.addEventListener('click', onUpvoteThread);
  $('#threadReport')?.addEventListener('click', onReportThread);
}

async function onUpvoteThread() {
  try {
    const res = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}/upvote`, { method: 'POST' });
    const n = Number(res?.upvoteCount || 0);
    setText('#threadUpCount', n);
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to upvote.');
  }
}

async function onReportThread() {
  if (!confirm('Report this thread to moderators?')) return;
  const reason = prompt('Reason (optional):', '') || '';
  try {
    await api(`/api/threads/${encodeURIComponent(THREAD_ID)}/report`, {
      method: 'POST',
      body: { reason, category: 'other', details: reason }
    });
    alert('Thanks! Your report was submitted.');
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to report thread.');
  }
}

/* =========================================================================
   Render: Comments tree
   ========================================================================= */
function renderCommentsTree(nodes = []) {
  const host = q('#comments');
  if (!host) return;
  if (!nodes.length) {
    host.innerHTML = `<div class="empty">No comments yet.</div>`;
    return;
  }
  host.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const node of nodes) frag.appendChild(renderCommentNode(node));
  host.appendChild(frag);
  // wire dynamic actions
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

  const actions = `
    <div class="row wrap" style="gap:.5rem; margin-top:.35rem">
      <button class="btn tiny c-upvote" ${isDeleted ? 'disabled' : ''}>▲ ${up}</button>
      <button class="btn tiny replyBtn" ${isDeleted ? 'disabled' : ''}>Reply</button>
      <button class="btn tiny danger c-report" ${isDeleted ? 'disabled' : ''}>Report</button>
    </div>
  `;

  el.innerHTML = `
    <header class="meta">${author} • ${when}</header>
    <div class="c-body">${body}</div>
    ${actions}
    ${Array.isArray(c.children) && c.children.length
      ? `<div class="children">${c.children.map(renderCommentChildHTML).join('')}</div>`
      : ''
    }
  `;
  // children: wire events later globally
  return el;
}

function renderCommentChildHTML(child) {
  const id = escapeAttr(String(child._id));
  const author = escapeHTML(child.author_display || 'Unknown');
  const when = timeAgo(child.createdAt);
  const up = Number(child.upvoteCount ?? child.score ?? 0);
  const isDeleted = !!child.isDeleted;
  const body = isDeleted ? '<em class="meta">[deleted]</em>' : escapeHTML(child.body || '');

  return `
    <article class="comment" id="c-${id}" data-id="${id}">
      <header class="meta">${author} • ${when}</header>
      <div class="c-body">${body}</div>
      <div class="row wrap" style="gap:.5rem; margin-top:.35rem">
        <button class="btn tiny c-upvote" ${isDeleted ? 'disabled' : ''}>▲ ${up}</button>
        <button class="btn tiny replyBtn" ${isDeleted ? 'disabled' : ''}>Reply</button>
        <button class="btn tiny danger c-report" ${isDeleted ? 'disabled' : ''}>Report</button>
      </div>
      ${Array.isArray(child.children) && child.children.length
        ? `<div class="children">${child.children.map(renderCommentChildHTML).join('')}</div>`
        : ''
      }
    </article>
  `;
}

/* =========================================================================
   Composer: reply, cancel, submit
   ========================================================================= */
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
    if (!body)     return alert('Comment cannot be empty.');

    try {
      const payload = { body, isAnonymous };
      if (parentId) payload.parentId = parentId;
      await api(`/api/comments/${encodeURIComponent(THREAD_ID)}`, { method: 'POST', body: payload });
      const rb = q('#replyBody'); if (rb) rb.value = '';
      clearReplyTarget();
      // Reload comments (lightweight)
      const fresh = await api(`/api/threads/${encodeURIComponent(THREAD_ID)}`, { nocache: true });
      renderCommentsTree(fresh?.comments || []);
    } catch (e) {
      const msg = e?.error || e?.message || 'Failed to post comment.';
      // Handle locked or forbidden gracefully
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
  // focus composer
  q('#replyBody')?.focus({ preventScroll: false });
  // scroll into view
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

async function onReportComment(ev) {
  const node = ev.currentTarget.closest('.comment');
  if (!node) return;
  const id = node.dataset.id;
  if (!confirm('Report this comment to moderators?')) return;
  const reason = prompt('Reason (optional):', '') || '';
  try {
    await api(`/api/comments/${encodeURIComponent(id)}/report`, {
      method: 'POST',
      body: { reason }
    });
    alert('Thanks! Your report was submitted.');
  } catch (e) {
    alert(e?.error || e?.message || 'Failed to report comment.');
  }
}

/* =========================================================================
   Helpers
   ========================================================================= */
function setText(sel, val) {
  const el = q(sel);
  if (el) el.textContent = String(val);
}
function setHTML(sel, html) {
  const el = q(sel);
  if (el) el.innerHTML = html;
}
function showFatal(msg) {
  const main = document.querySelector('main') || document.body;
  main.innerHTML = `<div class="err" role="alert">${escapeHTML(msg)}</div>`;
}

function safeParagraphs(text) {
  const t = String(text || '');
  if (!t.trim()) return '<p class="meta">(no content)</p>';
  // Simple paragraphizer
  return t
    .split(/\n{2,}/g)
    .map(p => `<p>${escapeHTML(p)}</p>`)
    .join('\n');
}

function pinBadge() {
  return `
    <span class="badge pin" title="Pinned" style="margin-left:.5rem">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="width:.9em;height:.9em">
        <path d="M14 2l-2 2 2 5-4 4-3-3-2 2 7 7 2-2-3-3 4-4 5 2 2-2-8-8z" fill="currentColor"/>
      </svg>
      Pinned
    </span>
  `;
}
function lockBadge() {
  return `
    <span class="badge lock" title="Locked" style="margin-left:.3rem">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="width:.9em;height:.9em">
        <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9z" fill="currentColor"/>
      </svg>
      Locked
    </span>
  `;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function highlightComment(cid) {
  const el = q(`#c-${CSS.escape(String(cid))}`);
  if (!el) return;
  el.classList.add('highlight');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // fade the highlight after a bit
  setTimeout(() => el.classList.remove('highlight'), 2400);
}

/* =========================================================================
   Toolbar binding is separated so renderThread can call it anytime
   ========================================================================= */
function bindToolbar() {
  // already wired in buildToolbar()
}
