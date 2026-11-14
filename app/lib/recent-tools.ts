/**
 * Recent and most-used tools, kept on the visitor's own device (docs/products/recent-tools.md).
 *
 * What is kept: a tool's catalogue name (its slug), when it was last opened and how many separate times. Never what was
 * typed, uploaded or produced. It lives in local storage, not in a cookie: nothing is sent to a server, no cookie is set,
 * and the pre-built pages stay as fast as they are. If the browser blocks storage the feature quietly does nothing.
 *
 * Everything that decides what to show is a plain function here, so it can be tested without a browser.
 */

import { TOOLS } from './catalogue';

export const RECENT_KEY = 'kaamsolv-recent-tools';
/** Fired on this page after we change the list (the browser's own `storage` event only reaches other tabs). */
export const RECENT_EVENT = 'kaamsolv:recent-tools';

/** More than the number of live tools, so nothing a person uses is ever pushed out in practice. */
export const MAX_ENTRIES = 80;
/** Opening a tool again within this time updates "last used" but is not counted as another use. */
export const SAME_USE_MS = 10 * 60 * 1000;
/** A tool is "most used" once it has been used this many separate times. */
export const MOST_USED_MIN = 3;

export type RecentEntry = { slug: string; last: number; uses: number };

/** Only live catalogue tools are ever kept or shown, so a removed or planned tool can never appear. */
export const isLiveSlug = (slug: string): boolean => TOOLS.some((t) => t.slug === slug && t.status === 'live');

/** The signed-in workspace pages that count as using a tool: the pages stand on the same tool. */
const WORKSPACE_TOOLS: [prefix: string, slug: string][] = [
  ['/app/invoices', 'invoice-generator'],
  ['/app/qr', 'qr-code-generator'],
];

export function toolForPath(pathname: string): string | null {
  const hit = WORKSPACE_TOOLS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

/** What the browser stored → a clean list, newest first. Anything unreadable or unexpected is dropped, never thrown. */
export function parseRecent(raw: string | null, isKnown: (slug: string) => boolean = isLiveSlug): RecentEntry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data !== 'object' || data === null || (data as { v?: unknown }).v !== 1) return [];
  const tools = (data as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  const seen = new Set<string>();
  const out: RecentEntry[] = [];
  for (const item of tools) {
    if (typeof item !== 'object' || item === null) continue;
    const { s, t, n } = item as { s?: unknown; t?: unknown; n?: unknown };
    if (typeof s !== 'string' || seen.has(s) || !isKnown(s)) continue;
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue;
    const uses = typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : 1;
    seen.add(s);
    out.push({ slug: s, last: t, uses });
  }
  return out.sort((a, b) => b.last - a.last).slice(0, MAX_ENTRIES);
}

export function serializeRecent(list: RecentEntry[]): string {
  return JSON.stringify({ v: 1, tools: list.map((e) => ({ s: e.slug, t: e.last, n: e.uses })) });
}

/** Notes one opening of a tool: it moves to the front, and counts as another use unless it is the same visit. */
export function recordUse(list: RecentEntry[], slug: string, now: number): RecentEntry[] {
  const prev = list.find((e) => e.slug === slug);
  const counts = !prev || now - prev.last >= SAME_USE_MS;
  const entry: RecentEntry = { slug, last: now, uses: prev ? prev.uses + (counts ? 1 : 0) : 1 };
  return [entry, ...list.filter((e) => e.slug !== slug)].slice(0, MAX_ENTRIES);
}

/** The tools opened most recently, newest first. */
export function recentList(list: RecentEntry[], limit: number): RecentEntry[] {
  return [...list].sort((a, b) => b.last - a.last).slice(0, limit);
}

/** The tools used at least `MOST_USED_MIN` separate times: most uses first, the more recent one wins a tie. */
export function mostUsedList(list: RecentEntry[], limit: number): RecentEntry[] {
  return list
    .filter((e) => e.uses >= MOST_USED_MIN)
    .sort((a, b) => b.uses - a.uses || b.last - a.last)
    .slice(0, limit);
}

