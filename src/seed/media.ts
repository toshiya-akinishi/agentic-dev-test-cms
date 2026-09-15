/**
 * メディア生成（06-test-data.md 4章）
 *
 * 外部ネットワークに依存しないよう、画像は seed 実行時に生成する。
 * 単色背景 + テキストの SVG を組み立て、sharp で PNG 化して
 * `payload.create({ collection: 'media', filePath })` で登録する。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

import sharp from 'sharp'
import type { Payload } from 'payload'

import { Rng, hashString } from './rng'

const TMP_DIR = path.join(os.tmpdir(), 'jtour-seed-media')

/** 生成済みメディアの ID キャッシュ（同一キーは 1 度だけ生成する） */
const cache = new Map<string, number>()

export const resetMediaCache = (): void => cache.clear()

export const ensureTmpDir = (): void => {
  fs.mkdirSync(TMP_DIR, { recursive: true })
}

/* ------------------------------------------------------------------ *
 * 配色
 * ------------------------------------------------------------------ */

/** 決定的な HSL パレット（キー文字列から色を決める） */
export const colorFor = (key: string, opts: { s?: number; l?: number } = {}): string => {
  const h = hashString(key) % 360
  const s = opts.s ?? 58
  const l = opts.l ?? 42
  return hslToHex(h, s, l)
}

export const hslToHex = (h: number, s: number, l: number): string => {
  const S = s / 100
  const L = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => {
    const v = L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return Math.round(255 * v)
  }
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

const FONT = "'WenQuanYi Zen Hei','Unifont-JP','DejaVu Sans',sans-serif"

export const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/* ------------------------------------------------------------------ *
 * SVG テンプレート
 * ------------------------------------------------------------------ */

type TextLine = { text: string; size: number; weight?: number; opacity?: number }

/** 単色背景 + 中央テキストの SVG */
export const svgCard = (
  width: number,
  height: number,
  bg: string,
  lines: TextLine[],
  opts: { accent?: string; corner?: string } = {},
): string => {
  const accent = opts.accent ?? 'rgba(255,255,255,0.14)'
  const totalH = lines.reduce((s, l) => s + l.size * 1.35, 0)
  let y = height / 2 - totalH / 2
  const body = lines
    .map((l) => {
      y += l.size * 1.05
      const out = `<text x="${width / 2}" y="${y}" font-family="${FONT}" font-size="${l.size}" font-weight="${
        l.weight ?? 700
      }" fill="#ffffff" fill-opacity="${l.opacity ?? 1}" text-anchor="middle">${esc(l.text)}</text>`
      y += l.size * 0.3
      return out
    })
    .join('')
  const corner = opts.corner
    ? `<text x="${width - 24}" y="${height - 24}" font-family="${FONT}" font-size="${Math.round(
        Math.min(width, height) / 28,
      )}" fill="#ffffff" fill-opacity="0.7" text-anchor="end">${esc(opts.corner)}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <circle cx="${width * 0.82}" cy="${height * 0.18}" r="${Math.min(width, height) * 0.38}" fill="${accent}"/>
  <circle cx="${width * 0.12}" cy="${height * 0.92}" r="${Math.min(width, height) * 0.3}" fill="${accent}"/>
  <rect x="0" y="${height - 8}" width="${width}" height="8" fill="rgba(0,0,0,0.25)"/>
  ${body}${corner}
</svg>`
}

/** 簡易ベクタの会場マップ / コースレイアウト図 */
export const svgMap = (
  width: number,
  height: number,
  title: string,
  rng: Rng,
  holeCount = 18,
): string => {
  const parts: string[] = []
  const cx = width / 2
  const cy = height / 2
  for (let i = 0; i < holeCount; i++) {
    const a = ((360 / holeCount) * i - 90) * (Math.PI / 180)
    const r1 = Math.min(width, height) * 0.2
    const r2 = Math.min(width, height) * (0.3 + rng.float(0.05, 0.16))
    const x1 = cx + Math.cos(a) * r1
    const y1 = cy + Math.sin(a) * r1
    const x2 = cx + Math.cos(a) * r2
    const y2 = cy + Math.sin(a) * r2
    parts.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(
        1,
      )}" stroke="#f2f7ef" stroke-width="10" stroke-linecap="round" stroke-opacity="0.85"/>`,
      `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="9" fill="#ffffff"/>`,
      `<text x="${x2.toFixed(1)}" y="${(y2 + 4).toFixed(
        1,
      )}" font-family="${FONT}" font-size="11" font-weight="700" fill="#1f6b3a" text-anchor="middle">${i + 1}</text>`,
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#2f7d4f"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${width * 0.42}" ry="${height * 0.4}" fill="#3f9a62"/>
  <ellipse cx="${cx * 0.7}" cy="${cy * 1.2}" rx="${width * 0.12}" ry="${height * 0.09}" fill="#4d9ed6"/>
  ${parts.join('\n  ')}
  <text x="32" y="52" font-family="${FONT}" font-size="30" font-weight="700" fill="#ffffff">${esc(title)}</text>
</svg>`
}

/* ------------------------------------------------------------------ *
 * 生成 & アップロード
 * ------------------------------------------------------------------ */

const writePngFromSvg = async (svg: string, file: string): Promise<string> => {
  const out = path.join(TMP_DIR, file)
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out)
  return out
}

export type UploadArgs = {
  payload: Payload
  key: string
  filename: string
  svg: string
  alt: string
  caption?: string
  credit?: string
}

/** SVG を PNG 化して media に登録し、ID を返す（キー単位でキャッシュ） */
export const uploadSvg = async ({
  payload,
  key,
  filename,
  svg,
  alt,
  caption,
  credit,
}: UploadArgs): Promise<number> => {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const filePath = await writePngFromSvg(svg, filename)
  const doc = await payload.create({
    collection: 'media',
    data: { alt, caption, credit: credit ?? 'J-Tour (seed)' },
    filePath,
    overrideAccess: true,
    depth: 0,
  })
  cache.set(key, doc.id as number)
  return doc.id as number
}

/* ------------------------------------------------------------------ *
 * ダミー PDF（4 ページ）
 * ------------------------------------------------------------------ */

/** 依存なしで 4 ページの最小 PDF を組み立てる */
export const buildPdf = (title: string, pages: string[]): Buffer => {
  const objects: string[] = []
  const pageCount = pages.length
  const fontObj = 3 + pageCount * 2
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i * 2} 0 R`).join(' ')

  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`)
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`)

  pages.forEach((body, i) => {
    const contentObj = 4 + i * 2
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`,
    )
    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    const stream = [
      'BT /F1 22 Tf 60 760 Td (' + safe(title) + ') Tj ET',
      'BT /F1 13 Tf 60 715 Td (' + safe(`Page ${i + 1} / ${pageCount}`) + ') Tj ET',
      'BT /F1 12 Tf 60 680 Td (' + safe(body) + ') Tj ET',
      '0.18 0.49 0.31 rg 60 640 475 6 re f',
    ].join('\n')
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`)

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefPos = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

export const uploadPdf = async (
  payload: Payload,
  key: string,
  filename: string,
  title: string,
  pages: string[],
  alt: string,
): Promise<number> => {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const filePath = path.join(TMP_DIR, filename)
  fs.writeFileSync(filePath, buildPdf(title, pages))
  const doc = await payload.create({
    collection: 'media',
    data: { alt, caption: title, credit: 'J-Tour (seed)' },
    filePath,
    overrideAccess: true,
    depth: 0,
  })
  cache.set(key, doc.id as number)
  return doc.id as number
}
