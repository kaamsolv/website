/**
 * Password-protect a PDF with pdf-lib's AES-256 (PDF 2.0, revision 6). Runs in the browser; the password
 * never leaves it. Works in Node, so it's unit-tested in test/pdf-protect.test.mts, including opening the
 * result with other PDF engines (Xpdf's pdftotext and qpdf via pikepdf) when they are installed.
 */

import { PDFDocument } from '@cantoo/pdf-lib';
import { PdfToolError } from './errors';
import { checkPassword, type ProtectOptions } from './protect-rules';

const LOAD = { updateMetadata: false, parseSpeed: 1500 } as const;
const SAVE = { useObjectStreams: false, objectsPerTick: 1500 } as const;

/** A long random owner password nobody is told: the opening password is the one the person chose. */
function randomOwnerPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function protectPdf(input: Uint8Array, options: ProtectOptions): Promise<Uint8Array> {
  const check = checkPassword(options.password, options.password);
  if (!check.ok) throw new PdfToolError('failed', check.message);
  const doc = await PDFDocument.load(input, LOAD);
  doc.setProducer('KaamSolv (kaamsolv.com)');
  const { printing, copying, editing } = options.block;
  doc.encrypt({
    userPassword: options.password,
    ownerPassword: randomOwnerPassword(),
    algorithm: 'AES-256',
    permissions: {
      printing: printing ? false : 'highResolution',
      copying: !copying,
      modifying: !editing,
      annotating: !editing,
      fillingForms: !editing,
      documentAssembly: !editing,
      // Screen readers keep working whatever else is blocked.
      contentAccessibility: true,
    },
  });
  // A plain object layout (no object streams): the simplest shape for other tools to read.
  return doc.save(SAVE);
}
