import QRCode from 'qrcode';
import type { QrEcLevel } from './types';
import { effectiveErrorCorrection } from './design';
import type { QrDesign } from './design';

export type QrMatrix = {
  size: number;
  /** Row-major module data — `true` = dark module. */
  data: boolean[];
};

export function createMatrix(text: string, errorCorrection: QrEcLevel): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: errorCorrection });
  const data: boolean[] = [];
  for (let i = 0; i < qr.modules.data.length; i += 1) {
    data.push(!!qr.modules.data[i]);
  }
  return { size: qr.modules.size, data };
}

export function createMatrixForDesign(text: string, design: QrDesign): QrMatrix {
  const ec = effectiveErrorCorrection(design.errorCorrection, !!design.logo?.dataUrl);
  return createMatrix(text, ec);
}

export function isFinderModule(row: number, col: number, size: number): boolean {
  if (row < 7 && col < 7) return true;
  if (row < 7 && col >= size - 7) return true;
  if (row >= size - 7 && col < 7) return true;
  return false;
}

export function moduleAt(matrix: QrMatrix, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row >= matrix.size || col >= matrix.size) return false;
  return matrix.data[row * matrix.size + col] ?? false;
}
