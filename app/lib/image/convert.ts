export { convertImage, suggestedDownloadName, terminateConversionWorker } from './worker-client';

import type { ConvertOptions, ImageToolDef } from './types';
import { DEFAULT_CONVERT_OPTIONS } from './types';
import { convertImage, suggestedDownloadName as downloadName } from './worker-client';
import { detectImageFile } from './validate';
import type { OutputFormat } from './types';

export async function convertImageFile(
  file: File,
  tool: ImageToolDef,
  options: ConvertOptions = DEFAULT_CONVERT_OPTIONS,
) {
  const detected = await detectImageFile(file);
  if (!detected.ok) {
    return { ok: false as const, code: detected.code, message: detected.message };
  }
  if (detected.detected.format !== tool.from) {
    return {
      ok: false as const,
      code: 'format-mismatch' as const,
      message: `Expected ${tool.fromLabel}, got ${detected.detected.format}.`,
    };
  }
  return convertImage(file, tool.from, tool.to as OutputFormat, options);
}

export function suggestedDownloadNameForTool(inputName: string, tool: ImageToolDef): string {
  return downloadName(inputName, tool.to as OutputFormat);
}
