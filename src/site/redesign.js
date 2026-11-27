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

// Home hero: picture-to-board slider. The range input drives the split; a single sweep on first view
// hints that it can be dragged (skipped with reduced motion or once someone touches it).
for (const compare of document.querySelectorAll('[data-compare]')) {
  const range = compare.querySelector('.pcb-compare-range');
  if (!range) continue;
  const set = value => {
    compare.style.setProperty('--split', `${value}%`);
    compare.dataset.edge = value < 12 ? 'board' : value > 88 ? 'art' : '';
  };
  let touched = false;
  range.addEventListener('input', () => { touched = true; set(Number(range.value)); });
  set(Number(range.value));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) continue;
  const sweep = () => {
    const keys = [[0, 50], [900, 82], [2000, 18], [2900, 50]], start = performance.now();
    const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const frame = now => {
      if (touched) return;
      const t = now - start, i = keys.findIndex(([at]) => at > t);
      if (i < 0) { range.value = 50; set(50); return; }
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i], v = v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
      range.value = Math.round(v); set(v);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); setTimeout(sweep, 700); } }, { threshold: .6 });
  io.observe(compare);
}
