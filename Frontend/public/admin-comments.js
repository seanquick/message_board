// admin-comments.js
// ✅ Update this line in admin-comments.js
import { api, q, qa, escapeHTML } from './main.js';


const state = {
  comments: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1
  }
};

export async function loadComments({ page = state.comments.page || 1 } = {}) {
  const tbody = document.querySelector('#commentsTable tbody');
  if (!tbody) return;

  const includeDeleted = q('#cIncludeDeleted')?.checked;
  const limit = parseInt(q('#cPageSize')?.value || state.comments.limit || 50, 10);
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString(), t: String(Date.now()) });
  if (includeDeleted) params.set('includeDeleted', '1');

  try {
    const resp = await api(`/api/admin/comments?${params.toString()}`, {
      method: 'GET',
      nocache: true,
      skipHtmlRedirect: true
    });

    const comments = Array.isArray(resp.comments) ? resp.comments : [];
    const { totalPages = 1, totalCount = 0 } = resp.pagination || {};

    tbody.innerHTML = '';
    if (!comments.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No comments found.</td></tr>`;
      q('#cPageInfo').textContent = `0 results`;
      q('#cPrev')?.setAttribute('disabled', true);
      q('#cNext')?.setAttribute('disabled', true);
      return;
    }

    comments.forEach(c => {
      const tr = document.createElement('tr');
      tr.dataset.id = c._id;
      tr.dataset.deleted = !!c.isDeleted;

      const publicAuthor = c.isAnonymous
        ? 'Anonymous'
        : (c.author_name || (c.author?.name || ''));
      const internalAuthor = c.realAuthor
        ? (c.realAuthor.name || c.realAuthor.email || '')
        : '';
      const displayAuthor = c.isAnonymous
        ? `${publicAuthor} (internal: ${escapeHTML(internalAuthor)}${c.realAuthor?._id ? `, <a class="btn tiny" href="profile.html?id=${c.realAuthor._id}" target="_blank">View Profile</a>` : ''})`
        : `${escapeHTML(publicAuthor)}${c.realAuthor?._id ? ` <a class="btn tiny" href="profile.html?id=${c.realAuthor._id}" target="_blank">View Profile</a>` : ''}`;

      const threadId = (c.thread && typeof c.thread === 'object' && c.thread._id) ? c.thread._id : (typeof c.thread === 'string' ? c.thread : '');
      const threadTitle = (c.thread && typeof c.thread === 'object' && c.thread.title) ? c.thread.title : '';

      tr.dataset.threadId = threadId || '';

      tr.innerHTML = `
        <td><input type="checkbox" class="bulkSelectComment" /></td>
        <td>${escapeHTML(new Date(c.createdAt || Date.now()).toLocaleString())}</td>
        <td>${escapeHTML(c.snippet || '(no snippet)')}</td>
        <td>${displayAuthor}</td>
        <td>${escapeHTML(threadTitle || threadId || '(unknown thread)')}</td>
        <td>${Number(c.upvoteCount ?? 0)}</td>
        <td>${c.isDeleted ? 'Deleted' : 'Active'}</td>
        <td class="row gap-05">
          <button class="btn tiny viewComment">View</button>
          <button class="btn tiny delRestoreComment">${c.isDeleted ? 'Restore' : 'Delete'}</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    state.comments.page = page;
    state.comments.limit = limit;
    state.comments.total = totalCount;
    state.comments.totalPages = totalPages;

    q('#cPageInfo').textContent = `Page ${page} of ${totalPages} (${totalCount} comments)`;
    q('#cPrev')?.toggleAttribute('disabled', page <= 1);
    q('#cNext')?.toggleAttribute('disabled', page >= totalPages);

    bindCommentActions(tbody);
  } catch (e) {
    console.error('[AdminComments] Error loading comments:', e);
    renderErrorRow('#commentsTable', `Error loading comments: ${e?.error || e?.message}`, 8);
  }
}

export function bindCommentActions(tbody) {
  tbody.querySelectorAll('.viewComment').forEach(btn =>
    btn.addEventListener('click', ev => {
      const tr = ev.currentTarget.closest('tr');
      const tid = tr?.dataset.threadId;
      if (!tid) {
        alert('Thread ID missing');
        return;
      }
      window.open(`thread.html?id=${encodeURIComponent(tid)}`, '_blank');
    })
  );

  tbody.querySelectorAll('.delRestoreComment').forEach(btn =>
    btn.addEventListener('click', async ev => {
      const tr = ev.currentTarget.closest('tr');
      const cid = tr?.dataset.id;
      if (!cid) return;
      const reason = prompt('Reason (optional):');
      try {
        await api(`/api/admin/comments/${encodeURIComponent(cid)}/delete`, {
          method: 'POST',
          body: { reason }
        });
        await loadComments({ page: state.comments.page });
      } catch (e) {
        alert(`Failed to delete/restore comment: ${e?.error || e?.message}`);
      }
    })
  );
}

export function bindCommentBulkActions() {
  q('#cSelectAll')?.addEventListener('change', ev => {
    const checked = ev.currentTarget.checked;
    qa('#commentsTable tbody tr input.bulkSelectComment').forEach(cb => {
      cb.checked = checked;
    });
  });

  q('#cBulkDelete')?.addEventListener('click', async () => {
    const ids = Array.from(qa('#commentsTable tbody tr input.bulkSelectComment:checked'))
      .map(cb => cb.closest('tr')?.dataset.id)
      .filter(Boolean);
    if (!ids.length) {
      alert('No comments selected');
      return;
    }
    const reason = prompt('Reason for delete (optional):');
    try {
      await api('/api/admin/comments/bulk-delete', {
        method: 'POST',
        body: { ids, restore: false, reason }
      });
      await loadComments({ page: state.comments.page });
    } catch (e) {
      alert(`Bulk comments delete failed: ${e?.error || e?.message}`);
    }
  });

  q('#cBulkRestore')?.addEventListener('click', async () => {
    const ids = Array.from(qa('#commentsTable tbody tr input.bulkSelectComment:checked'))
      .map(cb => cb.closest('tr')?.dataset.id)
      .filter(Boolean);
    if (!ids.length) {
      alert('No comments selected');
      return;
    }
    try {
      await api('/api/admin/comments/bulk-delete', {
        method: 'POST',
        body: { ids, restore: true }
      });
      await loadComments({ page: state.comments.page });
    } catch (e) {
      alert(`Bulk comments restore failed: ${e?.error || e?.message}`);
    }
  });

  q('#cRefresh')?.addEventListener('click', () => loadComments({ page: state.comments.page }));
  q('#cPrev')?.addEventListener('click', () => loadComments({ page: Math.max(1, state.comments.page - 1) }));
  q('#cNext')?.addEventListener('click', () => loadComments({ page: state.comments.page + 1 }));
}

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  bindCommentBulkActions();
  loadComments({ page: 1 });
});
