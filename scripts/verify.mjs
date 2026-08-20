#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

const requiredPaths = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  '.claude/settings.json',
  '.codex/config.toml',
  'HANDOFF-JA.md',
  'docs/vision.md',
  'tasks.md',
  'docs/state.md',
  'docs/decisions.md',
  'docs/issues.md',
  'docs/repo-map.md',
  'docs/product-research.md',
  'docs/design-system.md',
  'scripts/setup.mjs',
  'scripts/verify.mjs',
  '.github/workflows/ci.yml',
  '.env.example',
  '.gitignore',
  'package.json',
  'pnpm-workspace.yaml',
]

const failures = []
console.log('=== AI Whiteboard verification ===')

for (const file of requiredPaths) {
  const exists = fs.existsSync(file)
  console.log(`${exists ? 'OK     ' : 'MISSING'} ${file}`)
  if (!exists) failures.push(`required:${file}`)
}

if (fs.existsSync('.codex/config.toml') && fs.statSync('.codex/config.toml').size !== 0) {
  console.error('NONEMPTY .codex/config.toml (project override must remain intentionally empty)')
  failures.push('codex-config-not-empty')
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const script of ['lint', 'typecheck', 'test', 'build']) {
  if (typeof packageJson.scripts?.[script] !== 'string') failures.push(`script:${script}`)
}

function run(label, command, args) {
  console.log(`\n--- ${label} ---`)
  const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : command
  const executableArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command, ...args] : args
  const result = spawnSync(executable, executableArgs, {
    stdio: 'inherit',
    shell: false,
  })
  if (result.error || result.status !== 0) {
    console.error(`[verify] ${label} failed${result.error ? `: ${result.error.message}` : ''}`)
    failures.push(label)
  }
}

if (failures.length === 0) {
  run('lint', 'pnpm', ['lint'])
  run('typecheck', 'pnpm', ['typecheck'])
  run('test', 'pnpm', ['test'])
  run('build', 'pnpm', ['build'])
} else {
  console.error('[verify] structural checks failed; product checks were not started')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[verify] failed: ${failure}`)
  process.exit(1)
}

console.log('[verify] all checks passed')
