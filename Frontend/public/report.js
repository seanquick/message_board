// Frontend/public/report.js
import { api, q, qa } from './main.js';

async function submitReport(targetType, targetId) {
  const reason = prompt('Enter reason for reporting (optional):');
  try {
    const resp = await api('/api/report', {
      method: 'POST',
      body: { threadId: targetType === 'thread' ? targetId : undefined,
              commentId: targetType === 'comment' ? targetId : undefined,
              reason }
    });
    alert('Report submitted successfully.');
  } catch (err) {
    alert('Failed to submit report: ' + (err.error || err.message || JSON.stringify(err)));
  }
}

export function initReportUI() {
  // Thread report button
  const btnThread = q('#reportThreadBtn');
  if (btnThread) {
    const tid = btnThread.dataset.threadId;
    btnThread.addEventListener('click', () => submitReport('thread', tid));
  }

  // Comment report buttons
  qa('.reportCommentBtn').forEach(btn => {
    const cid = btn.dataset.commentId;
    btn.addEventListener('click', () => submitReport('comment', cid));
  });
}
