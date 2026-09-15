import type { Access, CollectionConfig, Where } from 'payload'

import { adminOnly, authenticated, isAdmin } from '../access'

/**
 * チケット注文（要求 5-1, 5-3 / 補-5-1-2, 補-5-1-4, 補-5-3-2）
 *
 * 購入にはログインが必須（ゲスト購入不可 / 6-1 の機能制限・補-5-1-2）のため、
 * `user` は必須。`deviceId` による所有判定（補-6-1-1）は用いない。
 * 決済は MOCK（補-5-1-4）で、`paymentRef` に `MOCK-xxxx` が入る。
 */

/** admin は全件、それ以外はログインユーザー自身の注文のみ（8-9） */
const adminOrOwnOrder: Access = ({ req }) => {
  if (isAdmin(req.user as never)) return true
  if (req.user?.id) {
    const where: Where = { user: { equals: req.user.id } }
    return where
  }
  return false
}

export const TicketOrders: CollectionConfig = {
  slug: 'ticket-orders',
  labels: { singular: 'チケット注文', plural: 'チケット注文' },
  admin: {
    group: 'チケット',
    useAsTitle: 'orderNo',
    defaultColumns: ['orderNo', 'user', 'ticketType', 'quantity', 'amount', 'status', 'purchasedAt'],
    description:
      '5-1 / 5-3。決済は MOCK（補-5-1-4）。大会中止時は補-5-1-5 により CMS から一括で status=cancelled にする運用',
  },
  access: {
    // 8-9: fan は自分の注文のみ CRUD
    create: authenticated, // 補-5-1-2: 購入にはログインが必須（ゲスト購入不可 / 6-1）
    read: adminOrOwnOrder,
    update: adminOrOwnOrder,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'orderNo',
      type: 'text',
      label: '注文番号',
      required: true,
      unique: true,
      index: true,
      admin: { description: '5-1。補-5-3-2 により券面にも表示する' },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      label: '購入ユーザー',
      required: true,
      index: true,
      admin: {
        description: '補-5-1-2 / 6-1。購入にはログインが必須のためゲスト購入は不可',
      },
    },
    {
      name: 'ticketType',
      type: 'relationship',
      relationTo: 'ticket-types',
      label: '券種',
      required: true,
      index: true,
      admin: { description: '5-1' },
    },
    {
      name: 'quantity',
      type: 'number',
      label: '枚数',
      required: true,
      min: 1,
      defaultValue: 1,
      admin: { description: '5-1。補-5-3-2 により券面にも表示する' },
    },
    {
      name: 'amount',
      type: 'number',
      label: '合計金額（円）',
      required: true,
      min: 0,
      admin: { description: '5-1。券種価格 × 枚数' },
    },
    {
      name: 'status',
      type: 'select',
      label: 'ステータス',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: '未決済', value: 'pending' },
        { label: '決済済み', value: 'paid' },
        { label: 'キャンセル', value: 'cancelled' },
        { label: '使用済み', value: 'used' },
      ],
      admin: {
        position: 'sidebar',
        description:
          '5-1 / 5-3。補-5-1-4 により MOCK 決済は常に paid。補-5-3-4 により used はデータモデル上のみ（もぎり運用は Ph1 対象外）',
      },
    },
    {
      name: 'paymentRef',
      type: 'text',
      label: '決済参照ID',
      admin: {
        description:
          '補-5-1-4。MOCK 決済の参照（例: MOCK-xxxx）。外部決済への差し替え点は 1 関数に隔離する',
      },
    },
    {
      name: 'qrPayload',
      type: 'text',
      label: 'QR ペイロード',
      admin: {
        description:
          '5-3。補-5-3-2 により電子チケットの QR コードに埋め込む文字列。再利用防止の検証は Ph1 対象外',
      },
    },
    {
      name: 'purchasedAt',
      type: 'date',
      label: '購入日時',
      index: true,
      admin: { description: '5-1。補-5-1-4 の MOCK 決済成功時に設定する' },
    },
  ],
}

export default TicketOrders
