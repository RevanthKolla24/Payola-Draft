// Page views share one live session. Navigation never serializes listening history.
export const pages = {
  '/': 'Home', '/dashboard': 'Dashboard', '/import': 'Add listening',
  '/receipt': 'Your receipt', '/history': 'Saved history',
  '/account': 'Account', '/help': 'Help & Privacy'
};

export function initNavigation() {
  const views = [...document.querySelectorAll('[data-page]')];
  const main = document.querySelector('main');
  const positions = new Map();
  let current;
  let restoration;
  history.scrollRestoration = 'manual';

  function show(path, { pop = false, initial = false } = {}) {
    if (!(path in pages)) return;
    cancelAnimationFrame(restoration);
    const dialog = document.querySelector('dialog[open]');
    if (dialog) dialog.close();
    views.forEach(view => { view.hidden = view.dataset.page !== path; });
    current = path;
    document.body.dataset.currentPage = path;
    document.dispatchEvent(new CustomEvent('payola:page', { detail: path }));
    document.title = `${pages[path]} — Payola Reciept`;
    document.querySelectorAll('nav a[data-route]').forEach(link => {
      if (link.pathname === path) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    // Keep skip navigation inside the current page, including after Back/Forward.
    const heading = document.querySelector(`[data-page="${path}"] h1, [data-page="${path}"] h2`);
    main.setAttribute('aria-label', pages[path]);
    if (!initial) (heading || main).focus({ preventScroll: true });
    window.scrollTo({ top: pop ? positions.get(history.state?.payolaPage) || 0 : 0, behavior: 'instant' });
    restoration = requestAnimationFrame(() => {
      window.scrollTo({ top: pop ? positions.get(history.state?.payolaPage) || 0 : 0, behavior: 'instant' });
    });
  }

  function navigate(path) {
    if (!(path in pages)) return;
    if (path === current) { show(path); return; }
    positions.set(history.state?.payolaPage, window.scrollY);
    history.pushState({ payolaPage: crypto.randomUUID() }, '', path);
    show(path);
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-route]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !(url.pathname in pages)) return;
    event.preventDefault();
    navigate(url.pathname);
  });
  // Save the old entry while it is active, not after popstate has changed it.
  window.addEventListener('scroll', () => positions.set(history.state?.payolaPage, window.scrollY), { passive: true });
  window.addEventListener('popstate', () => show(location.pathname, { pop: true }));
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  const emailAction = new URL(location.href).searchParams.get('emailAction');
  const returnQuery = path === '/account' && ['verify', 'reset'].includes(emailAction) ? `?emailAction=${emailAction}` : '';
  history.replaceState({ payolaPage: crypto.randomUUID() }, '', path + returnQuery);
  views.forEach(view => {
    const heading = view.querySelector('h1, h2');
    if (heading) heading.tabIndex = -1;
  });
  show(path in pages ? path : '/', { initial: true });
  return navigate;
}