/**
 * RFC 4180 CSV serialisation, shared by the blotter and the audit exporter.
 *
 * Quoting is not optional in this codebase: rejection reasons and audit
 * summaries contain commas, and an export that silently gains a column is the
 * kind of bug that surfaces months later in someone's reconciliation.
 */

/**
 * Leading characters a spreadsheet interprets as a formula. A string field
 * starting with one is prefixed with an apostrophe (the OWASP mitigation), so
 * a crafted value in localStorage cannot become `=cmd(...)` when the exported
 * trail is opened in Excel. Numbers are exempt — `-1204.5` is data, and only
 * strings can carry a payload.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

/** Escapes one field, doubling embedded quotes per RFC 4180. */
export function csvField(value: string | number | boolean): string {
  let text = String(value)
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) {
    text = `'${text}`
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Serialises a header and rows. Every row must match the header's width. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean)[])[]
): string {
  const lines = [headers.map(csvField).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvField).join(','))
  }
  return lines.join('\n')
}
