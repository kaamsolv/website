'use client';

import { useEffect, useState } from 'react';
import { ImageDropzone } from './image-dropzone';
import { FormatSelectors } from './format-selectors';
import { ConversionOptions, hasValidResizeOptions } from './conversion-options';
import { BatchPanel, QuotaNote, downloadBatchZip, useZipping } from './batch-panel';
import { useImageBatch, type ConvertOutcome } from './use-image-batch';
import { convertImage, suggestedDownloadName } from '@/app/lib/image/worker-client';
import { downloadBlob } from '@/app/lib/image/export';
import { trackToolError, trackToolSuccess } from '@/app/lib/analytics';
import { slugForPair } from '@/app/lib/image/routes';
import {
  canConvert,
  defaultOutputForInput,
  getEncodableFormats,
  getFormat,
  labelForFormatId,
} from '@/app/lib/image/registry/capabilities';
import type { FormatId } from '@/app/lib/image/registry/format-registry';
import type { ConvertProgress, ImageToolDef, OutputFormat, ResizeOptions } from '@/app/lib/image/types';
import { DEFAULT_CONVERT_OPTIONS, DEFAULT_RESIZE_OPTIONS } from '@/app/lib/image/types';
import { allInputAcceptString, detectImageFile, labelForFormat } from '@/app/lib/image/validate';
import { probeImageDimensions } from '@/app/lib/image/probe';
import { BATCH_MAX_FILES, rejectionMessage } from '@/app/lib/image/batch';
import { readDailyQuota, type DailyQuota } from '@/app/lib/image/quota-client';

type Props = {
  tool: ImageToolDef;
  /** Title and blurb from the page, shown on the left of the controls on wide screens. */
  intro: React.ReactNode;
  /** Address of this tool page, for the share row under the results. */
  shareUrl: string;
};

/** Everything a queued file is converted with. Captured when the file is added. */
type ConverterSettings = {
  from: FormatId;
  to: OutputFormat;
  quality: number;
  resize: ResizeOptions;
};

function ensureOutputFormat(format: FormatId): OutputFormat {
  const encodable = getEncodableFormats();
  const match = encodable.find((f) => f.id === format);
  if (match) return match.id as OutputFormat;
  return 'png';
}

async function convertFile(
  file: File,
  s: ConverterSettings,
  onProgress: (p: ConvertProgress) => void,
): Promise<ConvertOutcome> {
  const res = await convertImage(
    file,
    s.from,
    s.to,
    { ...DEFAULT_CONVERT_OPTIONS, quality: s.quality, resize: s.resize },
    onProgress,
  );
  if (!res.ok) {
    trackToolError('convert_failed', 'converter');
    return { ok: false, message: res.message };
  }
  trackToolSuccess('converter', true);
  return {
    ok: true,
    result: {
      blob: res.blob,
      name: suggestedDownloadName(file.name, s.to),
      width: res.width,
      height: res.height,
      beforeBytes: res.inputBytes,
      afterBytes: res.outputBytes,
      keepOriginal: false,
    },
  };
}

// Each pair URL is its own page; a router navigation would remount the
// workspace and drop the uploads. replaceState only changes the address
// (Next.js keeps its router in step), so a refresh or a shared link opens
// the right converter.
function syncUrl(nextFrom: FormatId, nextTo: OutputFormat) {
  const slug = slugForPair(nextFrom, nextTo);
  if (slug && window.location.pathname !== `/${slug}`) {
    window.history.replaceState(null, '', `/${slug}`);
  }
}

const ACCEPTED_LABELS = ['JPG', 'PNG', 'WebP', 'AVIF', 'HEIC', 'GIF', 'BMP', 'ICO', 'SVG'];

