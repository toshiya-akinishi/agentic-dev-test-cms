import type { CollectionConfig } from 'payload'

import { adminOnly, anyone } from '../access'

/**
 * 広告枠（要求 8-3, 8-5 / 補-8-3-1, 補-8-3-3, 補-8-5-1）
 * Ph1 では 5 箇所の枠を定義する。クリエイティブ未設定時、アプリ側は枠を非表示にする（補-8-5-1）。
 */
export const AdSlots: CollectionConfig = {
  slug: 'ad-slots',
  labels: { singular: '広告枠', plural: '広告枠' },
  admin: {
    group: 'スポンサー・広告',
    useAsTitle: 'name',
    defaultColumns: ['name', 'key', 'format', 'size'],
    description:
      '補-8-3-1。Ph1 の 5 枠: home_top_banner / home_inline / leaderboard_inline（10 行ごと）/ video_pre（動画再生前）/ tournament_detail_banner。補-8-5-1 によりクリエイティブ未設定時は枠を非表示にする',
  },
  access: {
    read: anyone,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'key',
      type: 'text',
      label: '枠キー',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          '補-8-3-1。Ph1 の 5 枠: home_top_banner / home_inline / leaderboard_inline / video_pre / tournament_detail_banner。アプリ側はこのキーで枠を引き当てる',
      },
    },
    {
      name: 'name',
      type: 'text',
      label: '枠名',
      required: true,
      admin: { description: '8-3。CMS 上の表示名' },
    },
    {
      name: 'format',
      type: 'select',
      label: 'フォーマット',
      required: true,
      options: [
        { label: 'バナー画像', value: 'banner' },
        { label: '動画CM', value: 'video' },
        { label: 'タイアップ記事', value: 'tieup_article' },
      ],
      admin: { description: '補-8-3-3。バナー画像 / 動画CM / タイアップ記事（news 参照）の 3 種' },
    },
    {
      name: 'size',
      type: 'text',
      label: 'サイズ',
      admin: { description: '8-5。表示サイズの目安（例: 320x100, 16:9）' },
    },
  ],
}

export default AdSlots
