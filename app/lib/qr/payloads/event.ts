import type { EncodeResult } from '../types';
import { compareLocalDateTime, toIcalLocal, escapeIcalText } from '../validate';

/** iCalendar VEVENT — floating local datetimes (no timezone suffix). */
export function encodeEventPayload(
  title: string,
  start: string,
  end: string,
  location: string,
  description: string,
): EncodeResult {
  const summary = title.trim();
  if (!summary) return { ok: false, field: 'title', message: 'Add an event title.' };
  if (summary.length > 200) return { ok: false, field: 'title', message: 'That title is too long.' };

  if (!start.trim()) return { ok: false, field: 'start', message: 'Pick a start date and time.' };
  if (!end.trim()) return { ok: false, field: 'end', message: 'Pick an end date and time.' };

  const dtStart = toIcalLocal(start);
  if (!dtStart) {
    return { ok: false, field: 'start', message: 'That start time doesn’t look right.' };
  }
  const dtEnd = toIcalLocal(end);
  if (!dtEnd) {
    return { ok: false, field: 'end', message: 'That end time doesn’t look right.' };
  }
  if (compareLocalDateTime(start, end) >= 0) {
    return { ok: false, field: 'end', message: 'End time must be after the start time.' };
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KaamSolv//QR Generator//EN',
    'BEGIN:VEVENT',
    `UID:${dtStart}-${summary.replace(/\s+/g, '-').slice(0, 40)}@kaamsolv.com`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcalText(summary)}`,
  ];

  const loc = location.trim();
  if (loc) {
    if (loc.length > 300) return { ok: false, field: 'location', message: 'That location is too long.' };
    lines.push(`LOCATION:${escapeIcalText(loc)}`);
  }

  const desc = description.trim();
  if (desc) {
    if (desc.length > 1000) return { ok: false, field: 'description', message: 'That description is too long.' };
    lines.push(`DESCRIPTION:${escapeIcalText(desc)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return { ok: true, text: lines.join('\r\n'), mode: 'static', kind: 'event' };
}
