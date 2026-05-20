// Bundle the Node server (src/main + src/shared) into a single CJS file at out/main/index.cjs.
// npm runtime deps stay external — they're installed locally into node_modules by the launcher,
// which matches the "double-click installs local dependencies" model.

import { build } from 'esbuild'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')
const external = Object.keys(pkg.dependencies ?? {})

await build({
  entryPoints: ['src/main/index.ts'],
  outfile: 'out/main/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external,
  logLevel: 'info'
})
