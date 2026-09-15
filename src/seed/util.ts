/**
 * seed 共通ユーティリティ（richText / 日付 / 座標）
 */

/* ------------------------------------------------------------------ *
 * richText（lexical）
 * ------------------------------------------------------------------ */

type LexicalText = {
  type: 'text'
  text: string
  detail: number
  format: number
  mode: 'normal'
  style: string
  version: 1
}

const textNode = (text: string): LexicalText => ({
  type: 'text',
  text,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  version: 1,
})

const paragraph = (text: string) => ({
  type: 'paragraph',
  version: 1,
  format: '' as const,
  indent: 0,
  direction: 'ltr' as const,
  textFormat: 0,
  textStyle: '',
  children: [textNode(text)],
})

const heading = (text: string, tag: 'h2' | 'h3' = 'h2') => ({
  type: 'heading',
  tag,
  version: 1,
  format: '' as const,
  indent: 0,
  direction: 'ltr' as const,
  children: [textNode(text)],
})

/** 段落の配列から lexical richText を組み立てる */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rich = (...blocks: (string | { h: string })[]): any => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: blocks.map((b) => (typeof b === 'string' ? paragraph(b) : heading(b.h))),
  },
})

/* ------------------------------------------------------------------ *
 * 日付
 * ------------------------------------------------------------------ */

/** 日付アンカー（既定は seed 実行日 00:00 JST 相当の UTC） */
export const anchorDate = (): Date => {
  const override = process.env.SEED_DATE
  if (override) return new Date(`${override}T00:00:00.000Z`)
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86400000)
export const addHours = (d: Date, hours: number): Date => new Date(d.getTime() + hours * 3600000)
export const addMinutes = (d: Date, minutes: number): Date => new Date(d.getTime() + minutes * 60000)
export const iso = (d: Date): string => d.toISOString()
/** YYYY-MM-DD */
export const ymd = (d: Date): string => d.toISOString().slice(0, 10)

/* ------------------------------------------------------------------ *
 * 座標（06-test-data.md 3章）
 * ------------------------------------------------------------------ */

export type LatLng = { lat: number; lng: number }

const EARTH_R = 6378137 // m
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/** 指定方位・距離（m）の地点を返す（小領域の等距円筒近似） */
export const destPoint = (from: LatLng, bearingDeg: number, distanceM: number): LatLng => {
  const b = bearingDeg * D2R
  const dNorth = distanceM * Math.cos(b)
  const dEast = distanceM * Math.sin(b)
  const lat = from.lat + (dNorth / EARTH_R) * R2D
  const lng = from.lng + (dEast / (EARTH_R * Math.cos(from.lat * D2R))) * R2D
  return { lat: round7(lat), lng: round7(lng) }
}

/** 2 点間距離（m） */
export const distanceM = (a: LatLng, b: LatLng): number => {
  const dLat = (b.lat - a.lat) * D2R * EARTH_R
  const dLng = (b.lng - a.lng) * D2R * EARTH_R * Math.cos(((a.lat + b.lat) / 2) * D2R)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/** 2 点間の方位角（度・北基準） */
export const bearing = (a: LatLng, b: LatLng): number => {
  const dLat = (b.lat - a.lat) * D2R * EARTH_R
  const dLng = (b.lng - a.lng) * D2R * EARTH_R * Math.cos(((a.lat + b.lat) / 2) * D2R)
  return (Math.atan2(dLng, dLat) * R2D + 360) % 360
}

/** 始点→終点の線上を t（0..1）進み、法線方向に lateral（m）ずらした地点 */
export const alongWithOffset = (
  from: LatLng,
  to: LatLng,
  t: number,
  lateralM: number,
): LatLng => {
  const brg = bearing(from, to)
  const d = distanceM(from, to) * t
  const on = destPoint(from, brg, d)
  if (lateralM === 0) return on
  return destPoint(on, (brg + 90) % 360, lateralM)
}

export const round7 = (n: number): number => Math.round(n * 1e7) / 1e7
export const M_PER_YARD = 0.9144
export const toYards = (m: number): number => Math.round(m / M_PER_YARD)
export const toMeters = (y: number): number => y * M_PER_YARD

/** 点が多角形（[lat, lng][]）の内部にあるか（ray casting） */
export const pointInPolygon = (p: LatLng, poly: [number, number][]): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i] as [number, number]
    const [yj, xj] = poly[j] as [number, number]
    const intersect =
      yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi + 1e-18) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** 円形ポリゴン（ハザード用） */
export const circlePolygon = (
  center: LatLng,
  radiusM: number,
  points = 8,
  squash = 1,
): [number, number][] => {
  const out: [number, number][] = []
  for (let i = 0; i < points; i++) {
    const a = (360 / points) * i
    const r = radiusM * (i % 2 === 0 ? 1 : squash)
    const p = destPoint(center, a, r)
    out.push([p.lat, p.lng])
  }
  return out
}

/* ------------------------------------------------------------------ *
 * その他
 * ------------------------------------------------------------------ */

export const pad = (n: number, len = 2): string => String(n).padStart(len, '0')

export const chunk = <T>(arr: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size) as T[])
  return out
}

export const yen = (n: number): string => `${n.toLocaleString('en-US')}円`
