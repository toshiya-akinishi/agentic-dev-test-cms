import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * ランキング（要求 1-5, 1-6, 1-7）
 * docs/02-data-model.md C章 `rankings`:
 * `type` ごとに最新 1 レコードを参照し、過去分は履歴として残す（前週比表示に使用）。
 */
export const Rankings: CollectionConfig = {
  slug: 'rankings',
  labels: { singular: 'ランキング', plural: 'ランキング' },
  admin: {
    group: 'ランキング',
    useAsTitle: 'id',
    defaultColumns: ['type', 'season', 'asOf', 'updatedAt'],
    description: '賞金・ポイント・各種スタッツランキング（1-5 / 1-6 / 1-7）',
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'season',
      type: 'relationship',
      relationTo: 'seasons',
      label: 'シーズン',
      required: true,
      index: true,
      admin: { description: '1-5 対象シーズン' },
    },
    {
      name: 'type',
      type: 'select',
      label: 'ランキング種別',
      required: true,
      index: true,
      options: [
        { label: '賞金ランキング', value: 'money' },
        { label: 'ポイントランキング', value: 'points' },
        { label: '新人王ランキング', value: 'rookie' },
        { label: '平均飛距離', value: 'driving_distance' },
        { label: 'パーオン率', value: 'greens_in_regulation' },
        { label: 'サンドセーブ率', value: 'sand_save' },
        { label: 'パット', value: 'putting' },
        { label: '平均ストローク', value: 'scoring_average' },
      ],
      admin: { description: '1-5 / 1-6 / 1-7。type ごとに最新 1 レコードを参照する' },
    },
    {
      name: 'asOf',
      type: 'date',
      label: '集計基準日',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description: '1-5: この日付が最新のレコードを表示。過去分は前週比表示のため履歴として残す',
      },
    },
    {
      name: 'entries',
      type: 'array',
      label: 'ランキング明細',
      labels: { singular: '明細', plural: '明細' },
      admin: { description: '1-5 / 1-6 / 1-7 の一覧行' },
      fields: [
        { name: 'rank', type: 'number', label: '順位', required: true, min: 1 },
        {
          name: 'player',
          type: 'relationship',
          relationTo: 'players',
          label: '選手',
          required: true,
        },
        {
          name: 'value',
          type: 'number',
          label: '数値',
          required: true,
          admin: { description: '賞金額・ポイント・平均値など type に応じた値' },
        },
        {
          name: 'valueLabel',
          type: 'text',
          label: '表示用テキスト',
          admin: { description: '例: 「120,500,000円」「298.4y」。単位付きの整形済み文字列' },
        },
        { name: 'events', type: 'number', label: '試合数', min: 0 },
        {
          name: 'previousRank',
          type: 'number',
          label: '前回順位',
          min: 1,
          admin: { description: '前週比（↑↓）表示に使用' },
        },
      ],
    },
  ],
}

export default Rankings
