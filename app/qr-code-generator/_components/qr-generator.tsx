'use client';

import { useEffect, useMemo, useState } from 'react';
import { encodePayload, isPayloadEmpty } from '@/app/lib/qr/encode';
import { KIND_OPTIONS } from '@/app/lib/qr/style';
import { styleWarning as computeStyleWarning } from '@/app/lib/qr/style';
import {
  DEFAULT_QR_STYLE,
  LOGO_TYPES,
  MAX_LOGO_BYTES,
  type QrKind,
  type QrPayload,
  type QrStyle,
} from '@/app/lib/qr/types';
import { emptyPayload } from '@/app/lib/qr/validate';
import { QrTypeFields } from './qr-type-fields';
import { QrPreview } from './qr-preview';
import { QrCustomise } from './qr-customise';
import { QrDownload } from './qr-download';

export function QrGenerator() {
  const [kind, setKind] = useState<QrKind>('url');
  const [payload, setPayload] = useState<QrPayload>(() => emptyPayload('url'));
  const [style, setStyle] = useState<QrStyle>(DEFAULT_QR_STYLE);
  const [touched, setTouched] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const encoded = useMemo(() => encodePayload(payload), [payload]);
  const empty = isPayloadEmpty(payload);
  const fieldErrors = useMemo(() => {
    if (!encoded.ok) return encoded.field ? { [encoded.field]: encoded.message } : { _form: encoded.message };
    return {};
  }, [encoded]);

  const styleWarn = useMemo(() => computeStyleWarning(style), [style]);
  const hasLogo = !!logoDataUrl;
  const valid = encoded.ok && !styleWarn && !logoError;
  const encodedText = valid && encoded.ok ? encoded.text : null;

  useEffect(() => {
    if (!encoded.ok && !empty) {
      setRenderError(null);
      return;
    }
    if (styleWarn) {
      setRenderError(styleWarn);
      return;
    }
    setRenderError(null);
  }, [encoded, empty, styleWarn]);

  function selectKind(next: QrKind) {
    setKind(next);
    setPayload(emptyPayload(next));
    setTouched(false);
    setRenderError(null);
  }

  function onPayloadChange(next: QrPayload) {
    setPayload(next);
    if (!touched) setTouched(true);
  }

  async function onLogoPick(file: File | null) {
    setLogoError(null);
    if (!file) {
      setLogoDataUrl(null);
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
      setLogoDataUrl(dataUrl);
      setLogoName(file.name);
    } catch {
      setLogoError("Couldn't read that image. Try another file.");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_min(100%,20rem)] lg:items-start">
      <div className="rounded-xl2 border border-hair bg-surface p-5 shadow-soft sm:p-6">
        <p className="text-sm font-semibold text-ink">What should this QR do?</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="QR type">
          {KIND_OPTIONS.map((opt) => {
            const active = kind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                aria-pressed={active}
                onClick={() => selectKind(opt.kind)}
                className={`h-10 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
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

        <div className="mt-6">
          <QrTypeFields
            kind={kind}
            payload={payload}
            onChange={onPayloadChange}
            fieldErrors={fieldErrors}
            touched={touched || !empty}
          />
        </div>

        <QrCustomise
          style={style}
          onStyleChange={setStyle}
          hasLogo={hasLogo}
          logoName={logoName}
          logoError={logoError}
          onLogoPick={onLogoPick}
          styleWarning={styleWarn}
        />
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        <QrPreview
          encodedText={encodedText}
          style={style}
          hasLogo={hasLogo}
          logo={logoDataUrl ? { dataUrl: logoDataUrl } : null}
          empty={empty}
          renderError={renderError}
        />
        <QrDownload
          encodedText={encodedText}
          style={style}
          hasLogo={hasLogo}
          logo={logoDataUrl ? { dataUrl: logoDataUrl } : null}
          disabled={!valid}
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
