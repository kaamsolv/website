/**
 * Password protection. The rules (pure), then real encrypted PDFs opened by INDEPENDENT readers, not just by
 * the pdf.js this app uses:
 *   - Xpdf's `pdftotext`  (its own PDF engine)   — skipped when it isn't installed
 *   - qpdf through `pikepdf`                       — skipped when Python / pikepdf isn't installed
 *   - pdf.js (the engine the app itself uses)
 * What this cannot show: Acrobat, Preview, Chrome's viewer or Word. Open real protected files in those too.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_PASSWORD_CHARS, MIN_PASSWORD_CHARS, checkPassword, passwordStrength, protectedPdfName, type ProtectOptions } from '../app/lib/pdf/protect-rules.ts';
import { protectPdf } from '../app/lib/pdf/protect.ts';

const NOTHING_BLOCKED = { printing: false, copying: false, editing: false };
const opts = (password: string, block = NOTHING_BLOCKED): ProtectOptions => ({ password, block });
const SECRET = 'Body of page 1: the quiet green fox';

async function sample(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText(SECRET, { x: 72, y: 700, size: 12, font });
  doc.addPage([595, 842]).drawText('Second page text', { x: 72, y: 700, size: 12, font });
  return doc.save();
}

const dir = mkdtempSync(join(tmpdir(), 'kaamsolv-protect-'));
let counter = 0;
function writeTemp(bytes: Uint8Array): string {
  const path = join(dir, `file-${++counter}.pdf`);
  writeFileSync(path, bytes);
  return path;
}

const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');
const hasXpdf = !spawnSync('pdftotext', ['-v']).error;
const hasPikepdf = spawnSync('python', ['-c', 'import pikepdf']).status === 0;

const PIKEPDF = `
import sys, json, pikepdf
path, pw = sys.argv[1], sys.argv[2]
out = {}
def tries(password):
    try:
        pikepdf.open(path, password=password).close()
        return 'opened'
    except pikepdf.PasswordError:
        return 'refused'
out['no_password'] = tries('')
out['wrong_password'] = tries('definitely-not-it')
pdf = pikepdf.open(path, password=pw)
e = pdf.encryption
out['encrypted'] = pdf.is_encrypted
out['R'] = e.R; out['V'] = e.V; out['bits'] = getattr(e, 'bits', None)
out['stream'] = str(e.stream_method); out['string'] = str(e.string_method)
a = pdf.allow
out['allow'] = {k: bool(getattr(a, k)) for k in ('accessibility','extract','modify_annotation','modify_assembly','modify_form','modify_other','print_lowres','print_highres')}
out['pages'] = len(pdf.pages)
print(json.dumps(out))
`;
type Report = { no_password: string; wrong_password: string; encrypted: boolean; R: number; V: number; bits: number | null; stream: string; string: string; allow: Record<string, boolean>; pages: number };
function pikepdfReport(path: string, password: string): Report {
  const r = spawnSync('python', ['-c', PIKEPDF, path, password], { encoding: 'utf8' });
  assert.equal(r.status, 0, `pikepdf failed: ${r.stderr}`);
  return JSON.parse(r.stdout) as Report;
}
function xpdfText(path: string, password?: string) {
  const args = password === undefined ? [path, '-'] : ['-upw', password, path, '-'];
  const r = spawnSync('pdftotext', args, { encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

// ───────────────────────────── the rules ─────────────────────────────

test('passwords are checked in plain words', () => {
  assert.equal(checkPassword('abcd', 'abcd').ok, true);
  const bad = (a: string, b: string) => {
    const r = checkPassword(a, b);
    assert.equal(r.ok, false);
    return r.ok ? '' : r.message;
  };
  assert.match(bad('abc', 'abc'), new RegExp(`at least ${MIN_PASSWORD_CHARS} characters`));
  assert.match(bad('x'.repeat(MAX_PASSWORD_CHARS + 1), 'x'.repeat(MAX_PASSWORD_CHARS + 1)), new RegExp(`${MAX_PASSWORD_CHARS} characters or fewer`));
  assert.match(bad('abcd', 'abce'), /don’t match/);
  assert.equal(checkPassword('x'.repeat(MAX_PASSWORD_CHARS), 'x'.repeat(MAX_PASSWORD_CHARS)).ok, true);
  assert.equal(MAX_PASSWORD_CHARS, 32);
  assert.equal(passwordStrength('abc12'), 'short');
  assert.equal(passwordStrength('abcdefgh'), 'ok');
  assert.equal(passwordStrength('Correct-Horse-9'), 'strong');
  assert.equal(protectedPdfName('Report'), 'Report-protected.pdf');
});

// ─────────────── the real thing, opened by other people's PDF engines ───────────────

test('the file declares AES encryption and does not contain the password', async () => {
  const locked = await protectPdf(await sample(), opts('correct-horse'));
  const raw = latin1(locked);
  assert.ok(raw.startsWith('%PDF-'));
  assert.match(raw, /\/Encrypt/);
  assert.match(raw, /\/AESV3/);
  assert.ok(!raw.includes('correct-horse'), 'the password is not in the bytes');
  assert.ok(!latin1(await sample()).includes('/Encrypt'), 'control: an unprotected file has no /Encrypt');
});

test('pdf.js: refuses without the password, refuses a wrong one, opens with the right one and reads the text', async () => {
  const locked = await protectPdf(await sample(), opts('correct-horse'));
  const load = (password?: string) => pdfjs.getDocument({ data: new Uint8Array(locked), password, isEvalSupported: false, verbosity: 0 }).promise;
  await assert.rejects(() => load(), (e: Error) => e.name === 'PasswordException');
  await assert.rejects(() => load('wrong-password'), (e: Error) => e.name === 'PasswordException');
  const doc = await load('correct-horse');
  assert.equal(doc.numPages, 2);
  const content = await (await doc.getPage(1)).getTextContent();
  assert.ok(content.items.map((i) => ('str' in i ? i.str : '')).join(' ').includes('quiet green fox'));
  await doc.loadingTask.destroy();
});

test('Xpdf (pdftotext, an independent engine): refuses without the password, reads it with', { skip: !hasXpdf && 'pdftotext is not installed' }, async () => {
  const path = writeTemp(await protectPdf(await sample(), opts('correct-horse')));
  const without = xpdfText(path);
  assert.notEqual(without.status, 0, 'no password: refused');
  assert.ok(!without.out.includes('quiet green fox'));
  const wrong = xpdfText(path, 'wrong-password');
  assert.notEqual(wrong.status, 0, 'wrong password: refused');
  const right = xpdfText(path, 'correct-horse');
  assert.equal(right.status, 0, right.err);
  assert.ok(right.out.includes(SECRET), `reads the page text: ${JSON.stringify(right.out.slice(0, 80))}`);
  assert.ok(right.out.includes('Second page text'));
});

test('qpdf via pikepdf (an independent engine): AES-256, revision 6, needs the password, opens with it', { skip: !hasPikepdf && 'python with pikepdf is not installed' }, async () => {
  const path = writeTemp(await protectPdf(await sample(), opts('correct-horse')));
  const r = pikepdfReport(path, 'correct-horse');
  assert.equal(r.no_password, 'refused');
  assert.equal(r.wrong_password, 'refused');
  assert.equal(r.encrypted, true);
  assert.equal(r.V, 5);
  assert.equal(r.R, 6);
  assert.equal(r.bits, 256);
  assert.match(r.stream, /aes/i);
  assert.match(r.string, /aes/i);
  assert.equal(r.pages, 2);
  // With no restrictions chosen, the person who opens it can do everything.
  assert.ok(Object.values(r.allow).every(Boolean), JSON.stringify(r.allow));
});

test('permissions: blocking printing, copying or editing is recorded in the file (a request to apps, not a lock)', { skip: !hasPikepdf && 'python with pikepdf is not installed' }, async () => {
  const bytes = await sample();
  const noPrintCopy = pikepdfReport(writeTemp(await protectPdf(bytes, opts('correct-horse', { printing: true, copying: true, editing: false }))), 'correct-horse');
  assert.equal(noPrintCopy.allow.print_highres, false);
  assert.equal(noPrintCopy.allow.print_lowres, false);
  assert.equal(noPrintCopy.allow.extract, false);
  assert.equal(noPrintCopy.allow.modify_other, true);
  assert.equal(noPrintCopy.allow.accessibility, true, 'screen readers keep working');
  const noEdit = pikepdfReport(writeTemp(await protectPdf(bytes, opts('correct-horse', { printing: false, copying: false, editing: true }))), 'correct-horse');
  assert.equal(noEdit.allow.modify_other, false);
  assert.equal(noEdit.allow.modify_assembly, false);
  assert.equal(noEdit.allow.modify_form, false);
  assert.equal(noEdit.allow.modify_annotation, false);
  assert.equal(noEdit.allow.print_highres, true);
  assert.equal(noEdit.allow.extract, true);
  assert.equal(noEdit.allow.accessibility, true);
});

test('the longest allowed password, symbols, spaces and Hindi all open in every reader that is installed', async () => {
  const passwords = ['Aa1 &!,.'.repeat(4), 'k'.repeat(MAX_PASSWORD_CHARS), 'पासवर्ड123', 'ग'.repeat(MAX_PASSWORD_CHARS), 'Zoë-çafé-9'];
  for (const pw of passwords) {
    const locked = await protectPdf(await sample(), opts(pw));
    const doc = await pdfjs.getDocument({ data: new Uint8Array(locked), password: pw, isEvalSupported: false, verbosity: 0 }).promise;
    assert.equal(doc.numPages, 2, `pdf.js opens with ${pw}`);
    await doc.loadingTask.destroy();
    const path = writeTemp(locked);
    if (hasPikepdf) assert.equal(pikepdfReport(path, pw).pages, 2, `qpdf opens with ${pw}`);
    // Xpdf's command line takes at most 32 bytes of password (a limit of that tool, not of the file).
    if (hasXpdf && Buffer.byteLength(pw) <= 32) assert.equal(xpdfText(path, pw).status, 0, `Xpdf opens with ${pw}`);
  }
});

test('the pages themselves come through unchanged', async () => {
  const locked = await protectPdf(await sample(), opts('correct-horse'));
  const doc = await PDFDocument.load(locked, { password: 'correct-horse' } as never);
  assert.equal(doc.getPageCount(), 2);
  await assert.rejects(() => protectPdf(new Uint8Array([1, 2, 3]), opts('correct-horse')));
  await assert.rejects(() => protectPdf(sample() as unknown as Uint8Array, opts('abc')), /at least 4 characters/);
});
