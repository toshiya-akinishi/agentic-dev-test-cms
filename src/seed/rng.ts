/**
 * 決定的な擬似乱数（mulberry32）
 *
 * 06-test-data.md 冒頭の「乱数は固定シード（SEED=20260915）で決定的に生成し、
 * 何度実行しても同じデータになること」を満たすための実装。
 * `Math.random()` は seed 内で一切使用しない。
 */

/** 文字列 → 32bit ハッシュ（ストリーム分離用） */
export const hashString = (s: string): number => {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export class Rng {
  private state: number

  constructor(seed: number | string) {
    this.state = (typeof seed === 'number' ? seed >>> 0 : hashString(seed)) >>> 0
  }

  /** mulberry32 本体。[0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max] の整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** [min, max) の実数 */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** 小数第 n 位で丸めた実数 */
  round(min: number, max: number, digits = 1): number {
    const f = 10 ** digits
    return Math.round(this.float(min, max) * f) / f
  }

  /** 確率 p で true */
  bool(p = 0.5): boolean {
    return this.next() < p
  }

  /** 配列から 1 件 */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array')
    return arr[Math.floor(this.next() * arr.length)] as T
  }

  /** 重み付き選択 */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let r = this.next() * total
    for (const [value, w] of entries) {
      r -= w
      if (r <= 0) return value
    }
    return entries[entries.length - 1]![0]
  }

  /** Fisher-Yates（非破壊） */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j] as T, a[i] as T]
    }
    return a
  }

  /** 先頭 n 件をランダムに抽出 */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr).slice(0, n)
  }

  /** 標準正規分布（Box-Muller） */
  gauss(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12)
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /** 名前付き子ストリーム（生成順の影響を局所化する） */
  child(name: string): Rng {
    return new Rng((hashString(name) ^ this.state) >>> 0)
  }
}

/** seed 値（環境変数 SEED、既定 20260915） */
export const SEED = Number(process.env.SEED ?? 20260915) || 20260915

/** 機能ごとの独立ストリームを作る */
export const streamFor = (name: string): Rng => new Rng((SEED ^ hashString(name)) >>> 0)
