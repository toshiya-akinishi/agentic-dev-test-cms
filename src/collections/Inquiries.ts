import type { Access, CollectionConfig, Where } from 'payload'

import { adminOnly, deviceIdOf, isStaff, staffOnly } from '../access'

/**
 * お問い合わせ（要求 6-14 / 補-6-14-1, 補-6-14-2）
 * ゲストでも送信できる（create は誰でも可）。CMS 側で open → in_progress → closed を管理する。
 * 返信機能は Ph1 対象外（メール返信の運用前提）。
 */

/**
 * スタッフは全件、それ以外は自分が送信した問い合わせのみ参照できる。
 * 所有判定は補-6-1-1 に準じるが、所有者フィールド名が `submittedBy` のため
 * 共通の `staffOrOwner`（`owner` 前提）ではなく個別に定義する。
 */
const staffOrSubmitter: Access = ({ req }) => {
  if (isStaff(req.user as never)) return true
  if (req.user?.id) {
    const bySubmitter: Where = { submittedBy: { equals: req.user.id } }
    return bySubmitter
  }
  const deviceId = deviceIdOf(req as never)
  if (deviceId) {
    const byDevice: Where = { deviceId: { equals: deviceId } }
    return byDevice
  }
  return false
}

export const Inquiries: CollectionConfig = {
  slug: 'inquiries',
  labels: { singular: 'お問い合わせ', plural: 'お問い合わせ' },
  admin: {
    group: 'ヘルプ',
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'status', 'email', 'createdAt'],
    description: '6-14。補-6-14-2 により対応状況のみ CMS で管理し、返信はメール運用で行う',
  },
  access: {
    // 補-6-14-1: ゲスト（未ログイン）でも問い合わせできる
    create: () => true,
    read: staffOrSubmitter,
    update: staffOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: '氏名',
      required: true,
      admin: { description: '補-6-14-1。ログイン時はユーザー情報から自動補完する' },
    },
    {
      name: 'email',
      type: 'email',
      label: 'メールアドレス',
      required: true,
      admin: { description: '補-6-14-1。返信先（補-6-14-2 によりメール運用）' },
    },
    {
      name: 'category',
      type: 'select',
      label: '種別',
      required: true,
      options: [
        { label: 'アカウント', value: 'account' },
        { label: 'チケット', value: 'ticket' },
        { label: '動画', value: 'video' },
        { label: '通知', value: 'notification' },
        { label: '現地観戦', value: 'onsite' },
        { label: 'その他', value: 'other' },
      ],
      admin: { description: '補-6-14-1' },
    },
    {
      name: 'body',
      type: 'textarea',
      label: '本文',
      required: true,
      admin: { description: '補-6-14-1' },
    },
    {
      name: 'status',
      type: 'select',
      label: '対応状況',
      required: true,
      defaultValue: 'open',
      options: [
        { label: '未対応', value: 'open' },
        { label: '対応中', value: 'in_progress' },
        { label: '対応済み', value: 'closed' },
      ],
      admin: { position: 'sidebar', description: '補-6-14-2' },
    },
    {
      name: 'submittedBy',
      type: 'relationship',
      relationTo: 'users',
      label: '送信ユーザー',
      index: true,
      admin: { position: 'sidebar', description: 'ログイン済みで送信された場合に設定' },
    },
    {
      name: 'deviceId',
      type: 'text',
      label: 'デバイスID',
      index: true,
      admin: { position: 'sidebar', description: '補-6-1-1。ゲスト（未ログイン）で送信された場合に設定' },
    },
  ],
}

export default Inquiries
