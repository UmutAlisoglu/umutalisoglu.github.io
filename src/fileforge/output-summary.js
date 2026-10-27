import { formatBytes } from './shared.js';

export function outputMetrics(files, blob) {
  const input = files.reduce((sum, file) => sum + file.size, 0);
  const change = input ? (blob.size - input) / input * 100 : null;
  return { input, output: blob.size, change, label: change == null ? 'New file created' : Math.abs(change) < .05 ? 'About the same size' : `${Math.abs(change).toFixed(1)}% ${change < 0 ? 'smaller' : 'larger'}` };
}

export function fillOutputSummary(element, files, blob, name) {
  const metrics = outputMetrics(files, blob);
  element.replaceChildren();
  const facts = [['Input for this step', metrics.input ? formatBytes(metrics.input) : 'Created in the tool'], ['Output', formatBytes(metrics.output)], ['Size change', metrics.label], ['Format', name.split('.').pop().toUpperCase()]];
  for (const [label, value] of facts) {
    const group = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
    term.textContent = label; detail.textContent = value; group.append(term, detail); element.append(group);
  }
  return metrics;
}
