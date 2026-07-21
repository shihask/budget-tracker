// pdfjs-dist (both its main-thread and worker bundles) calls
// Promise.withResolvers() internally — a very recent addition (Safari only
// got it in 17.4, March 2024; older iOS Safari has it as undefined). Calling
// undefined as a function is exactly what produced the "undefined is not a
// function" crash reported live from an iPhone on PDF import. Must be
// imported before pdfjs-dist itself (see pdfExtract.ts) — ESM import
// hoisting means side-effect modules only run in time if listed first.
//
// tsconfig's lib target (ES2023) predates the ES2024 type defs this method
// belongs to — augment the global type rather than bump the lib target
// (which would silently enable other ES2024 APIs never vetted for support).
export {} // forces this file to be treated as a module, required for `declare global` below

declare global {
  interface PromiseConstructor {
    withResolvers?<T>(): {
      promise: Promise<T>
      resolve: (value: T | PromiseLike<T>) => void
      reject: (reason?: unknown) => void
    }
  }
}

if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
}
