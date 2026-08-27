/**
 * Real client-side export. The prototype has no backend, so these produce an
 * actual downloaded file rather than a toast that claims one was queued.
 *
 * - CSV  → UTF-8 with a BOM, so Excel opens Indian names and ₹ correctly.
 * - XLS  → an HTML table with an .xls extension. Excel and LibreOffice both
 *          open it and keep column formatting; no dependency required.
 * - PDF  → a print window with a clean stylesheet, printed to PDF by the OS
 *          dialog. Server-side WeasyPrint replaces this in the real system.
 */

export type ExportFormat = 'xlsx' | 'csv' | 'pdf'

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function cell(v: string | number | null | undefined) {
  return v === null || v === undefined ? '' : String(v)
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Download raw CSV text as a real .csv file (BOM prefixed for Excel). */
export function downloadCsv(filename: string, csv: string) {
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), filename)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toCsv<T>(columns: ExportColumn<T>[], rows: T[]) {
  const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = [columns.map((c) => esc(c.header)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => esc(cell(c.value(r)))).join(','))
  return lines.join('\r\n')
}

function toTable<T>(title: string, columns: ExportColumn<T>[], rows: T[], meta: string) {
  const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('')
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(cell(c.value(r)))}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <p class="meta">${escapeHtml(title)} · ${escapeHtml(meta)}</p>`
}

/** Exports the given rows. Returns the number of rows written. */
export function exportRows<T>(
  format: ExportFormat,
  filename: string,
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
): number {
  const meta = `${rows.length} rows · exported ${new Date().toLocaleString('en-IN')} · SSB ERP`
  const base = `${filename}-${stamp()}`

  if (format === 'csv') {
    // The BOM is what makes Excel read it as UTF-8 rather than ANSI.
    download(new Blob(['﻿' + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' }), `${base}.csv`)
    return rows.length
  }

  const style = `
    body{font-family:'Segoe UI',Inter,system-ui,sans-serif;font-size:11px;color:#0f172a;margin:24px}
    h1{font-size:16px;margin:0 0 2px}
    .sub{color:#64748b;font-size:10px;margin:0 0 14px}
    table{border-collapse:collapse;width:100%}
    th{background:#f1f5f9;border:1px solid #cbd5e1;padding:5px 7px;text-align:left;font-size:10px;
       text-transform:uppercase;letter-spacing:.03em;color:#475569}
    td{border:1px solid #e2e8f0;padding:4px 7px;vertical-align:top}
    tr:nth-child(even) td{background:#f8fafc}
    .meta{margin-top:10px;color:#94a3b8;font-size:9px}
    @page{size:A4 landscape;margin:12mm}
  `

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${style}</style></head><body>
    <h1>${escapeHtml(title)}</h1><p class="sub">SSB Industries Pvt Ltd · ${escapeHtml(meta)}</p>
    ${toTable(title, columns, rows, meta)}</body></html>`

  if (format === 'xlsx') {
    download(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${base}.xls`)
    return rows.length
  }

  // PDF — hand the styled document to the browser's print-to-PDF.
  const w = window.open('', '_blank', 'width=1100,height=760')
  if (!w) throw new Error('Pop-up blocked. Allow pop-ups for this site to print or save as PDF.')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 250)
  return rows.length
}

/**
 * Builds export columns straight from a DataTable column definition, so a list
 * screen wires up its export in one line and the file matches what is on screen.
 */
export function columnsFromTable<T>(
  cols: { key: string; header: unknown; accessor?: (row: T) => string | number | null | undefined }[],
): ExportColumn<T>[] {
  return cols
    .filter((c) => typeof c.header === 'string' && c.header !== '')
    .map((c) => ({
      header: c.header as string,
      value: (row: T) =>
        c.accessor ? c.accessor(row) : ((row as Record<string, unknown>)[c.key] as string | number | null | undefined),
    }))
}
