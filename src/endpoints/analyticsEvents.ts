import type { Endpoint, PayloadRequest, Where } from 'payload'

import { sendGA4Event } from '../lib/ga4'
import { badRequest, okJson, readJsonBody } from './lib/http'

/**
 * 計測イベントのバッチ登録（要求 8-6, 8-4, 8-7 / 補-8-6-1, 補-8-6-2, 補-8-4-2, 補-8-7-1 / T-15-4, T-15-5, T-15-6, T-15-9）
 * POST /api/analytics-events/batch
 *
 * body: イベントオブジェクトの配列（`{ events: [...] }` の形でも可）。
 * クライアントは最大 20 件 / 10 秒でバッチ送信し、オフライン時は最大 200 件までメモリ保持して
 * 復帰時に送信する（補-8-6-2、いずれもアプリ側の実装。このエンドポイントは「そのようなバッチを
 * 正しく受け取れること」だけを保証する）。1 リクエストあたり 200 件を上限とする。
 *
 * viewable impression の重複排除（補-8-6-1: 同一セッション・同一クリエイティブは 30 秒に 1 回まで）は
 * ここでサーバ側でも簡易に強制する（同一 deviceId/userId + 同一 adCreative の impression が
 * 30 秒以内に既に存在する場合は挿入せず "deduped" として扱う）。
 *
 * 挿入した各イベントは GA4 Measurement Protocol 形式に変換して送信する（MOCK。補-8-7-1 / T-15-9）。
 * GA4 送信の失敗はイベント自体の受理結果に影響しない（ベストエフォート）。
 *
 * 重要: `analytics-events` は既存コレクションのスラッグのため、このエンドポイントは
 * ルートレベルではなく `AnalyticsEvents` コレクション自身の `endpoints` に相対パス `/batch` として
 * 登録する（rankings.ts のコメントと同じ理由: ルート登録だと `/:id`（id="batch"）に奪われる）。
 */

const EVENT_NAMES = [
  'screen_view',
  'impression',
  'click',
  'video_start',
  'video_progress',
  'video_complete',
  'share',
] as const
type EventName = (typeof EVENT_NAMES)[number]
const isEventName = (v: unknown): v is EventName =>
  typeof v === 'string' && (EVENT_NAMES as readonly string[]).includes(v)

const VIDEO_PROGRESS_VALUES = [25, 50, 75, 100] as const

const MAX_BATCH_SIZE = 200 // 補-8-6-2: オフライン時の最大保持件数と揃える

/** リクエスト 1 件分の生入力（クライアント側の表記ゆれ・エイリアスを許容する） */
type RawEvent = {
  eventName?: unknown
  type?: unknown // task 依頼文の表記（type）のエイリアス
  occurredAt?: unknown
  timestamp?: unknown // エイリアス
  userId?: unknown
  deviceId?: unknown
  sessionId?: unknown // deviceId が無い場合のエイリアスとして使う
  screen?: unknown
  screenName?: unknown // エイリアス
  slot?: unknown // ad-slots.key が来た場合の参考情報（props に格納するのみ。選択は /ads/serve が担う）
  adCreativeId?: unknown
  creativeId?: unknown // エイリアス
  adCreative?: unknown // エイリアス
  video?: unknown
  videoId?: unknown // エイリアス
  durationSec?: unknown
  progressPercent?: unknown
  props?: unknown
}

type NormalizedEvent = {
  eventName: EventName
  occurredAt: string
  userId?: number
  deviceId?: string
  screen?: string
  adCreativeId?: number
  videoId?: number
  durationSec?: number
  props: Record<string, unknown>
}

const toId = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

const toStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined

