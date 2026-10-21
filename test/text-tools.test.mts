import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countCharacters,
  countCharactersNoSpaces,
  countLines,
  countParagraphs,
  countSentences,
  countWords,
  formatDuration,
  textStats,
} from '../app/lib/text/count.ts';
import { codeWords, convertCase } from '../app/lib/text/case.ts';
import { cleanText, DEFAULT_CLEAN_OPTIONS, type CleanOptions } from '../app/lib/text/clean.ts';
import { clampCount, generateLorem, LOREM_OPENING } from '../app/lib/text/lorem.ts';

// ---------- counting ----------

test('words follow the Word rule: punctuation-joined tokens are one word', () => {
  assert.equal(countWords("Don't stop — it's a well-known 3.5% rise!"), 7);
  assert.equal(countWords('hello-world e-mail'), 2);
  assert.equal(countWords('  spaced   out\n\nwords\t here '), 4);
  assert.equal(countWords('— … !!'), 0);
  assert.equal(countWords(''), 0);
});

test('words in Hindi and Tamil count by spaces; Chinese / Japanese by segmenter', () => {
  assert.equal(countWords('नमस्ते दुनिया, आप कैसे हैं?'), 5);
  assert.equal(countWords('வணக்கம் உலகம்'), 2);
  assert.ok(countWords('我喜欢学习中文') >= 3);
  assert.ok(countWords('今日はいい天気です') >= 3);
});

test('characters count what you see: emoji and accents are one each', () => {
  assert.equal(countCharacters('👍🏽'), 1);
  assert.equal(countCharacters('👨‍👩‍👧'), 1);
  assert.equal(countCharacters('é'), 1); // e + combining accent
  assert.equal(countCharacters('नमस्ते'), countCharacters('नमस्ते'));
  assert.equal(countCharacters('a b\nc'), 5);
  assert.equal(countCharactersNoSpaces('a b\nc\t d'), 4);
});

test('sentences, paragraphs and lines', () => {
  assert.equal(countSentences('One. Two! Three? Four'), 4);
  assert.equal(countSentences('...'), 0);
  assert.equal(countParagraphs('First para.\nStill first.\n\nSecond.\n\n\n  \nThird.'), 3);
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a\nb\r\nc'), 3);
});

test('reading and speaking time', () => {
  const s = textStats(Array(476).fill('word').join(' '));
  assert.equal(s.words, 476);
  assert.equal(s.readingSeconds, 120);
  assert.equal(formatDuration(0), '0 sec');
  assert.equal(formatDuration(45), '45 sec');
  assert.equal(formatDuration(200), '3 min 20 sec');
  assert.equal(formatDuration(180), '3 min');
  assert.equal(formatDuration(3900), '1 hr 5 min');
});

// ---------- case ----------

test('upper, lower, sentence case', () => {
  assert.equal(convertCase('Hello World', 'upper'), 'HELLO WORLD');
  assert.equal(convertCase('Hello World', 'lower'), 'hello world');
  assert.equal(
    convertCase('THE BEST DAY. i think i\'m ready! "yes," i said.\nnew line', 'sentence'),
    'The best day. I think I\'m ready! "yes," I said.\nNew line',
  );
});

test('title case keeps minor words small except first and last', () => {
  assert.equal(convertCase('the lord of the rings', 'title'), 'The Lord of the Rings');
  assert.equal(convertCase('WHAT ARE YOU LOOKING AT', 'title'), 'What Are You Looking At');
  assert.equal(convertCase('"a tale of two cities"', 'title'), '"A Tale of Two Cities"');
  assert.equal(convertCase('the lord of the rings', 'capitalized'), 'The Lord Of The Rings');
});

