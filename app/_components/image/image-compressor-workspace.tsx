'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageDropzone } from './image-dropzone';
import { ImageFileCard } from './image-file-card';
import { ImageResultCard } from './image-result-card';
import { ConversionProgress } from './conversion-progress';
import { OnDeviceNote } from './on-device-note';
import { convertImage, terminateConversionWorker } from '@/app/lib/image/worker-client';
import { downloadBlob } from '@/app/lib/image/export';
import {
  COMPRESS_LEVELS,
  compressAcceptString,
  compressedFilename,
  compressOutcome,
  compressOutputChoices,
  DEFAULT_COMPRESS_LEVEL,
  defaultCompressOutput,
  isCompressibleInput,
  maxSideChoicesFor,
  qualityForLevel,
  resizeForMaxSide,
  type CompressLevel,
} from '@/app/lib/image/compress';
import { extensionForFormatId, getFormat, labelForFormatId } from '@/app/lib/image/registry/capabilities';
import type { FormatId } from '@/app/lib/image/registry/format-registry';
import type { ConvertProgress, OutputFormat } from '@/app/lib/image/types';
import { DEFAULT_CONVERT_OPTIONS } from '@/app/lib/image/types';
import { detectImageFile, formatBytes } from '@/app/lib/image/validate';
import { probeImageDimensions } from '@/app/lib/image/probe';

type Phase = 'empty' | 'ready' | 'working' | 'done';

type Result = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  inputBytes: number;
  outputBytes: number;
  format: OutputFormat;
};

const INPUT_LABELS = ['JPG', 'PNG', 'WebP', 'HEIC', 'AVIF', 'BMP'];

