/**
 * Password-protecting a PDF: what people choose and how it is checked. No PDF library here
 * (the panel and the engine in protect.ts both import it), tested in test/pdf-protect.test.mts.
 *
 * Two different things get called "protection":
 *  - the OPENING password: without it the file can't be read at all (it is encrypted with AES-256);
 *  - PERMISSIONS (no printing, copying or editing): a request that PDF apps are asked to honour. Anyone who
 *    can open the file can also use tools that ignore it, so it is not a lock.
 * The page says this in plain words; only the opening password is described as a lock.
 */

export type ProtectOptions = {
  /** Needed to open the file. */
  password: string;
  /** Ask apps not to allow these (all `false` = no restrictions, the usual choice). */
  block: { printing: boolean; copying: boolean; editing: boolean };
};

export const DEFAULT_PROTECT_OPTIONS: ProtectOptions = { password: '', block: { printing: false, copying: false, editing: false } };

export const MIN_PASSWORD_CHARS = 4;
/**
 * The longest password we accept. The format allows far more, but some PDF tools only take 32 characters
 * (Xpdf's command line does), and a protected file that one of them can't open is worse than a shorter password.
 */
export const MAX_PASSWORD_CHARS = 32;

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function checkPassword(password: string, confirm: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_CHARS) return { ok: false, message: `Use at least ${MIN_PASSWORD_CHARS} characters.` };
  if (password.length > MAX_PASSWORD_CHARS) return { ok: false, message: `Use ${MAX_PASSWORD_CHARS} characters or fewer.` };
  if (password !== confirm) return { ok: false, message: 'The two passwords don’t match.' };
  return { ok: true };
}

/** A rough, honest strength word for the hint. Not a guarantee. */
export function passwordStrength(password: string): 'short' | 'ok' | 'strong' {
  if (password.length < 8) return 'short';
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  return password.length >= 12 && kinds >= 3 ? 'strong' : 'ok';
}

/** "Report" → "Report-protected.pdf" */
export function protectedPdfName(baseName: string): string {
  return `${baseName}-protected.pdf`;
}