/** 1 件を正規化する。不正な場合は { error } を返す */
const normalize = (raw: RawEvent, fallbackUserId?: number): { error: string } | { event: NormalizedEvent } => {
  const eventNameRaw = raw.eventName ?? raw.type
  if (!isEventName(eventNameRaw)) {
    return { error: `eventName は ${EVENT_NAMES.join(' / ')} のいずれかを指定してください` }
  }
  const eventName = eventNameRaw

  const occurredAtRaw = raw.occurredAt ?? raw.timestamp
  let occurredAt: string
  if (occurredAtRaw === undefined || occurredAtRaw === null) {
    occurredAt = new Date().toISOString()
  } else {
    const d = new Date(occurredAtRaw as string | number)
    if (Number.isNaN(d.getTime())) return { error: 'occurredAt が不正な日時です' }
    occurredAt = d.toISOString()
  }

  const userId = toId(raw.userId) ?? fallbackUserId
  const deviceId = toStr(raw.deviceId) ?? toStr(raw.sessionId)
  const screen = toStr(raw.screen) ?? toStr(raw.screenName)
  const adCreativeId = toId(raw.adCreativeId) ?? toId(raw.creativeId) ?? toId(raw.adCreative)
  const videoId = toId(raw.video) ?? toId(raw.videoId)
  const durationSec = typeof raw.durationSec === 'number' ? raw.durationSec : undefined
  const progressPercent = toId(raw.progressPercent)

  if ((eventName === 'impression' || eventName === 'click') && adCreativeId === undefined) {
    return { error: `${eventName} には adCreativeId（または creativeId）が必要です` }
  }
  if (
    (eventName === 'video_start' || eventName === 'video_progress' || eventName === 'video_complete') &&
    videoId === undefined
  ) {
    return { error: `${eventName} には videoId（または video）が必要です` }
  }
  if (eventName === 'video_progress') {
    if (progressPercent === undefined || !VIDEO_PROGRESS_VALUES.includes(progressPercent as 25 | 50 | 75 | 100)) {
      return { error: '補-8-4-2: video_progress の progressPercent は 25/50/75/100 のいずれかが必要です' }
    }
  }
  if (eventName === 'screen_view' && !screen) {
    return { error: 'screen_view には screen（または screenName）が必要です' }
  }

  const props: Record<string, unknown> =
    raw.props && typeof raw.props === 'object' && !Array.isArray(raw.props)
      ? { ...(raw.props as Record<string, unknown>) }
      : {}
  if (progressPercent !== undefined) props.progressPercent = progressPercent
  if (typeof raw.slot === 'string') props.slot = raw.slot

  return {
    event: {
      eventName,
      occurredAt,
      userId,
      deviceId,
      screen,
      adCreativeId,
      videoId,
      durationSec,
      props,
    },
  }
}

