/// <reference lib="webworker" />
/**
 * pdf.js's own worker (parsing and image decoding off the main thread).
 * Importing it is enough: it starts listening when it finds itself in a
 * worker. Bundled as its own file, like ./compress.worker.ts.
 */
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
