import type { Access, CollectionConfig } from 'payload'

import { editorOnly, isStaff } from '../access'

/** 公開済みのみ read（補-8-8-3）。下書きは公開 API に出さない */
const readPublished: Access = ({ req }) => {
  if (isStaff(req.user as never)) return true
  return {
    or: [{ _status: { equals: 'published' } }, { _status: { exists: false } }],
  }
}

/**
 * 観戦ガイド記事（要求 1-1）
 * 1 記事は「見出し + 本文リッチテキスト + 画像 0..n + 動画 0..1」で構成する（補-1-1-2）。
 */
export const GuideArticles: CollectionConfig = {
  slug: 'guide-articles',
  labels: { singular: '観戦ガイド記事', plural: '観戦ガイド記事' },
  admin: {
    group: 'コンテンツ',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'order', 'updatedAt', '_status'],
    description: '1-1。ゴルフ観戦のルール・マナー初心者ガイド（写真／動画付き）',
  },
  // 補-8-8-3: 下書き / 公開のバージョニング
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
    },
    {
      name: 'category',
      type: 'select',
      label: 'カテゴリ',
      required: true,
      index: true,
      defaultValue: 'beginner',
      options: [
        { label: 'マナー', value: 'manner' },
        { label: 'ルール', value: 'rule' },
        { label: 'はじめて', value: 'beginner' },
      ],
      admin: { description: '補-1-1-1 の 3 分類。一覧はカテゴリタブで切り替えます' },
    },
    {
      name: 'body',
      type: 'richText',
      label: '本文',
      required: true,
      admin: {
        description: '補-1-1-2。用語集へのリンクは手動で設定します（自動リンク化はしない／補-1-2-3）',
      },
    },
    {
      name: 'images',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      label: '画像',
      admin: { description: '補-1-1-2。0..n 枚' },
    },
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'videos',
      label: '動画',
      admin: {
        description: '補-1-1-2。0..1 本。videos への参照（ガイド専用アップロードはしません）',
      },
    },
    {
      name: 'order',
      type: 'number',
      label: '表示順',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'カテゴリ内の表示順（昇順）' },
    },
  ],
}

export default GuideArticles
