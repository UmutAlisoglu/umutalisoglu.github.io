const canvasBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Sample generation is unavailable in this browser.')), 'image/png'));
export async function createSample(kind) {
  if (kind === 'photo') {
    const response = await fetch('/assets/demos/headphones.png');
    if (!response.ok) throw new Error('The sample photo could not load. Try again online or choose your own photo.');
    return { files: [new File([await response.blob()], 'studio-headphones.png', { type: 'image/png' })], tool: 'background' };
  }
  if (kind === 'text') {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 520;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#292332'; ctx.font = 'bold 54px Arial'; ctx.fillText('A LITTLE LESS FILE FRUSTRATION.', 65, 105);
    ctx.font = '34px Arial';
    ['Turn screenshots into editable text.', 'Make a PDF. Crop a photo. Keep moving.', 'Your files stay on your device.', 'Made by Umut. Built to be useful.'].forEach((line, index) => ctx.fillText(line, 65, 185 + index * 70));
    const blob = await canvasBlob(canvas); canvas.width = 1; canvas.height = 1;
    return { files: [new File([blob], 'fileforge-text-sample.png', { type: 'image/png' })], tool: 'text' };
  }
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const themes = [[.43, .24, .78], [.20, .52, .40], [.20, .40, .62]];
  ['THE SMALL THINGS, SORTED.', 'EVERY PAGE IN ITS PLACE.', 'READY FOR YOUR NEXT STEP.'].forEach((title, index) => {
    const page = doc.addPage([595, 842]), color = rgb(...themes[index]);
    page.drawRectangle({ x: 0, y: 570, width: 595, height: 272, color });
    page.drawText('FILEFORGE / SAMPLE DOCUMENT', { x: 48, y: 770, font, size: 12, color: rgb(1, 1, 1) });
    const words = title.split(', '); page.drawText(words[0], { x: 48, y: 655, font: bold, size: 25, color: rgb(1, 1, 1) });
    if (words[1]) page.drawText(words[1], { x: 48, y: 615, font: bold, size: 25, color: rgb(1, 1, 1) });
    ['This is an original three-page sample.', 'Try moving this page, rotating it or keeping only one.', 'Your original document stays unchanged.'].forEach((line, i) => page.drawText(line, { x: 48, y: 500 - i * 33, font, size: 14, color: rgb(.32, .29, .37) }));
    page.drawText(`Sample page ${index + 1} of 3`, { x: 48, y: 48, font, size: 11, color });
  });
  return { files: [new File([await doc.save()], 'fileforge-three-pages.pdf', { type: 'application/pdf' })], tool: 'organize' };
}
