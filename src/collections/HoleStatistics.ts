import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * ホール別エリア統計（要求 1-47）
 * 補-1-47-1: エリア別成功確率は事前集計値を参照し、実時間計算は行わない。
 */
export const HoleStatistics: CollectionConfig = {
  slug: 'hole-statistics',
  labels: { singular: 'ホール統計', plural: 'ホール統計' },
  admin: {
    group: 'スコア・ショット',
    useAsTitle: 'id',
    defaultColumns: ['tournament', 'hole', 'zone', 'birdieRate', 'avgStrokes', 'sampleSize'],
    description: 'エリア別ショット成功確率の事前集計（1-47 / 補-1-47-1）',
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'tournament',
      type: 'relationship',
      relationTo: 'tournaments',
      label: '大会',
      required: true,
      index: true,
      admin: { description: '1-47 集計対象の大会' },
    },
    {
      name: 'hole',
      type: 'number',
      label: 'ホール',
      required: true,
      min: 1,
      max: 18,
      index: true,
      admin: { description: '1-47 集計対象ホール' },
    },
    {
      name: 'zone',
      type: 'select',
      label: 'ゾーン',
      required: true,
      options: [
        { label: 'フェアウェイ左', value: 'fw_left' },
        { label: 'フェアウェイ中央', value: 'fw_center' },
        { label: 'フェアウェイ右', value: 'fw_right' },
        { label: 'ラフ左', value: 'rough_left' },
        { label: 'ラフ右', value: 'rough_right' },
        { label: 'バンカー', value: 'bunker' },
        { label: 'グリーン', value: 'green' },
      ],
      admin: { description: '補-1-47-1 コースマップ上のゾーン区分（Birdie% でヒートマップ表示）' },
    },
    {
      name: 'birdieRate',
      type: 'number',
      label: 'バーディ率（%）',
      min: 0,
      max: 100,
      admin: { description: '補-1-47-1 ヒートマップの色分け基準' },
    },
    {
      name: 'parRate',
      type: 'number',
      label: 'パー率（%）',
      min: 0,
      max: 100,
      admin: { description: '補-1-47-2 ゾーンタップ時に表示' },
    },
    {
      name: 'bogeyRate',
      type: 'number',
      label: 'ボギー率（%）',
      min: 0,
      max: 100,
      admin: { description: '補-1-47-2 ゾーンタップ時に表示' },
    },
    {
      name: 'avgStrokes',
      type: 'number',
      label: '平均ストローク',
      min: 0,
      admin: { description: '補-1-47-2 ゾーンタップ時に表示' },
    },
    {
      name: 'sampleSize',
      type: 'number',
      label: 'サンプル数',
      min: 0,
      admin: { description: '補-1-47-2: 30 未満のゾーンはアプリ側で「参考値」と注記する' },
    },
  ],
}

export default HoleStatistics
