/**
 * ランキング（要求 1-5, 1-6, 1-7）とホール別エリア統計（要求 1-47）
 */
import type { SeedCtx } from './context'
import { bump } from './context'
import { streamFor } from './rng'
import { iso, yen } from './util'

const RANKING_TYPES = [
  'money',
  'points',
  'rookie',
  'driving_distance',
  'greens_in_regulation',
  'sand_save',
  'putting',
  'scoring_average',
] as const

export const seedRankings = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('rankings')
  const season = ctx.seasons.find((s) => s.year === ctx.today.getUTCFullYear())!

  // isStar・skill を基準にした総合力の高い順（skill が小さいほど強い）
  const byStrength = [...ctx.players].sort((a, b) => a.skill - b.skill)
  // ルーキー候補: スター以外で index が大きい（後発で作成された＝若手扱い）選手
  const rookies = ctx.players.filter((p) => !p.isStar && p.index >= 68)

  for (const type of RANKING_TYPES) {
    const pool = type === 'rookie' ? rookies : byStrength
    const entries = pool.slice(0, Math.min(20, pool.length)).map((p, i) => {
      const rank = i + 1
      const noise = rng.float(-0.6, 0.6)
      let value: number
      let valueLabel: string
      switch (type) {
        case 'money':
          value = Math.max(500_000, Math.round((260_000_000 - i * 11_500_000 + noise * 2_000_000) / 10000) * 10000)
          valueLabel = yen(value)
          break
        case 'points':
          value = Math.max(10, Math.round(980 - i * 38 + noise * 10))
          valueLabel = `${value}pt`
          break
        case 'rookie':
          value = Math.max(10, Math.round(420 - i * 30 + noise * 8))
          valueLabel = `${value}pt`
          break
        case 'driving_distance':
          value = Math.round(300 - i * 1.1 + noise)
          valueLabel = `${value}y`
          break
        case 'greens_in_regulation':
          value = Math.round(Math.min(78, 72 - i * 0.3 + noise))
          valueLabel = `${value}%`
          break
        case 'sand_save':
          value = Math.round(Math.min(70, 62 - i * 0.4 + noise))
          valueLabel = `${value}%`
          break
        case 'putting':
          value = Math.round((28.2 + i * 0.03 + noise * 0.1) * 100) / 100
          valueLabel = `${value.toFixed(2)}`
          break
        case 'scoring_average':
        default:
          value = Math.round((69.5 + i * 0.06 + noise * 0.1) * 100) / 100
          valueLabel = `${value.toFixed(2)}`
          break
      }
      return {
        rank,
        player: p.id,
        value,
        valueLabel,
        events: rng.int(4, 18),
        previousRank: Math.max(1, rank + rng.int(-2, 2)),
      }
    })

    await ctx.payload.create({
      collection: 'rankings',
      data: {
        season: season.id,
        type,
        asOf: iso(ctx.today),
        entries,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'rankings')
  }

  // 前週比表示用の履歴（money のみ 1 件分過去データを追加）
  const prevWeekEntries = byStrength.slice(0, 20).map((p, i) => ({
    rank: i + 1,
    player: p.id,
    value: Math.max(500_000, 250_000_000 - i * 11_000_000),
    valueLabel: yen(Math.max(500_000, 250_000_000 - i * 11_000_000)),
    events: rng.int(4, 16),
  }))
  await ctx.payload.create({
    collection: 'rankings',
    data: {
      season: season.id,
      type: 'money',
      asOf: iso(new Date(ctx.today.getTime() - 7 * 86400000)),
      entries: prevWeekEntries,
    },
    overrideAccess: true,
    depth: 0,
  })
  bump(ctx, 'rankings')
}

/* ------------------------------------------------------------------ *
 * ホール別エリア統計（開催中大会 18H × 7ゾーン = 126件）
 * ------------------------------------------------------------------ */

const ZONES = ['fw_left', 'fw_center', 'fw_right', 'rough_left', 'rough_right', 'bunker', 'green'] as const

export const seedHoleStatistics = async (ctx: SeedCtx): Promise<void> => {
  const rng = streamFor('hole-statistics')
  const live = ctx.tournaments.find((t) => t.kind === 'live')!
  const holes = live.venue.course.holes

  for (const hole of holes) {
    for (const zone of ZONES) {
      const isGreen = zone === 'green'
      const isBunker = zone === 'bunker'
      const birdieRate = Math.round(
        isGreen ? rng.float(28, 45) : isBunker ? rng.float(8, 20) : rng.float(12, 30),
      )
      const parRate = Math.round(Math.max(0, 100 - birdieRate - rng.float(15, 35)))
      const bogeyRate = Math.round(Math.max(0, 100 - birdieRate - parRate))
      const avgStrokes = Math.round((hole.par + (isBunker ? 0.35 : isGreen ? -0.1 : 0.1) + rng.float(-0.15, 0.15)) * 100) / 100
      const sampleSize = rng.int(18, 72)
      await ctx.payload.create({
        collection: 'hole-statistics',
        data: {
          tournament: live.id,
          hole: hole.number,
          zone,
          birdieRate,
          parRate,
          bogeyRate,
          avgStrokes,
          sampleSize,
        },
        overrideAccess: true,
        depth: 0,
      })
      bump(ctx, 'hole-statistics')
    }
  }
}
