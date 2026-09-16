import type { Endpoint, PayloadRequest, Where } from 'payload'

import { isOperator } from '../access'
import { badRequest, forbidden, notFound, okJson, unauthorized } from './lib/http'
import type { HoleResult } from '../seed/scores'
import { pickHoleDelta, resultOf } from '../seed/scores'
import { Rng } from '../seed/rng'
import { notificationsRunChecksEndpoint } from './notificationsRunChecks'

/**
 * ライブ進行シミュレーションジョブ（T-10-11 / docs/06-test-data.md 2章）
 * POST /api/tournaments/advance-live?tournamentId=<id>
 *
 * ============================================================================
 * 設計方針
 * ============================================================================
 * この検証環境には実運用の cron/スケジューラが無い（ADR-013 と同じ前提）。
 * 「開催中の大会のスコアを1分ごとに1ホール進める」（06-test-data.md）を実現する常駐ジョブは
 * 用意できないため、cutProbability.ts / notificationsRunChecks.ts と同じ考え方で
 * **呼ばれるたびに未了選手を1ホールずつ進める on-demand エンドポイント**として実装する。
 * 実運用では、この POST を 1 分間隔で叩く外部スケジューラ（あるいは Cloud Scheduler）に
 * 置き換えるだけでよい構造にしてある。
 *
 * 対象は「開催中（status=live）の大会」かつ「進行中（status=live）のラウンド」のみ。
 * そのラウンドで `status=playing` かつ `thru<18` の選手を対象に、次の1ホール分の
 * スコアを追加する。何度呼んでも安全（冪等）: 既に18H消化済み、あるいは
 * playing 以外（finished/cut/wd/dq）の選手は対象から自然に外れ、それ以上進まない。
 *
 * ホールの delta（対パー）は `src/seed/scores.ts` の `pickHoleDelta` をそのまま再利用する。
 * seed 時と異なりここでは選手ごとの `skill` を持たないため、代わりに
 * 「その選手のこのラウンドでのここまでの平均対パー（today / thru）」を skill の代理指標として使う。
 * これにより、好調な選手はその後も好調な delta が出やすく、苦戦している選手はボギー等が
 * 出やすくなり、既存のスコア傾向と統計的に矛盾しない1ホールが生成される（依頼の要件）。
 *
 * カットライン関連フィールド（要求 3-1 / 補-3-1-1, 4）:
 * - `position` / `positionTied`: このラウンドの全行を対パー昇順で並べ直し、都度再採番する
 *   （アプリ側リーダーボードは `scores.position` でソートするため、toPar が変化しても
 *   position を追随させないとリーダーボードの順序が更新されて見えない）。
 * - `status`: 18H に到達した選手はこのラウンドが予選カットのラウンド
 *   （`tournament.cutLineAfterRound`）と一致する場合のみカット判定（cut/finished）を行い、
 *   それ以外のラウンドでは単に finished にする（この大会の実データでは、cutライン確定は
 *   既に R2 終了時点で seed 済みのため通常は後者の分岐のみ通る。前者は将来別大会で
 *   このジョブが「カットラウンドそのもの」を進める場合に備えた一般化）。
 * - `scores.cutProbability` は cutProbability.ts の設計方針（都度計算・値を保存しない）を
 *   踏襲し、本エンドポイントも書き込まない。
 *
 * 通知（T-14-2 以下）との連携について:
 * イーグル等のホール更新は notificationsRunChecks.ts の好スコア判定が拾う対象そのものなので、
 * スコア更新後に同じ `req`（isOperator は isStaff の上位互換なので認可を素通しできる）で
 * run-checks を内部的に1回呼び出す。デモの説得力（イーグルが出た瞬間に通知が生成される）を
 * 優先し、失敗しても本エンドポイントの主目的（スコア進行）は失敗させない（try/catch で握り
 * つぶし、結果は `notifications` フィールドに含めて返すのみ）。
 */

type HoleScoreEntry = { hole: number; par: number; strokes: number; toPar: number; result: HoleResult }

type ScoreRow = {
  id: number
  player: unknown
  round: unknown
  status: 'playing' | 'finished' | 'cut' | 'wd' | 'dq'
  thru?: number | null
  today?: number | null
  toPar: number
  position?: number | null
  positionTied?: boolean | null
  holeScores?: HoleScoreEntry[] | null
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
  status: 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed'
  course: unknown
  cutLineAfterRound: number
  cutRule?: string | null
}

