#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

const root = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(root, 'dist')
const watch = process.argv.includes('--watch')

async function copyStaticAssets() {
  await mkdir(distDir, { recursive: true })
  await cp(path.join(root, 'manifest.json'), path.join(distDir, 'manifest.json'))
  await cp(path.join(root, 'src/board/board.html'), path.join(distDir, 'board.html'))
  if (existsSync(path.join(root, 'public/icons'))) {
    await cp(path.join(root, 'public/icons'), path.join(distDir, 'icons'), { recursive: true })
  }
  if (existsSync(path.join(root, 'public/fonts'))) {
    await cp(path.join(root, 'public/fonts'), path.join(distDir, 'fonts'), { recursive: true })
  }
}

const sharedOptions = {
  bundle: true,
  platform: 'browser',
  target: ['chrome109'],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  jsx: 'automatic',
  // Excalidraw's own UI font (Assistant) is referenced via @font-face in its
  // CSS; inlining as a data URL avoids also having to manage it as a copied,
  // web-accessible asset. The larger canvas-text fonts (Excalifont, Xiaolai,
  // ...) are loaded separately at runtime via EXCALIDRAW_ASSET_PATH, not
  // through this CSS, so they stay as plain copied files (see public/fonts).
  loader: { '.css': 'css', '.woff2': 'dataurl' },
  logLevel: 'info',
  // @excalidraw/excalidraw's package.json only exposes its CSS under the
  // "production" export condition (no "browser"/"default" fallback).
  conditions: ['production'],
}

const contentBuild = {
  ...sharedOptions,
  entryPoints: { content: path.join(root, 'src/content/index.ts') },
  outdir: distDir,
  format: 'iife',
}

const boardBuild = {
  ...sharedOptions,
  entryPoints: { board: path.join(root, 'src/board/main.tsx') },
  outdir: distDir,
  format: 'esm',
}

async function run() {
  await rm(distDir, { recursive: true, force: true })
  await copyStaticAssets()

  if (watch) {
    const [contentCtx, boardCtx] = await Promise.all([esbuild.context(contentBuild), esbuild.context(boardBuild)])
    await Promise.all([contentCtx.watch(), boardCtx.watch()])
    console.log('[build] watching for changes (content.js, board.js)')
    return
  }

  await Promise.all([esbuild.build(contentBuild), esbuild.build(boardBuild)])
  console.log('[build] done ->', path.relative(process.cwd(), distDir))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
