import type { Access, CollectionConfig, Where } from 'payload'

import { editorOnly, isStaff } from '../access'

/**
 * 公開済み、かつ `publishedAt` が現在時刻以下のみ read（補-8-8-3 / 補-1-12-1）。
 * 下書きは公開 API に出さない。`publishedAt` が未来日時（＝予約公開）のものも
 * 一覧・詳細から除外する（補-1-12-1: 一覧 API が `publishedAt <= now` で絞る）。
 * スタッフ（admin / editor / operator）は下書き・予約公開分も参照できる。
 */
const readPublished: Access = ({ req }) => {
  if (isStaff(req.user as never)) return true
  const where: Where = {
    and: [
      { or: [{ _status: { equals: 'published' } }, { _status: { exists: false } }] },
      { publishedAt: { less_than_equal: new Date().toISOString() } },
    ],
  }
  return where
}

/**
 * ニュース（要求 1-9〜1-12）
 * 下書き→公開のステータスを持ち、`publishedAt` 未来日時は予約公開扱い（補-1-12-1）。
 */
export const News: CollectionConfig = {
  slug: 'news',
  labels: { singular: 'ニュース', plural: 'ニュース' },
  admin: {
    group: 'コンテンツ',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'tournament', 'isPinned', 'publishedAt', '_status'],
    description: '1-9〜1-12。編集可能ロールは admin / editor（補-1-12-2）',
  },
  // 補-8-8-3 / 補-1-12-1: 下書き / 公開のバージョニング
  versions: {
    drafts: true,
    maxPerDoc: 20,
  },
  access: {
    read: readPublished,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  fields: [
    { name: 'title', type: 'text', label: 'タイトル', required: true },
    {
      name: 'slug',
      type: 'text',
      label: 'スラッグ',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'ニュース詳細 URL に使用します' },
    },
    {
      name: 'body',
      type: 'richText',
      label: '本文',
      required: true,
      admin: {
        description:
          '1-10。見出し / 段落 / 画像 / リンク / 引用をレンダリングします（補-1-10-1）',
      },
    },
    { name: 'heroImage', type: 'upload', relationTo: 'media', label: 'メイン画像' },
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '関連大会',
      index: true,
      admin: { description: '1-9 大会詳細のニュースタブ / 補-1-10-2 の「関連大会」チップ' },
    },
    {
      name: 'players',
      type: 'relationship',
      relationTo: 'players',
      hasMany: true,
      label: '関連選手',
      index: true,
      admin: {
        description:
          '4-2 のお気に入り選手ニュース判定に使用します。1-9 の出場選手ニュース / 補-1-10-2 の「関連選手」チップにも使用',
      },
    },
    {
      name: 'category',
      type: 'select',
      label: 'カテゴリ',
      index: true,
      defaultValue: 'tournament',
      options: [
        { label: '大会', value: 'tournament' },
        { label: '選手', value: 'player' },
        { label: 'お知らせ', value: 'announcement' },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: '公開日時',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          '補-1-12-1。未来日時を指定すると予約公開扱い（一覧 API は publishedAt <= now で絞り込み）',
      },
    },
    {
      name: 'isPinned',
      type: 'checkbox',
      label: 'ホーム固定表示',
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          '1-11。ホームの最新ニュースで最上位に表示します（以降 publishedAt 降順で計 5 件／補-1-11-1）',
      },
    },
  ],
}

export default News
