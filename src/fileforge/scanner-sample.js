import { quadHomography, invertHomography, projectPoint } from './scanner-math.js';

// An original, generated "photo" of a page lying at an angle. Shared by the
// document scanner's sample button and the workspace's document Quick Job demo.
export const SAMPLE_NAME = 'angled-page-sample.png';
export const SAMPLE_SIZE = Object.freeze({ width: 1150, height: 1100 });
export const SAMPLE_QUAD = Object.freeze([{ x: 250, y: 60 }, { x: 900, y: 130 }, { x: 1040, y: 1050 }, { x: 110, y: 970 }].map(Object.freeze));

const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Sample generation is unavailable in this browser.')), 'image/png'));

/** Draws the sample. Returns { blob, quad }, or null when isStale() turns true. */
export async function drawAngledSample(isStale = () => false) {
  const paper = document.createElement('canvas'), photo = document.createElement('canvas');
  try {
    paper.width = 850; paper.height = 1000; const context = paper.getContext('2d');
    context.fillStyle = '#f9f6ea'; context.fillRect(0, 0, 850, 1000);
    context.fillStyle = '#6840bd'; context.fillRect(65, 70, 72, 9); context.font = 'bold 19px Arial'; context.fillText('FILEFORGE / ORIGINAL SAMPLE', 65, 120);
    context.fillStyle = '#292631'; context.font = 'bold 44px Arial'; context.fillText('A GOOD IDEA,', 65, 220); context.fillText('ON PAPER.', 65, 275);
    context.font = '28px Arial';
    ['Four corners change the perspective.', 'A simple photo becomes a clearer page.', 'Your files stay on your device.', '', 'Make room for better ideas.', 'Then take your next step.'].forEach((line, index) => context.fillText(line, 65, 370 + index * 65));
    context.fillStyle = '#6840bd'; context.fillRect(65, 840, 720, 3); context.font = '19px Arial'; context.fillText('Generated locally. No real personal document.', 65, 900);
    const paperPixels = context.getImageData(0, 0, 850, 1000).data;
    photo.width = SAMPLE_SIZE.width; photo.height = SAMPLE_SIZE.height; const destination = photo.getContext('2d');
    destination.fillStyle = '#56636a'; destination.fillRect(0, 0, photo.width, photo.height);
    const quad = SAMPLE_QUAD.map(point => ({ ...point }));
    const inverse = invertHomography(quadHomography(quad)), image = destination.getImageData(0, 0, photo.width, photo.height);
    for (let y = 60; y <= 1050; y++) {
      if (y % 128 === 0) { await new Promise(resolve => requestAnimationFrame(resolve)); if (isStale()) return null; }
      for (let x = 110; x <= 1040; x++) {
        const uv = projectPoint(inverse, x, y);
        if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) continue;
        const px = Math.round(uv.x * 849), py = Math.round(uv.y * 999), source = (py * 850 + px) * 4, target = (y * photo.width + x) * 4;
        const shadow = .87 + .13 * uv.x;
        for (let channel = 0; channel < 3; channel++) image.data[target + channel] = paperPixels[source + channel] * shadow;
        image.data[target + 3] = 255;
      }
    }
    destination.putImageData(image, 0, 0);
    return { blob: await toBlob(photo), quad };
  } finally { paper.width = paper.height = photo.width = photo.height = 1; }
}
