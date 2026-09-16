import type { CollectionConfig } from 'payload'

import { anyone, operatorOnly } from '../access'
import { notificationsEmergencyEndpoint } from '../endpoints/notificationsEmergency'
import { notificationsMarkReadEndpoint, notificationsMeEndpoint } from '../endpoints/notificationsCenter'
import { notificationsRunChecksEndpoint } from '../endpoints/notificationsRunChecks'

/**
 * 通知（配信履歴＝通知センター）（要求 6-17 / 02-data-model.md E章）
 *
 * 発行は運営（operator）のみ。read は anyone とし、
 * 宛先（audience / targetUser / targetDeviceId）による絞り込みは
 * 通知センター用エンドポイント側で行う。
 * 保持期間は 30 日、緊急通知は未読の間ピン留め表示する（補-6-17-3）。
 */
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  labels: { singular: '通知', plural: '通知' },
  admin: {
    group: '通知',
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'audience', 'priority', 'sentAt'],
    description:
      '6-17 通知センター。宛先の絞り込みはエンドポイント側で行う。' +
      '保持期間 30 日・緊急通知は未読の間ピン留め（補-6-17-3）',
  },
  access: {
    read: anyone,
    create: operatorOnly,
    update: operatorOnly,
    delete: operatorOnly,
  },
  defaultSort: '-sentAt',
  // T-14-1/2/3/6/7/8/9/11: 相対パスで登録する。ルート（src/endpoints/index.ts）に置くと
  // 先頭セグメント `notifications` が先にコレクションスラッグとして解決され、
  // コレクション標準の `/:id` 等に奪われるため（cutProbability.ts / rankings.ts と同じ理由）。
  endpoints: [
    notificationsEmergencyEndpoint, // POST /api/notifications/emergency (T-14-3)
    notificationsRunChecksEndpoint, // POST /api/notifications/run-checks (T-14-2/6/7/8/9)
    notificationsMeEndpoint, // GET  /api/notifications/me (T-14-11)
    notificationsMarkReadEndpoint, // POST /api/notifications/mark-read (T-14-11)
  ],
  fields: [
    {
      name: 'type',
      type: 'select',
      label: '通知種別',
      required: true,
      index: true,
      options: [
        { label: '緊急（中止・順延・雷）', value: 'emergency' },
        { label: '選手イベント', value: 'player_event' },
        { label: 'スタートリマインド', value: 'start_reminder' },
        { label: '優勝争い', value: 'title_race' },
        { label: 'ニュース', value: 'news' },
        { label: 'カットライン', value: 'cut_line' },
      ],
      admin: {
        description:
          'emergency は 1-23（マスタースイッチで停止不可 / ADR-015）。' +
          'player_event=4-16, start_reminder=4-17, title_race=4-19/3-5, news=1-9, cut_line=4-18',
      },
    },
    { name: 'title', type: 'text', label: 'タイトル', required: true },
    { name: 'body', type: 'textarea', label: '本文', required: true },
    {
      name: 'deepLink',
      type: 'text',
      label: 'ディープリンク',
      admin: {
        description:
          '補-6-17-2。タップで該当画面（リーダーボード／選手詳細／大会詳細／動画）へ遷移する URL',
      },
    },
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '関連大会',
    },
    {
      name: 'player',
      type: 'relationship',
      relationTo: 'players',
      label: '関連選手',
    },
    {
      name: 'audience',
      type: 'select',
      label: '配信対象',
      required: true,
      defaultValue: 'all',
      options: [
        { label: '全員', value: 'all' },
        { label: '特定ユーザー', value: 'user' },
        { label: '特定端末', value: 'device' },
      ],
      admin: { position: 'sidebar', description: '6-17。絞り込みはエンドポイント側で実施' },
    },
    {
      name: 'targetUser',
      type: 'relationship',
      relationTo: 'users',
      label: '宛先ユーザー',
      index: true,
      admin: {
        condition: (data) => data?.audience === 'user',
        description: 'audience=user のときの宛先',
      },
    },
    {
      name: 'targetDeviceId',
      type: 'text',
      label: '宛先デバイスID',
      index: true,
      admin: {
        condition: (data) => data?.audience === 'device',
        description: '補-6-1-1。audience=device のときの宛先（ゲスト向け）',
      },
    },
    {
      name: 'sentAt',
      type: 'date',
      label: '配信日時',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' }, position: 'sidebar' },
    },
    {
      name: 'readBy',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      label: '既読ユーザー',
      admin: { description: '補-6-17-1。既読/未読の管理に使用（未読数をタブバーのバッジに表示）' },
    },
    {
      name: 'priority',
      type: 'select',
      label: '優先度',
      defaultValue: 'normal',
      options: [
        { label: '高', value: 'high' },
        { label: '通常', value: 'normal' },
        { label: '低', value: 'low' },
      ],
      admin: {
        position: 'sidebar',
        description: '補-6-17-3。緊急通知は high とし、未読の間は一覧最上位にピン留めする',
      },
    },
    {
      name: 'dedupeKey',
      type: 'text',
      label: '重複排除キー（内部用）',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        hidden: true,
        description:
          'T-14-2。run-checks（判定ジョブ）が同一イベント×宛先の重複生成を防ぐための内部キー。' +
          '手動発行（緊急通知等）では未設定のままでよい',
      },
    },
  ],
}

export default Notifications
