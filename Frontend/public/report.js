// Frontend/public/report.js
import { api } from './main.js';

let reportModal = null;
let currentTarget = null;

/* =========================================================================
   Modal UI Setup
   ========================================================================= */
function createModal() {
  // only create once
  if (reportModal) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'reportModal';
  wrapper.innerHTML = `
    <div class="report-backdrop" style="
      position:fixed; inset:0; background:rgba(0,0,0,0.5);
      display:none; align-items:center; justify-content:center; z-index:9999;">
      <div class="report-dialog" style="
        background:#fff; border-radius:8px; padding:1rem; max-width:400px;
        box-shadow:0 4px 20px rgba(0,0,0,0.2); font-family:sans-serif;">
        <h3 style="margin-top:0;">Report Content</h3>
        <label for="reportCategory" style="display:block; margin:.5rem 0 .25rem;">Reason:</label>
        <select id="reportCategory" style="width:100%; padding:.4rem;">
          <option value="">-- Select a reason --</option>
          <option value="Vulgarity / Offensive Language">Vulgarity / Offensive Language</option>
          <option value="Harassment / Bullying">Harassment / Bullying</option>
          <option value="Spam or Self-Promotion">Spam or Self-Promotion</option>
          <option value="Misinformation">Misinformation</option>
          <option value="Other">Other</option>
        </select>

        <label for="reportReason" style="display:block; margin:.75rem 0 .25rem;">Additional details (optional):</label>
        <textarea id="reportReason" rows="4" style="width:100%; border:1px solid #ccc; border-radius:6px; padding:.5rem;"></textarea>

        <div class="row" style="display:flex; justify-content:flex-end; gap:.5rem; margin-top:1rem;">
          <button id="reportCancel" class="btn tiny" style="padding:.4rem .7rem;">Cancel</button>
          <button id="reportSubmit" class="btn tiny primary" style="padding:.4rem .7rem; background:#111827; color:#fff;">Submit</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);
  reportModal = wrapper.querySelector('.report-backdrop');

  // attach close & submit handlers
  wrapper.querySelector('#reportCancel').addEventListener('click', closeModal);
  wrapper.querySelector('#reportSubmit').addEventListener('click', submitModalReport);
}

/* =========================================================================
   Modal Open / Close
   ========================================================================= */
export function openReportModal(targetType, targetId) {
  createModal();
  currentTarget = { targetType, targetId };
  reportModal.style.display = 'flex';
  const select = reportModal.querySelector('#reportCategory');
  const textarea = reportModal.querySelector('#reportReason');
  select.value = '';
  textarea.value = '';
}

function closeModal() {
  if (reportModal) reportModal.style.display = 'none';
  currentTarget = null;
}

/* =========================================================================
   Submit Handler (modal)
   ========================================================================= */
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
      alert('✅ Report submitted successfully. Thank you!');
      closeModal();
    } else {
      alert('⚠️ Failed to submit report: ' + (resp.error || 'Unknown error'));
    }
  } catch (err) {
    alert('❌ Failed to submit report: ' + (err.error || err.message || JSON.stringify(err)));
  }
}

/* =========================================================================
   Initialization – attaches report buttons
   ========================================================================= */
export function initReportUI() {
  createModal();

  // Thread-level button
  const btnThread = document.querySelector('#reportThreadBtn');
  if (btnThread) {
    const tid = btnThread.dataset.threadId || window.location.search.split('id=')[1];
    btnThread.dataset.threadId = tid;
    btnThread.addEventListener('click', () => openReportModal('thread', tid));
  }

  // Comment-level buttons
  document.querySelectorAll('.reportCommentBtn, .c-report').forEach((btn) => {
    const cid = btn.dataset.commentId || btn.closest('.comment')?.dataset.id;
    btn.addEventListener('click', () => openReportModal('comment', cid));
  });
}

/* =========================================================================
   Re-export submitReport for backward compatibility
   ========================================================================= */
export async function submitReport(targetType, targetId) {
  openReportModal(targetType, targetId);
}

// Auto-init safely under CSP
window.addEventListener('DOMContentLoaded', initReportUI);
