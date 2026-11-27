// Gentle scroll reveals for cards and sections. Content stays visible without JS or with reduced motion.
const targets = document.querySelectorAll('.premium-project, .home-now, .home-bench a, .task-card, .faq-section, .tool-guide, .personal-contact, .project-card, .home-try');
if (targets.length && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-reveal');
  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el, i) => { el.setAttribute('data-reveal', ''); el.style.transitionDelay = `${(i % 3) * 70}ms`; io.observe(el); });
  // Safety net: never leave anything hidden.
  setTimeout(() => targets.forEach(el => el.classList.add('is-in')), 4000);
}
