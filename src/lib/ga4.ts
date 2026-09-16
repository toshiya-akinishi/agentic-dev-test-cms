/**
 * GA4 Measurement Protocol 変換モジュール（要求 8-7 / 補-8-7-1 / T-15-9）
 *
 * `analytics-events` と同じペイロードを GA4 Measurement Protocol の JSON 形式に変換する。
 * 実際の Google への HTTP 送信は行わず MOCK する（GA4 プロパティが未接続のため。00-project-overview.md
 * EP-15 MOCK 一覧を参照）。差し替え点（実送信）は `sendGA4Event` 内の 1 箇所に隔離しており、
 * 本番稼働時はその関数の中身だけを実装すれば良い（補-8-7-1「差し替え点を1モジュールに隔離する」）。
 *
 * このモジュールは他のどこからも import せずに単体で完結する（副作用は console.log と、
 * 差し替え後の fetch のみ）。ingestion endpoint（src/collections/AnalyticsEvents.ts の
 * `/batch`）から挿入直後のイベントごとに呼び出される。
 */

export type GA4InternalEventName =
  | 'screen_view'
  | 'impression'
  | 'click'
  | 'video_start'
  | 'video_progress'
  | 'video_complete'
  | 'share'

/** `analytics-events` コレクションのレコードから GA4 変換に必要な分だけを抜き出した形 */
export type InternalAnalyticsEventForGA4 = {
  eventName: GA4InternalEventName
  occurredAt: string | Date
  userId?: number | string | null
  deviceId?: string | null
  screen?: string | null
  adCreativeId?: number | string | null
  sponsorId?: number | string | null
  videoId?: number | string | null
  durationSec?: number | null
  /** analytics-events.props をそのまま渡す（例: { progressPercent: 50, shareTarget: 'line' }） */
  props?: Record<string, unknown> | null
}

export type GA4Param = string | number | boolean

export type GA4Event = {
  name: string
  params: Record<string, GA4Param>
}

/** https://developers.google.com/analytics/devguides/collection/protocol/ga4 のリクエスト body 形状 */
export type GA4Payload = {
  client_id: string
  user_id?: string
  timestamp_micros: number
  events: GA4Event[]
}

/**
 * 内部イベント名 → GA4 の推奨イベント名へのマッピング。
 * impression/click は GA4 の推奨広告イベント名（ad_impression / ad_click）に合わせる。
 */
const GA4_EVENT_NAME_MAP: Record<GA4InternalEventName, string> = {
  screen_view: 'screen_view',
  impression: 'ad_impression',
  click: 'ad_click',
  video_start: 'video_start',
  video_progress: 'video_progress',
  video_complete: 'video_complete',
  share: 'share',
}

/**
 * GA4 の client_id を決定する。
 * ログイン済みなら user_id を別途セットするが、client_id 自体は端末識別（deviceId）を優先し、
 * 未設定ならユーザーID由来の擬似ID、どちらもなければ 'anonymous' にフォールバックする。
 */
export const toGA4ClientId = (event: InternalAnalyticsEventForGA4): string => {
  if (event.deviceId) return event.deviceId
  if (event.userId !== null && event.userId !== undefined) return `user_${event.userId}`
  return 'anonymous'
}

const isScalar = (v: unknown): v is GA4Param =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

/** 内部イベント 1 件を GA4 Measurement Protocol の JSON payload に変換する（補-8-7-1） */
export const toGA4Payload = (event: InternalAnalyticsEventForGA4): GA4Payload => {
  const params: Record<string, GA4Param> = {}

  if (event.screen) params.screen_name = event.screen
  if (event.adCreativeId !== null && event.adCreativeId !== undefined) {
    params.creative_id = String(event.adCreativeId)
  }
  if (event.sponsorId !== null && event.sponsorId !== undefined) {
    params.sponsor_id = String(event.sponsorId)
  }
  if (event.videoId !== null && event.videoId !== undefined) {
    params.video_id = String(event.videoId)
  }
  if (event.durationSec !== null && event.durationSec !== undefined) {
    params.duration_sec = event.durationSec
  }

  // 補-8-4-2: video_progress の到達率（25/50/75/100）は props.progressPercent に入っている
  if (event.props && typeof event.props === 'object' && !Array.isArray(event.props)) {
    const progressPercent = (event.props as Record<string, unknown>).progressPercent
    if (typeof progressPercent === 'number') params.video_percent = progressPercent

    for (const [key, value] of Object.entries(event.props)) {
      if (key === 'progressPercent') continue
      if (isScalar(value)) params[key] = value
    }
  }

  return {
    client_id: toGA4ClientId(event),
    user_id: event.userId !== null && event.userId !== undefined ? String(event.userId) : undefined,
    timestamp_micros: new Date(event.occurredAt).getTime() * 1000,
    events: [{ name: GA4_EVENT_NAME_MAP[event.eventName], params }],
  }
}

export type GA4SendResult = {
  ok: boolean
  /** true の間は実際に Google へは送信していない（GA4 プロパティ未接続 / 補-8-7-1） */
  mocked: boolean
  endpoint: string
  payload: GA4Payload
}

/**
 * 送信先未設定時はログ出力に留める（補-8-7-1）。
 * `GA4_MEASUREMENT_ID` / `GA4_API_SECRET` 環境変数を設定し、GA4 プロパティが接続された後は、
 * 下記コメントの fetch 呼び出しに差し替えるだけで実送信に切り替えられる。
 * ============================================================================
 * ↓↓↓ 実運用への差し替え点はこの関数の中身のみ（他のコードは変更不要） ↓↓↓
 * ============================================================================
 */
export const sendGA4Event = async (event: InternalAnalyticsEventForGA4): Promise<GA4SendResult> => {
  const measurementId = process.env.GA4_MEASUREMENT_ID
  const apiSecret = process.env.GA4_API_SECRET
  const payload = toGA4Payload(event)
  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId ?? 'UNSET'}&api_secret=${apiSecret ? '***' : 'UNSET'}`

  if (!measurementId || !apiSecret) {
    // MOCK: 送信先が未設定 -> ログ出力のみ（補-8-7-1）
    console.log('[GA4 MOCK] would send:', endpoint, JSON.stringify(payload))
    return { ok: true, mocked: true, endpoint, payload }
  }

  // ---- 実送信（GA4 プロパティ接続後にコメントを外す） ----
  // const res = await fetch(endpoint, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(payload),
  // })
  // return { ok: res.ok, mocked: false, endpoint, payload }
  // ---------------------------------------------------------

  // measurement_id/api_secret が設定されていても、実送信コードは意図的にコメントアウトしたまま
  // 残してある（このプロジェクトでは GA4 プロパティ自体が未発行のため。上のコメントを参照）。
  console.log('[GA4 MOCK] credentials set but live send is intentionally disabled:', endpoint)
  return { ok: true, mocked: true, endpoint, payload }
}

export default sendGA4Event
