/**
 * スコア生成（06-test-data.md 2章「開催中の大会の作り方」を含む）
 *
 * ラウンドごとに 18 ホール分の delta（対パー）を「目標スコアに厳密一致」させる
 * `buildDeltas` を核として、通常選手はランダム目標、開催中大会の主役級選手
 * （優勝争い3名／カットライン4名／ホールインワン）は目標スコアを直接指定して
 * 意図的に作り込む。
 */
import type { HoleRef, SeedCtx } from './context'
import { bump } from './context'
import { Rng, streamFor } from './rng'
import { LIVE_CODE } from './tournaments'

export type HoleResult = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double_or_worse'
export type HoleScoreEntry = {
  hole: number
  par: number
  strokes: number
  toPar: number
  result: HoleResult
}
export type ScoreStatus = 'playing' | 'finished' | 'cut' | 'wd' | 'dq'

export type ScoreRowInfo = {
  scoreId: number
  tournamentCode: string
  roundId: number
  roundNumber: number
  playerId: number
  holeScores: HoleScoreEntry[]
  thru: number
  today: number
  toPar: number
  status: ScoreStatus
}

export type LiveScenario = {
  leaderIds: number[]
  cutlineIds: number[]
  holeInOne: { playerId: number; hole: number; roundId: number; roundNumber: number }
  unfinishedPlayerIds: number[]
  cutlineToPar: number
}

export type ScoreSeedResult = {
  /** tournament.code -> 予選通過した選手 ID 一覧（R3 以降の組み合わせ生成に使用） */
  cutFieldByTournament: Map<string, number[]>
  /** `${roundId}:${playerId}` -> スコア行情報（ショット生成で再利用） */
  rows: Map<string, ScoreRowInfo>
  liveScenario: LiveScenario
}

export const resultOf = (delta: number): HoleResult =>
  delta <= -2 ? 'eagle' : delta === -1 ? 'birdie' : delta === 0 ? 'par' : delta === 1 ? 'bogey' : 'double_or_worse'

/**
 * 1 ホール分の対パー delta を、技量（skill。小さいほど強い）に偏らせた重み付けで 1 つ選ぶ。
 * `buildDeltas`（ラウンド全体を目標スコアに帳尻合わせる版）の核となる分布そのもの。
 * T-10-11（ライブ進行シミュレーションジョブ）が「選手の既存のスコア傾向と矛盾しない
 * もっともらしい delta」を 1 ホールぶんだけ生成する目的でもそのまま再利用する。
 */
export const pickHoleDelta = (skill: number, rng: Rng): number => {
  const entries: (readonly [number, number])[] = [
    [-2, Math.max(0.4, 2.6 - skill * 3.2)],
    [-1, Math.max(1, 20 - skill * 7)],
    [0, 44],
    [1, Math.max(1, 22 + skill * 7)],
    [2, Math.max(0.4, 9 + skill * 5)],
  ]
  return rng.weighted(entries)
}

/** n ホール分の delta を、合計がちょうど target になるよう技量バイアス付きで生成する */
const buildDeltas = (n: number, target: number, skill: number, rng: Rng): number[] => {
  const pick = (): number => pickHoleDelta(skill, rng)
  const deltas = Array.from({ length: n }, pick)
  let sum = deltas.reduce((a, b) => a + b, 0)
  let guard = 0
  while (sum !== target && guard < 600) {
    guard++
    const i = rng.int(0, n - 1)
    if (sum < target && deltas[i]! < 3) {
      deltas[i]!++
      sum++
    } else if (sum > target && deltas[i]! > -2) {
      deltas[i]!--
      sum--
    }
  }
  return deltas
}

const toEntries = (holes: HoleRef[], deltas: number[]): HoleScoreEntry[] =>
  holes.map((h, i) => {
    const toPar = deltas[i]!
    const strokes = Math.max(1, h.par + toPar)
    return { hole: h.number, par: h.par, strokes, toPar: strokes - h.par, result: resultOf(strokes - h.par) }
  })

const sumToPar = (entries: HoleScoreEntry[]): number => entries.reduce((s, e) => s + e.toPar, 0)

