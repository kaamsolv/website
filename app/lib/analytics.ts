/**
 * Google Analytics 4 — client helpers. See docs/ANALYTICS.md.
 *
 * Rules this file enforces:
 *  - Nothing is sent, and gtag.js is not even loaded, until the visitor taps
 *    "Accept analytics" (see app/_components/analytics.tsx).
 *  - With NEXT_PUBLIC_GA_ID unset (local, dev, e2e) every function is a no-op.
 *  - Events carry only fixed labels: tool slug, category, tool type, file
 *    extension, error code, link domain. Never filenames, file contents,
 *    typed values, URLs people shorten, or error messages.
 */
import { CATEGORIES, TOOLS, type Tool } from './catalogue';

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';
export const ANALYTICS_ENABLED = /^G-[A-Z0-9]+$/i.test(GA_ID);

const STORAGE_KEY = 'kaamsolv-analytics';
const CHANGE_EVENT = 'kaamsolv-analytics-change';

export type Consent = 'granted' | 'denied' | 'unset';

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

// ---------------------------------------------------------------- consent

export function readConsent(): Consent {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'granted' || v === 'denied' ? v : 'unset';
  } catch {
    return 'unset';
  }
}

export function subscribeConsent(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function setConsent(value: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode: the choice just lasts until the page closes */
  }
  if (value === 'denied') stopTracking();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Switch GA off for this page and remove the cookies it set. Safe to call any time. */
export function stopTracking(): void {
  if (!ANALYTICS_ENABLED) return;
  const w = window as unknown as GtagWindow;
  w[`ga-disable-${GA_ID}`] = true;
  const host = location.hostname;
  const parts = host.split('.');
  const domains = new Set<string>([host, `.${host}`]);
  for (let i = 1; i < parts.length - 1; i++) domains.add(`.${parts.slice(i).join('.')}`);
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim();
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
    }
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

// ---------------------------------------------------------------- gtag

/** The standard gtag() shim: queues onto dataLayer until gtag.js loads. */
export function installGtag(): void {
  const w = window as unknown as GtagWindow;
  w.dataLayer = w.dataLayer ?? [];
  if (!w.gtag) {
    w.gtag = function gtag() {
      // gtag.js reads the `arguments` object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
}

/** The signed-in area: analytics is off there entirely (its URLs carry ids). */
export function isAccountPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

/** Analytics runs only with an ID, with consent, and never on account pages. */
function active(): boolean {
  return ANALYTICS_ENABLED && readConsent() === 'granted' && !isAccountPath(location.pathname);
}

/**
 * A URL as analytics may see it: origin and path only — never a query string or
 * fragment, and nothing past `/app` inside the account area (those paths hold ids).
 * Returns '' for anything that isn't a web URL. Never throws.
 */
export function cleanUrl(raw: string, base?: string): string {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `${u.origin}${isAccountPath(u.pathname) ? '/app' : u.pathname}`;
  } catch {
    return '';
  }
}

/**
 * The one way an event leaves the site. Google fills in `page_location` (and
 * `page_referrer`) with the full URL on its own, query string and all, so every
 * event sets both explicitly, from here. Call sites pass only their own fixed labels.
 */
/**
 * Make the cleaned address the default for everything Google's script measures
 * on its own too (it otherwise reads the full URL itself). Call once the tag is
 * set up and again on every route change. Events we send set the same values
 * explicitly in `send()`.
 */
export function syncCleanLocation(): void {
  if (!active()) return;
  installGtag();
  const defaults: Record<string, string> = { page_location: cleanUrl(location.href) };
  if (document.referrer) {
    const referrer = cleanUrl(document.referrer);
    if (referrer) defaults.page_referrer = referrer;
  }
  (window as unknown as GtagWindow).gtag!('set', defaults);
}

function send(name: string, params: Record<string, string | number | boolean>): void {
  if (!active()) return;
  installGtag();
  const clean: Record<string, string | number | boolean> = { ...params, page_location: cleanUrl(location.href) };
  if (document.referrer) {
    const referrer = cleanUrl(document.referrer);
    if (referrer) clean.page_referrer = referrer;
  }
  (window as unknown as GtagWindow).gtag!('event', name, clean);
}

// ---------------------------------------------------------------- tool lookup

/** The catalogue tool for a path like `/gst-calculator`, or undefined (home, privacy, account…). */
export function toolFromPath(pathname: string): Tool | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return TOOLS.find((t) => t.status === 'live' && t.url === clean);
}

/** Server-safe pathname for tool lookups is not needed: these run only from click handlers and effects. */
function categorySlug(tool: Tool): string {
  return CATEGORIES.find((c) => c.name === tool.category)?.slug ?? 'other';
}

export type ToolType = 'calculator' | 'converter' | 'generator' | 'utility';

// ---------------------------------------------------------------- page views

let lastPagePath = '';

/** One page_view per path change; path only — never the query string or hash. */
export function trackPageView(pathname: string): void {
  // The signed-in area has ids in its URLs and nothing public to measure.
  if (isAccountPath(pathname)) return;
  if (pathname === lastPagePath) return;
  lastPagePath = pathname;
  send('page_view', { page_path: pathname, page_title: document.title });
}

/** Forget the last path (e.g. after consent is withdrawn and later granted again). */
export function resetPageView(): void {
  lastPagePath = '';
}

// ---------------------------------------------------------------- tool events

function toolParams(tool: Tool, type?: ToolType): Record<string, string> {
  const p: Record<string, string> = { tool_name: tool.slug, tool_category: categorySlug(tool) };
  if (type) p.tool_type = type;
  return p;
}

const openedThisPage = new Set<string>();
const succeededThisPage = new Set<string>();

/** A tool page was opened. Once per tool per page load. */
export function trackToolOpen(tool: Tool, type?: ToolType): void {
  if (!active() || openedThisPage.has(tool.slug)) return;
  openedThisPage.add(tool.slug);
  send('tool_open', toolParams(tool, type));
}

/**
 * The tool did its job, on the tool page the visitor is on. By default once per
 * page load, so a live calculator isn't counted on every keystroke; converters
 * and generators pass `each` to count every finished conversion or file.
 */
export function trackToolSuccess(type?: ToolType, each = false): void {
  const tool = toolFromPath(location.pathname);
  if (!tool || !active()) return;
  if (!each) {
    if (succeededThisPage.has(tool.slug)) return;
    succeededThisPage.add(tool.slug);
  }
  send('tool_success', toolParams(tool, type));
}

/** A failure the visitor would notice. `code` must be a short fixed label, never an error message. */
export function trackToolError(code: string, type?: ToolType): void {
  const tool = toolFromPath(location.pathname);
  if (!tool) return;
  send('tool_error', { ...toolParams(tool, type), error_type: code.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) });
}

const FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'pdf', 'zip']);

/** A file was downloaded. Only the extension (from a fixed allow-list) is sent — never the name. */
export function trackFileDownload(filename: string): void {
  const tool = toolFromPath(location.pathname);
  if (!tool) return;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  send('file_download', { ...toolParams(tool), file_ext: FILE_EXTENSIONS.has(ext) ? ext : 'other' });
}

/** A click on a link to another site, on a public page. Only the domain is sent. */
export function trackOutboundClick(href: string): void {
  if (isAccountPath(location.pathname)) return;
  let url: URL;
  try {
    url = new URL(href, location.href);
  } catch {
    return;
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname === location.hostname) return;
  send('outbound_click', { link_domain: url.hostname });
}
