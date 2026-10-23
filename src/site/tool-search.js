import { featuredTools, findTools, renderToolCards, renderJobGroups } from './tool-catalog.js';
import './tool-search.css';
import './conversion-picker.js';

for (const directory of document.querySelectorAll('[data-tool-directory]')) {
  const discovery = directory.querySelector('.tool-discovery');
  const form = directory.querySelector('.tool-search-form');
  const search = directory.querySelector('input[type="search"]');
  const clear = directory.querySelector('.tool-search-clear');
  const count = directory.querySelector('.tool-search-count');
  const grid = directory.querySelector('[data-tool-results]');
  const empty = directory.querySelector('.tool-search-empty');
  const categories = [...directory.querySelectorAll('[data-tool-category]')];
  const compact = directory.dataset.compact === 'true';
  let category = 'All tools';

  function update() {
    const query = search.value.trim();
    const initial = compact && !query && category === 'All tools';
    const tools = initial ? featuredTools : findTools(query, category);
    const grouped = !compact && !query && category === 'All tools';
    grid.classList.toggle('grouped-results', grouped);
    grid.innerHTML = grouped ? renderJobGroups() : renderToolCards(tools, compact);
    grid.hidden = tools.length === 0;
    empty.hidden = tools.length !== 0;
    clear.hidden = !search.value;
    count.textContent = initial ? 'Popular tools to get started' : `${tools.length} ${tools.length === 1 ? 'task' : 'tasks'}${query ? ' matching your search' : category === 'All tools' ? ' available' : ` in ${category.toLowerCase()}`}`;
    categories.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.toolCategory === category)));
  }

  function reset() {
    search.value = '';
    category = 'All tools';
    update();
    search.focus();
  }

  form.addEventListener('submit', event => { event.preventDefault(); update(); });
  search.addEventListener('input', update);
  search.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); });
  clear.addEventListener('click', () => { search.value = ''; update(); search.focus(); });
  directory.querySelector('[data-tool-reset]').addEventListener('click', reset);
  categories.forEach(button => button.addEventListener('click', () => { category = button.dataset.toolCategory; update(); }));

  // No requests are sent while searching. The input filters this local catalogue.
  discovery.hidden = false;
  const params = new URLSearchParams(location.search);
  const query = params.get('q');
  if (query) search.value = query.slice(0, 120);
  update();
}
