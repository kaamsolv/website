import {
  FORMAT_REGISTRY,
  type FormatCapability,
  type FormatGroup,
  type FormatId,
} from './format-registry';

/** UI group labels for the format selector. */
export const FORMAT_GROUP_LABELS: Record<FormatGroup, string> = {
  popular: 'Popular',
  images: 'Images',
  'vector-icons': 'Vector & Icons',
  modern: 'Modern',
  camera: 'Camera',
  design: 'Design',
  professional: 'Professional',
};

const GROUP_ORDER: FormatGroup[] = [
  'popular',
  'images',
  'vector-icons',
  'modern',
  'camera',
  'design',
  'professional',
];

export function getFormat(id: FormatId): FormatCapability {
  return FORMAT_REGISTRY[id];
}

export function labelForFormatId(id: FormatId): string {
  return FORMAT_REGISTRY[id].label;
}

/** Formats the engine can decode right now — offered as input options. */
export function getDecodableFormats(): FormatCapability[] {
  return Object.values(FORMAT_REGISTRY).filter((f) => f.canDecode);
}

/** Formats the engine can encode right now — offered as output options. */
export function getEncodableFormats(): FormatCapability[] {
  return Object.values(FORMAT_REGISTRY).filter((f) => f.canEncode);
}

/** Grouped options for the format selector UI. Only live, working formats. */
export function getGroupedInputFormats(): { group: FormatGroup; label: string; formats: FormatCapability[] }[] {
  const decodable = getDecodableFormats();
  return GROUP_ORDER
    .map((group) => ({
      group,
      label: FORMAT_GROUP_LABELS[group],
      formats: decodable.filter((f) => f.group === group),
    }))
    .filter((g) => g.formats.length > 0);
}

export function getGroupedOutputFormats(): { group: FormatGroup; label: string; formats: FormatCapability[] }[] {
  const encodable = getEncodableFormats();
  return GROUP_ORDER
    .map((group) => ({
      group,
      label: FORMAT_GROUP_LABELS[group],
      formats: encodable.filter((f) => f.group === group),
    }))
    .filter((g) => g.formats.length > 0);
}

/** Whether a conversion pair is supported by the current engine. */
export function canConvert(from: FormatId, to: FormatId): boolean {
  if (from === to) return false;
  const src = FORMAT_REGISTRY[from];
  const dst = FORMAT_REGISTRY[to];
  if (!src?.canDecode || !dst?.canEncode) return false;
  // Vector → vector is not ordinary conversion (tracing is a separate tool).
  if (src.vector && dst.vector) return false;
  // RAW/layered inputs rasterize through decode first; output must be raster encode.
  return true;
}

/**
 * Whether the engine can run this job. Same as `canConvert`, plus re-encoding
 * into the same raster format (JPG → JPG), which compression needs. The
 * converter UI keeps using `canConvert`, where a same-format pair is a no-op.
 */
export function canProcess(from: FormatId, to: FormatId): boolean {
  if (canConvert(from, to)) return true;
  const fmt = FORMAT_REGISTRY[from];
  return from === to && Boolean(fmt?.canDecode && fmt.canEncode && !fmt.vector);
}

/** Pick a sensible default output when input changes. */
export function defaultOutputForInput(from: FormatId, currentTo: FormatId): FormatId {
  if (canConvert(from, currentTo)) return currentTo;
  const encodable = getEncodableFormats();
  const preferred: FormatId[] = ['png', 'jpeg', 'webp'];
  for (const id of preferred) {
    if (canConvert(from, id)) return id;
  }
  return encodable[0]?.id ?? 'png';
}

export function extensionForFormatId(id: FormatId): string {
  return FORMAT_REGISTRY[id].extensions[0];
}

export function mimeForFormatId(id: FormatId): string {
  return FORMAT_REGISTRY[id].mimeTypes[0];
}

export function allDecodableAcceptString(): string {
  const parts = new Set<string>();
  for (const f of getDecodableFormats()) {
    for (const m of f.mimeTypes) parts.add(m);
    for (const e of f.extensions) parts.add(`.${e}`);
  }
  return [...parts].join(',');
}

export function formatFromExtension(ext: string): FormatId | null {
  const lower = ext.toLowerCase();
  for (const f of Object.values(FORMAT_REGISTRY)) {
    if (f.canDecode && f.extensions.includes(lower)) return f.id;
  }
  return null;
}

export function formatFromMime(mime: string): FormatId | null {
  const lower = mime.toLowerCase();
  for (const f of Object.values(FORMAT_REGISTRY)) {
    if (f.canDecode && f.mimeTypes.some((m) => m === lower)) return f.id;
  }
  return null;
}
