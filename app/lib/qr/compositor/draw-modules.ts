import type { EyeShape, ModuleShape } from '../design';
import { isFinderModule, type QrMatrix } from '../matrix';

export type ModuleDrawOp = {
  kind: 'square' | 'roundRect' | 'circle';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
};

function shapeForCell(
  moduleShape: ModuleShape,
  eyeShape: EyeShape,
  isFinder: boolean,
): ModuleDrawOp['kind'] {
  const shape = isFinder ? eyeShape : moduleShape;
  if (shape === 'dots') return 'circle';
  if (shape === 'rounded') return 'roundRect';
  return 'square';
}

export function buildModuleOps(
  matrix: QrMatrix,
  quietZone: number,
  modulePx: number,
  offsetX: number,
  offsetY: number,
  moduleShape: ModuleShape,
  eyeShape: EyeShape,
): ModuleDrawOp[] {
  const ops: ModuleDrawOp[] = [];
  const size = matrix.size;
  const gap = moduleShape === 'dots' ? 0.22 : moduleShape === 'rounded' ? 0.08 : 0.02;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!matrix.data[row * size + col]) continue;
      const finder = isFinderModule(row, col, size);
      const kind = shapeForCell(moduleShape, eyeShape, finder);
      const px = offsetX + (col + quietZone) * modulePx;
      const py = offsetY + (row + quietZone) * modulePx;
      const inset = modulePx * gap;
      const w = modulePx - inset * 2;
      const h = modulePx - inset * 2;
      const x = px + inset;
      const y = py + inset;

      if (kind === 'circle') {
        const d = Math.min(w, h);
        ops.push({ kind, x: x + (w - d) / 2, y: y + (h - d) / 2, w: d, h: d });
      } else if (kind === 'roundRect') {
        ops.push({ kind, x, y, w, h, r: Math.min(w, h) * 0.28 });
      } else {
        ops.push({ kind: 'square', x, y, w, h });
      }
    }
  }
  return ops;
}
