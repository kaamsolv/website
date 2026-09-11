import {
  LOGO_FRACTIONS,
  LOGO_MAX_FRACTION,
  MIN_QUIET_ZONE,
  type QrDesign,
  effectiveErrorCorrection,
  logoFraction,
} from './design';
import type { QrMatrix } from './matrix';
import { contrastRatio, isHexColor } from './validate';
import { frameHasCta, resolveCtaText } from './frames';

export type ScanIssueLevel = 'block' | 'warn';

export type ScanIssue = {
  level: ScanIssueLevel;
  code: string;
  message: string;
};

export type ScanabilityReport = {
  canRender: boolean;
  canExport: boolean;
  issues: ScanIssue[];
};

const CONTRAST_BLOCK = 3;
const CONTRAST_WARN = 4;

export function scanabilityReport(
  _matrix: QrMatrix,
  design: QrDesign,
  exportPixelSize?: number,
): ScanabilityReport {
  const issues: ScanIssue[] = [];

  if (!isHexColor(design.colors.fg)) {
    issues.push({ level: 'block', code: 'fg-invalid', message: 'Pick a valid foreground colour.' });
  }

  if (design.colors.transparent) {
    const vsWhite = isHexColor(design.colors.fg) ? contrastRatio(design.colors.fg, '#FFFFFF') : 0;
    if (vsWhite < CONTRAST_BLOCK) {
      issues.push({
        level: 'block',
        code: 'fg-contrast',
        message: 'Foreground and background are too similar — phones may not read this QR.',
      });
    } else if (vsWhite < CONTRAST_WARN) {
      issues.push({
        level: 'warn',
        code: 'fg-contrast-warn',
        message: 'That colour may be hard to scan on a light background.',
      });
    }
    issues.push({
      level: 'warn',
      code: 'transparent-bg',
      message: 'Transparent backgrounds can be harder to scan on dark surfaces.',
    });
  } else {
    if (!isHexColor(design.colors.bg)) {
      issues.push({ level: 'block', code: 'bg-invalid', message: 'Pick a valid background colour.' });
    } else if (isHexColor(design.colors.fg) && contrastRatio(design.colors.fg, design.colors.bg) < CONTRAST_BLOCK) {
      issues.push({
        level: 'block',
        code: 'fg-contrast',
        message: 'Foreground and background are too similar — phones may not read this QR.',
      });
    }
  }

  if (design.quietZoneModules < MIN_QUIET_ZONE) {
    issues.push({
      level: 'block',
      code: 'quiet-zone',
      message: 'The quiet zone is too small for reliable scanning.',
    });
  }

  if (design.logo) {
    const frac = logoFraction(design.logo.size);
    if (frac > LOGO_MAX_FRACTION) {
      issues.push({
        level: 'block',
        code: 'logo-size',
        message: 'That logo is too large — it would cover too much of the QR.',
      });
    }
    const ec = effectiveErrorCorrection(design.errorCorrection, true);
    if (ec !== 'H') {
      issues.push({
        level: 'block',
        code: 'logo-ec',
        message: 'A logo needs High error correction to stay scannable.',
      });
    }
  }

  if (design.modules.shape === 'dots') {
    issues.push({
      level: 'warn',
      code: 'dots-shape',
      message: 'Dot-style modules can be slightly harder to scan — test before you print.',
    });
  }

  if (exportPixelSize !== undefined && exportPixelSize < 512) {
    issues.push({
      level: 'warn',
      code: 'export-small',
      message: 'This size is fine for screens. Use 512px or larger for print.',
    });
  }

  const cta = resolveCtaText(design.frame.id, design.frame.ctaText);
  if (frameHasCta(design.frame.id) && cta && cta.length > 20) {
    issues.push({
      level: 'warn',
      code: 'cta-long',
      message: 'Long CTA text may wrap awkwardly on small prints.',
    });
  }

  const blocks = issues.filter((i) => i.level === 'block');
  return {
    canRender: blocks.length === 0,
    canExport: blocks.length === 0,
    issues,
  };
}

export function primaryBlockMessage(report: ScanabilityReport): string | null {
  const block = report.issues.find((i) => i.level === 'block');
  return block?.message ?? null;
}

export function warningMessages(report: ScanabilityReport): string[] {
  return report.issues.filter((i) => i.level === 'warn').map((i) => i.message);
}