/** 1 ホールを強制的に指定 delta にし、合計を他のホールで帳尻合わせする */
const forceHoleDelta = (entries: HoleScoreEntry[], idx: number, newDelta: number, rng: Rng): void => {
  const old = entries[idx]!.toPar
  const e = entries[idx]!
  entries[idx] = { ...e, strokes: e.par + newDelta, toPar: newDelta, result: resultOf(newDelta) }
  let remaining = old - newDelta // このぶんを他ホールに配分し直す
  let guard = 0
  while (remaining !== 0 && guard < 200 && entries.length > 1) {
    guard++
    const j = rng.int(0, entries.length - 1)
    if (j === idx) continue
    const cur = entries[j]!
    const step = remaining > 0 ? 1 : -1
    const next = cur.toPar + step
    if (next < -2 || next > 3) continue
    entries[j] = { ...cur, strokes: cur.par + next, toPar: next, result: resultOf(next) }
    remaining -= step
  }
}

const buildRound = (holes: HoleRef[], target: number, skill: number, rng: Rng): HoleScoreEntry[] =>
  toEntries(holes, buildDeltas(holes.length, target, skill, rng))

/** 標準正規乱数を丸めてラウンド目標スコアを作る（クランプ -9..+9） */
const roundTarget = (skill: number, rng: Rng): number =>
  Math.max(-9, Math.min(9, Math.round(rng.gauss(skill, 2.6))))

