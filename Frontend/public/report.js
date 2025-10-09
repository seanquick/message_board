// Frontend/public/report.js
import { api } from './main.js';

async function submitReport(targetType, targetId) {
  const categories = [
    'Vulgarity / Offensive Language',
    'Harassment / Bullying',
    'Spam or Self-Promotion',
    'Misinformation',
    'Other',
  ];

  let categoryPrompt = 'Select a reason for reporting:\n\n';
  categories.forEach((c, i) => (categoryPrompt += `${i + 1}. ${c}\n`));
  categoryPrompt += '\nEnter the number of the reason:';

  const choice = prompt(categoryPrompt);
  const index = parseInt(choice, 10) - 1;
  const category = categories[index] || 'Other';

  const reason = prompt(`You selected "${category}".\n\nOptional: add more details below:`) || '';

  try {
    const resp = await api('/api/report', {
      method: 'POST',
      body: {
        threadId: targetType === 'thread' ? targetId : undefined,
        commentId: targetType === 'comment' ? targetId : undefined,
        category,
        reason,
      },
    });

    if (resp.ok) {
      alert('✅ Report submitted successfully. Thank you for helping keep the community safe.');
    } else {
      alert('⚠️ Failed to submit report: ' + (resp.error || 'Unknown error'));
    }
  } catch (err) {
    alert('❌ Failed to submit report: ' + (err.error || err.message || JSON.stringify(err)));
  }
}

export function initReportUI() {
  const btnThread = document.querySelector('#reportThreadBtn');
  if (btnThread) {
    const tid = btnThread.dataset.threadId || window.location.search.split('id=')[1];
    btnThread.dataset.threadId = tid;
    btnThread.addEventListener('click', () => submitReport('thread', tid));
  }

  document.querySelectorAll('.reportCommentBtn').forEach((btn) => {
    const cid = btn.dataset.commentId;
    btn.addEventListener('click', () => submitReport('comment', cid));
  });
}

// Export for direct use in thread.js
export { submitReport };

// Auto-initialize (safe under CSP)
window.addEventListener('DOMContentLoaded', initReportUI);
