import type { EncodeResult } from '../types';
import { parseCoordinate, validateLatitude, validateLongitude } from '../validate';

/**
 * RFC 5870 `geo:` URI. Optional name is included via the common `?q=lat,lng(label)`
 * pattern so maps apps can show a label without changing the primary coordinates.
 */
export function encodeLocationPayload(
  latitude: string,
  longitude: string,
  name: string,
): EncodeResult {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);

  if (latitude.trim() === '' || longitude.trim() === '') {
    return { ok: false, field: 'latitude', message: 'Add latitude and longitude.' };
  }
  if (lat === null) {
    return { ok: false, field: 'latitude', message: 'Latitude must be a number between -90 and 90.' };
  }
  if (lng === null) {
    return { ok: false, field: 'longitude', message: 'Longitude must be a number between -180 and 180.' };
  }
  if (!validateLatitude(lat)) {
    return { ok: false, field: 'latitude', message: 'Latitude must be between -90 and 90.' };
  }
  if (!validateLongitude(lng)) {
    return { ok: false, field: 'longitude', message: 'Longitude must be between -180 and 180.' };
  }

  const latStr = formatCoord(lat);
  const lngStr = formatCoord(lng);
  const label = name.trim();
  const text = label
    ? `geo:${latStr},${lngStr}?q=${latStr},${lngStr}(${encodeURIComponent(label)})`
    : `geo:${latStr},${lngStr}`;

  return { ok: true, text, mode: 'static', kind: 'location' };
}

function formatCoord(n: number): string {
  return String(n);
}
