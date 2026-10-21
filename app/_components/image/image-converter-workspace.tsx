'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageDropzone } from './image-dropzone';
import { ImageFileCard } from './image-file-card';
import { ImageResultCard } from './image-result-card';
import { FormatSelectors } from './format-selectors';
import { ConversionOptions, hasValidResizeOptions } from './conversion-options';
import { ConversionProgress } from './conversion-progress';
import { convertImage, suggestedDownloadName, terminateConversionWorker } from '@/app/lib/image/worker-client';
import { downloadBlob } from '@/app/lib/image/export';
import { slugForPair } from '@/app/lib/image/routes';
import {
  canConvert,
  defaultOutputForInput,
  getEncodableFormats,
  labelForFormatId,
} from '@/app/lib/image/registry/capabilities';
import type { FormatId } from '@/app/lib/image/registry/format-registry';
import type { ConvertProgress, ImageToolDef, OutputFormat } from '@/app/lib/image/types';
import { DEFAULT_CONVERT_OPTIONS, DEFAULT_RESIZE_OPTIONS } from '@/app/lib/image/types';
import { allInputAcceptString, detectImageFile, labelForFormat } from '@/app/lib/image/validate';
import { probeImageDimensions } from '@/app/lib/image/probe';
import { getFormat } from '@/app/lib/image/registry/capabilities';

type Phase = 'empty' | 'ready' | 'converting' | 'done';

type Props = {
  tool: ImageToolDef;
};

function ensureOutputFormat(format: FormatId): OutputFormat {
  const encodable = getEncodableFormats();
  const match = encodable.find((f) => f.id === format);
  if (match) return match.id as OutputFormat;
  return 'png';
}

