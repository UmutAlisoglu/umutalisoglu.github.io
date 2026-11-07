// Settings shared by the page and the card generator (kept small so the page loads fast).
export const DEFAULTS = {
  first: 'umut',
  last: 'alisoglu',
  dot: true,
  monogram: 'u.',
  rows: [
    { icon: 'mail', text: 'umut@alisoglu.com' },
    { icon: 'globe', text: 'alisoglu.com' },
    { icon: 'github', text: 'github.com/UmutAlisoglu' },
  ],
  tagline: 'SOFTWARE · TOOLS · HARDWARE',
  footer: 'FILEFORGE · REPODOCK · PCB ART STUDIO',
  backTitle: 'alisoglu.com',
  url: 'https://alisoglu.com',
  ripples: true,
};

export const ICON_LABELS = { mail: 'Email', globe: 'Website', github: 'GitHub', phone: 'Phone', code: 'Code', pin: 'Place' };

export const MASK_COLOURS = {
  blue: { label: 'Blue', mask: '#1a3887', cu: '#2b59bd', silk: '#f5f7fa', fab: 'Blue' },
  black: { label: 'Black', mask: '#121316', cu: '#26292e', silk: '#f2f2f2', fab: 'Black' },
  green: { label: 'Green', mask: '#0f5a2c', cu: '#1d7b41', silk: '#f5f7f4', fab: 'Green' },
  red: { label: 'Red', mask: '#8e1d1d', cu: '#b2302d', silk: '#f7f5f4', fab: 'Red' },
  white: { label: 'White', mask: '#eceef1', cu: '#dde1e6', silk: '#1a1c21', fab: 'White' },
};

export const FINISHES = {
  silver: { label: 'Silver', fab: 'HASL (lead free)', stops: ['#b3b8bf', '#f2f4f7', '#c2c7ce', '#eceef2', '#a9aeb5'] },
  gold: { label: 'Gold', fab: 'ENIG', stops: ['#cca14c', '#fadb8f', '#dbb05c', '#f7d685', '#c79947'] },
};
