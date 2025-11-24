import { api } from './utils.js';

async function loadNotifications() {
  try {
    const res = await api('/api/notifications', { method: 'GET' });
    const container = document.getElementById('notifList');
    container.innerHTML = '';

    if (!res?.length) {
      container.innerHTML = '<p>No notifications yet.</p>';
      return;
    }

    res.forEach(n => {
      const div = document.createElement('div');
      div.className = `notif ${n.readAt ? 'read' : 'unread'}`;

      const linkHTML = n.link
        ? `<a href="${n.link}">${n.title || 'View'}</a>`
        : n.title;

      div.innerHTML = `
        <div class="notif-header">
          <strong>${linkHTML}</strong>
          <span class="notif-date">${new Date(n.createdAt).toLocaleString()}</span>
        </div>
        <div class="notif-body">${n.body || ''}</div>
      `;

      container.appendChild(div);
    });
  } catch (e) {
    console.error('[notifications.js] Failed to load notifications:', e);
    document.getElementById('notifList').innerHTML = '<p>Failed to load notifications.</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadNotifications);

document.addEventListener('DOMContentLoaded', () => {
  const clearBtn = document.getElementById('clearNotifsBtn');
  clearBtn?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all notifications?')) return;

    try {
      await api('/api/notifications/clear', { method: 'POST' });
      document.getElementById('notifList').innerHTML = '<p>No notifications.</p>';
    } catch (err) {
      console.error('Failed to clear notifications:', err);
      alert('Failed to clear notifications.');
    }
  });
});
