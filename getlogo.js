#!/usr/bin/env bun
/**
 * Vendor Logo Downloader
 * Downloads SVG vendor logos from Simple Icons (simpleicons.org)
 *
 * Usage:
 *   bun getlogo.js -get cisco        # Download Cisco logo
 *   bun getlogo.js -get ubiquiti     # Download Ubiquiti logo
 *   bun getlogo.js -list             # List known vendors
 */

import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const LOGOS_DIR = './logos'
const ICONS_CDN = 'https://cdn.simpleicons.org'

async function downloadLogo(slug) {
  // Try the slug directly (without .svg - CDN adds it automatically)
  const url = `${ICONS_CDN}/${slug}`
  const outputDir = path.join(LOGOS_DIR, slug)

  console.error(`  Downloading ${slug}...`)

  const response = await fetch(url)
  if (!response.ok) {
    return null
  }

  const content = await response.text()
  if (!content.trim().startsWith('<svg')) {
    return null
  }

  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true })
  }

  const outputPath = path.join(outputDir, 'logo.svg')
  await writeFile(outputPath, content)
  console.log(`  Saved: ${outputPath}`)

  return outputPath
}

async function tryVariants(name) {
  // Try different slug variants
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const variants = [
    base,
    base.replace(/networks?$/i, ''),
    base.replace(/systems?$/i, ''),
    base.replace(/technologies$/i, ''),
    base.replace(/inc$/i, ''),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i)

  for (const variant of variants) {
    const result = await downloadLogo(variant)
    if (result) return result
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(`Vendor Logo Downloader - Downloads SVG logos from Simple Icons

Usage:
  bun getlogo.js -get "name"    Download logo (tries variants)

Examples:
  bun getlogo.js -get cisco
  bun getlogo.js -get ubiquiti
  bun getlogo.js -get mikrotik
  bun getlogo.js -get hp
  bun getlogo.js -get dell

Browse all icons at: https://simpleicons.org`)
    process.exit(1)
  }

  const [command, value] = args

  if (command === '-get' && value) {
    const result = await tryVariants(value)
    if (!result) {
      console.error(`Logo not found for "${value}"`)
      console.error(`Browse available icons at: https://simpleicons.org`)
      process.exit(1)
    }
  } else {
    console.error('Usage: bun getlogo.js -get <vendor>')
    process.exit(1)
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
