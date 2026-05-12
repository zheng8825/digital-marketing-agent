// "Documents" the marketer uploads (PPT / Word / PDF / text) for the agent to read & answer about —
// a lightweight NotebookLM-style sources box. Files land in <workspace>/uploads/:
//   - the original file
//   - for Office files, a .md sidecar with the extracted text (what the agent actually reads)
//   - _index.md   — a table the agent reads to know what's available and which file to open
//   - .docs.json  — metadata for the UI (hidden from the agent)
// The agent's cwd is the workspace, so it reads e.g. `uploads/my-deck.pptx.md` with its normal Read tool.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { UploadedDoc } from '../shared/types'
import { getWorkspaceDir } from './workspace'
import { extractDocument, kindForExt } from './doc-extract'

const SUBDIR = 'uploads'
const META = '.docs.json'
const INDEX = '_index.md'

export function getUploadsDir(): string {
  const dir = join(getWorkspaceDir(), SUBDIR)
  mkdirSync(dir, { recursive: true })
  return dir
}

function metaFile(): string {
  return join(getUploadsDir(), META)
}

export function listDocs(): UploadedDoc[] {
  try {
    const arr = JSON.parse(readFileSync(metaFile(), 'utf8'))
    return Array.isArray(arr) ? (arr as UploadedDoc[]) : []
  } catch {
    return []
  }
}

function writeMeta(docs: UploadedDoc[]): void {
  writeFileSync(metaFile(), JSON.stringify(docs, null, 2), 'utf8')
}

function sanitizeBase(name: string, ext: string): string {
  let b = basename(name, ext).normalize('NFC').replace(/[^\w \-.()]+/g, '_').replace(/[_\s]{2,}/g, ' ').trim()
  if (!b || b === '.' || b === '..') b = 'file'
  return b.slice(0, 80)
}

function uniqueStoredName(base: string, ext: string): string {
  const dir = getUploadsDir()
  const taken = new Set(listDocs().map((d) => d.id.toLowerCase()))
  let candidate = `${base}${ext}`
  let n = 2
  while (existsSync(join(dir, candidate)) || taken.has(candidate.toLowerCase())) {
    candidate = `${base} (${n})${ext}`
    n++
  }
  return candidate
}

const KIND_LABEL: Record<UploadedDoc['kind'], string> = {
  word: 'Word', powerpoint: 'PowerPoint', excel: 'Excel', pdf: 'PDF', text: 'Text', other: 'File'
}

export function rewriteIndex(): void {
  const docs = listDocs()
  const lines: string[] = [
    '# Uploaded documents',
    '',
    'The marketer uploaded these files for you to read and answer questions about. They live in this',
    '`uploads/` folder. **To use one, open the file under "read this" with your Read tool** — for Word/',
    'PowerPoint/Excel that is the `.md` next to the original (it holds the extracted text); for PDFs and',
    'text files it is the file itself. When she asks about "the deck" / "the document" / "this file",',
    'read the relevant one(s) first and answer grounded in them — say which file (and slide/section) you',
    "are drawing from. If it's unclear which document she means, list what's here and ask.",
    ''
  ]
  if (docs.length === 0) {
    lines.push('_(nothing uploaded yet)_')
  } else {
    lines.push('| # | file | type | read this | added | notes |', '|---|---|---|---|---|---|')
    docs.forEach((d, i) => {
      const added = new Date(d.addedAt).toISOString().slice(0, 16).replace('T', ' ')
      const readCol = d.unsupported ? '— (cannot be read)' : `\`${d.agentPath}\``
      lines.push(`| ${i + 1} | ${d.name} | ${KIND_LABEL[d.kind]} | ${readCol} | ${added} | ${d.note} |`)
    })
  }
  lines.push('')
  writeFileSync(join(getUploadsDir(), INDEX), lines.join('\n'), 'utf8')
}

export async function addDoc(originalName: string, buf: Buffer): Promise<UploadedDoc> {
  const dir = getUploadsDir()
  const ext = extname(originalName || '').toLowerCase()
  const stored = uniqueStoredName(sanitizeBase(originalName || 'file', ext), ext)
  writeFileSync(join(dir, stored), buf)

  const res = await extractDocument(buf, ext)
  let agentRel = `${SUBDIR}/${stored}`
  let converted = false
  if (res.text !== undefined) {
    const sidecar = `${stored}.md`
    const header = `> Extracted text from the uploaded ${KIND_LABEL[kindForExt(ext)]} file **${originalName}**. The original is at \`${SUBDIR}/${stored}\`.\n\n`
    writeFileSync(join(dir, sidecar), header + (res.text || '_(no extractable text found in this file)_') + '\n', 'utf8')
    agentRel = `${SUBDIR}/${sidecar}`
    converted = true
  }

  const doc: UploadedDoc = {
    id: stored,
    name: originalName || stored,
    agentPath: agentRel,
    kind: kindForExt(ext),
    size: buf.length,
    addedAt: Date.now(),
    converted,
    unsupported: !!res.unsupported,
    note: res.note
  }
  const docs = listDocs()
  docs.unshift(doc)
  writeMeta(docs)
  rewriteIndex()
  return doc
}

export function deleteDoc(id: string): void {
  const dir = getUploadsDir()
  const docs = listDocs()
  const doc = docs.find((d) => d.id === id)
  writeMeta(docs.filter((d) => d.id !== id))
  if (doc) {
    for (const p of [join(dir, doc.id), join(dir, `${doc.id}.md`)]) {
      try {
        if (existsSync(p) && statSync(p).isFile()) rmSync(p)
      } catch {
        /* ignore */
      }
    }
  }
  rewriteIndex()
}
