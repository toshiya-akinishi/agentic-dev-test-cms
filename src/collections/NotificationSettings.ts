import type { CollectionConfig } from 'payload'

import { createOwnOrDevice, ownerOrDevice } from '../access'
import { ownerFields } from '../fields'

/**
 * 通知設定（要求 4-16, 4-17, 6-16 / 02-data-model.md E章）
 *
 * ownerFields() により、ログインユーザー（owner）とゲスト（deviceId）の
 * どちらでも保持できる（補-6-1-1）。
 * 選手別の通知イベントは 8 種（補-4-16-1）。お気に入り未登録の選手にも設定できる（4-16, 4-19）。
 */
export const NotificationSettings: CollectionConfig = {
  slug: 'notification-settings',
  labels: { singular: '通知設定', plural: '通知設定' },
  admin: {
    group: '通知',
    useAsTitle: 'id',
    defaultColumns: ['owner', 'deviceId', 'master', 'titleRace', 'updatedAt'],
    description:
      '4-16 / 4-17 / 6-16。ユーザーまたは端末ごとに 1 レコード。' +
      '緊急通知（1-23）はマスタースイッチでも停止できない（ADR-015 / 補-6-16-1）',
  },
  access: {
    read: ownerOrDevice,
    create: createOwnOrDevice,
    update: ownerOrDevice,
    delete: ownerOrDevice,
  },
  fields: [
    // owner（→users）/ deviceId（text）: 補-6-1-1
    ...ownerFields(),
    {
      name: 'master',
      type: 'checkbox',
      label: 'マスタースイッチ',
      defaultValue: true,
      admin: {
        description:
          '6-16。プッシュ通知全体の ON/OFF。OFF にすると緊急通知を除く全通知を停止する（補-6-16-1）',
      },
    },
    {
      name: 'emergency',
      type: 'checkbox',
      label: '緊急通知（中止・順延・雷）',
      defaultValue: true,
      admin: {
        readOnly: true,
        description:
          '1-23 / ADR-015。安全に関わる情報のため OFF 不可（常時 true）。' +
          'マスタースイッチ OFF でも配信される（補-6-16-1）',
      },
    },
    {
      name: 'titleRace',
      type: 'checkbox',
      label: '優勝争い通知',
      defaultValue: false,
      admin: {
        description:
          '3-5 / 4-19。優勝争い情報のリアルタイム通知。選手別設定とは独立させる（補-4-19-1）',
      },
    },
    {
      name: 'perPlayer',
      type: 'array',
      label: '選手別通知設定',
      labels: { singular: '選手別設定', plural: '選手別設定' },
      admin: {
        description:
          '補-4-16-1 の 8 イベント。お気に入り登録していない選手も設定可能（4-16, 4-19 / 補-4-16-2）。' +
          '初期値はお気に入り選手に対して バーディ / イーグル / スタート30分前 のみ ON（補-4-16-3）',
      },
      fields: [
        {
          name: 'player',
          type: 'relationship',
          relationTo: 'players',
          label: '選手',
          required: true,
          index: true,
        },
        {
          name: 'birdie',
          type: 'checkbox',
          label: 'バーディ',
          defaultValue: true,
          admin: { description: '補-4-16-1 / 補-4-16-3（初期値 ON）' },
        },
        {
          name: 'eagle',
          type: 'checkbox',
          label: 'イーグル以上',
          defaultValue: true,
          admin: { description: '補-4-16-1 / 補-4-16-3（初期値 ON）' },
        },
        {
          name: 'bogeyOrWorse',
          type: 'checkbox',
          label: 'ボギー以下',
          defaultValue: false,
          admin: { description: '補-4-16-1' },
        },
        {
          name: 'cutLineChange',
          type: 'checkbox',
          label: 'カット圏内変動',
          defaultValue: false,
          admin: { description: '補-4-16-1。確定通知は 4-18 側（補-4-18-1）' },
        },
        {
          name: 'top10',
          type: 'checkbox',
          label: 'トップ10入り',
          defaultValue: false,
          admin: { description: '補-4-16-1' },
        },
        {
          name: 'startReminder30',
          type: 'checkbox',
          label: 'スタート30分前リマインド',
          defaultValue: true,
          admin: { description: '4-17 / 補-4-17-1（初期値 ON）' },
        },
        {
          name: 'startReminder15',
          type: 'checkbox',
          label: 'スタート15分前リマインド',
          defaultValue: false,
          admin: { description: '4-17 / 補-4-17-1' },
        },
        {
          name: 'goodScore',
          type: 'checkbox',
          label: '好スコア',
          defaultValue: false,
          admin: {
            description:
              '4-15 / 補-4-15-1。通算 -4 以下到達、または 1 ホールでイーグル以上（定義は app-settings で変更可）',
          },
        },
      ],
    },
  ],
}

export default NotificationSettings
