'use client';

import { useEffect, useMemo, useState } from 'react';
import { canonicalPayload, encodePayload, isPayloadEmpty } from '@/app/lib/qr/encode';
import {
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_QR_DESIGN,
  type LogoSize,
  type QrDesign,
  type QrExportOptions,
  clampExportSize,
} from '@/app/lib/qr/design';
import { createMatrixForDesign } from '@/app/lib/qr/matrix';
import { primaryBlockMessage, scanabilityReport } from '@/app/lib/qr/scanability';
import { KIND_OPTIONS } from '@/app/lib/qr/style';
import { LOGO_TYPES, MAX_LOGO_BYTES, type QrKind, type QrPayload } from '@/app/lib/qr/types';
import { emptyPayload } from '@/app/lib/qr/validate';
import { QrTypeFields } from './qr-type-fields';
import { QrPreview } from './qr-preview';
import { QrStudio } from './qr-studio';
import { QrDownload } from './qr-download';
import { TrackPanel, type TrackedState } from './track-panel';

const CHIP_SCROLL =
  'flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
const CHIP_BTN = 'touch-manipulation select-none';

export function QrGenerator() {
  const [kind, setKind] = useState<QrKind>('url');
  const [payload, setPayload] = useState<QrPayload>(() => emptyPayload('url'));
  const [design, setDesign] = useState<QrDesign>(DEFAULT_QR_DESIGN);
  const [exportOptions, setExportOptions] = useState<QrExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [touched, setTouched] = useState(false);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1024);
  // A saved tracked code: the QR encodes its short link for as long as the link it was saved for is unchanged.
  const [tracked, setTracked] = useState<TrackedState | null>(null);

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  const canonical = useMemo(() => canonicalPayload(payload), [payload]);
  const canonicalText = canonical.ok ? canonical.text : null;
  const activeTrackedUrl = tracked && canonicalText === tracked.forText ? tracked.shortUrl : null;
  const encoded = useMemo(() => encodePayload(payload, activeTrackedUrl), [payload, activeTrackedUrl]);
  const empty = isPayloadEmpty(payload);
  const fieldErrors = useMemo(() => {
    if (!encoded.ok) return encoded.field ? { [encoded.field]: encoded.message } : { _form: encoded.message };
    return {};
  }, [encoded]);

  const effectiveExportSize = useMemo(
    () => clampExportSize(exportOptions.pixelSize, viewportWidth),
    [exportOptions.pixelSize, viewportWidth],
  );

  const matrix = useMemo(() => {
    if (!encoded.ok || empty) return null;
    return createMatrixForDesign(encoded.text, design);
  }, [encoded, empty, design]);

  const scanReport = useMemo(() => {
    if (!matrix) {
      return { canRender: false, canExport: false, issues: [] };
    }
    return scanabilityReport(matrix, design, effectiveExportSize);
  }, [matrix, design, effectiveExportSize]);

  const validPayload = encoded.ok && !logoError;
  const blockMessage = validPayload && !empty ? primaryBlockMessage(scanReport) : null;
  const canRender = validPayload && scanReport.canRender;
  const canExport = validPayload && scanReport.canExport;
  const encodedText = canRender && encoded.ok ? encoded.text : null;

  function selectKind(next: QrKind) {
    setKind(next);
    setPayload(emptyPayload(next));
    setTouched(false);
    setTracked(null);
  }

  function onPayloadChange(next: QrPayload) {
    setPayload(next);
    if (!touched) setTouched(true);
  }

  async function onLogoPick(file: File | null) {
    setLogoError(null);
    if (!file) {
      setDesign((d) => ({ ...d, logo: undefined }));
      setLogoName(null);
      return;
    }
    if (!LOGO_TYPES.has(file.type)) {
      setLogoError('Use a PNG, JPG, or WEBP image.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`That image is too large. Keep it under ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const size: LogoSize = design.logo?.size ?? 'm';
      setDesign((d) => ({ ...d, logo: { dataUrl, size } }));
      setLogoName(file.name);
    } catch {
      setLogoError("Couldn't read that image. Try another file.");
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[1fr_min(100%,20rem)] lg:items-start lg:gap-8">
      <div className="min-w-0 rounded-xl2 border border-hair bg-surface p-5 shadow-soft sm:p-6 lg:col-start-1 lg:row-start-1">
        <p className="text-sm font-semibold text-ink">What should this QR do?</p>
        <div className={`mt-2 ${CHIP_SCROLL}`} role="group" aria-label="QR type">
          {KIND_OPTIONS.map((opt) => {
            const active = kind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                aria-pressed={active}
                onClick={() => selectKind(opt.kind)}
                className={`${CHIP_BTN} h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
                  active
                    ? 'border-activebg bg-activebg text-activetext'
                    : 'border-hair text-strong hover:bg-wash'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 sm:mt-6">
          <QrTypeFields
            kind={kind}
            payload={payload}
            onChange={onPayloadChange}
            fieldErrors={fieldErrors}
            touched={touched || !empty}
          />
          <TrackPanel
            payload={payload}
            canonicalText={empty ? null : canonicalText}
            design={design}
            tracked={tracked}
            onTracked={setTracked}
          />
        </div>
      </div>

      <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24">
        <QrPreview
          encodedText={encodedText}
          design={design}
          exportPixelSize={effectiveExportSize}
          empty={empty}
          renderError={blockMessage}
        />
        <QrDownload
          encodedText={encodedText}
          design={design}
          exportOptions={{ ...exportOptions, pixelSize: effectiveExportSize }}
          disabled={!canExport}
        />
      </div>

      <div className="min-w-0 rounded-xl2 border border-hair bg-surface p-5 shadow-soft sm:p-6 lg:col-start-1 lg:row-start-2">
        <QrStudio
          design={design}
          exportOptions={exportOptions}
          onDesignChange={setDesign}
          onExportChange={setExportOptions}
          logoName={logoName}
          logoError={logoError}
          onLogoPick={onLogoPick}
          scanReport={scanReport}
        />
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('read failed'));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
