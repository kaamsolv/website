/**
 * Makes `photo.heic`, the real HEIC fixture for tests/e2e/heic.spec.ts.
 *
 * Built the way an iPhone stores a photo: a 2 × 2 grid of 512 × 512 HEVC
 * tiles inside a HEIF container. ffmpeg (with libx265) encodes the tiles; this
 * script writes the container around them. No npm packages needed.
 *
 *   node tests/e2e/fixtures/make-heic.mts
 *
 * Only needed to regenerate the committed file. Requires ffmpeg on PATH.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TILE = 512;
const COLS = 2;
const ROWS = 2;
const OUT = fileURLToPath(new URL('./photo.heic', import.meta.url));

// --------------------------------------------------------------- HEVC tiles

/** Encode one tile of a test pattern as a single HEVC intra frame (Annex B). */
function encodeTile(col: number, row: number): Buffer {
  return execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `testsrc2=size=${TILE * COLS}x${TILE * ROWS}:rate=1`,
    '-frames:v', '1',
    '-vf', `crop=${TILE}:${TILE}:${col * TILE}:${row * TILE}`,
    '-pix_fmt', 'yuv420p',
    '-c:v', 'libx265', '-x265-params', 'log-level=error', '-crf', '28',
    '-f', 'hevc', '-',
  ]);
}

/** Split an Annex B stream into NAL units (start codes removed). */
function splitNals(stream: Buffer): Buffer[] {
  const starts: number[] = [];
  for (let i = 0; i + 3 <= stream.length; i++) {
    if (stream[i] === 0 && stream[i + 1] === 0 && stream[i + 2] === 1) {
      starts.push(i + 3);
      i += 2;
    }
  }
  return starts.map((s, n) => {
    let end = n + 1 < starts.length ? starts[n + 1] - 3 : stream.length;
    while (end > s && stream[end - 1] === 0) end--; // 4-byte start codes
    return stream.subarray(s, end);
  });
}

const nalType = (nal: Buffer) => (nal[0] >> 1) & 0x3f;

// ------------------------------------------------------------ ISOBMFF boxes

const u8 = (v: number) => Buffer.from([v]);
const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; };
const str = (s: string) => Buffer.from(s, 'latin1');

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), str(type), body]);
}

function fullBox(type: string, version: number, flags: number, ...parts: Buffer[]): Buffer {
  return box(type, u8(version), u8((flags >> 16) & 0xff), u16(flags & 0xffff), ...parts);
}

/** hvcC from the VPS/SPS/PPS of the first tile (all tiles share settings). */
function hvcC(vps: Buffer, sps: Buffer, pps: Buffer): Buffer {
  // general_profile_tier_level sits right after the SPS NAL header (2 bytes)
  // and the vps_id / max_sub_layers / temporal_id_nesting byte.
  const rbsp = Buffer.from(sps.filter((_, i) => !(i >= 2 && sps[i] === 3 && sps[i - 1] === 0 && sps[i - 2] === 0)));
  const ptl = rbsp.subarray(3, 15);
  const array = (nal: Buffer) => Buffer.concat([u8(0x80 | nalType(nal)), u16(1), u16(nal.length), nal]);
  return box(
    'hvcC',
    u8(1),
    ptl, // profile space/tier/idc, compatibility flags, constraint flags, level
    u16(0xf000), // min_spatial_segmentation_idc = 0
    u8(0xfc), // parallelismType = 0
    u8(0xfc | 1), // chroma_format_idc = 1 (4:2:0)
    u8(0xf8), // bit_depth_luma_minus8 = 0
    u8(0xf8), // bit_depth_chroma_minus8 = 0
    u16(0), // avgFrameRate
    u8(0x0f), // 1 temporal layer, nested, 4-byte NAL lengths
    u8(3),
    array(vps),
    array(sps),
    array(pps),
  );
}

// ------------------------------------------------------------------- build

const tiles = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) tiles.push(splitNals(encodeTile(col, row)));
}
const first = tiles[0];
const find = (t: number) => first.find((n) => nalType(n) === t)!;
const config = hvcC(find(32), find(33), find(34));

// Item data: only the coded slices (NAL types 0–31), each with a 4-byte length.
const tileData = tiles.map((nals) =>
  Buffer.concat(nals.filter((n) => nalType(n) < 32).flatMap((n) => [u32(n.length), n])),
);
const gridData = Buffer.concat([u8(0), u8(0), u8(ROWS - 1), u8(COLS - 1), u16(TILE * COLS), u16(TILE * ROWS)]);

const GRID_ID = 1;
const tileIds = tiles.map((_, i) => i + 2);

function buildMeta(mdatDataStart: number): Buffer {
  const items = [{ id: GRID_ID, data: gridData }, ...tileIds.map((id, i) => ({ id, data: tileData[i] }))];
  let offset = mdatDataStart;
  const iloc = fullBox(
    'iloc', 0, 0,
    u8(0x44), u8(0x00), // offset_size 4, length_size 4, no base offset
    u16(items.length),
    ...items.map((it) => {
      const entry = Buffer.concat([u16(it.id), u16(0), u16(1), u32(offset), u32(it.data.length)]);
      offset += it.data.length;
      return entry;
    }),
  );
  const infe = (id: number, type: string, hidden: boolean) =>
    fullBox('infe', 2, hidden ? 1 : 0, u16(id), u16(0), str(type), u8(0));
  const ipco = box(
    'ipco',
    config, // 1
    fullBox('ispe', 0, 0, u32(TILE), u32(TILE)), // 2
    fullBox('ispe', 0, 0, u32(TILE * COLS), u32(TILE * ROWS)), // 3
  );
  const ipma = fullBox(
    'ipma', 0, 0,
    u32(1 + tileIds.length),
    u16(GRID_ID), u8(1), u8(3),
    ...tileIds.map((id) => Buffer.concat([u16(id), u8(2), u8(0x80 | 1), u8(2)])),
  );
  return fullBox(
    'meta', 0, 0,
    fullBox('hdlr', 0, 0, u32(0), str('pict'), u32(0), u32(0), u32(0), u8(0)),
    fullBox('pitm', 0, 0, u16(GRID_ID)),
    fullBox('iinf', 0, 0, u16(1 + tileIds.length), infe(GRID_ID, 'grid', false), ...tileIds.map((id) => infe(id, 'hvc1', true))),
    fullBox('iref', 0, 0, box('dimg', u16(GRID_ID), u16(tileIds.length), ...tileIds.map(u16))),
    box('iprp', ipco, ipma),
    iloc,
  );
}

const ftyp = box('ftyp', str('heic'), u32(0), str('mif1'), str('heic'));
const metaSize = buildMeta(0).length; // offsets don't change the size
const meta = buildMeta(ftyp.length + metaSize + 8);
const mdat = box('mdat', gridData, ...tileData);
const file = Buffer.concat([ftyp, meta, mdat]);
writeFileSync(OUT, file);
console.log(`Wrote ${OUT} (${file.length} bytes, ${TILE * COLS}×${TILE * ROWS})`);
