// Small, progressive enhancements. Navigation and content also work without JS.
const band = document.querySelector('.site-header-band');
const menu = document.querySelector('.site-menu-toggle');
const nav = document.querySelector('#site-navigation');
const mobile = window.matchMedia('(max-width: 680px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const shortcutHint = document.querySelector('.tool-switcher-trigger kbd');
if (shortcutHint && /Mac|iPhone|iPad/.test(navigator.platform)) shortcutHint.textContent = '⌘ K';

for (const tour of document.querySelectorAll('[data-product-tour]')) {
  const captions = [
    'Paste a GitHub repository link or username in the top bar. Download the project, then review its detected setup and run commands.',
    'Each project card has run controls. Install the project’s runtime and dependencies, review the command, then start it from its card. Use Stop when finished.',
    'A running card shows CPU, memory and uptime, with a link to open the app. Choose Log on a card to inspect its output; the log pane is not shown in this screenshot. Use Quit from the tray to stop apps when leaving.',
  ];
  tour.querySelectorAll('[data-tour-step]').forEach(button => button.addEventListener('click', () => {
    const step = Number(button.dataset.tourStep);
    tour.querySelectorAll('[data-tour-step]').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
    tour.querySelector('[data-tour-caption]').textContent = captions[step];
    tour.querySelector('[data-tour-focus]').dataset.region = String(step);
  }));
}

if (menu && nav) {
  function setMenu(open, restoreFocus = false) {
    menu.setAttribute('aria-expanded', String(open));
    menu.querySelector('span').textContent = open ? 'Close' : 'Menu';
    nav.hidden = mobile.matches && !open;
    if (restoreFocus) menu.focus();
  }
  function syncMenu() {
    menu.hidden = !mobile.matches;
    setMenu(false);
  }
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') setMenu(false, true);
  });
  document.addEventListener('click', event => {
    if (mobile.matches && !band.contains(event.target)) setMenu(false);
  });
  mobile.addEventListener('change', syncMenu);
  window.addEventListener('pageshow', syncMenu);
  syncMenu();
}

if (band) {
  const updateHeader = () => band.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}

// Never hide content while waiting for an observer. A failed enhancement leaves
// the complete page visible, including when navigating back to a scrolled page.
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (reducedMotion.matches) continue;
      entry.target.animate([
        { opacity: 0.75, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 450, easing: 'cubic-bezier(.2,.65,.3,1)' });
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('.hero-stage, .premium-project, .premium-tool-grid, .personal-current, .personal-about, .personal-contact, .about-intro, .story-section, .release-panel').forEach(element => observer.observe(element));
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    observer.disconnect();
    document.getAnimations().forEach(animation => animation.finish());
  });
}
