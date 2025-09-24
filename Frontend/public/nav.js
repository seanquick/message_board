// Frontend/public/nav.js
// Inject (or reuse) the site header exactly once, then signal 'nav:ready'.

(async function initHeader() {
  // Global guard in case this script is included twice
  if (window.__NAV_INJECTED__) {
    document.dispatchEvent(new CustomEvent('nav:ready'));
    return;
  }
  window.__NAV_INJECTED__ = true;

  try {
    // If a header already exists in the page, reuse it (no fetch)
    let header = document.querySelector('header.site-header');

    if (!header) {
      // Otherwise fetch header.html and inject once
      const res = await fetch('header.html', { cache: 'no-store', credentials: 'omit' });
      const html = await res.text();

      const wrap = document.createElement('div');
      wrap.innerHTML = html.trim();

      header = wrap.querySelector('header.site-header') || wrap.firstElementChild;
      if (header) {
        header.setAttribute('data-header-injected', '1');
        document.body.prepend(header);
      }
    } else {
      header.setAttribute('data-header-existing', '1');
    }
  } catch (e) {
    console.error('[nav] header inject failed:', e);
    // fall through; still notify so main.js can proceed
  } finally {
    // Always notify consumers that the nav is ready to be wired
    document.dispatchEvent(new CustomEvent('nav:ready'));
  }
})();
