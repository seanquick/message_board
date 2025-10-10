// Frontend/public/report.js
import { api } from './main.js';

let reportModal = null;
let currentTarget = null;

function createModal() {
  if (reportModal) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'reportModal';
  wrapper.innerHTML = `
    <div class="report-backdrop" style="
      position:fixed; inset:0; background:rgba(0,0,0,0.5);
      display:none; align-items:center; justify-content:center; z-index:9999;">
      <div class="report-dialog card" style="
        background:#fff; border-radius:8px; padding:1.5rem; max-width:420px;
        width:100%; box-shadow:0 8px 28px rgba(0,0,0,0.2);">
        <h2 style="margin-top:0;">Report Content</h2>

        <label for="reportCategory" class="meta" style="margin-top:1rem; display:block;">Reason:</label>
        <select id="reportCategory" class="input" style="width:100%; margin-top:0.25rem;">
          <option value="">-- Select a reason --</option>
          <option value="Vulgarity / Offensive Language">Vulgarity / Offensive Language</option>
          <option value="Harassment / Bullying">Harassment / Bullying</option>
          <option value="Spam or Self-Promotion">Spam or Self-Promotion</option>
          <option value="Misinformation">Misinformation</option>
          <option value="Other">Other</option>
        </select>

        <label for="reportReason" class="meta" style="margin-top:1rem; display:block;">Additional details (optional):</label>
        <textarea id="reportReason" class="input" rows="4" style="width:100%; margin-top:0.25rem;"></textarea>

        <div class="row" style="justify-content:flex-end; gap:.5rem; margin-top:1.5rem;">
          <button id="reportCancel" class="btn tiny">Cancel</button>
          <button id="reportSubmit" class="btn tiny danger">Submit</button>
        </div>
      </div>
    </div>
  `.trim();

  document.body.appendChild(wrapper);
  reportModal = wrapper.querySelector('.report-backdrop');

  wrapper.querySelector('#reportCancel').addEventListener('click', closeModal);
  wrapper.querySelector('#reportSubmit').addEventListener('click', submitModalReport);
}

function closeModal() {
  if (reportModal) reportModal.style.display = 'none';
  currentTarget = null;
}

function openReportModal(targetType, targetId) {
  createModal();
  currentTarget = { targetType, targetId };

  // Reset form
  const categorySelect = reportModal.querySelector('#reportCategory');
  const reasonInput = reportModal.querySelector('#reportReason');
  if (categorySelect) categorySelect.value = '';
  if (reasonInput) reasonInput.value = '';

  reportModal.style.display = 'flex';
}

async function submitModalReport() {
  const category = reportModal.querySelector('#reportCategory')?.value || 'Other';
  const reason = reportModal.querySelector('#reportReason')?.value.trim();

  if (!currentTarget) return;
  if (!category) return alert('⚠️ Please select a reason.');

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
      alert('✅ Report submitted. Thank you.');
      closeModal();
    } else {
      alert('⚠️ Failed to submit: ' + (resp.error || 'Unknown error'));
    }
  } catch (err) {
    alert('❌ Submission failed: ' + (err.error || err.message || 'Unknown error'));
  }
}

export function initReportUI() {
  createModal();

  const btnThread = document.querySelector('#reportThreadBtn');
  if (btnThread) {
    const tid = btnThread.dataset.threadId || window.location.search.split('id=')[1];
    btnThread.dataset.threadId = tid;
    btnThread.addEventListener('click', () => openReportModal('thread', tid));
  }

  document.querySelectorAll('.reportCommentBtn, .c-report').forEach((btn) => {
    const cid = btn.dataset.commentId || btn.closest('.comment')?.dataset.id;
    if (cid) {
      btn.addEventListener('click', () => openReportModal('comment', cid));
    }
  });
}

// Optional external call
export function submitReport(targetType, targetId) {
  openReportModal(targetType, targetId);
}

// Auto-init on load (CSP-safe)
window.addEventListener('DOMContentLoaded', initReportUI);
