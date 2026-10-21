/// <reference lib="webworker" />
import { runConversionPipeline } from '../pipeline';
import { runTargetPipeline, type TargetJob } from '../target-pipeline';
import type { ConvertOptions } from '../types';
import type { FormatId } from '../registry/format-registry';

export type WorkerRequest =
  | {
      kind?: 'convert';
      id: string;
      buffer: ArrayBuffer;
      from: FormatId;
      to: FormatId;
      options: ConvertOptions;
    }
  | { kind: 'target'; id: string; buffer: ArrayBuffer; from: FormatId; job: TargetJob };

export type WorkerResponse =
  | { id: string; type: 'progress'; stage: string; percent?: number }
  | {
      id: string;
      type: 'done';
      blob: Blob;
      width: number;
      height: number;
      outputMime: string;
      outputExtension: string;
    }
  | {
      id: string;
      type: 'target-done';
      blob: Blob;
      width: number;
      height: number;
      quality: number;
      outcome: 'fits' | 'too-big' | 'too-small';
    }
  | { id: string; type: 'error'; code: string; message: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  if (req.kind === 'target') {
    const result = await runTargetPipeline(req.buffer, req.from, req.job, (stage) => {
      self.postMessage({ id: req.id, type: 'progress', stage });
    });
    if (!result.ok) {
      self.postMessage({ id: req.id, type: 'error', code: result.code, message: result.message });
      return;
    }
    self.postMessage({
      id: req.id,
      type: 'target-done',
      blob: result.blob,
      width: result.width,
      height: result.height,
      quality: result.quality,
      outcome: result.outcome,
    });
    return;
  }

  const { id, buffer, from, to, options } = req;
  const result = await runConversionPipeline(buffer, from, to, options, (p) => {
    self.postMessage({ id, type: 'progress', stage: p.stage, percent: p.percent });
  });

  if (!result.ok) {
    self.postMessage({ id, type: 'error', code: result.code, message: result.message });
    return;
  }

  self.postMessage({
    id,
    type: 'done',
    blob: result.blob,
    width: result.width,
    height: result.height,
    outputMime: result.outputMime,
    outputExtension: result.outputExtension,
  });
};
