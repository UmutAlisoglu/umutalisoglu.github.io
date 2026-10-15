const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function validateQuad(points, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height > 12_000_000) throw new Error('Choose an image between 2 pixels and 12 megapixels.');
  if (!Array.isArray(points) || points.length !== 4) throw new Error('Choose all four document corners.');
  const quad = points.map(point => ({ x: Number(point.x), y: Number(point.y) }));
  if (quad.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > width - 1 || point.y > height - 1)) throw new Error(`Keep the corners inside the ${width} × ${height} image.`);
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4], c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross <= 1e-5 || distance(a, b) < 1) throw new Error('Keep the four corners in clockwise order without crossing or folding the selection.');
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 2) throw new Error('The selected document is too narrow. Move the corners farther apart.');
  return quad;
}

// Unit square -> quadrilateral. Sampling this transform at each destination
// pixel is inverse mapping: every output pixel receives a source coordinate.
export function quadHomography(points) {
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-9) {
    const determinant = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(determinant) < 1e-9) throw new Error('These corners cannot form a stable document. Adjust the selection.');
    g = (dx3 * dy2 - dx2 * dy3) / determinant;
    h = (dx1 * dy3 - dx3 * dy1) / determinant;
  }
  const matrix = [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
  // A denominator crossing zero would project part of the page to infinity.
  if (matrix.some(value => !Number.isFinite(value)) || [1, 1 + g, 1 + h, 1 + g + h].some(value => value < 1e-7)) throw new Error('This angle is too extreme. Move the corners closer to the document edges.');
  return matrix;
}

export function projectPoint(matrix, u, v) {
  const denominator = matrix[6] * u + matrix[7] * v + 1;
  return { x: (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator, y: (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator };
}

export function invertHomography(m) {
  const [a,b,c,d,e,f,g,h,i] = m;
  const result = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const determinant = a * result[0] + b * result[3] + c * result[6];
  if (Math.abs(determinant) < 1e-9) throw new Error('The document selection is singular.');
  // projectPoint expects the final homography coefficient to be one.
  if (Math.abs(result[8]) < 1e-9) throw new Error('The document angle cannot be represented.');
  return result.map(value => value / result[8]);
}

export function rectifiedSize(points, maximumPixels = 3_000_000) {
  if (!Number.isFinite(maximumPixels) || maximumPixels < 4 || maximumPixels > 3_000_000) throw new Error('Invalid scanner output limit.');
  let width = Math.max(2, Math.round((distance(points[0], points[1]) + distance(points[3], points[2])) / 2) + 1);
  let height = Math.max(2, Math.round((distance(points[0], points[3]) + distance(points[1], points[2])) / 2) + 1);
  const scale = Math.min(1, Math.sqrt(maximumPixels / (width * height)), 3000 / Math.max(width, height));
  width = Math.max(2, Math.floor(width * scale)); height = Math.max(2, Math.floor(height * scale));
  return { width, height };
}

export function warpDocument(source, width, height, points, outputWidth, outputHeight, progress = () => {}) {
  const quad = validateQuad(points, width, height), matrix = quadHomography(quad);
  if (!(source instanceof Uint8ClampedArray) || source.length !== width * height * 4 || !Number.isInteger(outputWidth) || !Number.isInteger(outputHeight) || outputWidth < 2 || outputHeight < 2 || outputWidth * outputHeight > 3_000_000) throw new Error('The scanner image size is invalid.');
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y++) {
    const v = y / (outputHeight - 1);
    if (y % 64 === 0) progress(y / outputHeight);
    for (let x = 0; x < outputWidth; x++) {
      const point = projectPoint(matrix, x / (outputWidth - 1), v);
      const sx = Math.max(0, Math.min(width - 1, point.x)), sy = Math.max(0, Math.min(height - 1, point.y));
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0, target = (y * outputWidth + x) * 4;
      const offsets = [(y0 * width + x0) * 4, (y0 * width + x1) * 4, (y1 * width + x0) * 4, (y1 * width + x1) * 4];
      const weights = [(1-fx)*(1-fy), fx*(1-fy), (1-fx)*fy, fx*fy];
      for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let sample = 0; sample < 4; sample++) { const alpha = source[offsets[sample] + 3] / 255; value += (source[offsets[sample] + channel] * alpha + 255 * (1 - alpha)) * weights[sample]; }
        output[target + channel] = value;
      }
      output[target + 3] = 255;
    }
  }
  return output;
}

