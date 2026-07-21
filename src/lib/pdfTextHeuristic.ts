// Below this, a page is treated as having no usable text layer (a scanned or
// photographed statement page) and gets routed through the vision path
// instead of the text path. Kept in its own zero-dependency module so it's
// testable without pulling in pdfjs-dist.
const MIN_MEANINGFUL_TEXT_LENGTH = 20

export function hasExtractablePageText(text: string): boolean {
  return text.trim().length >= MIN_MEANINGFUL_TEXT_LENGTH
}
