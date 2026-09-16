import type { Payload, Where } from 'payload'

/**
 * スポンサーレポート集計（要求 8-4 / 補-8-4-1, 補-8-4-2 / T-15-8）
 *
 * `GET /api/reports/sponsor`（src/endpoints/reports.ts）と、Sponsors 管理画面の
 * 仮想フィールド（src/collections/Sponsors.ts の `adReportSummary`）の両方から
 * 同じ集計ロジックを使うため、ここに切り出している。
 *
 * 表示回数・クリックは `adCreative` に紐づく impression/click イベントで数える。
 * 動画視聴時間は、そのスポンサーの `ad-creatives.video` に紐づく動画イベント
 * （video_start/video_progress/video_complete）を対象にする（クリエイティブ自体に
 * `adCreative` を持たない動画イベントのため、対象動画IDの集合で絞り込む）。
 * 平均視聴完了率は video_progress イベントの `props.progressPercent` の平均。
 */

const clampRange = (from?: string, to?: string): { from: string; to: string } => {
  const toDate = to ? new Date(to) : new Date()
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { from: fromDate.toISOString(), to: toDate.toISOString() }
}

type AdCreativeLite = { id: number; name: string; slot?: unknown; video?: unknown }

const relId = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'object') {
    const id = (v as { id?: unknown }).id
    return typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : undefined
  }
  return typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : undefined
}

export type SponsorReportCreativeRow = {
  id: number
  name: string
  slotKey?: string
  impressions: number
  clicks: number
  ctr: number
}

export type SponsorReportResult = {
  sponsorId: number
  range: { from: string; to: string }
  totals: {
    impressions: number
    clicks: number
    ctr: number
    totalWatchTimeSec: number
    avgCompletionRate: number
    creativeCount: number
  }
  creatives: SponsorReportCreativeRow[]
}

export const computeSponsorReport = async (
  payload: Payload,
  sponsorId: number,
  rangeInput?: { from?: string; to?: string },
): Promise<SponsorReportResult> => {
  const range = clampRange(rangeInput?.from, rangeInput?.to)
  const occurredAtInRange: Where = {
    and: [
      { occurredAt: { greater_than_equal: range.from } },
      { occurredAt: { less_than_equal: range.to } },
    ],
  }

  // 重要: depth は必ず 0 にする。depth >= 1 にすると `sponsor` リレーションが populate され、
  // Sponsors コレクションの `adReportSummary` 仮想フィールド（afterRead フック）が発火し、
  // そのフックがこの関数を再び呼び出す（ad-creatives を再検索 → 再び sponsor を populate → …）
  // という無限再帰でサーバがクラッシュする（`RangeError: Map maximum size exceeded` で実際に発生済み）。
  // slot のキー名など depth>=1 で得られる情報は、下で ad-slots を個別に引いて代替する。
  const creativesRes = await payload.find({
    collection: 'ad-creatives',
    where: { sponsor: { equals: sponsorId } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const creatives = creativesRes.docs as unknown as AdCreativeLite[]
  const creativeIds = creatives.map((c) => c.id)
  const videoIds = [...new Set(creatives.map((c) => relId(c.video)).filter((v): v is number => v !== undefined))]

  // slot は id のみ（depth:0）で来るため、表示用の key は ad-slots を別途まとめて引く
  // （ad-slots に sponsor へのリレーションは無いため、ここは再帰の心配がない）
  const slotIds = [...new Set(creatives.map((c) => relId(c.slot)).filter((v): v is number => v !== undefined))]
  const slotKeyById = new Map<number, string>()
  if (slotIds.length > 0) {
    const slotsRes = await payload.find({
      collection: 'ad-slots',
      where: { id: { in: slotIds } },
      limit: slotIds.length,
      depth: 0,
      overrideAccess: true,
    })
    for (const s of slotsRes.docs as unknown as { id: number; key: string }[]) {
      slotKeyById.set(s.id, s.key)
    }
  }

  const creativeRows: SponsorReportCreativeRow[] = []
  let impressions = 0
  let clicks = 0

  for (const c of creatives) {
    const slotId = relId(c.slot)
    const [impRes, clickRes] = await Promise.all([
      payload.count({
        collection: 'analytics-events',
        where: { and: [{ eventName: { equals: 'impression' } }, { adCreative: { equals: c.id } }, occurredAtInRange] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'analytics-events',
        where: { and: [{ eventName: { equals: 'click' } }, { adCreative: { equals: c.id } }, occurredAtInRange] },
        overrideAccess: true,
      }),
    ])
    impressions += impRes.totalDocs
    clicks += clickRes.totalDocs
    creativeRows.push({
      id: c.id,
      name: c.name,
      slotKey: slotId !== undefined ? slotKeyById.get(slotId) : undefined,
      impressions: impRes.totalDocs,
      clicks: clickRes.totalDocs,
      ctr: impRes.totalDocs > 0 ? clickRes.totalDocs / impRes.totalDocs : 0,
    })
  }

  let totalWatchTimeSec = 0
  let avgCompletionRate = 0
  if (videoIds.length > 0) {
    const videoEvents = await payload.find({
      collection: 'analytics-events',
      where: {
        and: [
          { video: { in: videoIds } },
          { eventName: { in: ['video_start', 'video_progress', 'video_complete'] } },
          occurredAtInRange,
        ],
      },
      limit: 10_000,
      depth: 0,
      overrideAccess: true,
    })
    const docs = videoEvents.docs as unknown as {
      durationSec?: number | null
      eventName: string
      props?: unknown
    }[]
    totalWatchTimeSec = docs.reduce((sum, d) => sum + (d.durationSec ?? 0), 0)

    const progressPercents = docs
      .filter((d) => d.eventName === 'video_progress')
      .map((d) => {
        const p = d.props as Record<string, unknown> | undefined
        const v = p?.progressPercent
        return typeof v === 'number' ? v : undefined
      })
      .filter((v): v is number => v !== undefined)
    avgCompletionRate =
      progressPercents.length > 0
        ? progressPercents.reduce((a, b) => a + b, 0) / progressPercents.length
        : 0
  }

  return {
    sponsorId,
    range,
    totals: {
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      totalWatchTimeSec,
      avgCompletionRate,
      creativeCount: creativeIds.length,
    },
    creatives: creativeRows,
  }
}

export default computeSponsorReport