type HoleDoc = { id: number; number: number; par: number; course: unknown }

const relId = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : undefined
  }
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
}

const DEFAULT_CUT_SIZE = 45
/** cutProbability.ts / notificationsRunChecks.ts と同じロジック（意図的に複製。本リポジトリの慣習） */
const parseCutSize = (cutRule: string | null | undefined): number => {
  const m = cutRule?.match(/(\d+)\s*位/)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CUT_SIZE
}

export const tournamentsAdvanceLiveEndpoint: Endpoint = {
  // Tournaments コレクションの endpoints に相対パスで登録する（/api/tournaments + /advance-live）。
  // ルート登録（src/endpoints/index.ts）だと先頭セグメント `tournaments` が先に
  // tournaments コレクションの `/:id` に解決されてしまうため（cutProbability.ts と同じ理由・ADR-020）。
  path: '/advance-live',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return unauthorized('ログインが必要です')
    // Scores の create/update は operatorOnly（admin/operator）なので、このジョブの実行権限も揃える
    if (!isOperator(req.user as never)) {
      return forbidden('ライブ進行ジョブの実行は運営（operator）以上のみ許可されています')
    }

    const query = req.query as Record<string, unknown>
    const tournamentIdRaw = query.tournamentId
    const tournamentId =
      typeof tournamentIdRaw === 'string' || typeof tournamentIdRaw === 'number' ? tournamentIdRaw : undefined
    if (tournamentId === undefined) return badRequest('tournamentId は必須です', 'tournamentId')

    const tournament = (await req.payload
      .findByID({ collection: 'tournaments', id: tournamentId, depth: 0, overrideAccess: true })
      .catch(() => null)) as TournamentDoc | null
    if (!tournament) return notFound('大会が見つかりませんでした')
    if (tournament.status !== 'live') {
      return badRequest('開催中（status=live）の大会のみライブ進行を実行できます', 'tournamentId')
    }

    const roundsRes = await req.payload.find({
      collection: 'rounds',
      where: { tournament: { equals: tournament.id } } as Where,
      sort: 'number',
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    const rounds = roundsRes.docs as unknown as RoundDoc[]
    const liveRound = rounds.find((r) => r.status === 'live')
    if (!liveRound) {
      return okJson({
        tournament: { id: tournament.id, name: tournament.name },
        advanced: 0,
        message: '進行中（status=live）のラウンドが見つかりませんでした。既に全ラウンド終了している可能性があります',
      })
    }

    const courseId = relId(tournament.course)
    const holesRes = courseId
      ? await req.payload.find({
          collection: 'holes',
          where: { course: { equals: courseId } } as Where,
          sort: 'number',
          limit: 20,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] }
    const parByNumber = new Map<number, number>(
      (holesRes.docs as unknown as HoleDoc[]).map((h) => [h.number, h.par]),
    )

    const scoresRes = await req.payload.find({
      collection: 'scores',
      where: { round: { equals: liveRound.id } } as Where,
      limit: 300,
      depth: 0,
      overrideAccess: true,
    })
    const rows = scoresRes.docs as unknown as ScoreRow[]

    const counters = { advancedHoles: 0, newlyFinished: 0, eagleOrBetter: 0, alreadyDone: 0 }

    for (const row of rows) {
      if (row.status !== 'playing') {
        counters.alreadyDone++
        continue
      }
      const thru = row.thru ?? 0
      if (thru >= 18) {
        // 本来ここに来る前に status が finished 等へ更新されているはずだが、念のためのクリーンアップ
        await req.payload.update({
          collection: 'scores',
          id: row.id,
          data: { status: 'finished' },
          overrideAccess: true,
        })
        counters.alreadyDone++
        continue
      }

      const nextHoleNumber = thru + 1
      const par = parByNumber.get(nextHoleNumber) ?? 4
      // このラウンドのここまでの平均対パー（today/thru）を skill の代理指標にする
      // （seed の skill と同じ「小さいほど好調」の向き。まだ1H も消化していない場合は 0=平均的）
      const paceSkill = thru > 0 ? Math.max(-3, Math.min(3, (row.today ?? 0) / thru)) : 0
      const rng = new Rng(`advance-live:${Date.now()}:${row.id}:${nextHoleNumber}:${Math.random()}`)
      const delta = pickHoleDelta(paceSkill, rng)
      const strokes = Math.max(1, par + delta)
      const toPar = strokes - par
      const result = resultOf(toPar)

      const newHoleScores = [...(row.holeScores ?? []), { hole: nextHoleNumber, par, strokes, toPar, result }]
      const newThru = nextHoleNumber
      const newToday = (row.today ?? 0) + toPar
      const newToPar = row.toPar + toPar
      const newStatus: ScoreRow['status'] = newThru >= 18 ? 'finished' : 'playing'

      await req.payload.update({
        collection: 'scores',
        id: row.id,
        data: { holeScores: newHoleScores, thru: newThru, today: newToday, toPar: newToPar, status: newStatus },
        overrideAccess: true,
      })

      counters.advancedHoles++
      if (newStatus === 'finished') counters.newlyFinished++
      if (result === 'eagle') counters.eagleOrBetter++
    }

    // ---- 順位（position/positionTied）を再採番する（補-3-1-1。リーダーボードは position でソート） ----
    const freshRes = await req.payload.find({
      collection: 'scores',
      where: { round: { equals: liveRound.id } } as Where,
      limit: 300,
      depth: 0,
      overrideAccess: true,
    })
    const freshRows = (freshRes.docs as unknown as ScoreRow[]).slice().sort((a, b) => a.toPar - b.toPar)
    let rank = 1
    for (let i = 0; i < freshRows.length; i++) {
      if (i > 0 && freshRows[i]!.toPar !== freshRows[i - 1]!.toPar) rank = i + 1
      const tied =
        (i > 0 && freshRows[i]!.toPar === freshRows[i - 1]!.toPar) ||
        (i < freshRows.length - 1 && freshRows[i]!.toPar === freshRows[i + 1]!.toPar)
      if (freshRows[i]!.position !== rank || Boolean(freshRows[i]!.positionTied) !== tied) {
        await req.payload.update({
          collection: 'scores',
          id: freshRows[i]!.id,
          data: { position: rank, positionTied: tied },
          overrideAccess: true,
        })
      }
    }

    // ---- ラウンド全体が完了したら round.status / カットライン判定を更新する ----
    const allDone = freshRows.every((r) => r.status !== 'playing')
    if (allDone && freshRows.length > 0) {
      if (liveRound.number === (tournament.cutLineAfterRound ?? 2)) {
        // このジョブが「カットラウンドそのもの」を最後まで進めた一般ケース
        // （この検証環境の live 大会では既に R2 終了時点でカット確定済みのため通常は通らない分岐）
        const cutSize = parseCutSize(tournament.cutRule)
        const sorted = [...freshRows].map((r) => r.toPar).sort((a, b) => a - b)
        const cutLineToPar = sorted[Math.min(cutSize, sorted.length) - 1]!
        for (const r of freshRows) {
          if (r.status !== 'finished') continue
          const passed = r.toPar <= cutLineToPar
          if (!passed) {
            await req.payload.update({
              collection: 'scores',
              id: r.id,
              data: { status: 'cut' },
              overrideAccess: true,
            })
          }
        }
      }
      if (liveRound.status !== 'finished') {
        await req.payload.update({
          collection: 'rounds',
          id: liveRound.id,
          data: { status: 'finished' },
          overrideAccess: true,
        })
      }
    }

    // ---- 好スコア通知等が即座に反映されるよう run-checks を内側から1回呼ぶ（判断は上部コメント参照） ----
    let notifications: unknown
    try {
      const runChecksRes = await notificationsRunChecksEndpoint.handler(req)
      notifications = await (runChecksRes as Response).json()
    } catch (err) {
      notifications = { error: err instanceof Error ? err.message : String(err) }
    }

    return okJson({
      tournament: { id: tournament.id, name: tournament.name },
      round: { id: liveRound.id, number: liveRound.number, status: allDone ? 'finished' : liveRound.status },
      advanced: counters,
      notifications,
      message:
        counters.advancedHoles > 0
          ? `${counters.advancedHoles}名の選手を1ホール進めました`
          : 'このラウンドで進行可能な選手（status=playing かつ thru<18）はいませんでした',
    })
  },
}
