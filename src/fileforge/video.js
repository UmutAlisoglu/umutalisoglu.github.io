import { FFmpeg } from '@ffmpeg/ffmpeg';
import workerURL from '@ffmpeg/ffmpeg/worker?worker&url';
import { resultName, videoBudget } from './shared.js';

export async function compressVideo(file, options, report, signal) {
  const engine = new FFmpeg();
  const logs = [];
  const stop = () => engine.terminate();
  signal.addEventListener('abort', stop, { once: true });
  const timeout = setTimeout(stop, 15 * 60_000);
  let phase = 0, attempt = 0, duration = 0;
  engine.on('log', ({ message }) => { logs.push(message); if (logs.length > 120) logs.shift(); });
  engine.on('progress', ({ time }) => {
    if (duration) report(`Encoding ${phase === 1 ? 'pass 1' : 'pass 2'}${attempt ? `, retry ${attempt}` : ''}… Keep this tab open.`, Math.min(96, 10 + (phase - 1) * 42 + Math.max(0, Math.min(1, time / 1_000_000 / duration)) * 42));
  });
  try {
    report('Loading the video engine (about 32 MB on first use)…', 2);
    await engine.load({ classWorkerURL: workerURL, coreURL: '/vendor/ffmpeg/ffmpeg-core.js', wasmURL: '/vendor/ffmpeg/ffmpeg-core.wasm' });
    signal.throwIfAborted();
    report('Reading your video locally…', 7);
    const suffix = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const input = `input.${suffix}`;
    await engine.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    // This core reports -1 even after a successful ffprobe. Validate its actual
    // duration output instead of treating that return value as an exit code.
    await engine.ffprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input, '-o', 'duration.txt']);
    try { duration = Number(new TextDecoder().decode(await engine.readFile('duration.txt'))); }
    catch { throw new Error('This video could not be read. Try another file or the desktop app.'); }
    const target = Number(options.target) * 1_000_000;
    const budget = videoBudget(target, duration, !options.removeAudio);
    let bitrate = budget.video;
    const height = Number(options.height);
    const filter = height ? `scale=-2:trunc(min(${height}\\,ih)/2)*2` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    for (attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      const common = ['-i', input, '-map', '0:v:0', '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(bitrate), '-pix_fmt', 'yuv420p', '-passlogfile', 'encode'];
      phase = 1;
      report('Encoding pass 1… Keep this tab open.', 10);
      const first = await engine.exec(['-y', ...common, '-pass', '1', '-an', '-f', 'null', '/dev/null']);
      signal.throwIfAborted();
      if (first !== 0) throw new Error('The browser could not encode this video. Try a smaller file or the desktop app.');
      phase = 2;
      const audio = options.removeAudio ? ['-an'] : ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', String(budget.audio)];
      const second = await engine.exec(['-y', ...common, '-pass', '2', ...audio, '-movflags', '+faststart', 'output.mp4']);
      signal.throwIfAborted();
      if (second !== 0) throw new Error('The browser could not finish this video. Try the desktop app.');
      const output = await engine.readFile('output.mp4');
      if (output.byteLength <= target) return { bytes: output, name: resultName(file.name, 'mp4'), type: 'video/mp4', detail: 'Full duration retained. Output size checked against your target.' };
      bitrate = Math.floor(bitrate * target / output.byteLength * 0.9);
      if (bitrate < 24_000) break;
    }
    throw new Error('That size target could not be met. Choose a larger size or remove audio.');
  } catch (error) {
    if (signal.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
    if (error.message?.includes('terminated')) throw new Error('Browser encoding stopped or reached the 15-minute limit. Try a shorter video or the desktop app.');
    throw error;
  } finally {
    clearTimeout(timeout); signal.removeEventListener('abort', stop); engine.terminate();
  }
}