export function ImageConverterWorkspace({ tool, intro, shareUrl }: Props) {
  const [from, setFrom] = useState<FormatId>(tool.from);
  const [to, setTo] = useState<OutputFormat>(ensureOutputFormat(tool.to));
  const [quality, setQuality] = useState(DEFAULT_CONVERT_OPTIONS.quality);
  const [resize, setResize] = useState(DEFAULT_RESIZE_OPTIONS);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState<DailyQuota | null>(null);

  const batch = useImageBatch<ConverterSettings>(convertFile);
  const zip = useZipping();
  const current = (): ConverterSettings => ({ from, to, quality, resize });
  const firstFile = batch.items[0]?.file ?? null;

  useEffect(() => {
    void readDailyQuota().then(setQuota);
  }, []);

  // The free count moves with every file, so re-read it once the batch settles.
  useEffect(() => {
    if (!batch.working) void readDailyQuota().then(setQuota);
  }, [batch.working]);

  // Resize limits are checked against the first file's size.
  useEffect(() => {
    if (!firstFile) {
      setDimensions(null);
      return;
    }
    let live = true;
    probeImageDimensions(firstFile, from)
      .then((d) => live && setDimensions(d))
      .catch(() => live && setDimensions(null));
    return () => {
      live = false;
    };
  }, [firstFile, from]);

  const changePair = (nextFrom: FormatId, nextTo: OutputFormat) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setNotice(null);
    syncUrl(nextFrom, nextTo);
    batch.markStale();
  };

  const handleFromChange = (nextFrom: FormatId) => {
    changePair(nextFrom, defaultOutputForInput(nextFrom, to) as OutputFormat);
  };

  const handleToChange = (nextTo: OutputFormat) => {
    let nextFrom = from;
    if (nextFrom === nextTo) nextFrom = nextTo === 'jpeg' ? 'png' : 'jpeg';
    if (!canConvert(nextFrom, nextTo)) {
      setNotice("That conversion isn't supported yet. Try JPG, PNG, or WebP as output.");
      return;
    }
    changePair(nextFrom, nextTo);
  };

  const handleSwap = () => {
    if (!getEncodableFormats().some((f) => f.id === from)) return;
    const newFrom = to as FormatId;
    const newTo = ensureOutputFormat(from);
    if (!canConvert(newFrom, newTo)) return;
    changePair(newFrom, newTo);
  };

  /** Drop or pick files. The first file can set the input format; after that, every file must match it. */
  async function handleFiles(files: File[]) {
    if (!hasValidResizeOptions(dimensions, resize)) {
      setNotice("That size doesn't fit this image. Change it in More options, then add the files again.");
      return;
    }
    const messages: string[] = [];
    const accepted: File[] = [];
    const startEmpty = batch.items.length === 0;
    let activeFrom = from;
    let activeTo = to;
    let adopted = false;

    for (const file of files) {
      const detected = await detectImageFile(file);
      if (!detected.ok) {
        messages.push(detected.message);
        continue;
      }
      const fmt = detected.detected.format;
      if (startEmpty && accepted.length === 0 && fmt !== activeFrom) {
        activeFrom = fmt;
        activeTo = defaultOutputForInput(fmt, activeTo) as OutputFormat;
        adopted = true;
      }
      if (fmt !== activeFrom) {
        messages.push(
          `${file.name} is ${labelForFormat(fmt)}. This page converts ${labelForFormatId(activeFrom)} files, so it was left out.`,
        );
        continue;
      }
      accepted.push(file);
    }

    if (adopted) {
      setFrom(activeFrom);
      setTo(activeTo);
      syncUrl(activeFrom, activeTo);
    }
    if (accepted.length > 0) {
      const rejected = batch.add(accepted, { from: activeFrom, to: activeTo, quality, resize });
      messages.push(...rejected.map(rejectionMessage));
    }
    setNotice(messages.length ? messages.join(' ') : null);
  }

  const conversionSupported = canConvert(from, to);
  const hasTransparency = getFormat(from).transparency;
  const exhausted = batch.items.some((i) => i.status === 'blocked');
  const downloadRule = `${ACCEPTED_LABELS.slice(0, 5).join(', ')} · up to ${BATCH_MAX_FILES} at a time, 25 MB each`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:items-start md:gap-6">
        <div>{intro}</div>
        <div className="mt-4 space-y-3 rounded-xl2 border border-hair bg-surface p-3 md:mt-0">
          <FormatSelectors
            from={from}
            to={to}
            disabled={batch.working}
            onFromChange={handleFromChange}
            onToChange={handleToChange}
            onSwap={handleSwap}
          />

          <ConversionOptions
            open={moreOptionsOpen}
            onOpenChange={setMoreOptionsOpen}
            disabled={batch.working}
            outputFormat={to}
            sourceDimensions={dimensions}
            resize={resize}
            onResizeChange={(next) => {
              setResize(next);
              batch.markStale();
            }}
            quality={quality}
            onQualityChange={(next) => {
              setQuality(next);
              batch.markStale();
            }}
            hasTransparency={hasTransparency}
          />
        </div>
      </div>

      {conversionSupported && (
        <>
          <QuotaNote quota={quota} exhausted={exhausted} />

          <ImageDropzone
            accept={allInputAcceptString()}
            extensions={ACCEPTED_LABELS}
            multiple
            onFiles={handleFiles}
            onFile={(file) => void handleFiles([file])}
            title={batch.items.length > 0 ? 'Add more images' : 'Drop your images here'}
            detail={downloadRule}
          />

          {notice && (
            <p
              className="rounded-xl border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
              role="alert"
            >
              {notice}
            </p>
          )}
        </>
      )}

      {batch.items.length > 0 && (
        <BatchPanel
          items={batch.items}
          summary={batch.summary}
          working={batch.working}
          staleCount={batch.staleCount}
          zipping={zip.zipping}
          againLabel={`Convert again to ${labelForFormatId(to)}`}
          share={{ name: tool.name, url: shareUrl }}
          onConvertAgain={() => batch.convertAll(current())}
          onRetry={(id) => batch.retry(id, current())}
          onRemove={batch.remove}
          onClear={batch.clear}
          onDownload={(item) => item.result && downloadBlob(item.result.blob, item.result.name)}
          onDownloadAll={() =>
            void zip.run(() => downloadBatchZip(batch.items, `kaamsolv-${to}-images.zip`))
          }
        />
      )}
    </div>
  );
}
