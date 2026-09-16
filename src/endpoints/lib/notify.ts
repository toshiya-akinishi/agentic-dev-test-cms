import type { Payload } from 'payload'

/**
 * 通知配信プリミティブ（T-14-1 / ADR-013）。
 *
 * ADR-013 により実プッシュ送信（FCM/APNs）は行わない。このモジュールが
 * 「配信」の唯一の実体で、以下の 2 つだけを行う:
 *   1. `notifications` コレクションにレコードを作成する（＝通知センターに残る実データ）
 *   2. コンソールへ MOCK 配信ログを出力する（実運用で配信基盤に差し替える際の置換ポイント）
 *
 * T-14-2（通知発火ジョブ）以下すべて（T-14-6〜T-14-9 の各判定ロジック）は、
 * 判定に一致したユーザー/端末ごとにこの `notifyUser` を呼ぶことで通知を生成する。
 */

export type NotificationType =
  | 'emergency'
  | 'player_event'
  | 'start_reminder'
  | 'title_race'
  | 'news'
  | 'cut_line'

export type NotificationPriority = 'high' | 'normal' | 'low'

export type NotifyRecipient =
  | { audience: 'all' }
  | { audience: 'user'; targetUser: number }
  | { audience: 'device'; targetDeviceId: string }

export type NotifyInput = NotifyRecipient & {
  type: NotificationType
  title: string
  body: string
  deepLink?: string
  tournament?: number
  player?: number
  priority?: NotificationPriority
  sentAt?: string
  /**
   * 冪等性キー（T-14-2 の重複排除要件）。同一キーを持つレコードが既に存在する場合は
   * 新規作成をスキップする。run-checks のような on-demand ジョブを何度呼んでも
   * 同一イベントに対する通知が重複生成されないようにするための仕組み。
   * 手動発行（緊急通知など）では省略してよい（毎回新規作成される）。
   */
  dedupeKey?: string
}

export type NotifyResult =
  | { created: true; id: number | string }
  | { created: false; reason: 'duplicate' }

/** 宛先の説明文字列（ログ・冪等キーの補助に使う） */
export const recipientKeyOf = (recipient: NotifyRecipient): string => {
  if (recipient.audience === 'user') return `u${recipient.targetUser}`
  if (recipient.audience === 'device') return `d${recipient.targetDeviceId}`
  return 'all'
}

export const notifyUser = async (payload: Payload, input: NotifyInput): Promise<NotifyResult> => {
  if (input.dedupeKey) {
    const existing = await payload.count({
      collection: 'notifications',
      where: { dedupeKey: { equals: input.dedupeKey } },
      overrideAccess: true,
    })
    if (existing.totalDocs > 0) {
      return { created: false, reason: 'duplicate' }
    }
  }

  try {
    const doc = await payload.create({
      collection: 'notifications',
      data: {
        type: input.type,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink,
        tournament: input.tournament,
        player: input.player,
        audience: input.audience,
        targetUser: input.audience === 'user' ? input.targetUser : undefined,
        targetDeviceId: input.audience === 'device' ? input.targetDeviceId : undefined,
        sentAt: input.sentAt ?? new Date().toISOString(),
        priority: input.priority ?? (input.type === 'emergency' ? 'high' : 'normal'),
        dedupeKey: input.dedupeKey,
      },
      overrideAccess: true,
      depth: 0,
    })

    // MOCK 配信ログ（ADR-013）。実配信基盤に差し替える際はここを実送信 API 呼び出しに置換する。
    console.log(
      `[notify:mock-push] type=${input.type} audience=${input.audience}` +
        (input.audience === 'user' ? ` targetUser=${input.targetUser}` : '') +
        (input.audience === 'device' ? ` targetDeviceId=${input.targetDeviceId}` : '') +
        ` title="${input.title}" notificationId=${doc.id}`,
    )

    return { created: true, id: doc.id as number }
  } catch (err) {
    // dedupeKey は unique 制約も持つため、count チェックのすり抜け（同時リクエストの競合）を
    // 一意制約違反として検出できた場合は重複扱いにする。それ以外のエラーは再送出する。
    if (input.dedupeKey) {
      const stillExists = await payload.count({
        collection: 'notifications',
        where: { dedupeKey: { equals: input.dedupeKey } },
        overrideAccess: true,
      })
      if (stillExists.totalDocs > 0) {
        return { created: false, reason: 'duplicate' }
      }
    }
    throw err
  }
}
