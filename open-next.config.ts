// TEMPORARY — Cloudflare Workers proof-of-concept only (branch cf-workers-poc).
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// KaamKit has no ISR or revalidation, so pre-rendered pages are served
// read-only from the Worker's static assets — no R2 / KV / D1 resources.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
