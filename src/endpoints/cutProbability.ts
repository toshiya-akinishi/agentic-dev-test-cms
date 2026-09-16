import type { Endpoint, PayloadRequest, Where } from 'payload'

import { badRequest, notFound, okJson } from './lib/http'

/**
 * カット通過確率（要求 4-14 / 補-4-14-1, 補-4-14-2 / T-13-7）
 * GET /api/players/cut-probability?tournamentId=<id>&round=<number>&playerIds=<id,id,...>
 *
 * 補-4-14-1 は「事前計算値を scores.cutProbability に保存し、ラウンド終了ごとに CMS 側ジョブで
 * 算出する」としているが、本 Endpoint は依頼（T-13-7）の指示に従い、開催中の大会で
 * リアルタイムに変化するスコアに対して常に最新の値を返すため、あえて値を保存せず
 * **リクエスト時に `scores` から都度計算する**（SIMPL）。`scores.cutProbability`
 * フィールド自体は将来バッチジョブが値を書き込む余地として残し、本 Endpoint はそれを
 * 読み書きしない（GET に副作用を持たせないため）。
 *
 * 算出に使う入力（補-4-14-1）: 現在の対パー・残ホール数・想定カットライン。
 * 想定カットラインは `tournament.cutRule`（例:「上位45位タイまでが予選通過」）の順位
 * まで対パー昇順に並べた際の値を、対象ラウンドの現在のスコア分布から都度算出する
 * （＝カット確定前のラウンドが進むほど、この想定ラインも変動する＝"live"）。
 *
 * 5 段階バッジ（補-4-14-2）: 0 / 25 / 50 / 75 / 100（%）の 5 値のみを返す。
 * 残ホール数から決まる「振れ幅（band）」を対パー差に対して掛け、
 * その日の調子（today）による小さな補正を加えた上で 5 段階に丸める。
 * 歴史的カット通過率は Players / HoleStatistics のどちらにも選手別の実績データが
 * ないため（依頼文の "if easily available" の条件を満たさない）採用していない。
 */

type CutProbabilityScoreRow = {
  id: number
  player: unknown
  round: unknown
  status: 'playing' | 'finished' | 'cut' | 'wd' | 'dq'
  thru?: number | null
  today?: number | null
  toPar: number
}

type RoundDoc = {
  id: number
  number: number
  status: 'scheduled' | 'live' | 'finished' | 'suspended'
  tournament: unknown
}

type TournamentDoc = {
  id: number
  name: string
  slug: string
  cutLineAfterRound: number
  cutRule?: string | null
}

const DEFAULT_CUT_SIZE = 45

/** `cutRule` のフリーテキストから「上位N位」の N を読み取る。読み取れなければ既定値 */
const parseCutSize = (cutRule: string | null | undefined): number => {
  const m = cutRule?.match(/(\d+)\s*位/)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CUT_SIZE
}

const relId = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : undefined
  }
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** 5 段階バッジ（0/25/50/75/100）に丸める。band は残ホール数から決まる「振れ幅（打数）」 */
const classify = (effectiveDiff: number, band: number): 0 | 25 | 50 | 75 | 100 => {
  if (effectiveDiff <= -2 * band) return 100
  if (effectiveDiff <= -0.5 * band) return 75
  if (effectiveDiff < 0.5 * band) return 50
  if (effectiveDiff < 2 * band) return 25
  return 0
}

const TIER_LABEL: Record<number, string> = {
  100: '有力',
  75: 'やや有力',
  50: '微妙',
  25: '厳しい',
  0: '絶望的',
}

