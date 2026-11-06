import { inspect, hashes, INSPECT_LIMIT } from './inspector.js';

self.onmessage = async ({ data }) => {
  const { id, file } = data;
  try {
    if (file.size > INSPECT_LIMIT) throw new Error('This file is larger than 100 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = inspect(bytes, file.name);
    result.hashes = await hashes(bytes);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
