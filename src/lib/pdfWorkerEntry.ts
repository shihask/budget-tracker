// Custom worker entry point, bundled by Vite (see the `?worker&url` import in
// pdfExtract.ts) instead of pointing pdfjs-dist straight at its own prebuilt
// worker file. Workers run in a separate JS realm with their own `Promise`
// constructor — polyfilling Promise.withResolvers on the main thread (see
// promiseWithResolversPolyfill.ts) does NOT reach code running inside the
// worker, and pdfjs-dist's worker bundle calls Promise.withResolvers() near
// the very start of loading any PDF (a class field initializer that runs as
// soon as document loading begins), so this needs its own copy of the
// polyfill, applied before the real worker code below is evaluated.
import './promiseWithResolversPolyfill'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