test('programming cases split on spaces, punctuation and camel humps', () => {
  assert.deepEqual(codeWords('parseHTTPResponse code'), ['parse', 'http', 'response', 'code']);
  assert.equal(convertCase('Hello big World', 'camel'), 'helloBigWorld');
  assert.equal(convertCase('hello big world', 'pascal'), 'HelloBigWorld');
  assert.equal(convertCase('Hello, big World!', 'snake'), 'hello_big_world');
  assert.equal(convertCase('helloBigWorld', 'kebab'), 'hello-big-world');
  assert.equal(convertCase('max retry count', 'constant'), 'MAX_RETRY_COUNT');
  assert.equal(convertCase('', 'camel'), '');
});

// ---------- clean ----------

const only = (patch: Partial<CleanOptions>): CleanOptions => ({
  ...Object.fromEntries(Object.keys(DEFAULT_CLEAN_OPTIONS).map((k) => [k, false])),
  ...patch,
}) as CleanOptions;

test('defaults: invisible chars, line-end spaces, double spaces, extra blank lines', () => {
  const messy = '  Hello  world​  \n\n\n\nSecond   line\t\t here.  ';
  assert.equal(cleanText(messy, DEFAULT_CLEAN_OPTIONS), 'Hello world\n\nSecond line here.');
});

test('fix broken lines joins PDF line wraps and rejoins hyphenated words', () => {
  const pdf = 'This sentence was\nbroken across lines by a PDF ex-\nporter.\n\nNew paragraph\nhere.';
  assert.equal(
    cleanText(pdf, only({ joinLines: true })),
    'This sentence was broken across lines by a PDF exporter.\n\nNew paragraph here.',
  );
});

test('one line, quotes, html, duplicates, emoji', () => {
  assert.equal(cleanText('a\n\nb\nc', only({ oneLine: true })), 'a b c');
  assert.equal(cleanText('“Hi,” she said. It’s fine.', only({ quotes: true })), '"Hi," she said. It\'s fine.');
  assert.equal(cleanText('<p>Fish &amp; chips</p><p>Tea<br>Biscuits</p>', only({ html: true })), 'Fish & chips\nTea\nBiscuits\n');
  assert.equal(cleanText('apple\nbanana\napple\n\nbanana', only({ duplicates: true })), 'apple\nbanana\n');
  assert.equal(cleanText('Great job 👍🏽🎉 team 👨‍👩‍👧!', only({ emoji: true, spaces: true })), 'Great job team !');
});

test('cleaning is idempotent with the defaults', () => {
  const once = cleanText('  a  b \n\n\n c ', DEFAULT_CLEAN_OPTIONS);
  assert.equal(cleanText(once, DEFAULT_CLEAN_OPTIONS), once);
});

// ---------- lorem ----------

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('lorem: counts, opening and HTML wrapping', () => {
  const paras = generateLorem({ unit: 'paragraphs', count: 3, startWithLorem: true, html: false }, seeded());
  assert.equal(paras.split('\n\n').length, 3);
  assert.ok(paras.startsWith(`${LOREM_OPENING}.`));

  const html = generateLorem({ unit: 'paragraphs', count: 2, startWithLorem: false, html: true }, seeded());
  assert.equal(html.match(/<p>/g)?.length, 2);
  assert.ok(!html.startsWith('<p>Lorem ipsum dolor sit amet'));

  const words = generateLorem({ unit: 'words', count: 12, startWithLorem: true, html: false }, seeded());
  assert.equal(countWords(words), 12);
  assert.ok(words.startsWith('Lorem ipsum dolor sit amet consectetur adipiscing elit'));

  const three = generateLorem({ unit: 'words', count: 3, startWithLorem: true, html: false }, seeded());
  assert.equal(three, 'Lorem ipsum dolor.');

  const sents = generateLorem({ unit: 'sentences', count: 4, startWithLorem: false, html: false }, seeded());
  assert.equal(countSentences(sents), 4);
});

test('lorem: counts are clamped to sensible limits', () => {
  assert.equal(clampCount('paragraphs', 0), 1);
  assert.equal(clampCount('paragraphs', 999), 50);
  assert.equal(clampCount('words', Number.NaN), 50);
  assert.equal(clampCount('sentences', 7.6), 8);
});
