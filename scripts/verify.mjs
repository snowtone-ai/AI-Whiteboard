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

function changedFrontendLines() {
  let baseRef = 'HEAD'
  if (process.env.GITHUB_BASE_REF) {
    const remoteBase = `origin/${process.env.GITHUB_BASE_REF}`
    const exists = spawnSync('git', ['rev-parse', '--verify', remoteBase], { stdio: 'ignore', shell: false })
    baseRef = exists.status === 0 ? `${remoteBase}...HEAD` : 'HEAD^'
  }
  const result = spawnSync('git', ['diff', '--unified=0', baseRef, '--', 'apps/extension', 'packages'], {
    encoding: 'utf8',
    shell: false,
  })
  if (result.status !== 0) {
    failures.push('design-token-lint-diff')
    return []
  }
  return result.stdout.split(/\r?\n/).filter((line) => line.startsWith('+') && !line.startsWith('+++'))
}

function runDesignTokenLint() {
  if (!fs.existsSync('DESIGN.md')) return
  const registered = fs.readFileSync('DESIGN.md', 'utf8').match(/`[^`]+`/g)?.map((token) => token.slice(1, -1)) ?? []
  const allowed = new Set(registered)
  const violations = []

  for (const line of changedFrontendLines()) {
    const values = [
      ...(line.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
      ...(line.match(/\b\d+(?:\.\d+)?(?:px|rem|em|ms)\b/g) ?? []),
    ]
    for (const value of values) {
      if (!allowed.has(value)) violations.push(`${value} in ${line.slice(1).trim()}`)
    }
  }

  if (violations.length > 0) {
    console.error('[verify] unregistered design values in changed frontend files:')
    for (const violation of violations) console.error(`  ${violation}`)
    failures.push('design-token-lint')
  }
}

runDesignTokenLint()

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
