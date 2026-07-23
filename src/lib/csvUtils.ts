export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv<T extends object>(rows: T[], columns: string[]): string {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map(c => csvEscape((row as Record<string, unknown>)[c])).join(','))
  return '﻿' + lines.join('\n')
}
