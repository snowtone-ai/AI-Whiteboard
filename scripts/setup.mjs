#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredDirectories = [
  'docs',
  'scripts',
  '.claude',
  '.codex',
  '.github/workflows',
  'apps/desktop',
  'packages/contracts',
  'packages/domain',
  'packages/persistence',
  'packages/providers',
]

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`[setup] Node.js 22.12+ is required; found ${process.versions.node}`)
  process.exit(1)
}

for (const directory of requiredDirectories) {
  fs.mkdirSync(path.join(root, directory), { recursive: true })
  console.log(`[setup] ready ${directory}`)
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (!packageJson.packageManager?.startsWith('pnpm@10')) {
  console.error('[setup] package.json must pin pnpm 10 for reproducible workspace commands')
  process.exit(1)
}

console.log('[setup] foundation ready')
console.log('[setup] next: pnpm install && pnpm verify')
