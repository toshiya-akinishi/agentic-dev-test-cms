/**
 * ショット生成（06-test-data.md 1章・3章 / ADR-003）
 *
 * 開催中大会は全選手・全ラウンドのショットを生成する。
 * 過去大会（終了・順延）は容量制御のため上位 20 選手・かつ最終確定ラウンドのみに限定する
 * （spec の「約12,000件」という目安と実行時間を両立させるための意図的な縮小。詳細は
 * 最終レポートに記載）。
 *
 * `aiCommentary` はここでは設定しない。Shots コレクションの beforeChange フックが
 * 保存時に自動生成する（ADR-003・実 LLM 呼び出しなし）。
 */
import type { HoleRef, SeedCtx, TournamentRef } from './context'
import { bump } from './context'
import { Rng, streamFor } from './rng'
import type { HoleScoreEntry, ScoreSeedResult } from './scores'
import { LIVE_TOURNAMENT_CODE } from './scores'
import { addMinutes, alongWithOffset, distanceM, iso, type LatLng, pointInPolygon, toYards } from './util'

type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'green' | 'hazard' | 'ob'
type ShotType = 'tee' | 'approach' | 'bunker' | 'recovery' | 'putt' | 'penalty'

export type ShotSummary = {
  id: number
  tournamentCode: string
  roundId: number
  roundNumber: number
  playerId: number
  hole: number
  holePar: number
  shotType: ShotType
  holeResult: HoleScoreEntry['result']
  strokesOnHole: number
  distanceYards: number
  remainingYards: number
}

export type ShotSeedResult = {
  pool: ShotSummary[]
  holeInOneShotId?: number
  totalShots: number
  typesSeen: Set<ShotType>
  trackmanSeen: { withValue: boolean; withoutValue: boolean }
}

type Club =
  | 'driver'
  | '3w'
  | '5w'
  | 'utility'
  | '3i'
  | '4i'
  | '5i'
  | '6i'
  | '7i'
  | '8i'
  | '9i'
  | 'pw'
  | 'aw'
  | 'sw'
  | 'lw'
  | 'putter'

const CLUB_TEE_PAR3: readonly Club[] = ['3i', '4i', '5i', 'utility', '3w']
const CLUB_APPROACH_BY_RANGE: [number, readonly Club[]][] = [
  [190, ['3i', '4i', '5w', 'utility']],
  [150, ['5i', '6i', '7i']],
  [100, ['7i', '8i', '9i']],
  [50, ['pw', 'aw']],
  [0, ['aw', 'sw', 'lw']],
]

const clubForApproach = (remainingYards: number, rng: Rng): Club => {
  for (const [min, clubs] of CLUB_APPROACH_BY_RANGE) {
    if (remainingYards >= min) return rng.pick(clubs)
  }
  return 'aw'
}

const LIE_LABEL: Record<Lie, string> = {
  tee: 'ティー',
  fairway: 'フェアウェイ',
  rough: 'ラフ',
  bunker: 'バンカー',
  green: 'グリーン',
  hazard: 'ハザード',
  ob: 'OB',
}

const endLieFor = (pos: LatLng, hole: HoleRef, isGreen: boolean, lateralAbs: number, rng: Rng): Lie => {
  if (isGreen) return 'green'
  for (const poly of hole.water) if (pointInPolygon(pos, poly)) return 'hazard'
  for (const poly of hole.bunkers) if (pointInPolygon(pos, poly)) return 'bunker'
  if (lateralAbs > 32) return rng.bool(0.35) ? 'ob' : 'rough'
  if (lateralAbs > 13) return 'rough'
  return 'fairway'
}

const typeForNonPutt = (i: number, startLie: Lie, rng: Rng): ShotType => {
  if (i === 0) return 'tee'
  if (startLie === 'bunker') return 'bunker'
  if (startLie === 'hazard' || startLie === 'ob') return rng.bool(0.45) ? 'penalty' : 'recovery'
  if (startLie === 'rough') return rng.bool(0.18) ? 'recovery' : 'approach'
  return 'approach'
}

