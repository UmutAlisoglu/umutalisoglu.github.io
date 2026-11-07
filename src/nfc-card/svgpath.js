// Minimal SVG path flattener (M L H V C S Q A Z, absolute and relative) for small icons.
export function flattenSvgPath(d, segments = 10) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
  let i = 0;
  const contours = [];
  let cur = [];
  let x = 0, y = 0, sx = 0, sy = 0, cx2 = 0, cy2 = 0, cmd = '', prevCmd = '';
  const num = () => parseFloat(tokens[i++]);
  const flag = () => {
    // arc flags may be packed ("0016" = flags 0, 0 and the number 16)
    const t = tokens[i];
    if (t.length > 1 && (t[0] === '0' || t[0] === '1') && !t.startsWith('0.')) { tokens[i] = t.slice(1); return Number(t[0]); }
    i++;
    return Number(t);
  };
  const close = () => { if (cur.length >= 3) contours.push(cur); cur = []; };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': close(); x = ox + num(); y = oy + num(); sx = x; sy = y; cur.push([x, y]); break;
      case 'L': x = ox + num(); y = oy + num(); cur.push([x, y]); break;
      case 'H': x = ox + num(); cur.push([x, y]); break;
      case 'V': y = oy + num(); cur.push([x, y]); break;
      case 'C': case 'S': {
        let x1, y1;
        if (cmd.toUpperCase() === 'C') { x1 = ox + num(); y1 = oy + num(); }
        else if ('CScs'.includes(prevCmd)) { x1 = 2 * x - cx2; y1 = 2 * y - cy2; }
        else { x1 = x; y1 = y; }
        const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
        for (let k = 1; k <= segments; k++) {
          const t = k / segments, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, e = t ** 3;
          cur.push([a * x + b * x1 + c * x2 + e * ex, a * y + b * y1 + c * y2 + e * ey]);
        }
        cx2 = x2; cy2 = y2; x = ex; y = ey;
        break;
      }
      case 'Q': {
        const x1 = ox + num(), y1 = oy + num(), ex = ox + num(), ey = oy + num();
        for (let k = 1; k <= segments; k++) {
          const t = k / segments;
          cur.push([(1 - t) ** 2 * x + 2 * (1 - t) * t * x1 + t * t * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * y1 + t * t * ey]);
        }
        x = ex; y = ey;
        break;
      }
      case 'A': {
        let rx = Math.abs(num()), ry = Math.abs(num());
        const phi = num() * Math.PI / 180, large = flag(), sweep = flag();
        const ex = ox + num(), ey = oy + num();
        // endpoint to centre parameterisation (SVG spec F.6.5)
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const dx = (x - ex) / 2, dy = (y - ey) / 2;
        const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
        const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
        if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
        const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
        const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
        const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
        const ccx = cp * cxp - sp * cyp + (x + ex) / 2, ccy = sp * cxp + cp * cyp + (y + ey) / 2;
        const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
        let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
        if (!sweep && dt > 0) dt -= 2 * Math.PI;
        if (sweep && dt < 0) dt += 2 * Math.PI;
        const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 24)));
        for (let k = 1; k <= n; k++) {
          const t = t1 + dt * k / n;
          cur.push([ccx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, ccy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp]);
        }
        x = ex; y = ey;
        break;
      }
      case 'Z': x = sx; y = sy; close(); break;
      default: i++;
    }
    prevCmd = cmd;
  }
  close();
  return contours;
}