export const seedScores = async (ctx: SeedCtx): Promise<ScoreSeedResult> => {
  const rng = streamFor('scores')
  const rows = new Map<string, ScoreRowInfo>()
  const cutFieldByTournament = new Map<string, number[]>()

  let leaderIds: number[] = []
  let cutlineIds: number[] = []
  let holeInOne: LiveScenario['holeInOne'] | undefined
  const unfinishedPlayerIds: number[] = [] // 開催中大会の最終ラウンド未了選手のみを記録する
  let cutlineToPar = 0

  for (const t of ctx.tournaments) {
    if (t.kind === 'cancelled' || t.kind === 'scheduled') continue // 未着手

    const holes = t.venue.course.holes
    const trng = rng.child(t.code)
    const isLive = t.kind === 'live'
    const isPostponed = t.kind === 'postponed'

    // --- ラウンド対象（cut 前は全員、cut 後は通過者のみ）
    const cutRoundNo = t.cutLineAfterRound
    const roundsPlayed = isPostponed ? t.rounds.filter((r) => r.number <= 2) : t.rounds

    // 累計対パー（プレイヤー ID -> 値）
    const cum = new Map<number, number>()
    for (const p of t.field) cum.set(p.id, 0)

    // 開催中大会のシナリオ配役
    const stars = t.field.filter((p) => p.isStar)
    const nonStars = t.field.filter((p) => !p.isStar)
    const liveLeaders = isLive ? [stars[2]!, stars[5]!, stars[9]!] : []
    const liveCutliners = isLive ? [nonStars[18]!, nonStars[24]!, nonStars[29]!, nonStars[34]!] : []
    if (isLive) {
      leaderIds = liveLeaders.map((p) => p.id)
      cutlineIds = liveCutliners.map((p) => p.id)
    }

    let cutFieldIds: number[] = t.field.map((p) => p.id)

    for (const round of roundsPlayed) {
      const afterCut = round.number > cutRoundNo
      const eligible = afterCut
        ? t.field.filter((p) => cutFieldIds.includes(p.id))
        : t.field

      const rrng = trng.child(`r${round.number}`)
      const roundResults = new Map<number, { entries: HoleScoreEntry[]; thru: number; status: ScoreStatus }>()

      // --- 通常ロジック: 全員分のラウンド結果を生成
      for (const p of eligible) {
        const prng = rrng.child(`p${p.id}`)
        const isFinal = round.status === 'finished'
        const thru = isFinal ? 18 : isLive ? prng.int(6, 18) : prng.int(4, 14) // 開催中=最終R進行中 / 順延=中断R
        const target = roundTarget(p.skill, prng)
        const targetForThru = Math.round((target * thru) / 18)
        const entries = buildRound(holes.slice(0, thru), targetForThru, p.skill, prng)
        const status: ScoreStatus = isFinal ? 'finished' : 'playing'
        roundResults.set(p.id, { entries, thru, status })
        if (isLive && afterCut && thru < 18) unfinishedPlayerIds.push(p.id)
      }

      // --- 開催中大会 R1/R2: リーダー・カットライン選手を強制スクリプト化
      if (isLive && !afterCut) {
        if (round.number === 1) {
          const targets = [-6, -5, -6]
          liveLeaders.forEach((p, i) => {
            const prng = rrng.child(`p${p.id}`)
            roundResults.set(p.id, { entries: buildRound(holes, targets[i]!, p.skill, prng), thru: 18, status: 'finished' })
          })
        }
        if (round.number === 2) {
          const targets = [-6, -6, -5] // 累計: -12, -11, -11
          liveLeaders.forEach((p, i) => {
            const prng = rrng.child(`p${p.id}`)
            roundResults.set(p.id, { entries: buildRound(holes, targets[i]!, p.skill, prng), thru: 18, status: 'finished' })
          })
        }
      }

      // 累計加算 + 行の確定
      for (const p of eligible) {
        const r = roundResults.get(p.id)
        if (!r) continue
        const today = sumToPar(r.entries)
        const before = cum.get(p.id) ?? 0
        cum.set(p.id, before + today)
      }

      // --- 開催中大会 R2 終了時点: カットライン ±0 を 4 名に強制する
      // （順延大会の R2 は中断のため round.status !== 'finished' となり、カット判定は行わない）
      const cutRoundComplete = round.number === cutRoundNo && round.status === 'finished'
      if (isLive && cutRoundComplete) {
        // 現時点の分布から自然なカットライン値（46位=CUT_SIZE付近）を採用
        const sorted = [...t.field]
          .map((p) => ({ id: p.id, v: cum.get(p.id) ?? 0 }))
          .sort((a, b) => a.v - b.v)
        const naturalIdx = Math.min(sorted.length - 1, 44)
        const naturalCutline = sorted[naturalIdx]!.v
        cutlineToPar = naturalCutline

        for (const p of liveCutliners) {
          const r1 = rows.get(`${t.rounds[0]!.id}:${p.id}`)
          const r1ToPar = r1 ? r1.toPar : 0
          const need = naturalCutline - r1ToPar
          const prng = rrng.child(`cl${p.id}`)
          const entries = buildRound(holes, need, p.skill, prng)
          roundResults.set(p.id, { entries, thru: 18, status: 'finished' })
          cum.set(p.id, r1ToPar + sumToPar(entries))
        }

        // カットフィールド確定（カットライン以下＝通過）
        cutFieldIds = t.field
          .filter((p) => (cum.get(p.id) ?? Infinity) <= naturalCutline)
          .map((p) => p.id)
      } else if (!isLive && cutRoundComplete) {
        const sorted = [...t.field]
          .map((p) => ({ id: p.id, v: cum.get(p.id) ?? 0 }))
          .sort((a, b) => a.v - b.v)
        const naturalIdx = Math.min(sorted.length - 1, 44)
        const line = sorted[naturalIdx]!.v
        cutFieldIds = t.field.filter((p) => (cum.get(p.id) ?? Infinity) <= line).map((p) => p.id)
      }

      // --- 開催中大会 R3（最終ラウンド・進行中）: 優勝争い・イーグル/ダブルボギー件数を作り込む
      if (isLive && afterCut && round.number === Math.max(...t.rounds.map((r) => r.number))) {
        const leaderThru = [17, 15, 13]
        const leaderTargets = [-2, -1, -2] // 通算: -14, -13, -13(=いずれも2打差以内)
        liveLeaders.forEach((p, i) => {
          const before = (cum.get(p.id) ?? 0) - (roundResults.get(p.id)?.entries.reduce((s, e) => s + e.toPar, 0) ?? 0)
          const prng = rrng.child(`ld${p.id}`)
          const entries = buildRound(holes.slice(0, leaderThru[i]!), leaderTargets[i]!, p.skill, prng)
          roundResults.set(p.id, { entries, thru: leaderThru[i]!, status: 'playing' })
          cum.set(p.id, before + sumToPar(entries))
          unfinishedPlayerIds.push(p.id)
        })

        // ホールインワン: リーダー1（インデックス0）の既プレー済みホールのうち Par3 を強制
        const l0 = liveLeaders[0]!
        const l0res = roundResults.get(l0.id)!
        const par3Idx = holes
          .slice(0, l0res.thru)
          .map((h, i) => ({ h, i }))
          .filter((x) => x.h.par === 3)
        if (par3Idx.length > 0) {
          const idx = par3Idx[0]!.i
          const before = (cum.get(l0.id) ?? 0) - sumToPar(l0res.entries)
          forceHoleDelta(l0res.entries, idx, -(l0res.entries[idx]!.par - 1), rrng.child('ace'))
          cum.set(l0.id, before + sumToPar(l0res.entries))
          holeInOne = { playerId: l0.id, hole: l0res.entries[idx]!.hole, roundId: round.id, roundNumber: round.number }
        }

        // 他のカットフィールド選手が優勝争いの 3 名を上回らないようクランプ
        const bestLeaderTotal = Math.min(
          ...liveLeaders.map((p) => cum.get(p.id) ?? 0),
        )
        for (const p of t.field) {
          if (!cutFieldIds.includes(p.id)) continue
          if (leaderIds.includes(p.id)) continue
          const r = roundResults.get(p.id)
          if (!r) continue
          const total = cum.get(p.id) ?? 0
          if (total < bestLeaderTotal) {
            const before = total - sumToPar(r.entries)
            const prng = rrng.child(`clamp${p.id}`)
            const newTarget = bestLeaderTotal - before + prng.int(1, 4)
            const entries = buildRound(holes.slice(0, r.thru), newTarget, p.skill, prng)
            roundResults.set(p.id, { entries, thru: r.thru, status: r.status })
            cum.set(p.id, before + sumToPar(entries))
          }
        }

        // イーグル4件・ダブルボギー以上15件を満たすまで一般選手のホールを補正
        const tally = () => {
          let eagles = 0
          let doubles = 0
          for (const p of t.field) {
            if (!cutFieldIds.includes(p.id)) continue
            const r = roundResults.get(p.id)
            if (!r) continue
            for (const e of r.entries) {
              if (e.result === 'eagle') eagles++
              if (e.result === 'double_or_worse') doubles++
            }
          }
          return { eagles, doubles }
        }
        const generic = t.field.filter(
          (p) => cutFieldIds.includes(p.id) && !leaderIds.includes(p.id) && p.id !== l0.id,
        )
        let guard = 0
        while (guard < 200) {
          guard++
          const { eagles, doubles } = tally()
          if (eagles >= 4 && doubles >= 15) break
          const p = generic[rrng.int(0, generic.length - 1)]!
          const r = roundResults.get(p.id)
          if (!r || r.entries.length === 0) continue
          const idx = rrng.int(0, r.entries.length - 1)
          const wantEagle = eagles < 4
          const before = (cum.get(p.id) ?? 0) - sumToPar(r.entries)
          // 優勝争いを乱さないよう、十分に離れている選手だけ補正対象にする
          if ((cum.get(p.id) ?? 0) < bestLeaderTotal + 3) continue
          forceHoleDelta(r.entries, idx, wantEagle ? -2 : 2, rrng)
          cum.set(p.id, before + sumToPar(r.entries))
        }
      }

      // --- 行の保存
      for (const p of eligible) {
        const r = roundResults.get(p.id)
        if (!r) continue
        const today = sumToPar(r.entries)
        const toParCum = cum.get(p.id) ?? today

        let status: ScoreStatus = r.status
        if (!isLive && cutRoundComplete && !cutFieldIds.includes(p.id)) status = 'cut'

        const doc = await ctx.payload.create({
          collection: 'scores',
          data: {
            round: round.id,
            player: p.id,
            toPar: toParCum,
            strokes: r.entries.reduce((s, e) => s + e.strokes, 0),
            thru: r.thru,
            today,
            status,
            holeScores: r.entries,
            stats: {
              drivingDistance: Math.round(265 - p.skill * 6 + rrng.float(-6, 6)),
              fairwayHitRate: Math.round(Math.min(85, Math.max(35, 62 - p.skill * 4 + rrng.float(-6, 6)))),
              greenInRegulation: Math.round(Math.min(90, Math.max(40, 68 - p.skill * 5 + rrng.float(-6, 6)))),
              puttsPerRound: Math.round((29 + p.skill * 0.6 + rrng.float(-1, 1)) * 10) / 10,
              sandSaveRate: Math.round(Math.min(80, Math.max(20, 50 - p.skill * 3 + rrng.float(-8, 8)))),
              scrambleRate: Math.round(Math.min(80, Math.max(30, 55 - p.skill * 3 + rrng.float(-6, 6)))),
            },
          },
          overrideAccess: true,
          depth: 0,
        })
        bump(ctx, 'scores')

        rows.set(`${round.id}:${p.id}`, {
          scoreId: doc.id as number,
          tournamentCode: t.code,
          roundId: round.id,
          roundNumber: round.number,
          playerId: p.id,
          holeScores: r.entries,
          thru: r.thru,
          today,
          toPar: toParCum,
          status,
        })
      }

      // --- 順位を確定（この回のラウンドまでの累計で採番）
      const finishedRows = eligible
        .map((p) => rows.get(`${round.id}:${p.id}`))
        .filter((r): r is ScoreRowInfo => !!r)
        .sort((a, b) => a.toPar - b.toPar)
      let rank = 1
      for (let i = 0; i < finishedRows.length; i++) {
        if (i > 0 && finishedRows[i]!.toPar !== finishedRows[i - 1]!.toPar) rank = i + 1
        const tied =
          (i > 0 && finishedRows[i]!.toPar === finishedRows[i - 1]!.toPar) ||
          (i < finishedRows.length - 1 && finishedRows[i]!.toPar === finishedRows[i + 1]!.toPar)
        await ctx.payload.update({
          collection: 'scores',
          id: finishedRows[i]!.scoreId,
          data: { position: rank, positionTied: tied },
          overrideAccess: true,
          depth: 0,
        })
      }
    }

    // --- WD / DQ の作り込み（1件ずつ・cut 後のラウンドを持つ最初の finished 大会で実施）
    if (t.kind === 'finished' && !cutFieldByTournament.has('__wd_dq_done__')) {
      const r3 = t.rounds.find((r) => r.number === 3)
      const r4 = t.rounds.find((r) => r.number === 4)
      const wdCandidate = cutFieldIds[3]
      const dqCandidate = cutFieldIds[7]
      if (r3 && wdCandidate !== undefined) {
        const key = `${r3.id}:${wdCandidate}`
        const row = rows.get(key)
        if (row) {
          await ctx.payload.update({
            collection: 'scores',
            id: row.scoreId,
            data: { status: 'wd', thru: Math.min(row.thru, 11) },
            overrideAccess: true,
            depth: 0,
          })
          row.status = 'wd'
        }
      }
      if (r4 && dqCandidate !== undefined) {
        const key = `${r4.id}:${dqCandidate}`
        const row = rows.get(key)
        if (row) {
          await ctx.payload.update({
            collection: 'scores',
            id: row.scoreId,
            data: { status: 'dq', thru: Math.min(row.thru, 9) },
            overrideAccess: true,
            depth: 0,
          })
          row.status = 'dq'
        }
      }
      cutFieldByTournament.set('__wd_dq_done__', [1])
    }

    cutFieldByTournament.set(t.code, cutFieldIds)
  }
  cutFieldByTournament.delete('__wd_dq_done__')

  return {
    cutFieldByTournament,
    rows,
    liveScenario: {
      leaderIds,
      cutlineIds,
      holeInOne: holeInOne ?? { playerId: leaderIds[0] ?? 0, hole: 4, roundId: 0, roundNumber: 3 },
      unfinishedPlayerIds: Array.from(new Set(unfinishedPlayerIds)),
      cutlineToPar,
    },
  }
}

export const LIVE_TOURNAMENT_CODE = LIVE_CODE