/** GA4 変換用に adCreative から sponsor id を引くための軽量キャッシュ */
const sponsorIdCache = new Map<number, number | undefined>()
const sponsorIdOf = async (req: PayloadRequest, adCreativeId: number): Promise<number | undefined> => {
  if (sponsorIdCache.has(adCreativeId)) return sponsorIdCache.get(adCreativeId)
  const doc = await req.payload
    .findByID({ collection: 'ad-creatives', id: adCreativeId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const sponsor = (doc as { sponsor?: unknown } | null)?.sponsor
  const sponsorId = typeof sponsor === 'number' ? sponsor : undefined
  sponsorIdCache.set(adCreativeId, sponsorId)
  return sponsorId
}

const DEDUPE_WINDOW_MS = 30_000 // 補-8-6-1: 同一セッション・同一クリエイティブは30秒に1回まで

export const analyticsEventsBatchEndpoint: Endpoint = {
  // AnalyticsEvents コレクションの endpoints に登録するため相対パス（/api/analytics-events + /batch）
  path: '/batch',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const body = await readJsonBody<RawEvent[] | { events?: RawEvent[] }>(req)
    const rawEvents: RawEvent[] = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : []

    if (!Array.isArray(body) && !Array.isArray((body as { events?: unknown })?.events)) {
      return badRequest('body は イベントの配列、または { events: [...] } を指定してください')
    }
    if (rawEvents.length === 0) {
      return okJson({ received: 0, accepted: 0, deduped: 0, rejected: [], ids: [] })
    }
    if (rawEvents.length > MAX_BATCH_SIZE) {
      return badRequest(`1 リクエストあたり最大 ${MAX_BATCH_SIZE} 件までです（補-8-6-2）`)
    }

    const fallbackUserId = req.user ? toId((req.user as { id?: unknown }).id) : undefined

    const rejected: { index: number; reason: string }[] = []
    const ids: (number | string)[] = []
    let deduped = 0

    // 同一バッチ内での 30 秒重複も抑止するため、処理済みの impression をここに積む
    const seenImpressions: { key: string; occurredAtMs: number }[] = []

    for (let index = 0; index < rawEvents.length; index++) {
      const normalized = normalize(rawEvents[index]!, fallbackUserId)
      if ('error' in normalized) {
        rejected.push({ index, reason: normalized.error })
        continue
      }
      const ev = normalized.event

      if (ev.eventName === 'impression' && ev.adCreativeId !== undefined) {
        const identity = ev.deviceId ?? (ev.userId !== undefined ? `u:${ev.userId}` : undefined)
        if (identity) {
          const key = `${identity}::${ev.adCreativeId}`
          const occurredAtMs = new Date(ev.occurredAt).getTime()

          // バッチ内の直近同一キー
          const withinBatch = seenImpressions.find(
            (s) => s.key === key && Math.abs(s.occurredAtMs - occurredAtMs) < DEDUPE_WINDOW_MS,
          )
          if (withinBatch) {
            deduped++
            continue
          }

          // 既存データとの重複チェック（DB 上の直近レコード）
          const windowStart = new Date(occurredAtMs - DEDUPE_WINDOW_MS).toISOString()
          const windowEnd = new Date(occurredAtMs + DEDUPE_WINDOW_MS).toISOString()
          const identityWhere: Where = ev.deviceId
            ? { deviceId: { equals: ev.deviceId } }
            : { userId: { equals: ev.userId } }
          const existing = await req.payload.find({
            collection: 'analytics-events',
            where: {
              and: [
                { eventName: { equals: 'impression' } },
                { adCreative: { equals: ev.adCreativeId } },
                identityWhere,
                { occurredAt: { greater_than_equal: windowStart } },
                { occurredAt: { less_than_equal: windowEnd } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          if (existing.docs.length > 0) {
            deduped++
            continue
          }

          seenImpressions.push({ key, occurredAtMs })
        }
      }

      const created = await req.payload.create({
        collection: 'analytics-events',
        data: {
          eventName: ev.eventName,
          occurredAt: ev.occurredAt,
          userId: ev.userId,
          deviceId: ev.deviceId,
          screen: ev.screen,
          adCreative: ev.adCreativeId,
          video: ev.videoId,
          durationSec: ev.durationSec,
          props: ev.props,
        },
        overrideAccess: true,
        depth: 0,
      })
      ids.push(created.id as number)

      // 補-8-7-1 / T-15-9: GA4 Measurement Protocol へ変換して送信（MOCK）。失敗しても受理結果には影響させない
      try {
        const sponsorId = ev.adCreativeId !== undefined ? await sponsorIdOf(req, ev.adCreativeId) : undefined
        await sendGA4Event({
          eventName: ev.eventName,
          occurredAt: ev.occurredAt,
          userId: ev.userId,
          deviceId: ev.deviceId,
          screen: ev.screen,
          adCreativeId: ev.adCreativeId,
          sponsorId,
          videoId: ev.videoId,
          durationSec: ev.durationSec,
          props: ev.props,
        })
      } catch (err) {
        req.payload.logger.warn(`GA4 変換/送信でエラー（イベント自体は受理済み）: ${String(err)}`)
      }
    }

    return okJson({
      received: rawEvents.length,
      accepted: ids.length,
      deduped,
      rejected,
      ids,
    })
  },
}

export default analyticsEventsBatchEndpoint
