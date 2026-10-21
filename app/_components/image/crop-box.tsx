'use client';

import { useEffect, useRef, useState } from 'react';
import { cropRect, MAX_ZOOM, MIN_ZOOM, moveCrop, zoomCrop, type CropState } from '@/app/lib/image/crop';

/**
 * Aspect-locked crop box over the source image. Drag (mouse or touch) or use
 * the arrow keys to move it; the slider zooms in. Values are in source pixels.
 */
export function CropBox({
  src,
  srcW,
  srcH,
  aspect,
  value,
  onChange,
}: {
  src: string;
  srcW: number;
  srcH: number;
  /** Output width / height. */
  aspect: number;
  value: CropState;
  onChange: (next: CropState) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1); // display px per source px
  const drag = useRef<{ x: number; y: number; start: CropState } | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / srcW));
    ro.observe(el);
    return () => ro.disconnect();
  }, [srcW]);

  const r = cropRect(srcW, srcH, aspect, value);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  function onKeyDown(e: React.KeyboardEvent) {
    const step = (e.shiftKey ? 0.05 : 0.01) * Math.max(srcW, srcH);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    onChange(moveCrop(srcW, srcH, aspect, value, m[0], m[1]));
  }

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        className="relative w-full select-none overflow-hidden rounded-lg bg-chip"
        style={{ aspectRatio: `${srcW} / ${srcH}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img src={src} alt="Your image" draggable={false} className="absolute inset-0 h-full w-full" />
        <div
          role="group"
          tabIndex={0}
          aria-label="Crop area. Drag, or use the arrow keys to move it."
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, start: value };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || scale <= 0) return;
            onChange(moveCrop(srcW, srcH, aspect, d.start, (e.clientX - d.x) / scale, (e.clientY - d.y) / scale));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          className="absolute cursor-move touch-none outline outline-2 outline-white focus-visible:outline-coral-500"
          style={{
            left: pct(r.x, srcW),
            top: pct(r.y, srcH),
            width: pct(r.w, srcW),
            height: pct(r.h, srcH),
            boxShadow: '0 0 0 9999px rgba(12, 34, 72, 0.55)',
          }}
        >
          {/* Rule-of-thirds guides help line up a face. */}
          <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/40" />
          <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/40" />
          <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/40" />
          <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/40" />
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium text-strong">
        <span className="shrink-0">Zoom</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={value.zoom}
          onChange={(e) => onChange(zoomCrop(srcW, srcH, aspect, value, Number(e.target.value)))}
          className="w-full accent-coral-500"
        />
      </label>
      <p className="text-xs text-muted">Drag the box (or use the arrow keys) to choose what’s kept.</p>
    </div>
  );
}