export const cutProbabilityEndpoint: Endpoint = {
  // Players コレクションの endpoints に相対パスで登録する（/api/players + /cut-probability）。
  // ルート登録（src/endpoints/index.ts）にすると先頭セグメント `players` が先に
  // players コレクションの `/:id` に解決されてしまうため（rankings.ts と同じ理由）。
  path: '/cut-probability',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const query = req.query as Record<string, unknown>

    const tournamentIdRaw = query.tournamentId
    const tournamentId =
      typeof tournamentIdRaw === 'string' || typeof tournamentIdRaw === 'number'
        ? tournamentIdRaw
        : undefined
    if (tournamentId === undefined) {
      return badRequest('tournamentId は必須です', 'tournamentId')
    }

    const tournament = (await req.payload
      .findByID({
        collection: 'tournaments',
        id: tournamentId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)) as TournamentDoc | null
    if (!tournament) return notFound('大会が見つかりませんでした')

    const cutRoundNumber = tournament.cutLineAfterRound ?? 2

    const roundParamRaw = query.round
    const requestedRoundNumber =
      typeof roundParamRaw === 'string' || typeof roundParamRaw === 'number'
        ? Number(roundParamRaw)
        : undefined
    if (requestedRoundNumber !== undefined && !Number.isFinite(requestedRoundNumber)) {
      return badRequest('round は数値で指定してください', 'round')
    }
    // カット通過確率が意味を持つのは予選カットが確定するラウンドまで。
    // それより後のラウンドが指定された場合はカット確定ラウンドに丸める。
    const targetRoundNumber = Math.min(requestedRoundNumber ?? cutRoundNumber, cutRoundNumber)

    const allRounds = await req.payload.find({
      collection: 'rounds',
      where: { tournament: { equals: tournament.id } },
      sort: 'number',
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
    const rounds = allRounds.docs as unknown as RoundDoc[]

    let round = rounds.find((r) => r.number === targetRoundNumber)
    // 指定/既定ラウンドがまだ未着手（scores が無い）の場合は、着手済みの直近ラウンドまで遡る
    if (!round) {
      return notFound(
        `大会 ${tournament.name} にラウンド ${targetRoundNumber} が見つかりませんでした`,
      )
    }

    const scoresRes = await req.payload.find({
      collection: 'scores',
      where: { round: { equals: round.id } } as Where,
      sort: 'toPar',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    let rows = scoresRes.docs as unknown as CutProbabilityScoreRow[]

    // 未着手ラウンド（scores が 1 件もない）なら、実データがある直近の過去ラウンドへフォールバック
    if (rows.length === 0) {
      const playedRounds = rounds
        .filter((r) => r.number < targetRoundNumber)
        .sort((a, b) => b.number - a.number)
      for (const candidate of playedRounds) {
        const candidateRes = await req.payload.find({
          collection: 'scores',
          where: { round: { equals: candidate.id } } as Where,
          sort: 'toPar',
          limit: 200,
          depth: 0,
          overrideAccess: true,
        })
        if (candidateRes.docs.length > 0) {
          round = candidate
          rows = candidateRes.docs as unknown as CutProbabilityScoreRow[]
          break
        }
      }
    }
    if (rows.length === 0) {
      return notFound('対象ラウンドのスコアがまだ登録されていません')
    }

    const cutSize = parseCutSize(tournament.cutRule)
    const sortedToPar = rows.map((r) => r.toPar).sort((a, b) => a - b)
    const cutIndex = Math.min(cutSize, sortedToPar.length) - 1
    const cutLineToPar = sortedToPar[cutIndex]!

    const additionalFullRounds = Math.max(0, cutRoundNumber - round.number)

    const playerIdsRaw = query.playerIds
    const playerIdFilter =
      typeof playerIdsRaw === 'string' && playerIdsRaw.trim().length > 0
        ? new Set(
            playerIdsRaw
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n)),
          )
        : undefined

    const players = rows
      .filter((r) => {
        if (!playerIdFilter) return true
        const pid = relId(r.player)
        return pid !== undefined && playerIdFilter.has(pid)
      })
      .map((r) => {
        const thru = r.thru ?? 18
        const today = r.today ?? 0
        const diff = r.toPar - cutLineToPar
        const holesRemainingThisRound = Math.max(0, 18 - thru)
        const totalHolesRemaining = holesRemainingThisRound + additionalFullRounds * 18
        // 残ホール数が多いほど順位変動の余地が大きい＝振れ幅（打数）を広げる
        const band = Math.max(1, Math.round(totalHolesRemaining / 6))
        // その日の調子を軽く加味する（絶対値3打まで、係数0.5）。today が良い（マイナス）ほど有利側に補正
        const trendAdjustment = clamp(-today, -3, 3) * 0.5
        const effectiveDiff = diff - trendAdjustment
        const cutProbability = classify(effectiveDiff, band)

        return {
          playerId: relId(r.player),
          player: r.player,
          scoreId: r.id,
          status: r.status,
          toPar: r.toPar,
          thru,
          today,
          diffFromCutLine: diff,
          holesRemaining: totalHolesRemaining,
          cutProbability,
          tierLabel: TIER_LABEL[cutProbability],
        }
      })
      // カットラインからの差が小さい順（＝注目度が高い順）に並べる
      .sort((a, b) => a.diffFromCutLine - b.diffFromCutLine)

    return okJson({
      tournament: { id: tournament.id, name: tournament.name, slug: tournament.slug },
      cutLineAfterRound: cutRoundNumber,
      round: { id: round.id, number: round.number, status: round.status },
      cutLine: { toPar: cutLineToPar, size: cutSize, basedOnPlayers: rows.length },
      players,
    })
  },
}
