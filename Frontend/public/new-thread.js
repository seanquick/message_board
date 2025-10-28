import { api, q, escapeHTML, refreshMe, me } from './main.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await refreshMe();
    if (!me?.id) {
      alert('You must be logged in to create a thread.');
      window.location.href = '/login.html';
      return;
    }
  } catch (err) {
    console.error('[new-thread] Failed to refresh user:', err);
    alert('Authentication failed. Please log in again.');
    window.location.href = '/login.html';
    return;
  }

  const form = q('#createThreadForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = q('#threadTitleInput')?.value.trim();
    const body = q('#threadBodyInput')?.value.trim();
    const anonymous = !!q('#threadIsAnonymous')?.checked;
    const payload = { title, body, isAnonymous: anonymous };


    if (!title || !body) {
      q('#formError').textContent = 'Title and body are required.';
      q('#formError').style.display = 'block';
      return;
    }

    
    console.log('[new-thread.js] Submitting payload:', payload);

    try {
      const res = await api('/api/threads', {
        method: 'POST',
        body: payload
      });

      if (res?.thread?.id) {
        window.location.href = `/thread.html?id=${res.thread.id}`;
      } else {
        throw new Error('Unexpected response from server.');
      }
    } catch (err) {
      console.error('[new-thread.js] Thread creation failed:', err);
      q('#formError').textContent = escapeHTML(err?.message || 'Failed to create thread.');
      q('#formError').style.display = 'block';
    }
  });
});