export function cleanPaper(pixels, width, height, mode) {
  if (!['original', 'color', 'gray', 'bw'].includes(mode)) throw new Error('Choose a supported paper treatment.');
  if (mode === 'original') return pixels;
  const gray = new Uint8Array(width * height), histogram = new Uint32Array(256);
  for (let index = 0; index < gray.length; index++) { const at = index * 4; const value = Math.round(.2126 * pixels[at] + .7152 * pixels[at + 1] + .0722 * pixels[at + 2]); gray[index] = value; histogram[value]++; }
  let count = 0, low = 0, high = 255;
  for (let value = 0; value < 256; value++) { count += histogram[value]; if (count >= gray.length * .02) { low = value; break; } }
  count = 0;
  for (let value = 255; value >= 0; value--) { count += histogram[value]; if (count >= gray.length * .04) { high = value; break; } }
  // Avoid inventing dramatic contrast in nearly blank or uniformly shaded pages.
  const black = Math.min(low, 95);
  if (mode !== 'bw') {
    // Estimate the paper colour from the brighter pixels in small tiles. A
    // bilinear field avoids seams and corrects gentle lighting gradients while
    // leaving dark printed strokes out of the background estimate.
    const tile = 48, columns = Math.ceil(width / tile), rows = Math.ceil(height / tile), background = new Float32Array(columns * rows * 3);
    const tileHistogram = new Uint32Array(256);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const left = column * tile, right = Math.min(width, left + tile), top = row * tile, bottom = Math.min(height, top + tile);
      tileHistogram.fill(0);
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) tileHistogram[gray[y * width + x]]++;
      let accumulated = 0, threshold = high;
      for (let value = 0; value < 256; value++) { accumulated += tileHistogram[value]; if (accumulated >= (right - left) * (bottom - top) * .8) { threshold = value; break; } }
      let samples = 0, red = 0, green = 0, blue = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (gray[y * width + x] >= threshold) { const at = (y * width + x) * 4; red += pixels[at]; green += pixels[at + 1]; blue += pixels[at + 2]; samples++; }
      const at = (row * columns + column) * 3; background[at] = red / samples; background[at + 1] = green / samples; background[at + 2] = blue / samples;
    }
    for (let index = 0; index < gray.length; index++) {
      const at = index * 4, x = index % width, y = Math.floor(index / width);
      const gx = Math.max(0, Math.min(columns - 1, x / tile - .5)), gy = Math.max(0, Math.min(rows - 1, y / tile - .5));
      const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(columns - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1), fx = gx - x0, fy = gy - y0;
      let luminance = 0;
      for (let channel = 0; channel < 3; channel++) {
        const paper = background[(y0 * columns + x0) * 3 + channel] * (1-fx) * (1-fy) + background[(y0 * columns + x1) * 3 + channel] * fx * (1-fy) + background[(y1 * columns + x0) * 3 + channel] * (1-fx) * fy + background[(y1 * columns + x1) * 3 + channel] * fx * fy;
        const value = Math.max(0, Math.min(255, (pixels[at + channel] - Math.min(black, 40)) * 255 / Math.max(40, paper - Math.min(black, 40))));
        if (mode === 'color') pixels[at + channel] = value;
        else luminance += value * [.2126, .7152, .0722][channel];
      }
      if (mode === 'gray') pixels[at] = pixels[at + 1] = pixels[at + 2] = luminance;
    }
    return pixels;
  }
  const stride = width + 1, integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) { let row = 0; for (let x = 0; x < width; x++) { row += gray[y * width + x]; integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row; } }
  const radius = Math.max(8, Math.min(60, Math.round(Math.max(width, height) * .02)));
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
      const mean = (integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left]) / ((right - left) * (bottom - top));
      const value = gray[y * width + x] < Math.max(60, mean * .88) ? 0 : 255, at = (y * width + x) * 4;
      pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
    }
  }
  return pixels;
}
