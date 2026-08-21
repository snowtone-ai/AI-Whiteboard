#!/usr/bin/env node
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const requiredDirectories = [
  'docs',
  'scripts',
  '.claude',
  '.codex',
  '.github/workflows',
  'apps/extension',
  'packages/core',
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

const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
const frontendFrameworks = [
  'react',
  'vue',
  'svelte',
  'solid-js',
  'next',
  'nuxt',
  'astro',
  '@angular/core',
]
const hasUiSurface = fs.existsSync(path.join(root, 'DESIGN.md'))
  || frontendFrameworks.some((dependency) => dependency in dependencies)

function ensureChromeDevtoolsMcp() {
  const mcpPath = path.join(root, '.mcp.json')
  const config = fs.existsSync(mcpPath) ? JSON.parse(fs.readFileSync(mcpPath, 'utf8')) : {}
  config.mcpServers ??= {}
  if (config.mcpServers['chrome-devtools']) return

  config.mcpServers['chrome-devtools'] = {
    command: 'npx',
    args: ['chrome-devtools-mcp@latest'],
  }
  fs.writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`)
  console.log('[setup] added project-scoped chrome-devtools MCP')
}

function runNpx(args) {
  const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npx'
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npx', ...args] : args
  return spawnSync(executable, commandArgs, { cwd: root, stdio: 'inherit', shell: false })
}

if (hasUiSurface) {
  const impeccableSkills = [
    path.join(root, '.claude', 'skills', 'impeccable', 'SKILL.md'),
    path.join(root, '.agents', 'skills', 'impeccable', 'SKILL.md'),
  ]
  if (!impeccableSkills.every((skill) => fs.existsSync(skill))) {
    const result = runNpx(['impeccable', 'skills', 'install', '-y', '--providers=claude,codex', '--scope=project', '--no-hooks'])
    if (result.error || result.status !== 0) {
      console.error(`[setup] Impeccable install failed${result.error ? `: ${result.error.message}` : ''}`)
      process.exit(1)
    }
  }

  if ('shadcn' in dependencies || '@shadcn/ui' in dependencies) {
    const shadcnSkill = path.join(root, '.claude', 'skills', 'shadcn-ui', 'SKILL.md')
    if (!fs.existsSync(shadcnSkill)) {
      const result = runNpx(['skills', 'add', 'shadcn/ui'])
      if (result.error || result.status !== 0) {
        console.error(`[setup] shadcn/ui skill install failed${result.error ? `: ${result.error.message}` : ''}`)
        process.exit(1)
      }
    }
  }

  ensureChromeDevtoolsMcp()
}

console.log('[setup] foundation ready')
console.log('[setup] next: pnpm install && pnpm verify')