export function ImageConverterWorkspace({ tool }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState<FormatId>(tool.from);
  const [to, setTo] = useState<OutputFormat>(ensureOutputFormat(tool.to));
  const [phase, setPhase] = useState<Phase>('empty');
  const [file, setFile] = useState<File | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<FormatId | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultMeta, setResultMeta] = useState<{
    width: number;
    height: number;
    inputBytes: number;
    outputBytes: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState(DEFAULT_CONVERT_OPTIONS.quality);
  const [resize, setResize] = useState(DEFAULT_RESIZE_OPTIONS);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [progress, setProgress] = useState<ConvertProgress>({ stage: 'preparing' });

  const previewUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const revoke = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  const clearUrls = useCallback(() => {
    revoke(previewUrlRef.current);
    revoke(resultUrlRef.current);
    previewUrlRef.current = null;
    resultUrlRef.current = null;
    setPreviewUrl(null);
    setResultUrl(null);
  }, [revoke]);

  useEffect(() => {
    return () => {
      clearUrls();
      terminateConversionWorker();
    };
  }, [clearUrls]);

  const syncUrl = useCallback(
    (nextFrom: FormatId, nextTo: OutputFormat) => {
      const slug = slugForPair(nextFrom, nextTo);
      if (slug && slug !== tool.slug) {
        router.replace(`/${slug}`, { scroll: false });
      }
    },
    [router, tool.slug],
  );

  const handleFromChange = (nextFrom: FormatId) => {
    const nextTo = defaultOutputForInput(nextFrom, to) as OutputFormat;
    setFrom(nextFrom);
    setTo(nextTo);
    setError(null);
    if (phase === 'done') setPhase(file ? 'ready' : 'empty');
    syncUrl(nextFrom, nextTo);
  };

  const handleToChange = (nextTo: OutputFormat) => {
    let nextFrom = from;
    if (nextFrom === nextTo) {
      nextFrom = nextTo === 'jpeg' ? 'png' : 'jpeg';
      setFrom(nextFrom);
    }
    if (!canConvert(nextFrom, nextTo)) {
      setError('That conversion isn\'t supported yet. Try JPG, PNG, or WebP as output.');
      return;
    }
    setTo(nextTo);
    setError(null);
    if (phase === 'done') setPhase(file ? 'ready' : 'empty');
    syncUrl(nextFrom, nextTo);
  };

  const handleSwap = () => {
    if (!getEncodableFormats().some((f) => f.id === from)) return;
    const newFrom = to as FormatId;
    const newTo = ensureOutputFormat(from);
    if (!canConvert(newFrom, newTo)) return;
    setFrom(newFrom);
    setTo(newTo);
    setError(null);
    if (phase === 'done') setPhase(file ? 'ready' : 'empty');
    syncUrl(newFrom, newTo);
  };

  function reset() {
    clearUrls();
    setFile(null);
    setDetectedFormat(null);
    setDimensions(null);
    setResultBlob(null);
    setResultMeta(null);
    setError(null);
    setPhase('empty');
    setQuality(DEFAULT_CONVERT_OPTIONS.quality);
    setResize(DEFAULT_RESIZE_OPTIONS);
    setMoreOptionsOpen(false);
  }

  async function handleFile(next: File) {
    clearUrls();
    setResultBlob(null);
    setResultMeta(null);
    setError(null);

    const detected = await detectImageFile(next);
    if (!detected.ok) {
      setError(detected.message);
      setPhase('empty');
      return;
    }

    const url = URL.createObjectURL(next);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setFile(next);
    setDetectedFormat(detected.detected.format);
    setFrom(detected.detected.format);
    setTo(defaultOutputForInput(detected.detected.format, to) as OutputFormat);
    setPhase('ready');

    probeImageDimensions(next, detected.detected.format)
      .then(setDimensions)
      .catch(() => setDimensions(null));
  }

  async function convert() {
    if (!file || !detectedFormat) return;
    if (!canConvert(from, to)) {
      setError('That conversion isn\'t supported. Pick a different output format.');
      return;
    }
    setError(null);
    setPhase('converting');
    setProgress({ stage: 'preparing' });

    const result = await convertImage(
      file,
      from,
      to,
      { ...DEFAULT_CONVERT_OPTIONS, quality, resize },
      setProgress,
    );

    if (!result.ok) {
      setError(result.message);
      setPhase('ready');
      return;
    }

    revoke(resultUrlRef.current);
    const url = URL.createObjectURL(result.blob);
    resultUrlRef.current = url;
    setResultBlob(result.blob);
    setResultUrl(url);
    setResultMeta({
      width: result.width,
      height: result.height,
      inputBytes: result.inputBytes,
      outputBytes: result.outputBytes,
    });
    setPhase('done');
  }

  function handleDownload() {
    if (!resultBlob || !file) return;
    downloadBlob(resultBlob, suggestedDownloadName(file.name, to));
  }

  const resizeValid = hasValidResizeOptions(dimensions, resize);
  const formatMismatch =
    file && detectedFormat && detectedFormat !== from
      ? `This file is ${labelForFormat(detectedFormat)}. Change the input format or pick another file.`
      : null;
  const hasTransparency = detectedFormat ? getFormat(detectedFormat).transparency : false;
  const conversionSupported = canConvert(from, to);
  const downloadName = file ? suggestedDownloadName(file.name, to) : '';

  const decodableLabels = ['JPG', 'PNG', 'WebP', 'AVIF', 'HEIC', 'GIF', 'BMP', 'ICO', 'SVG'];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="text-center">
        <p className="font-display text-xl font-bold text-ink sm:text-2xl">Convert your image</p>
        <p className="mt-1 text-sm text-muted">
          {labelForFormatId(from)} → {labelForFormatId(to)}
        </p>
      </header>

      <FormatSelectors
        from={from}
        to={to}
        disabled={phase === 'converting'}
        onFromChange={handleFromChange}
        onToChange={handleToChange}
        onSwap={handleSwap}
      />

      <ConversionOptions
        open={moreOptionsOpen}
        onOpenChange={setMoreOptionsOpen}
        disabled={phase === 'converting'}
        outputFormat={to}
        sourceDimensions={dimensions}
        resize={resize}
        onResizeChange={setResize}
        quality={quality}
        onQualityChange={setQuality}
        hasTransparency={hasTransparency}
      />

      <div className="flex items-start gap-3 rounded-xl border border-teal-300 bg-tealx-100 p-4">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-tealx-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-ink">Processed on your device</p>
          <p className="text-sm text-strong">Your image isn&apos;t uploaded to KaamKit.</p>
        </div>
      </div>

      {phase === 'empty' && !file && (
        <ImageDropzone
          accept={allInputAcceptString()}
          extensions={decodableLabels}
          onFile={handleFile}
        />
      )}

      {file && phase !== 'converting' && phase !== 'done' && (
        <>
          <ImageFileCard
            name={file.name}
            bytes={file.size}
            format={detectedFormat ?? from}
            width={dimensions?.width}
            height={dimensions?.height}
            previewUrl={previewUrl}
            transparent={hasTransparency}
            onRemove={reset}
          />

          {(error || formatMismatch) && (
            <div
              className="rounded-xl border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
            >
              {formatMismatch ?? error}
            </div>
          )}

          {!formatMismatch && conversionSupported && (
            <button
              type="button"
              onClick={convert}
              disabled={!resizeValid}
              className="h-12 w-full rounded-full bg-coral-500 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Convert to {labelForFormatId(to)}
            </button>
          )}
        </>
      )}

      {phase === 'converting' && <ConversionProgress progress={progress} />}

      {phase === 'done' && resultUrl && resultMeta && file && (
        <ImageResultCard
          filename={downloadName}
          outputFormat={to}
          inputBytes={resultMeta.inputBytes}
          outputBytes={resultMeta.outputBytes}
          previewUrl={resultUrl}
          width={resultMeta.width}
          height={resultMeta.height}
          transparent={to === 'png'}
          onDownload={handleDownload}
          onReset={reset}
        />
      )}
    </div>
  );
}
