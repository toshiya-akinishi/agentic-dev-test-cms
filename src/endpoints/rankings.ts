import type { Endpoint, PayloadRequest, Where } from 'payload'

import { badRequest, notFound, okJson } from './lib/http'

/**
 * ランキング最新スナップショット（要求 1-5 / 1-6 / 1-7 / T-05-4）
 * GET /api/rankings/latest?type=money&seasonId=<id>
 *
 * `type` ごとに `asOf` が最新の 1 レコードを返す（誰でも閲覧可 = Rankings.ts の read: anyone に一致）。
 * 各明細の前回比（rankChange）は、レコード自身が持つ `previousRank`（seed 時点で設定済み）を優先し、
 * 無ければ直前の asOf スナップショットの同一選手の順位から算出する。
 *
 * 重要: この Endpoint は `Rankings`（src/collections/Rankings.ts）自身の `endpoints` 配列に
 * 登録する。ルートレベルの `config.endpoints`（src/endpoints/index.ts）に置くと、Payload の
 * ルーティングは最初のパスセグメント `rankings` を先にコレクションスラッグとして解決してしまい、
 * `/api/rankings/latest` が rankings コレクション標準の `GET /:id`（findByID, id="latest"）に
 * 奪われて 500 エラーになる（node_modules/payload/dist/utilities/handleEndpoints.js 参照）。
 * そのためコレクション側では相対パス `/latest` として登録する。
 */

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
type RankingType = (typeof RANKING_TYPES)[number]

const isRankingType = (value: unknown): value is RankingType =>
  typeof value === 'string' && (RANKING_TYPES as readonly string[]).includes(value)

const relId = (value: unknown): string | number | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id === undefined || id === null ? undefined : (id as string | number)
  }
  return value as string | number
}

type RankingEntry = {
  events?: number | null
  player: unknown
  previousRank?: number | null
  rank: number
  value: number
  valueLabel?: string | null
}

export const rankingsLatestEndpoint: Endpoint = {
  // Rankings コレクションの endpoints に登録するため相対パス（/api/rankings + /latest）
  path: '/latest',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const query = req.query as Record<string, unknown>
    const type = typeof query.type === 'string' ? query.type : undefined
    // task/spec表記のゆれを吸収（03-api-spec.md では seasonId、依頼文では season）
    const seasonIdRaw = query.seasonId ?? query.season
    const seasonId =
      typeof seasonIdRaw === 'string' || typeof seasonIdRaw === 'number' ? seasonIdRaw : undefined

    if (!isRankingType(type)) {
      return badRequest(
        `type は ${RANKING_TYPES.join(' / ')} のいずれかを指定してください`,
        'type',
      )
    }

    const where: Where = { type: { equals: type } }
    if (seasonId !== undefined) where.season = { equals: seasonId }

    // 最新2件（前回比算出のフォールバック用に直前分も取得）
    const snapshots = await req.payload.find({
      collection: 'rankings',
      where,
      sort: '-asOf',
      limit: 2,
      depth: 1,
      overrideAccess: true,
    })

    const latest = snapshots.docs[0]
    if (!latest) return notFound('該当するランキングが見つかりませんでした')

    const previous = snapshots.docs[1] as { entries?: RankingEntry[] } | undefined
    const previousRankByPlayer = new Map<string | number, number>()
    if (previous?.entries) {
      for (const entry of previous.entries) {
        const pid = relId(entry.player)
        if (pid !== undefined) previousRankByPlayer.set(pid, entry.rank)
      }
    }

    const entries = ((latest as { entries?: RankingEntry[] }).entries ?? []).map((entry) => {
      const pid = relId(entry.player)
      const previousRank =
        entry.previousRank ?? (pid !== undefined ? previousRankByPlayer.get(pid) : undefined) ?? null
      const rankChange = previousRank != null ? previousRank - entry.rank : null

      return {
        rank: entry.rank,
        player: entry.player,
        value: entry.value,
        valueLabel: entry.valueLabel ?? null,
        events: entry.events ?? null,
        previousRank,
        rankChange, // 正: 順位上昇 / 負: 順位下降 / 0: 変動なし / null: 前回データなし（新規ランクイン等）
      }
    })

    return okJson({
      type,
      season: (latest as { season?: unknown }).season,
      asOf: (latest as { asOf?: unknown }).asOf,
      entries,
    })
  },
}
