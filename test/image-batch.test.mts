import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import {
  BATCH_MAX_FILES,
  BATCH_MAX_TOTAL_BYTES,
  fractionFor,
  rejectionMessage,
  selectBatchFiles,
  tally,
  uniqueName,
  zipBlobs,
} from '../app/lib/image/batch.ts';
import { effectiveCompressOutput } from '../app/lib/image/compress.ts';
import { indiaDayKey } from '../app/lib/image/quota-policy.ts';
import { MAX_IMAGE_BYTES } from '../app/lib/image/types.ts';

/** A File whose reported size is `size`, without allocating that many bytes. */
function fakeFile(name: string, size: number): File {
  const file = new File([new Uint8Array(0)], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

test('a batch takes 20 files, the rest are named as left out', () => {
  const files = Array.from({ length: 22 }, (_, i) => fakeFile(`p${i}.jpg`, 1000));
  const { accepted, rejected } = selectBatchFiles(files, { count: 0, totalBytes: 0 });
  assert.equal(accepted.length, BATCH_MAX_FILES);
  assert.deepEqual(rejected.map((r) => r.name), ['p20.jpg', 'p21.jpg']);
  assert.ok(rejected.every((r) => r.reason === 'too-many'));
});

test('files over 25 MB are refused on their own', () => {
  const big = fakeFile('huge.jpg', MAX_IMAGE_BYTES + 1);
  const ok = fakeFile('fine.jpg', 10);
  const { accepted, rejected } = selectBatchFiles([big, ok], { count: 0, totalBytes: 0 });
  assert.deepEqual(accepted.map((f) => f.name), ['fine.jpg']);
  assert.equal(rejected[0].reason, 'too-big');
  assert.match(rejectionMessage(rejected[0]), /over 25 MB/);
});

test('a batch over 150 MB in total leaves out the file that tips it', () => {
  const six = Array.from({ length: 6 }, (_, i) => fakeFile(`b${i}.jpg`, MAX_IMAGE_BYTES));
  const seventh = fakeFile('b6.jpg', 10);
  const { accepted, rejected } = selectBatchFiles([...six, seventh], { count: 0, totalBytes: 0 });
  assert.equal(accepted.length, 6);
  assert.deepEqual(rejected.map((r) => r.reason), ['too-much']);
});

test('files already in the batch count against the limits', () => {
  const { accepted, rejected } = selectBatchFiles([fakeFile('x.jpg', 1)], { count: 20, totalBytes: 0 });
  assert.equal(accepted.length, 0);
  assert.equal(rejected[0].reason, 'too-many');
});

test('progress only moves forward through the stages', () => {
  const order = ['preparing', 'reading', 'decoding', 'processing', 'encoding', 'finalizing'] as const;
  let last = -1;
  for (const stage of order) {
    const f = fractionFor(stage);
    assert.ok(f > last, `${stage} should be past ${last}`);
    last = f;
  }
  assert.ok(fractionFor('encoding', 50) > fractionFor('encoding', 0));
  assert.ok(fractionFor('encoding', 100) < fractionFor('finalizing'));
  assert.equal(fractionFor('encoding', 999), fractionFor('encoding', 100));
});

test('tally counts finished, failed, blocked and queued files and sums the bytes', () => {
  const t = tally([
    { status: 'done', fraction: 1, beforeBytes: 1000, afterBytes: 400 },
    { status: 'done', fraction: 1, beforeBytes: 500, afterBytes: 500 },
    { status: 'working', fraction: 0.5 },
    { status: 'failed', fraction: 0 },
    { status: 'blocked', fraction: 0 },
    { status: 'queued', fraction: 0 },
  ]);
  assert.equal(t.total, 6);
  assert.equal(t.done, 2);
  assert.equal(t.working, 1);
  assert.equal(t.failed, 1);
  assert.equal(t.blocked, 1);
  assert.equal(t.queued, 1);
  assert.equal(t.beforeBytes, 1500);
  assert.equal(t.afterBytes, 900);
  // (1 + 1 + 0.5) / 6
  assert.ok(Math.abs(t.fraction - 2.5 / 6) < 1e-9);
});

test('an empty batch has no progress', () => {
  assert.equal(tally([]).fraction, 0);
});

test('duplicate names in a ZIP get a number, extension kept', () => {
  const used = new Set<string>();
  assert.equal(uniqueName('photo.webp', used), 'photo.webp');
  assert.equal(uniqueName('photo.webp', used), 'photo (2).webp');
  assert.equal(uniqueName('photo.webp', used), 'photo (3).webp');
  assert.equal(uniqueName('README', used), 'README');
  assert.equal(uniqueName('README', used), 'README (2)');
});

test('the ZIP holds every file, byte for byte, with unique names', async () => {
  const a = new Blob([new Uint8Array([1, 2, 3])]);
  const b = new Blob([new Uint8Array([9, 8])]);
  const zip = await zipBlobs([
    { name: 'same.png', blob: a },
    { name: 'same.png', blob: b },
  ]);
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(Object.keys(entries).sort(), ['same (2).png', 'same.png']);
  assert.deepEqual(Array.from(entries['same.png']), [1, 2, 3]);
  assert.deepEqual(Array.from(entries['same (2).png']), [9, 8]);
});

test('a mixed batch keeps the chosen format where it suits and falls back where not', () => {
  // PNG accepts WebP, JPG and PNG; JPG is never offered PNG.
  assert.equal(effectiveCompressOutput('png', 'png'), 'png');
  assert.equal(effectiveCompressOutput('jpeg', 'png'), 'jpeg');
  assert.equal(effectiveCompressOutput('png', 'jpeg'), 'jpeg');
});

test('the day key is the India calendar day, so it turns over at midnight IST', () => {
  // 2026-11-15 18:29 UTC is 23:59 IST on the 15th; 18:31 UTC is 00:01 IST on the 16th.
  assert.equal(indiaDayKey(Date.parse('2026-11-15T18:29:00Z')), '2026-11-15');
  assert.equal(indiaDayKey(Date.parse('2026-11-15T18:31:00Z')), '2026-11-16');
});