/** "Today", "Yesterday", "3 days ago", "Last week", "2 weeks ago", "A while ago": by calendar day on the visitor's clock. */
export function whenText(last: number, now: number): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(last)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Last week' : `${weeks} weeks ago`;
  }
  return 'A while ago';
}

export const usesText = (uses: number): string => (uses === 1 ? 'Used once' : `Used ${uses} times`);

// ───────────────────────────────────────────── the browser side (guarded: storage can be blocked, and pages render on a server)

/** The stored text as it is right now ('' when there is none or storage is blocked). A stable string for useSyncExternalStore. */
export function readRaw(): string {
  try {
    return window.localStorage.getItem(RECENT_KEY) ?? '';
  } catch {
    return '';
  }
}

function announce() {
  try {
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch {
    /* nothing is listening, or there is no window */
  }
}

/** Remember that a tool was just opened. Does nothing for anything that is not a live catalogue tool. */
export function noteToolUse(slug: string, now: number = Date.now()): void {
  if (!isLiveSlug(slug)) return;
  try {
    const next = recordUse(parseRecent(readRaw()), slug, now);
    window.localStorage.setItem(RECENT_KEY, serializeRecent(next));
    announce();
  } catch {
    /* storage is blocked or full: the feature simply stays empty */
  }
}

/** Forget everything kept here. */
export function clearRecent(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* nothing to clear */
  }
  announce();
}

/** For useSyncExternalStore: call back when the list changes on this page or in another tab. */
export function subscribeRecent(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === RECENT_KEY) onChange();
  };
  window.addEventListener(RECENT_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(RECENT_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

// ───────────────────────────────────────────── the bar under the header

/** The bar is for finding a tool, so it shows only where people choose one, never inside a tool or the workspace. */
export const BAR_ROUTES = ['/', '/tools'];
export const showsRecentBar = (pathname: string): boolean => BAR_ROUTES.includes(pathname);

/** Session storage: "hidden for now". Opening the home page brings the bar back; it lasts only as long as this tab. */
export const BAR_CLOSED_KEY = 'kaamsolv-recent-bar-closed';
export const BAR_EVENT = 'kaamsolv:recent-bar';

export function readBarClosed(): boolean {
  try {
    return window.sessionStorage.getItem(BAR_CLOSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBarClosed(closed: boolean): void {
  try {
    if (closed) window.sessionStorage.setItem(BAR_CLOSED_KEY, '1');
    else window.sessionStorage.removeItem(BAR_CLOSED_KEY);
  } catch {
    /* session storage is blocked: the bar then hides for this page only (the component keeps its own flag) */
  }
  try {
    window.dispatchEvent(new Event(BAR_EVENT));
  } catch {
    /* nothing is listening */
  }
}

export function subscribeBar(onChange: () => void): () => void {
  window.addEventListener(BAR_EVENT, onChange);
  return () => window.removeEventListener(BAR_EVENT, onChange);
}

/**
 * Runs before the first paint (like the theme script) and marks the page `data-recent="1"` when the bar is going to show,
 * so its space is already reserved and the page does not jump down when it appears. A best guess from the stored text:
 * if the guess is wrong the space simply closes up. Kept as a string because it must run before the page's own script.
 */
export const RECENT_BAR_SCRIPT = `(function(){try{var p=location.pathname;if(${JSON.stringify(BAR_ROUTES)}.indexOf(p)<0)return;var r=localStorage.getItem(${JSON.stringify(RECENT_KEY)});if(!r||r.indexOf('"s":')<0)return;if(p!=='/'&&sessionStorage.getItem(${JSON.stringify(BAR_CLOSED_KEY)})==='1')return;document.documentElement.setAttribute('data-recent','1');}catch(e){}})();`;
