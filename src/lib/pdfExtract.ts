import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export { hasExtractablePageText } from './pdfTextHeuristic'

export async function loadPdf(file: Blob): Promise<PDFDocumentProxy> {
  const buf = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data: buf }).promise
}

export async function getPdfPageText(doc: PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await doc.getPage(pageNum)
  const content = await page.getTextContent()
  return content.items.map(item => ('str' in item ? item.str : '')).join(' ')
}

// Renders a page to a JPEG blob for the vision-extraction path — used for
// pages with no usable text layer (scanned/photographed statements).
export async function renderPdfPageToImage(doc: PDFDocumentProxy, pageNum: number, scale = 2): Promise<Blob> {
  const page = await doc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  await page.render({ canvasContext: ctx, viewport, canvas }).promise

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Could not render PDF page')
  return blob
}
