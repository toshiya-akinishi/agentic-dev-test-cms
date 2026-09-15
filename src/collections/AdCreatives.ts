import type { Access, CollectionConfig, Where } from 'payload'

import { adminOnly } from '../access'

/**
 * 広告クリエイティブ（要求 8-3, 8-5 / 補-8-3-2, 補-8-3-4, 補-8-9-2）
 *
 * `tournament` / `player` により大会別・選手別の出し分けを行い、
 * 合致するものがなければ全体配信（両方未設定）のクリエイティブにフォールバックする（補-8-3-2）。
 * 同一枠に複数候補がある場合は `weight` による重み付きランダム選択（補-8-3-4）。
 */

/**
 * 参照は原則公開（アプリに広告を出すため / 8-5）。
 * ただし sponsor ロールのユーザーは自社クリエイティブのみ見えるように絞る（補-8-9-2）。
 */
const anyoneExceptOtherSponsors: Access = ({ req }) => {
  const user = req.user as
    | { role?: string | null; sponsor?: string | number | { id?: string | number } | null }
    | null
    | undefined

  if (user?.role === 'sponsor') {
    const sponsor = user.sponsor
    const sponsorId =
      sponsor && typeof sponsor === 'object' ? (sponsor.id ?? null) : (sponsor ?? null)
    // 所属スポンサー未設定の sponsor ロールには何も見せない（補-8-9-2: 他社データは一覧に出さない）
    if (sponsorId === null || sponsorId === undefined) return false
    const where: Where = { sponsor: { equals: sponsorId } }
    return where
  }

  return true
}

export const AdCreatives: CollectionConfig = {
  slug: 'ad-creatives',
  labels: { singular: '広告クリエイティブ', plural: '広告クリエイティブ' },
  admin: {
    group: 'スポンサー・広告',
    useAsTitle: 'name',
    defaultColumns: ['name', 'sponsor', 'slot', 'tournament', 'player', 'weight', 'isActive'],
    description:
      '8-3 / 8-5。補-8-3-2 により大会別・選手別に出し分け、未設定のものを全体配信としてフォールバックする。補-8-9-2 により sponsor ロールには自社分のみ表示',
  },
  access: {
    read: anyoneExceptOtherSponsors, // 補-8-9-2
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'クリエイティブ名',
      required: true,
      admin: { description: '8-3。CMS 上の識別名' },
    },
    {
      name: 'sponsor',
      type: 'relationship',
      relationTo: 'sponsors',
      label: 'スポンサー',
      required: true,
      index: true,
      admin: { description: '補-8-9-2。sponsor ロールはこの値が自社と一致するものだけ参照できる' },
    },
    {
      name: 'slot',
      type: 'relationship',
      relationTo: 'ad-slots',
      label: '広告枠',
      required: true,
      index: true,
      admin: { description: '補-8-3-1。配信先の枠' },
    },
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '対象大会',
      index: true,
      admin: { description: '補-8-3-2。大会別配信。未設定の場合は全体配信としてフォールバックに使う' },
    },
    {
      name: 'player',
      type: 'relationship',
      relationTo: 'players',
      label: '対象選手',
      index: true,
      admin: { description: '補-8-3-2。選手別配信。未設定の場合は全体配信としてフォールバックに使う' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'バナー画像',
      admin: { description: '補-8-3-3。format=banner のとき使用' },
    },
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'videos',
      label: '動画CM',
      admin: { description: '補-8-3-3。format=video のとき使用（video_pre 枠など）' },
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'news',
      label: 'タイアップ記事',
      admin: { description: '補-8-3-3。format=tieup_article のとき使用' },
    },
    {
      name: 'linkUrl',
      type: 'text',
      label: 'リンクURL',
      admin: { description: '8-5。タップ時の遷移先。未設定時はスポンサーの landingUrl を使う' },
    },
    {
      name: 'weight',
      type: 'number',
      label: '配信ウェイト',
      required: true,
      defaultValue: 1,
      min: 0,
      admin: { description: '補-8-3-4。同一枠に複数候補がある場合の重み付きランダム選択に使う' },
    },
    {
      name: 'startAt',
      type: 'date',
      label: '配信開始日時',
      index: true,
      admin: { description: '補-8-3-4。配信期間での絞り込みに使う' },
    },
    {
      name: 'endAt',
      type: 'date',
      label: '配信終了日時',
      index: true,
      admin: { description: '補-8-3-4。配信期間での絞り込みに使う' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      label: '配信中',
      defaultValue: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: '補-8-3-4。OFF のクリエイティブは配信対象から除外する',
      },
    },
  ],
}

export default AdCreatives
