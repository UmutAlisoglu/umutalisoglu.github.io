const form = document.querySelector('#feedback-form');
const preview = document.querySelector('#feedback-preview');
const draft = document.querySelector('#feedback-draft');
const link = document.querySelector('#feedback-github');
const repositories = {
  website: 'umutalisoglu.github.io',
  fileforge: 'fileforge',
  repodock: 'repodock',
};

form.addEventListener('submit', event => {
  event.preventDefault();
  const title = form.elements.title.value.trim();
  const details = form.elements.details.value.trim();
  form.elements.title.setCustomValidity(title ? '' : 'Add a short summary.');
  form.elements.details.setCustomValidity(details ? '' : 'Add a few details.');
  if (!form.reportValidity()) return;
  const project = form.elements.project;
  const body = `Project: ${project.selectedOptions[0].textContent}\n\n${details}`;
  // No API request: the visitor decides whether to open GitHub and submit the draft.
  const url = new URL(`https://github.com/UmutAlisoglu/${repositories[project.value]}/issues/new`);
  url.searchParams.set('title', title); url.searchParams.set('body', body);
  if (url.href.length > 7500) {
    form.elements.details.setCustomValidity('This draft is too long for a GitHub link. Please shorten the report, or use the direct project issue link.');
    form.reportValidity(); return;
  }
  draft.textContent = `${title}\n\n${body}`;
  link.href = url.href;
  preview.hidden = false;
  link.focus({ preventScroll: true });
  preview.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
});
form.addEventListener('input', event => {
  event.target.setCustomValidity?.('');
  preview.hidden = true; draft.textContent = ''; link.removeAttribute('href');
});
// Without JavaScript, only the direct contact links are shown. Typed feedback
// must never fall back to a normal form submission or a URL query on this site.
form.hidden = false;
