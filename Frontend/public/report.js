// frontend/public/report.js
import { api } from './main.js';

let reportModal = null;
let currentTarget = null;

function createModal() {
  if (reportModal) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'reportModalWrapper';
  wrapper.innerHTML = `
    <div class="report-backdrop" style="
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: none; align-items: center; justify-content: center; z-index: 9999;
    ">
      <div class="report-dialog" style="
        background: #fff; border-radius: 8px; padding: 1.25rem; max-width: 420px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.2); font-family: sans-serif;
      ">
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

  // Cancel and Submit
  wrapper.querySelector('#reportCancel').addEventListener('click', (ev) => {
    ev.preventDefault();
    closeModal();
  });
  wrapper.querySelector('#reportSubmit').addEventListener('click', (ev) => {
    ev.preventDefault();
    submitModalReport();
  });
}

// Open modal
export function openReportModal(targetType, targetId) {
  createModal();
  currentTarget = { targetType, targetId };
  if (reportModal) {
    reportModal.style.display = 'flex';
    const sel = reportModal.querySelector('#reportCategory');
    const ta = reportModal.querySelector('#reportReason');
    if (sel) sel.value = '';
    if (ta) ta.value = '';
  }
}

// Close modal
function closeModal() {
  if (reportModal) reportModal.style.display = 'none';
  currentTarget = null;
}

// Submit
async function submitModalReport() {
  if (!currentTarget) return;
  const sel = reportModal.querySelector('#reportCategory');
  const ta = reportModal.querySelector('#reportReason');
  const category = sel?.value || 'Other';
  const reason = ta?.value.trim() || '';

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
      alert('✅ Report submitted.');
      closeModal();
    } else {
      alert('⚠️ Failed: ' + (resp.error || 'Unknown'));
    }
  } catch (err) {
    console.error('submitReport error:', err);
    alert('❌ Error submitting report.');
  }
}

// Wire report UI
export function initReportUI() {
  createModal();

  // Thread-level
  const btnThread = document.querySelector('#reportThreadBtn');
  if (btnThread) {
    const tid = btnThread.dataset.threadId || window.location.search.split('id=')[1];
    btnThread.dataset.threadId = tid;
    btnThread.addEventListener('click', (ev) => {
      ev.preventDefault();
      openReportModal('thread', tid);
    });
  }

  // Comment-level
  document.querySelectorAll('.c-report, .reportCommentBtn').forEach((btn) => {
    // avoid multiple bindings
    if (btn.dataset.reportBound) return;
    btn.dataset.reportBound = 'true';

    const cid = btn.dataset.commentId || btn.closest('.comment')?.dataset.id;
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (cid) openReportModal('comment', cid);
    });
  });
}

// Fallback
export function submitReport(targetType, targetId) {
  openReportModal(targetType, targetId);
}

// Auto-init
window.addEventListener('DOMContentLoaded', initReportUI);
