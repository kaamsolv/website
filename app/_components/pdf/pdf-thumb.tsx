'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '@/app/lib/pdf/pdfjs';

/** Two pages draw at a time, so a 300-page grid doesn't freeze a phone. */
const queue: Array<() => Promise<void>> = [];
let running = 0;
function schedule(job: () => Promise<void>) {
  queue.push(job);
  pump();
}
function pump() {
  while (running < 2 && queue.length > 0) {
    const job = queue.shift()!;
    running++;
    job().finally(() => {
      running--;
      pump();
    });
  }
}

/**
 * A page preview drawn by pdf.js once it scrolls near the screen. Neutral
 * paper look in both themes; a grey box while it draws.
 */
export function PdfThumb({
  doc,
  pageNumber,
  className = '',
  alt,
}: {
  doc: Promise<PDFDocumentProxy> | null;
  pageNumber: number;
  className?: string;
  alt: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: '300px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !doc) return;
    let cancelled = false;
    let made: string | null = null;
    schedule(async () => {
      if (cancelled) return;
      try {
        const [{ renderThumbnail }, d] = await Promise.all([import('@/app/lib/pdf/pdfjs'), doc]);
        if (cancelled) return;
        const blob = await renderThumbnail(d, pageNumber);
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      } catch {
        if (!cancelled) setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [visible, doc, pageNumber]);

  return (
    <div ref={ref} className={`relative overflow-hidden rounded-md border border-hair bg-white ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote image
        <img src={url} alt={alt} className="h-full w-full object-contain" draggable={false} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-wash text-[10px] font-semibold text-faint" aria-hidden="true">
          {failed ? '—' : 'PDF'}
        </div>
      )}
    </div>
  );
}
