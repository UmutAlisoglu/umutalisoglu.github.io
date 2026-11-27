// Gentle scroll reveals for cards and sections. Content stays visible without JS or with reduced motion.
const targets = document.querySelectorAll('.premium-project, .home-now, .home-bench a, .task-card, .faq-section, .tool-guide, .personal-contact, .project-card, .home-try');
if (targets.length && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-reveal');
  // Once shown, drop the reveal hooks so the card's own hover transitions work again without a delay.
  const show = el => {
    if (!el.hasAttribute('data-reveal') || el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    setTimeout(() => { el.removeAttribute('data-reveal'); el.style.transitionDelay = ''; }, 900);
  };
  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el, i) => { el.setAttribute('data-reveal', ''); el.style.transitionDelay = `${(i % 3) * 70}ms`; io.observe(el); });
  // Safety net: never leave anything hidden (fast jumps, find-in-page, printing).
  setTimeout(() => targets.forEach(show), 4000);
  addEventListener('beforeprint', () => targets.forEach(show));
}

// Phones: "More FileForge tools" lists every tool (24+), which pushed the guide and FAQ far down.
// Show the first six (plus the current tool) and let people expand the rest.
const toolNav = document.querySelector('.dedicated-tool .tool-nav');
if (toolNav && matchMedia('(max-width: 650px)').matches) {
  const links = toolNav.querySelectorAll('a');
  if (links.length > 8) {
    toolNav.classList.add('is-collapsed');
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tool-nav-more';
    more.setAttribute('aria-expanded', 'false');
    more.textContent = `Show all ${links.length} tools`;
    more.addEventListener('click', () => {
      const open = toolNav.classList.toggle('is-collapsed') === false;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show fewer tools' : `Show all ${links.length} tools`;
    });
    toolNav.append(more);
  }
}
