import type { Access, CollectionConfig, Where } from 'payload'

import { adminOnly, createOwnOrDevice, deviceIdOf, isStaff } from '../access'

/**
 * ゲストセッション（要求 6-1 / 補-6-1-1）
 * 未ログインでもお気に入り・いいね・通知設定を保持するため、端末生成 UUID（deviceId）で識別する。
 * ログイン／新規登録時に `linkedUser` を設定し、ゲストデータをユーザーへ移行する。
 */

/**
 * 自分のセッションのみ参照・更新できる。
 * スタッフ（admin/editor/operator）は全件、ログインユーザーは linkedUser 一致、
 * ゲストは X-Device-Id ヘッダ一致のレコードのみ。
 */
const ownSession: Access = ({ req }) => {
  if (isStaff(req.user as never)) return true
  if (req.user?.id) {
    const byUser: Where = { linkedUser: { equals: req.user.id } }
    return byUser
  }
  const deviceId = deviceIdOf(req as never)
  if (deviceId) {
    const byDevice: Where = { deviceId: { equals: deviceId } }
    return byDevice
  }
  return false
}

export const GuestSessions: CollectionConfig = {
  slug: 'guest-sessions',
  labels: { singular: 'ゲストセッション', plural: 'ゲストセッション' },
  admin: {
    group: 'アカウント',
    useAsTitle: 'deviceId',
    defaultColumns: ['deviceId', 'linkedUser', 'lastSeenAt', 'createdAt'],
    description: '6-1 / 補-6-1-1。未ログイン利用者を deviceId で識別するためのセッション',
  },
  access: {
    read: ownSession,
    create: createOwnOrDevice,
    update: ownSession,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'deviceId',
      type: 'text',
      label: 'デバイスID',
      required: true,
      unique: true,
      index: true,
      admin: { description: '補-6-1-1。端末生成 UUID（アプリ側で SecureStore に保管）' },
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      label: '最終アクセス日時',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'linkedUser',
      type: 'relationship',
      relationTo: 'users',
      label: '移行先ユーザー',
      index: true,
      admin: {
        position: 'sidebar',
        description: '補-6-1-1。ログイン／新規登録時にゲストデータを移行したユーザー',
      },
    },
    {
      name: 'preferences',
      type: 'json',
      label: '端末設定',
      admin: { description: 'オンボーディング完了状態・表示設定などの端末ローカル設定のスナップショット' },
    },
  ],
}

export default GuestSessions