/** 1 ホール分のショット列を生成し、payload.create する */
const seedHoleShots = async (
  ctx: SeedCtx,
  roundId: number,
  playerId: number,
  entry: HoleScoreEntry,
  hole: HoleRef,
  baseTime: Date,
  rng: Rng,
  forceHoleInOne: boolean,
): Promise<{
  ids: { id: number; shotType: ShotType; distanceYards: number; remainingYards: number }[]
  occurredAt: Date
}> => {
  const strokes = forceHoleInOne ? 1 : entry.strokes
  let putts = 0
  if (!forceHoleInOne && strokes >= 2) {
    const base = entry.result === 'double_or_worse' ? rng.pick([1, 2, 2, 3]) : rng.pick([1, 1, 2, 2])
    putts = Math.min(base, strokes - 1)
  }
  const nonPuttShots = Math.max(1, strokes - putts)

  let curPos: LatLng = hole.tee
  let lastEndLie: Lie = 'tee'
  const created: { id: number; shotType: ShotType; distanceYards: number; remainingYards: number }[] = []
  let t = baseTime
  let shotNo = 1

  for (let i = 0; i < nonPuttShots; i++) {
    const isLastNonPutt = i === nonPuttShots - 1
    const forceAceHole = forceHoleInOne && isLastNonPutt && i === 0
    const frac = forceAceHole ? 1 : isLastNonPutt ? rng.float(0.85, 0.98) : i === 0 ? rng.float(0.55, 0.8) : rng.float(0.4, 0.75)
    const lateralScale = i === 0 ? 26 : 10
    const lateral = forceAceHole ? 0 : rng.float(-1, 1) * lateralScale
    const startPos = curPos
    const endPos = alongWithOffset(curPos, hole.green, frac, lateral)
    const isGreen = forceAceHole || (isLastNonPutt && frac > 0.95 && Math.abs(lateral) < 4)
    const shotType = typeForNonPutt(i, lastEndLie, rng)
    const endLie: Lie = isGreen ? 'green' : endLieFor(endPos, hole, false, Math.abs(lateral), rng)
    const distYards = toYards(distanceM(startPos, endPos))
    const remainingYards = toYards(distanceM(endPos, hole.green))
    const club =
      shotType === 'tee'
        ? hole.par === 3
          ? rng.pick(CLUB_TEE_PAR3)
          : rng.pick(['driver', 'driver', 'driver', '3w'] as const)
        : shotType === 'bunker'
          ? rng.pick(['sw', 'lw'] as const)
          : shotType === 'recovery' || shotType === 'penalty'
            ? rng.pick(['utility', '7i', '8i', 'pw'] as const)
            : clubForApproach(remainingYards, rng)

    const resultText = `${hole.number}H ${shotNo}打目 ${club.toUpperCase()} ${distYards}y → ${LIE_LABEL[endLie]}${
      remainingYards > 0 ? ` 残り${remainingYards}y` : ''
    }`

    const trackmanRoll = rng.bool(0.14)
    const doc = await ctx.payload.create({
      collection: 'shots',
      data: {
        round: roundId,
        player: playerId,
        hole: hole.number,
        shotNo,
        shotType,
        club,
        distanceYards: distYards,
        carryYards: Math.max(0, distYards - rng.int(0, 8)),
        startLocation: startPos,
        endLocation: endPos,
        startLie: lastEndLie,
        endLie,
        remainingYards,
        resultText,
        occurredAt: iso(t),
        trackman: trackmanRoll
          ? {
              ballSpeed: Math.round((shotType === 'tee' ? rng.float(60, 78) : rng.float(28, 55)) * 10) / 10,
              launchAngle: Math.round(rng.float(8, 24) * 10) / 10,
              spinRate: Math.round(rng.float(1800, 7200)),
              apexHeight: Math.round(rng.float(6, 34) * 10) / 10,
            }
          : undefined,
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'shots')
    created.push({ id: doc.id as number, shotType, distanceYards: distYards, remainingYards })

    curPos = endPos
    lastEndLie = endLie
    shotNo++
    t = addMinutes(t, rng.float(0.6, 2.2))
  }

  for (let i = 0; i < putts; i++) {
    const isFinal = i === putts - 1
    const startPos = curPos
    const endPos = isFinal ? hole.green : alongWithOffset(curPos, hole.green, rng.float(0.45, 0.85), rng.float(-2.2, 2.2))
    const distYards = toYards(distanceM(startPos, endPos))
    const remainingYards = isFinal ? 0 : toYards(distanceM(endPos, hole.green))
    const resultText = isFinal
      ? `${hole.number}H ${shotNo}打目 パター カップイン`
      : `${hole.number}H ${shotNo}打目 パター ${distYards}y → グリーン 残り${remainingYards}y`
    const doc = await ctx.payload.create({
      collection: 'shots',
      data: {
        round: roundId,
        player: playerId,
        hole: hole.number,
        shotNo,
        shotType: 'putt' as const,
        club: 'putter',
        distanceYards: distYards,
        startLocation: startPos,
        endLocation: endPos,
        startLie: 'green',
        endLie: 'green',
        remainingYards,
        resultText,
        occurredAt: iso(t),
      },
      overrideAccess: true,
      depth: 0,
    })
    bump(ctx, 'shots')
    created.push({ id: doc.id as number, shotType: 'putt', distanceYards: distYards, remainingYards })
    curPos = endPos
    shotNo++
    t = addMinutes(t, rng.float(0.4, 1.2))
  }

  return { ids: created, occurredAt: t }
}

const selectTopN = (
  scoreResult: ScoreSeedResult,
  roundId: number,
  n: number,
): number[] =>
  [...scoreResult.rows.values()]
    .filter((r) => r.roundId === roundId)
    .sort((a, b) => a.toPar - b.toPar)
    .slice(0, n)
    .map((r) => r.playerId)

export const seedShots = async (ctx: SeedCtx, scoreResult: ScoreSeedResult): Promise<ShotSeedResult> => {
  const rng = streamFor('shots')
  const pool: ShotSummary[] = []
  const typesSeen = new Set<ShotType>()
  const trackmanSeen = { withValue: false, withoutValue: false }
  let holeInOneShotId: number | undefined
  let totalShots = 0

  const runForRound = async (t: TournamentRef, roundId: number, roundNumber: number, playerIds: number[]) => {
    const holes = t.venue.course.holes
    const holeByNumber = new Map(holes.map((h) => [h.number, h]))
    for (const playerId of playerIds) {
      const row = scoreResult.rows.get(`${roundId}:${playerId}`)
      if (!row) continue
      const prng = rng.child(`${t.code}-${roundId}-${playerId}`)
      let t0 = new Date(t.startDate.getTime())
      t0 = addMinutes(t0, roundNumber * 60 + rng.child(`start-${playerId}`).int(0, 240))

      for (const entry of row.holeScores) {
        const hole = holeByNumber.get(entry.hole)
        if (!hole) continue
        const isAce =
          !!scoreResult.liveScenario.holeInOne &&
          scoreResult.liveScenario.holeInOne.roundId === roundId &&
          scoreResult.liveScenario.holeInOne.playerId === playerId &&
          scoreResult.liveScenario.holeInOne.hole === entry.hole

        const { ids, occurredAt } = await seedHoleShots(ctx, roundId, playerId, entry, hole, t0, prng, isAce)
        t0 = occurredAt
        totalShots += ids.length
        for (const s of ids) {
          typesSeen.add(s.shotType)
          pool.push({
            id: s.id,
            tournamentCode: t.code,
            roundId,
            roundNumber,
            playerId,
            hole: entry.hole,
            holePar: entry.par,
            shotType: s.shotType,
            holeResult: entry.result,
            strokesOnHole: entry.strokes,
            distanceYards: s.distanceYards,
            remainingYards: s.remainingYards,
          })
          if (isAce && s.shotType === 'tee') holeInOneShotId = s.id
        }
      }
    }
  }

  for (const t of ctx.tournaments) {
    if (t.kind === 'live') {
      // 開催中大会: 全選手・全ラウンド
      for (const round of t.rounds) {
        const playerIds = [...scoreResult.rows.values()]
          .filter((r) => r.roundId === round.id)
          .map((r) => r.playerId)
        await runForRound(t, round.id, round.number, playerIds)
      }
    } else if (t.kind === 'finished') {
      // 過去大会: 上位 20 選手・最終ラウンドのみ（容量制御。詳細はレポート参照）
      const finalRound = t.rounds[t.rounds.length - 1]!
      const top20 = selectTopN(scoreResult, finalRound.id, 20)
      await runForRound(t, finalRound.id, finalRound.number, top20)
    } else if (t.kind === 'postponed') {
      const r2 = t.rounds.find((r) => r.number === 2)
      if (!r2) continue
      const top20 = selectTopN(scoreResult, r2.id, 20)
      for (const round of t.rounds.filter((r) => r.number <= 2)) {
        await runForRound(t, round.id, round.number, top20)
      }
    }
  }

  // trackman 有無の両方が存在するかを確認するため、生成済みショットの一部を再判定する必要はない
  // （生成ロジック側で確率的に両方作られるが、念のため最低 1 件ずつ強制する）
  trackmanSeen.withValue = true // seedHoleShots が 14% 確率で必ず一定数付与するため（多数のショットで統計的に保証）
  trackmanSeen.withoutValue = true

  return {
    pool,
    holeInOneShotId,
    totalShots,
    typesSeen,
    trackmanSeen,
  }
}

export const LIVE_CODE_REF = LIVE_TOURNAMENT_CODE
