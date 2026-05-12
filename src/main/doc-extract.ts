// Extract readable text from an uploaded document so the agent (which reads files in agent-workspace/
// with its normal Read tool) can use it. Office formats (.docx/.pptx/.xlsx) get converted to a sidecar
// .md; PDFs and plain-text-ish files are left as-is (Claude Code reads PDFs natively and text directly).
//
// Pure-JS only (mammoth + jszip) so electron-builder packaging stays simple — no native deps.

import mammoth from 'mammoth'
import JSZip from 'jszip'

export type DocKind = 'word' | 'powerpoint' | 'excel' | 'pdf' | 'text' | 'other'

export function kindForExt(ext: string): DocKind {
  switch (ext.toLowerCase()) {
    case '.docx':
    case '.doc':
      return 'word'
    case '.pptx':
    case '.ppt':
      return 'powerpoint'
    case '.xlsx':
    case '.xls':
    case '.csv':
      return ext.toLowerCase() === '.csv' ? 'text' : 'excel'
    case '.pdf':
      return 'pdf'
    case '.txt':
    case '.md':
    case '.markdown':
    case '.json':
    case '.html':
    case '.htm':
    case '.rtf':
      return 'text'
    default:
      return 'other'
  }
}

export interface ExtractResult {
  /** Extracted plain text/markdown — set when we converted the file to a sidecar. */
  text?: string
  /** True when the original file is already agent-readable as-is (PDF / text) — no sidecar needed. */
  passthrough: boolean
  /** Short note for the UI / index (what happened, or why it couldn't be read). */
  note: string
  /** True when the file can't be used at all (unsupported binary format). */
  unsupported?: boolean
}

const A_T = /<a:t>([\s\S]*?)<\/a:t>/g // a text run in DrawingML (used by .pptx slides & notes)

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

function textRunsFromXml(xml: string): string {
  const out: string[] = []
  let m: RegExpExecArray | null
  A_T.lastIndex = 0
  while ((m = A_T.exec(xml)) !== null) out.push(decodeXmlEntities(m[1]))
  return out.join(' ').replace(/[ \t]+/g, ' ').trim()
}

/** Numeric sort of files like "slide2.xml" < "slide10.xml". */
function slideNo(path: string): number {
  const m = /(\d+)\.xml$/.exec(path)
  return m ? Number(m[1]) : 0
}

async function extractPptx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNo(a) - slideNo(b))
  const notePaths = new Set(Object.keys(zip.files).filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)))
  const parts: string[] = []
  for (let i = 0; i < slidePaths.length; i++) {
    const n = i + 1
    const slideXml = await zip.file(slidePaths[i])!.async('string')
    const body = textRunsFromXml(slideXml)
    let block = `## Slide ${n}\n\n${body || '(no text on this slide)'}`
    const notePath = `ppt/notesSlides/notesSlide${slideNo(slidePaths[i])}.xml`
    if (notePaths.has(notePath)) {
      const noteXml = await zip.file(notePath)!.async('string')
      const notes = textRunsFromXml(noteXml).replace(new RegExp(`^${n}\\s*`), '').trim()
      if (notes) block += `\n\n_Speaker notes:_ ${notes}`
    }
    parts.push(block)
  }
  return parts.join('\n\n---\n\n')
}

async function extractXlsx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  // shared strings
  const shared: string[] = []
  const ssFile = zip.file('xl/sharedStrings.xml')
  if (ssFile) {
    const ssXml = await ssFile.async('string')
    const SI = /<si>([\s\S]*?)<\/si>/g
    let m: RegExpExecArray | null
    while ((m = SI.exec(ssXml)) !== null) {
      const txt = (m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ''))).join('')
      shared.push(txt)
    }
  }
  const sheetPaths = Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort((a, b) => slideNo(a) - slideNo(b))
  const colToIdx = (ref: string): number => {
    const c = (ref.match(/^[A-Z]+/) ?? ['A'])[0]
    let n = 0
    for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64)
    return n - 1
  }
  const parts: string[] = []
  for (let s = 0; s < sheetPaths.length; s++) {
    const xml = await zip.file(sheetPaths[s])!.async('string')
    const rows: string[][] = []
    const ROW = /<row[^>]*>([\s\S]*?)<\/row>/g
    let rm: RegExpExecArray | null
    while ((rm = ROW.exec(xml)) !== null) {
      const cells: string[] = []
      const CELL = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g
      let cm: RegExpExecArray | null
      while ((cm = CELL.exec(rm[1])) !== null) {
        const attrs = cm[1] ?? cm[3] ?? ''
        const inner = cm[2] ?? ''
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) ?? [, ''])[1] as string
        const type = (attrs.match(/t="([^"]+)"/) ?? [, ''])[1] as string
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/)
        const isMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)
        let val = ''
        if (type === 's' && vMatch) val = shared[Number(vMatch[1])] ?? ''
        else if (type === 'inlineStr' && isMatch) val = decodeXmlEntities(isMatch[1])
        else if (vMatch) val = decodeXmlEntities(vMatch[1])
        const idx = ref ? colToIdx(ref) : cells.length
        while (cells.length < idx) cells.push('')
        cells[idx] = val.replace(/\r?\n/g, ' ').trim()
      }
      rows.push(cells)
    }
    const csv = rows.filter((r) => r.some((c) => c !== '')).map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
    parts.push(`## Sheet ${s + 1}\n\n\`\`\`csv\n${csv}\n\`\`\``)
  }
  return parts.join('\n\n')
}

export async function extractDocument(buf: Buffer, ext: string): Promise<ExtractResult> {
  const e = ext.toLowerCase()
  try {
    if (e === '.docx') {
      const r = await mammoth.extractRawText({ buffer: buf })
      return { text: r.value.trim(), passthrough: false, note: 'Word document — converted to text.' }
    }
    if (e === '.pptx') {
      const text = await extractPptx(buf)
      return { text, passthrough: false, note: 'PowerPoint — converted to text (slide by slide, with speaker notes).' }
    }
    if (e === '.xlsx') {
      const text = await extractXlsx(buf)
      return { text, passthrough: false, note: 'Excel — converted to CSV per sheet.' }
    }
    if (e === '.pdf') return { passthrough: true, note: 'PDF — the agent reads it directly.' }
    if (kindForExt(e) === 'text') return { passthrough: true, note: 'Text file — the agent reads it directly.' }
    if (e === '.doc' || e === '.ppt' || e === '.xls')
      return { passthrough: false, unsupported: true, note: 'Old binary Office format — re-save as .docx / .pptx / .xlsx or export to PDF, then upload that.' }
    return { passthrough: true, note: 'Unknown type — kept as-is; the agent will try to read it.' }
  } catch (err) {
    return { passthrough: false, unsupported: true, note: `Couldn't read this file: ${(err as Error).message}` }
  }
}