/** ["a"] → "a"; ["a","b"] → "a or b"; ["a","b","c"] → "a, b or c". */
function joinOr(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function Pills<T extends string | number | null>({
  legend,
  options,
  value,
  onChange,
  disabled,
  hint,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`h-9 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60 ${
              value === opt.value
                ? 'bg-navy-900 text-white'
                : 'border border-hair bg-fieldbg text-strong hover:bg-wash'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}

export function ImageCompressorWorkspace() {
  const [phase, setPhase] = useState<Phase>('empty');
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<FormatId | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [level, setLevel] = useState<CompressLevel>(DEFAULT_COMPRESS_LEVEL);
  const [output, setOutput] = useState<OutputFormat>('jpeg');
  const [maxSide, setMaxSide] = useState<number | null>(null);
  const [progress, setProgress] = useState<ConvertProgress>({ stage: 'preparing' });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = useRef<string[]>([]);
  const track = (url: string) => {
    urls.current.push(url);
    return url;
  };
  const releaseAll = useCallback(() => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
  }, []);

  useEffect(
    () => () => {
      releaseAll();
      terminateConversionWorker();
    },
    [releaseAll],
  );

  function reset() {
    releaseAll();
    setPhase('empty');
    setFile(null);
    setFormat(null);
    setDimensions(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setLevel(DEFAULT_COMPRESS_LEVEL);
    setMaxSide(null);
  }

  /** Change a setting after a result: go back to "ready" so the next press re-runs. */
  function changed<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      if (phase === 'done') {
        setResult(null);
        setPhase('ready');
      }
    };
  }

  async function handleFile(next: File) {
    reset();
    const detected = await detectImageFile(next);
    if (!detected.ok) {
      setError(detected.message);
      return;
    }
    const fmt = detected.detected.format;
    if (!isCompressibleInput(fmt)) {
      setError(
        `${labelForFormatId(fmt)} files can't be compressed here yet. Try a JPG, PNG, WebP, HEIC or AVIF image.`,
      );
      return;
    }
    setFile(next);
    setFormat(fmt);
    setOutput(defaultCompressOutput(fmt));
    setPreviewUrl(track(URL.createObjectURL(next)));
    setPhase('ready');
    probeImageDimensions(next, fmt)
      .then(setDimensions)
      .catch(() => setDimensions(null));
  }

  async function compress() {
    if (!file || !format) return;
    setError(null);
    setPhase('working');
    setProgress({ stage: 'preparing' });

    const res = await convertImage(
      file,
      format,
      output,
      {
        ...DEFAULT_CONVERT_OPTIONS,
        quality: qualityForLevel(level),
        resize: resizeForMaxSide(maxSide, dimensions?.width ?? null, dimensions?.height ?? null),
      },
      setProgress,
    );

    if (!res.ok) {
      setError(res.message);
      setPhase('ready');
      return;
    }

    setResult({
      blob: res.blob,
      url: track(URL.createObjectURL(res.blob)),
      width: res.width,
      height: res.height,
      inputBytes: res.inputBytes,
      outputBytes: res.outputBytes,
      format: output,
    });
    setPhase('done');
  }

  const choices = format ? compressOutputChoices(format) : [];
  const currentChoice = choices.find((c) => c.format === output);
  const lossy = output === 'jpeg' || output === 'webp';
  const sideChoices = maxSideChoicesFor(dimensions?.width ?? null, dimensions?.height ?? null);
  const transparentInput = format ? getFormat(format).transparency : false;
  const outcome = result ? compressOutcome(result.inputBytes, result.outputBytes) : null;
  const downloadName = file && result ? compressedFilename(file.name, extensionForFormatId(result.format)) : '';
  // Only suggest settings this image actually offers.
  const smallerTips = [
    lossy && level !== 'smaller' ? '“Smaller file”' : null,
    output !== 'webp' && choices.some((c) => c.format === 'webp') ? 'saving as WebP' : null,
    sideChoices.length > 1 && maxSide !== sideChoices[sideChoices.length - 1] ? 'a smaller Max size' : null,
  ].filter((tip): tip is string => tip !== null);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <OnDeviceNote />

      {phase === 'empty' && (
        <>
          <ImageDropzone accept={compressAcceptString()} extensions={INPUT_LABELS} onFile={handleFile} />
          {error && (
            <div
              className="rounded-xl border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
            >
              {error}
            </div>
          )}
        </>
      )}

      {file && format && (phase === 'ready' || phase === 'done') && !(phase === 'done' && outcome?.kind === 'smaller') && (
        <>
          <ImageFileCard
            name={file.name}
            bytes={file.size}
            format={format}
            width={dimensions?.width}
            height={dimensions?.height}
            previewUrl={previewUrl}
            transparent={transparentInput}
            onRemove={reset}
          />

          <div className="space-y-5 rounded-xl border border-hair bg-surface p-4 sm:p-5">
            {lossy ? (
              <Pills
                legend="Compression"
                options={COMPRESS_LEVELS.map((l) => ({ value: l.id, label: l.label }))}
                value={level}
                onChange={changed(setLevel)}
                hint={COMPRESS_LEVELS.find((l) => l.id === level)?.hint}
              />
            ) : (
              <p className="text-sm text-muted">
                PNG is lossless, so there&apos;s no quality setting — pick a smaller <strong>Max size</strong>, or
                save as WebP for a much smaller file.
              </p>
            )}

            <Pills
              legend="Save as"
              options={choices.map((c) => ({ value: c.format, label: c.label }))}
              value={output}
              onChange={changed(setOutput)}
              hint={
                output === 'jpeg' && transparentInput
                  ? 'JPG has no transparency — see-through areas turn white.'
                  : currentChoice?.hint
              }
            />

            {sideChoices.length > 1 && (
              <Pills
                legend="Max size"
                options={sideChoices.map((s) => ({ value: s, label: s === null ? 'Original' : `${s} px` }))}
                value={maxSide}
                onChange={changed(setMaxSide)}
                hint="Longest side. Smaller dimensions shrink the file a lot — 1920 px is plenty for screens."
              />
            )}
          </div>

          {phase === 'done' && outcome?.kind === 'not-smaller' && (
            <div className="rounded-xl border border-yellow-300 bg-yellowx-100 px-4 py-3 text-sm text-strong" role="status">
              <p className="font-semibold text-ink">Your original is already the smaller file.</p>
              <p className="mt-1">
                Compressing came out {outcome.extraBytes > 0 ? `${formatBytes(outcome.extraBytes)} bigger` : 'the same size'},
                so keep the original.
                {smallerTips.length > 0 && ` To go smaller, try ${joinOr(smallerTips)}.`}
              </p>
            </div>
          )}

          {error && (
            <div
              className="rounded-xl border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={compress}
            className="h-12 w-full rounded-full bg-coral-500 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
          >
            {phase === 'done' ? 'Try again' : 'Compress image'}
          </button>
        </>
      )}

      {phase === 'working' && <ConversionProgress progress={progress} />}

      {phase === 'done' && result && outcome?.kind === 'smaller' && (
        <>
          <ImageResultCard
            filename={downloadName}
            outputFormat={result.format}
            inputBytes={result.inputBytes}
            outputBytes={result.outputBytes}
            previewUrl={result.url}
            width={result.width}
            height={result.height}
            transparent={result.format !== 'jpeg'}
            onDownload={() => downloadBlob(result.blob, downloadName)}
            onReset={reset}
            resetLabel="Compress another"
            footnote={null}
          />
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setPhase('ready');
            }}
            className="w-full text-center text-sm font-semibold text-coral-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Change settings
          </button>
        </>
      )}
    </div>
  );
}
