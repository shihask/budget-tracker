import { describe, it, expect } from 'vitest'
import { hasExtractablePageText } from './pdfTextHeuristic'

describe('hasExtractablePageText', () => {
  it('treats a real statement line as extractable', () => {
    expect(hasExtractablePageText('01/07/2026  UPI/PAYTM/xxxx  DEBIT  500.00')).toBe(true)
  })

  it('treats an empty page as not extractable (scanned/photographed page)', () => {
    expect(hasExtractablePageText('')).toBe(false)
  })

  it('treats whitespace-only text as not extractable', () => {
    expect(hasExtractablePageText('   \n\n  ')).toBe(false)
  })

  it('treats a couple of stray characters (e.g. a page number) as not extractable', () => {
    expect(hasExtractablePageText('3')).toBe(false)
  })

  it('is a hard threshold right at the boundary', () => {
    expect(hasExtractablePageText('a'.repeat(19))).toBe(false)
    expect(hasExtractablePageText('a'.repeat(20))).toBe(true)
  })
})
