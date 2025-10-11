// Frontend/public/report.js
import { api } from './main.js';

let reportModal = null;
let currentTarget = null;

// Create the modal DOM (once)
function createModal() {
  if (reportModal) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'reportModal';
  wrapper.innerHTML = `
    <div class="report-backdrop" style="
      position:fixed; inset:0; background:rgba(0,0,0,0.5);
      display:none; align-items:center; justify-content:center; z-index:9999;">
      <div class="report-dialog" style="
        background:#fff; border-radius:8px; padding:1.25rem; max-width:420px;
        box-shadow:0 4px 24px rgba(0,0,0,0.2); font-family:sans-serif;">
        <h3 style="margin-top:0; margin-bottom:1rem; font-size:1.25rem;">Report Content</h3>
        <label for="reportCategory" style="display:block; margin-bottom:.5rem; font-weight:500;">Reason</label>
        <select id="reportCategory" style="width:100%; padding:.5rem; border:1px solid #ccc; border-radius:6px;">
          <option value="">-- Select a reason --</option>
          <option value="Vulgarity / Offensive Language">Vulgarity / Offensive Language</option>
          <option value="Harassment / Bullying">Harassment / Bullying</option>
          <option value="Spam or Self-Promotion">Spam or Self-Promotion</option>
          <option value="Misinformation">Misinformation</option>
          <option value="Other">Other</option>
        </select>

        <label for="reportReason" style="display:block; margin-top:.75rem; margin-bottom:.25rem;">Details (optional)</label>
        <textarea id="reportReason" rows="4" style="width:100%; border:1px solid #ccc; border-radius:6px; padding:.5rem;"></textarea>

        <div class="row" style="display:flex; justify-content:flex-end; gap:.75rem; margin-top:1.25rem;">
          <button id="reportCancel" class="btn tiny" style="padding:.45rem .9rem;">Cancel</button>
          <button id="reportSubmit" class="btn tiny danger" style="padding:.45rem .9rem;">Submit</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);
  reportModal = wrapper.querySelector('.report-backdrop');

  wrapper.querySelector('#reportCancel').addEventListener('click', closeModal);
  wrapper.querySelector('#reportSubmit').addEventListener('click', submitModalReport);
}

// Open the modal for given target
export function openReportModal(targetType, targetId) {
  createModal();
  currentTarget = { targetType, targetId };
  reportModal.style.display = 'flex';
  reportModal.querySelector('#reportCategory').value = '';
  reportModal.querySelector('#reportReason').value = '';
}

// Hide modal
function closeModal() {
  if (reportModal) reportModal.style.display = 'none';
  currentTarget = null;
}

// Submit report
async function submitModalReport() {
  const select = reportModal.querySelector('#reportCategory');
  const textarea = reportModal.querySelector('#reportReason');
  const category = select.value || 'Other';
  const reason = textarea.value.trim();

  if (!currentTarget) return;
  if (!category) {
    alert('⚠️ Please select a reason.');
    return;
  }

  try {
    const resp = await api('/api/report', {
      method: 'POST',
      body: {
        threadId: currentTarget.targetType === 'thread' ? currentTarget.targetId : undefined,
        commentId: currentTarget.targetType === 'comment' ? currentTarget.targetId : undefined,
        category,
        reason,
      },
    });

    if (resp.ok) {
      alert('✅ Report submitted successfully.');
      closeModal();
    } else {
      alert('⚠️ Failed to submit: ' + (resp.error || 'Unknown error'));
    }
  } catch (err) {
    alert('❌ Failed to submit: ' + (err.error || err.message || JSON.stringify(err)));
  }
}

// Attach listeners for buttons
export function initReportUI() {
  createModal();

  const threadBtn = document.querySelector('#threadReport');
  if (threadBtn) {
    const tid = threadBtn.dataset.threadId || window.location.search.split('id=')[1];
    threadBtn.dataset.threadId = tid;
    threadBtn.addEventListener('click', () => openReportModal('thread', tid));
  }

  document.querySelectorAll('.reportCommentBtn, .c-report').forEach((btn) => {
    const cid = btn.dataset.commentId || btn.closest('.comment')?.dataset.id;
    if (cid && !btn.dataset.bound) {
      btn.dataset.bound = 'true'; // prevent duplicate listeners
      btn.addEventListener('click', () => openReportModal('comment', cid));
    }

    if (btn.disabled && btn.title === 'Login Required') {
      btn.title = 'You cannot report your own post.';
    }
  });
}

// Fallback call from other scripts
export function submitReport(targetType, targetId) {
  openReportModal(targetType, targetId);
}

// Init on DOM ready
window.addEventListener('DOMContentLoaded', initReportUI);
