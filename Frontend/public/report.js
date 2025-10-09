// Frontend/public/report.js

import { api } from './main.js';

function createReportModal(targetType, targetId) {
  // create container
  const overlay = document.createElement('div');
  overlay.id = 'reportOverlay';
  overlay.style = `
    position: fixed; top: 0; left: 0; width:100%; height:100%;
    background: rgba(0,0,0,0.4); display: flex; justify-content:center; align-items:center;
    z-index: 10000;
  `;

  const box = document.createElement('div');
  box.style = `
    background: white; padding:1.5rem; border-radius:8px; max-width:400px; width: 90%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  // Title
  const h = document.createElement('h2');
  h.textContent = 'Report Content';
  box.appendChild(h);

  // Dropdown select
  const select = document.createElement('select');
  select.name = 'reportCategory';
  select.style = 'width:100%; padding:.5rem; margin-bottom:1rem;';
  const options = [
    { val: '', label: 'Select a reason...' },
    { val: 'vulgarity', label: 'Vulgarity / Offensive Language' },
    { val: 'harassment', label: 'Harassment / Bullying' },
    { val: 'spam', label: 'Spam or Self‑Promotion' },
    { val: 'misinformation', label: 'Misinformation' },
    { val: 'other', label: 'Other' }
  ];
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.val;
    o.textContent = opt.label;
    select.appendChild(o);
  });
  box.appendChild(select);

  // Textarea for additional details
  const textarea = document.createElement('textarea');
  textarea.name = 'reportDetails';
  textarea.placeholder = 'Optional: additional details';
  textarea.style = 'width:100%; min-height:80px; padding:.5rem; margin-bottom:1rem;';
  box.appendChild(textarea);

  // Buttons row
  const btnRow = document.createElement('div');
  btnRow.style = 'display:flex; gap:.5rem; justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn';
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  btnRow.appendChild(cancelBtn);

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Submit';
  submitBtn.className = 'btn primary';
  submitBtn.addEventListener('click', async () => {
    const category = select.value;
    const reason = textarea.value.trim();
    if (!category) {
      alert('Please select a reason.');
      return;
    }
    try {
      const resp = await api('/api/report', {
        method: 'POST',
        body: {
          threadId: targetType === 'thread' ? targetId : undefined,
          commentId: targetType === 'comment' ? targetId : undefined,
          category,
          reason
        }
      });
      if (resp.ok) {
        alert('Report submitted successfully.');
        document.body.removeChild(overlay);
      } else {
        alert('Failed to submit report: ' + (resp.error || JSON.stringify(resp)));
      }
    } catch (err) {
      alert('Error submitting report: ' + (err.error || err.message || JSON.stringify(err)));
    }
  });
  btnRow.appendChild(submitBtn);

  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

export function initReportUI() {
  // Thread-level button
  const btnThread = document.querySelector('#reportThreadBtn');
  if (btnThread) {
    const tid = btnThread.dataset.threadId;
    btnThread.addEventListener('click', () => createReportModal('thread', tid));
  }

  // Comment-level buttons
  document.querySelectorAll('.reportCommentBtn').forEach(btn => {
    const cid = btn.dataset.commentId;
    btn.addEventListener('click', () => createReportModal('comment', cid));
  });
}
