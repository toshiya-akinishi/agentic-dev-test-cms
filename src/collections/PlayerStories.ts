import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * 選手ストーリー（要求 4-1）
 * 補-4-1-1: 「テキスト + 動画」の記事形式。選手詳細の「ストーリー」タブと
 * ホームのストーリー動画レーン（2-13）の両方から到達する。
 */
export const PlayerStories: CollectionConfig = {
  slug: 'player-stories',
  labels: { singular: '選手ストーリー', plural: '選手ストーリー' },
  admin: {
    group: '選手',
    useAsTitle: 'title',
    defaultColumns: ['title', 'player', 'publishedAt', 'order'],
    description: '選手ストーリー記事（4-1 / 補-4-1-1）',
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'player',
      type: 'relationship',
      relationTo: 'players',
      label: '選手',
      required: true,
      index: true,
      admin: { description: '4-1 対象選手' },
    },
    {
      name: 'title',
      type: 'text',
      label: 'タイトル',
      required: true,
      admin: { description: '4-1' },
    },
    {
      name: 'body',
      type: 'richText',
      label: '本文',
      admin: { description: '補-4-1-1 テキストパート' },
    },
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'videos',
      label: '動画',
      admin: { description: '補-4-1-1 動画パート（2-13 ストーリー動画レーンと共通）' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: '公開日時',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: '4-1 新着順の基準' },
    },
    {
      name: 'order',
      type: 'number',
      label: '表示順',
      defaultValue: 0,
      admin: { position: 'sidebar', description: '4-1 選手詳細ストーリータブ内の並び順' },
    },
  ],
}

export default PlayerStories
