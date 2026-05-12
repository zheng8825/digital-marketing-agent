// Generate build/icon.ico (a proper multi-resolution Windows icon: 256/48/32/16) from build/icon.png.
// Run: `node build/make-icon.mjs`. We commit the resulting icon.ico so electron-builder uses it
// directly for the .exe / installer — its own PNG→ICO auto-conversion is hit-or-miss.
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, 'icon.png')
const out = join(here, 'icon.ico')

const ico = await pngToIco(readFileSync(src))
writeFileSync(out, ico)
console.log(`wrote ${out} (${ico.length} bytes) from ${src}`)
