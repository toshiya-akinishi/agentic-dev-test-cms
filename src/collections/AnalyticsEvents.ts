import type { Access, CollectionConfig, Where } from 'payload'

import { adminOnly, isStaff } from '../access'
import { analyticsEventsBatchEndpoint } from '../endpoints/analyticsEvents'

/**
 * 計測イベント（要求 8-4, 8-6, 8-7 / 補-8-6-1, 補-8-6-2, 補-8-7-1）
 *
 * クライアントからバッチ（最大 20 件 / 10 秒）で POST される（補-8-6-2）。
 * 集計は `/api/reports/sponsor` で提供し（補-8-4-1）、GA4 への転送は MOCK（補-8-7-1）。
 * 件数が非常に多くなるため `occurredAt` / `eventName` に索引を張る。
 */

/**
 * 参照はスタッフ（admin/editor/operator）のみ。
 * sponsor ロールは自社クリエイティブに紐づくイベントのみ参照できる（補-8-4-1, 補-8-9-2）。
 */
const staffOrOwnSponsorEvents: Access = ({ req }) => {
  if (isStaff(req.user as never)) return true

  const user = req.user as
    | { role?: string | null; sponsor?: string | number | { id?: string | number } | null }
    | null
    | undefined

  if (user?.role === 'sponsor') {
    const sponsor = user.sponsor
    const sponsorId =
      sponsor && typeof sponsor === 'object' ? (sponsor.id ?? null) : (sponsor ?? null)
    if (sponsorId === null || sponsorId === undefined) return false
    const where: Where = { 'adCreative.sponsor': { equals: sponsorId } }
    return where
  }

  return false
}

export const AnalyticsEvents: CollectionConfig = {
  slug: 'analytics-events',
  labels: { singular: '計測イベント', plural: '計測イベント' },
  admin: {
    group: '計測',
    useAsTitle: 'eventName',
    defaultColumns: ['eventName', 'occurredAt', 'screen', 'adCreative', 'video', 'durationSec'],
    description:
      '8-4 / 8-6 / 8-7。補-8-6-2 によりクライアントからバッチ送信される。集計は /api/reports/sponsor（補-8-4-1）、GA4 転送は MOCK（補-8-7-1）',
  },
  access: {
    // 補-8-6-2: 未ログイン・ゲストを含むアプリから計測イベントを送信するため create は誰でも可
    create: () => true,
    read: staffOrOwnSponsorEvents, // 補-8-4-1 / 補-8-9-2
    update: adminOnly,
    delete: adminOnly,
  },
  // POST /api/analytics-events/batch（T-15-4, T-15-5, T-15-6）。ルートレベル登録だと
  // 先頭セグメント `analytics-events` が先にコレクションスラッグとして解決されてしまうため、
  // rankings.ts と同じ理由でコレクション自身の endpoints に相対パスで登録する
  endpoints: [analyticsEventsBatchEndpoint],
  fields: [
    {
      name: 'eventName',
      type: 'select',
      label: 'イベント名',
      required: true,
      index: true, // 件数が多いため索引必須
      options: [
        { label: '画面表示 (screen_view)', value: 'screen_view' },
        { label: 'インプレッション (impression)', value: 'impression' },
        { label: 'クリック (click)', value: 'click' },
        { label: '動画再生開始 (video_start)', value: 'video_start' },
        { label: '動画進捗 (video_progress)', value: 'video_progress' },
        { label: '動画再生完了 (video_complete)', value: 'video_complete' },
        { label: 'シェア (share)', value: 'share' },
      ],
      admin: {
        description:
          '8-6 / 8-7。補-8-6-1 によりインプレッションは 50%・1 秒以上で 1 回。補-8-7-2 により screen_view は画面遷移フックで自動送信。補-8-4-2 により video_progress は 25/50/75/100% 到達で送信',
      },
    },
    {
      name: 'occurredAt',
      type: 'date',
      label: '発生日時',
      required: true,
      index: true, // 期間集計（補-8-4-1）で頻繁に絞り込むため索引必須
      admin: {
        description: '8-4。補-8-4-1 のレポート（from/to）で期間絞り込みに使う。クライアント発生時刻',
      },
    },
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      label: 'ユーザー',
      index: true,
      admin: { description: '8-7。ログイン済みの場合に設定' },
    },
    {
      name: 'deviceId',
      type: 'text',
      label: 'デバイスID',
      index: true,
      admin: { description: '補-6-1-1 / 8-7。ゲスト（未ログイン）の場合に設定' },
    },
    {
      name: 'screen',
      type: 'text',
      label: '画面',
      admin: { description: '補-8-7-2。screen_view の対象画面（expo-router のルート名）' },
    },
    {
      name: 'adCreative',
      type: 'relationship',
      relationTo: 'ad-creatives',
      label: '広告クリエイティブ',
      index: true,
      admin: {
        description:
          '8-6。impression / click の対象クリエイティブ。補-8-9-2 により sponsor ロールはこの値が自社のものだけ参照できる',
      },
    },
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'videos',
      label: '動画',
      index: true,
      admin: { description: '8-4。video_start / video_progress / video_complete の対象動画' },
    },
    {
      name: 'durationSec',
      type: 'number',
      label: '視聴時間（秒）',
      min: 0,
      admin: { description: '8-4。補-8-4-2 により video_progress の到達地点から視聴時間を集計する' },
    },
    {
      name: 'props',
      type: 'json',
      label: '付加プロパティ',
      admin: {
        description:
          '8-7。補-8-7-1 の GA4 Measurement Protocol 変換に渡す任意パラメータ（例: progressPercent, shareTarget）',
      },
    },
  ],
}

export default AnalyticsEvents
