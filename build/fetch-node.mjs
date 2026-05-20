// Dev helper (run on the developer's machine): download a portable Windows Node.js and unpack it
// into ./node, so the whole folder can be copied to a machine that has no Node installed and still
// run via start.bat. Nothing is installed system-wide.
//
//   node build/fetch-node.mjs            # default version below
//   node build/fetch-node.mjs 22.11.0    # a specific version
//
// Result: node/node.exe, node/npm.cmd, etc. (the "node" folder is gitignored — deliver via zip/USB.)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { get } from 'node:https'
import JSZip from 'jszip'

const VERSION = process.argv[2] || '20.18.1'
const ARCH = 'x64'
const name = `node-v${VERSION}-win-${ARCH}`
const url = `https://nodejs.org/dist/v${VERSION}/${name}.zip`
const outDir = resolve(process.cwd(), 'node')

function download(u) {
  return new Promise((resolveDl, reject) => {
    get(u, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolveDl(download(res.headers.location))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${u}`))
      }
      const chunks = []
      let got = 0
      const total = Number(res.headers['content-length']) || 0
      res.on('data', (c) => {
        chunks.push(c)
        got += c.length
        if (total) process.stdout.write(`\r  downloading… ${(got / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`)
      })
      res.on('end', () => { process.stdout.write('\n'); resolveDl(Buffer.concat(chunks)) })
      res.on('error', reject)
    }).on('error', reject)
  })
}

console.log(`Fetching Node v${VERSION} (win-${ARCH})\n  ${url}`)
const buf = await download(url)

console.log('Unpacking into ./node …')
const zip = await JSZip.loadAsync(buf)
const prefix = `${name}/`
let count = 0
for (const [path, entry] of Object.entries(zip.files)) {
  if (!path.startsWith(prefix)) continue
  const rel = path.slice(prefix.length)
  if (!rel) continue
  const dest = join(outDir, rel)
  if (entry.dir) {
    mkdirSync(dest, { recursive: true })
    continue
  }
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, await entry.async('nodebuffer'))
  count++
}

console.log(`Done — ${count} files in ${outDir}`)
console.log('You can now zip up this whole folder and copy it to a machine without Node.')
