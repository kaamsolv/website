'use client';

import { useEffect, useState } from 'react';
import { ImageDropzone } from './image-dropzone';
import { OnDeviceNote } from './on-device-note';
import { BatchPanel, QuotaNote, downloadBatchZip, useZipping } from './batch-panel';
import { useImageBatch, type ConvertOutcome } from './use-image-batch';
import { Chips, Segmented } from '../choice';
import { convertImage } from '@/app/lib/image/worker-client';
import { downloadBlob } from '@/app/lib/image/export';
import { trackToolError, trackToolSuccess } from '@/app/lib/analytics';
import {
  COMPRESS_LEVELS,
  compressAcceptString,
  compressedFilename,
  compressOutcome,
  compressOutputChoices,
  DEFAULT_COMPRESS_LEVEL,
  defaultCompressOutput,
  effectiveCompressOutput,
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
import { detectImageFile } from '@/app/lib/image/validate';
import { probeImageDimensions } from '@/app/lib/image/probe';
import { BATCH_MAX_FILES, rejectionMessage } from '@/app/lib/image/batch';
import { readDailyQuota, type DailyQuota } from '@/app/lib/image/quota-client';

const INPUT_LABELS = ['JPG', 'PNG', 'WebP', 'HEIC', 'AVIF', 'BMP'];

/** Everything a queued file is compressed with. Captured when the file is added. */
type CompressSettings = {
  level: CompressLevel;
  output: OutputFormat;
  maxSide: number | null;
};

/** A labelled single choice with an optional hint line. */
function Pills<T extends string | number | null>({
  legend,
  options,
  value,
  onChange,
  hint,
  segmented = false,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  hint?: string;
  /** Joined bar for a mode switch; chips for picking a value. */
  segmented?: boolean;
}) {
  const Control = segmented ? Segmented : Chips;
  return (
    <div>
      <Control legend={legend} options={options} value={value} onChange={onChange} />
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

async function compressFile(
  file: File,
  s: CompressSettings,
  onProgress: (p: ConvertProgress) => void,
): Promise<ConvertOutcome> {
  const detected = await detectImageFile(file);
  if (!detected.ok) return { ok: false, message: detected.message };
  const fmt = detected.detected.format;
  if (!isCompressibleInput(fmt)) {
    return {
      ok: false,
      message: `${labelForFormatId(fmt)} files can't be compressed here yet. Try a JPG, PNG, WebP, HEIC or AVIF image.`,
    };
  }

  const out = effectiveCompressOutput(fmt, s.output);
  const dims = await probeImageDimensions(file, fmt).catch(() => null);
  const res = await convertImage(
    file,
    fmt,
    out,
    {
      ...DEFAULT_CONVERT_OPTIONS,
      quality: qualityForLevel(s.level),
      resize: resizeForMaxSide(s.maxSide, dims?.width ?? null, dims?.height ?? null),
    },
    onProgress,
  );
  if (!res.ok) {
    trackToolError('compress_failed', 'converter');
    return { ok: false, message: res.message };
  }
  trackToolSuccess('converter', true);

  // Never offer a bigger file: a result that isn't smaller is kept out of the download.
  const outcome = compressOutcome(res.inputBytes, res.outputBytes);
  return {
    ok: true,
    result: {
      blob: res.blob,
      name: compressedFilename(file.name, extensionForFormatId(out)),
      width: res.width,
      height: res.height,
      beforeBytes: res.inputBytes,
      afterBytes: res.outputBytes,
      keepOriginal: outcome.kind !== 'smaller',
    },
  };
}

export function ImageCompressorWorkspace({ shareUrl }: { shareUrl: string }) {
  const [level, setLevel] = useState<CompressLevel>(DEFAULT_COMPRESS_LEVEL);
  const [output, setOutput] = useState<OutputFormat>('jpeg');
  const [maxSide, setMaxSide] = useState<number | null>(null);
  /** Input format of the first file. It sets which "Save as" choices show. */
  const [formatHint, setFormatHint] = useState<FormatId | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState<DailyQuota | null>(null);

  const batch = useImageBatch<CompressSettings>(compressFile);
  const zip = useZipping();
  const current = (): CompressSettings => ({ level, output, maxSide });
  const firstFile = batch.items[0]?.file ?? null;

  useEffect(() => {
    void readDailyQuota().then(setQuota);
  }, []);

  useEffect(() => {
    if (!batch.working) void readDailyQuota().then(setQuota);
  }, [batch.working]);

  // Max size choices come from the first file's shape.
  useEffect(() => {
    if (!firstFile || !formatHint) {
      setDimensions(null);
      return;
    }
    let live = true;
    probeImageDimensions(firstFile, formatHint)
      .then((d) => live && setDimensions(d))
      .catch(() => live && setDimensions(null));
    return () => {
      live = false;
    };
  }, [firstFile, formatHint]);

  const changed = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    batch.markStale();
  };

  async function handleFiles(files: File[]) {
    const messages: string[] = [];
    const accepted: File[] = [];
    const startEmpty = batch.items.length === 0;
    let activeOutput = output;
    let hint = formatHint;

    for (const file of files) {
      const detected = await detectImageFile(file);
      if (!detected.ok) {
        messages.push(detected.message);
        continue;
      }
      const fmt = detected.detected.format;
      if (!isCompressibleInput(fmt)) {
        messages.push(
          `${labelForFormatId(fmt)} files can't be compressed here yet. Try a JPG, PNG, WebP, HEIC or AVIF image.`,
        );
        continue;
      }
      if (startEmpty && accepted.length === 0) {
        hint = fmt;
        activeOutput = defaultCompressOutput(fmt);
      }
      accepted.push(file);
    }

    if (accepted.length > 0) {
      if (hint !== formatHint) setFormatHint(hint);
      if (activeOutput !== output) setOutput(activeOutput);
      const rejected = batch.add(accepted, { level, output: activeOutput, maxSide });
      messages.push(...rejected.map(rejectionMessage));
    }
    setNotice(messages.length ? messages.join(' ') : null);
  }

  const choices = formatHint ? compressOutputChoices(formatHint) : [];
  const lossy = output === 'jpeg' || output === 'webp';
  const sideChoices = maxSideChoicesFor(dimensions?.width ?? null, dimensions?.height ?? null);
  const transparentInput = formatHint ? getFormat(formatHint).transparency : false;
  const exhausted = batch.items.some((i) => i.status === 'blocked');

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <OnDeviceNote />

      {formatHint && (
        <div className="space-y-5 rounded-xl border border-hair bg-surface p-4 sm:p-5">
          {lossy ? (
            <Pills
              segmented
              legend="Compression"
              options={COMPRESS_LEVELS.map((l) => ({ value: l.id, label: l.label }))}
              value={level}
              onChange={changed(setLevel)}
              hint={COMPRESS_LEVELS.find((l) => l.id === level)?.hint}
            />
          ) : (
            <p className="text-sm text-muted">
              PNG is lossless, so there&apos;s no quality setting. Pick a smaller <strong>Max size</strong>, or save
              as WebP for a much smaller file.
            </p>
          )}

          <Pills
            legend="Save as"
            options={choices.map((c) => ({ value: c.format, label: c.label }))}
            value={output}
            onChange={changed(setOutput)}
            hint={
              output === 'jpeg' && transparentInput
                ? 'JPG has no transparency. See-through areas turn white.'
                : choices.find((c) => c.format === output)?.hint
            }
          />

          {sideChoices.length > 1 && (
            <Pills
              legend="Max size"
              options={sideChoices.map((s) => ({ value: s, label: s === null ? 'Original' : `${s} px` }))}
              value={maxSide}
              onChange={changed(setMaxSide)}
              hint="Longest side. Smaller dimensions shrink the file a lot. 1920 px is plenty for screens."
            />
          )}
        </div>
      )}

      <QuotaNote quota={quota} exhausted={exhausted} />

      <ImageDropzone
        accept={compressAcceptString()}
        extensions={INPUT_LABELS}
        multiple
        onFiles={handleFiles}
        onFile={(file) => void handleFiles([file])}
        title={batch.items.length > 0 ? 'Add more images' : 'Drop your images here'}
        detail={`JPG, PNG, WebP, HEIC, AVIF · up to ${BATCH_MAX_FILES} at a time, 25 MB each`}
      />

      {notice && (
        <p className="rounded-xl border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700" role="alert">
          {notice}
        </p>
      )}

      {batch.items.length > 0 && (
        <BatchPanel
          items={batch.items}
          summary={batch.summary}
          working={batch.working}
          staleCount={batch.staleCount}
          zipping={zip.zipping}
          againLabel="Compress again"
          share={{ name: 'Compress an image', url: shareUrl }}
          onConvertAgain={() => batch.convertAll(current())}
          onRetry={(id) => batch.retry(id, current())}
          onRemove={batch.remove}
          onClear={() => {
            if (batch.working) return;
            batch.clear();
            setFormatHint(null);
            setNotice(null);
          }}
          onDownload={(item) => item.result && downloadBlob(item.result.blob, item.result.name)}
          onDownloadAll={() => void zip.run(() => downloadBatchZip(batch.items, 'kaamsolv-compressed-images.zip'))}
        />
      )}
    </div>
  );
}
