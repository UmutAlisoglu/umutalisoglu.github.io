import { conversionSources, conversionTargets, conversionFor } from './conversion-options.js';
import './conversion-picker.css';

for (const picker of document.querySelectorAll('[data-conversion-picker]')) {
  const form = picker.querySelector('form');
  const source = form.elements.from, target = form.elements.to;
  const params = new URLSearchParams(location.search);
  if (conversionSources.some(([id]) => id === params.get('from'))) source.value = params.get('from');

  function showFacts() {
    const route = conversionFor(source.value, target.value);
    form.querySelector('button').disabled = !route;
    picker.querySelector('[data-conversion-name]').textContent = route?.tool.name || 'Choose a supported conversion';
    picker.querySelector('[data-conversion-limit]').textContent = route?.facts[0] || '';
    picker.querySelector('[data-conversion-note]').textContent = route?.facts[1] || '';
  }
  function chooseSource(preferred = target.value) {
    const choices = conversionTargets(source.value);
    target.replaceChildren(...choices.map(([id, label]) => new Option(label, id)));
    if (choices.some(([id]) => id === preferred)) target.value = preferred;
    showFacts();
  }
  source.addEventListener('change', () => chooseSource());
  target.addEventListener('change', showFacts);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const route = conversionFor(source.value, target.value);
    if (route) location.assign(route.href);
  });
  chooseSource(params.get('to') || 'pdf');
  form.hidden = false;
  picker.querySelector('[data-conversion-fallback]').hidden = true;
}
