/**
 * Lorem ipsum placeholder text. Framework-free; the random source can be
 * injected so tests are repeatable.
 */

export type LoremUnit = 'paragraphs' | 'sentences' | 'words';

export const LOREM_LIMITS: Record<LoremUnit, { min: number; max: number; default: number }> = {
  paragraphs: { min: 1, max: 50, default: 3 },
  sentences: { min: 1, max: 200, default: 5 },
  words: { min: 1, max: 2000, default: 50 },
};

export const LOREM_OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';

const WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore ' +
  'magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo ' +
  'consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint ' +
  'occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum praesent ' +
  'sagittis mauris vitae ultricies leo integer malesuada nunc vel risus commodo viverra maecenas accumsan ' +
  'lacus vel facilisis volutpat est velit egestas dui pellentesque habitant morbi tristique senectus netus'
).split(' ');

export type LoremOptions = {
  unit: LoremUnit;
  count: number;
  startWithLorem: boolean;
  /** Wrap each paragraph in <p></p> (paragraph mode only). */
  html: boolean;
};

type Rng = () => number;

const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng: Rng) => WORDS[Math.floor(rng() * WORDS.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sentence(rng: Rng): string {
  const n = between(rng, 6, 14);
  const words = Array.from({ length: n }, () => pick(rng));
  // An occasional comma reads more like real text.
  if (n > 8 && rng() < 0.5) words[between(rng, 3, n - 3)] += ',';
  return `${cap(words.join(' '))}.`;
}

function sentences(rng: Rng, n: number, startWithLorem: boolean): string[] {
  const out = Array.from({ length: n }, () => sentence(rng));
  if (startWithLorem && out.length > 0) out[0] = `${LOREM_OPENING}.`;
  return out;
}

export function clampCount(unit: LoremUnit, count: number): number {
  const { min, max, default: d } = LOREM_LIMITS[unit];
  if (!Number.isFinite(count)) return d;
  return Math.min(max, Math.max(min, Math.round(count)));
}

export function generateLorem(options: LoremOptions, rng: Rng = Math.random): string {
  const count = clampCount(options.unit, options.count);

  if (options.unit === 'words') {
    const words = Array.from({ length: count }, () => pick(rng));
    if (options.startWithLorem) {
      LOREM_OPENING.replace(',', '').toLowerCase().split(' ').slice(0, count).forEach((w, i) => (words[i] = w));
    }
    return `${cap(words.join(' '))}.`;
  }

  if (options.unit === 'sentences') {
    return sentences(rng, count, options.startWithLorem).join(' ');
  }

  const paragraphs = Array.from({ length: count }, (_, i) =>
    sentences(rng, between(rng, 4, 7), options.startWithLorem && i === 0).join(' '),
  );
  return options.html ? paragraphs.map((p) => `<p>${p}</p>`).join('\n') : paragraphs.join('\n\n');
}
