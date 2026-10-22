export function parseCSV(input) {
  const text = String(input).replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  function cell() { row.push(field); field = ''; closed = false; if (row.length > 100) throw new Error('Use at most 100 columns.'); }
  function line() { cell(); rows.push(row); row = []; if (rows.length > 10001) throw new Error('Use at most 10,000 data rows.'); }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error('A CSV quote is out of place. Quote the entire cell and double any quotes inside it.');
      quoted = true;
    } else if (char === ',') cell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; line(); }
    else { if (closed) throw new Error('Unexpected text after a closing CSV quote.'); field += char; }
  }
  if (quoted) throw new Error('This CSV has an unclosed quoted cell.');
  if (field || row.length || closed) line();
  if (!rows.length) throw new Error('Add a header row and some CSV data.');
  const headers = rows.shift();
  if (headers.some(header => !header.trim()) || new Set(headers).size !== headers.length) throw new Error('CSV headers must be non-empty and unique.');
  if (rows.some(row => row.length !== headers.length)) throw new Error('Each CSV row must have the same number of cells as the header.');
  return rows.map(row => Object.fromEntries(headers.map((header, i) => [header, row[i]])));
}
export function jsonToCSV(input, protect = true) {
  let rows;
  try { rows = JSON.parse(input); } catch { throw new Error('This is not valid JSON. Use an array of row objects.'); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Use a JSON array with 1–10,000 row objects.');
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  if (!headers.length || headers.length > 100 || headers.some(header => !header.trim())) throw new Error('Use 1–100 named columns.');
  const quote = value => {
    if (value != null && typeof value === 'object') throw new Error('Nested objects and arrays need to be flattened before CSV export.');
    let text = value == null ? '' : String(value);
    if (protect && typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [headers.map(quote).join(','), ...rows.map(row => headers.map(header => quote(row[header])).join(','))].join('\r\n');
}
