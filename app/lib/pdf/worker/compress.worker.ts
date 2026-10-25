/// <reference lib="webworker" />
import { compressPdfBytes, STANDARD_COMPRESSION, type CompressStats } from '../compress';
import { canvasReencoder } from '../canvas-reencoder';
import { toPdfToolError } from '../errors';

export type CompressRequest = { id: string; bytes: Uint8Array };

export type CompressResponse =
  | { id: string; type: 'progress'; done: number; total: number }
  | { id: string; type: 'done'; bytes: Uint8Array; stats: CompressStats }
  | { id: string; type: 'error'; code: string; message: string };

self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { id, bytes } = event.data;
  try {
    const result = await compressPdfBytes(bytes, canvasReencoder, STANDARD_COMPRESSION, (done, total) => {
      self.postMessage({ id, type: 'progress', done, total } satisfies CompressResponse);
    });
    self.postMessage({ id, type: 'done', bytes: result.bytes, stats: result.stats } satisfies CompressResponse, [result.bytes.buffer]);
  } catch (err) {
    const e = toPdfToolError(err);
    self.postMessage({ id, type: 'error', code: e.code, message: e.message } satisfies CompressResponse);
  }
};
