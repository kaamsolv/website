/**
 * Case conversions for the Case Converter. Framework-free.
 */

export type CaseId =
  | 'sentence'
  | 'lower'
  | 'upper'
  | 'title'
  | 'capitalized'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant';

export const CASES: { id: CaseId; label: string; example: string }[] = [
  { id: 'sentence', label: 'Sentence case', example: 'The quick brown fox. It jumps.' },
  { id: 'lower', label: 'lower case', example: 'the quick brown fox' },
  { id: 'upper', label: 'UPPER CASE', example: 'THE QUICK BROWN FOX' },
  { id: 'title', label: 'Title Case', example: 'The Quick Brown Fox of the Year' },
  { id: 'capitalized', label: 'Capitalize Every Word', example: 'The Quick Brown Fox Of The Year' },
  { id: 'camel', label: 'camelCase', example: 'theQuickBrownFox' },
  { id: 'pascal', label: 'PascalCase', example: 'TheQuickBrownFox' },
  { id: 'snake', label: 'snake_case', example: 'the_quick_brown_fox' },
  { id: 'kebab', label: 'kebab-case', example: 'the-quick-brown-fox' },
  { id: 'constant', label: 'CONSTANT_CASE', example: 'THE_QUICK_BROWN_FOX' },
];

/** Short words kept lower case inside a title (common style-guide set). */
const TITLE_MINOR_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs',
]);

const capitalize = (word: string) => word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();

/** Capitalise each word; `minor` words stay lower case unless first or last. */
function titleLike(text: string, keepMinorLower: boolean): string {
  return text
    .split('\n')
    .map((line) => {
      const parts = line.split(/(\s+)/);
      const wordIdx = parts.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i >= 0);
      const first = wordIdx[0];
      const last = wordIdx[wordIdx.length - 1];
      return parts
        .map((part, i) => {
          if (!/\S/.test(part)) return part;
          const lower = part.toLocaleLowerCase();
          const bare = lower.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
          if (keepMinorLower && i !== first && i !== last && TITLE_MINOR_WORDS.has(bare)) return lower;
          // Capitalise the first letter even after an opening quote or bracket.
          return lower.replace(/\p{L}/u, (ch) => ch.toLocaleUpperCase());
        })
        .join('');
    })
    .join('\n');
}

function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase();
  return (
    lower
      // First letter of the text, of each line, and after . ! ? (plus closing quotes/brackets).
      .replace(/(^|[.!?]["')\]]*\s+|\n\s*)(\p{L})/gu, (_, lead: string, ch: string) => lead + ch.toLocaleUpperCase())
      // The pronoun "I" on its own, including I'm / I'll / I'd / I've.
      .replace(/(^|[^\p{L}])i(?=$|[^\p{L}]|'[a-z])/gu, (_, lead: string) => `${lead}I`)
  );
}

/** Split into words for programming cases: spaces, punctuation and camelCase humps. */
export function codeWords(text: string): string[] {
  return text
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.toLocaleLowerCase());
}

export function convertCase(text: string, to: CaseId): string {
  switch (to) {
    case 'lower':
      return text.toLocaleLowerCase();
    case 'upper':
      return text.toLocaleUpperCase();
    case 'sentence':
      return sentenceCase(text);
    case 'title':
      return titleLike(text, true);
    case 'capitalized':
      return titleLike(text, false);
    case 'camel': {
      const [first = '', ...rest] = codeWords(text);
      return first + rest.map(capitalize).join('');
    }
    case 'pascal':
      return codeWords(text).map(capitalize).join('');
    case 'snake':
      return codeWords(text).join('_');
    case 'kebab':
      return codeWords(text).join('-');
    case 'constant':
      return codeWords(text).join('_').toLocaleUpperCase();
  }
}
