import type { CollectionConfig } from 'payload'

import { createOwnOrDevice, ownerOrDevice } from '../access'
import { ownerFields } from '../fields'

/**
 * デバイストークン（プッシュ通知の送信先 / 02-data-model.md E章）
 *
 * ownerFields() により、ログインユーザー（owner）とゲスト（deviceId）の
 * どちらでも登録できる（補-6-1-1）。ゲストでもプッシュ通知を受け取れるようにするため。
 * 退会時は物理削除する（補-6-7-2）。
 */
export const DeviceTokens: CollectionConfig = {
  slug: 'device-tokens',
  labels: { singular: 'デバイストークン', plural: 'デバイストークン' },
  admin: {
    group: '通知',
    useAsTitle: 'token',
    defaultColumns: ['token', 'platform', 'owner', 'deviceId', 'lastActiveAt'],
    description:
      'プッシュ通知の送信先トークン。未ログインでも deviceId で保持する（補-6-1-1）。' +
      '退会時は物理削除する（補-6-7-2）',
  },
  access: {
    read: ownerOrDevice,
    create: createOwnOrDevice,
    update: ownerOrDevice,
    delete: ownerOrDevice,
  },
  fields: [
    {
      name: 'token',
      type: 'text',
      label: 'プッシュトークン',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Expo / FCM / APNs のデバイストークン' },
    },
    {
      name: 'platform',
      type: 'select',
      label: 'プラットフォーム',
      required: true,
      options: [
        { label: 'iOS', value: 'ios' },
        { label: 'Android', value: 'android' },
      ],
      admin: { position: 'sidebar' },
    },
    // owner（→users）/ deviceId（text）: 補-6-1-1
    ...ownerFields(),
    {
      name: 'lastActiveAt',
      type: 'date',
      label: '最終アクティブ日時',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: '長期間未使用のトークンは配信対象から除外する',
      },
    },
  ],
}

export default DeviceTokens
