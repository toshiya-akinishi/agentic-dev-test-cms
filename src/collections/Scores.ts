import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

/**
 * スコア（ラウンド単位） — 要求 3-1, 3-2, 3-6
 * docs/02-data-model.md C章 `scores` に対応。
 * 補-4-14-1 のカット通過確率 `cutProbability` を追加している。
 */
export const Scores: CollectionConfig = {
  slug: 'scores',
  labels: { singular: 'スコア', plural: 'スコア' },
  admin: {
    group: 'スコア・ショット',
    useAsTitle: 'id',
    defaultColumns: ['player', 'round', 'position', 'toPar', 'today', 'thru', 'status'],
    description: 'ラウンド単位のスコア（3-1 リーダーボード / 3-2 Hole-by-Hole / 3-6 スタッツ）',
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'round',
      type: 'relationship',
      relationTo: 'rounds',
      label: 'ラウンド',
      required: true,
      index: true, // リーダーボードはラウンド単位で引くため必須のインデックス
      admin: { description: '3-1 対象ラウンド' },
    },
    {
      name: 'player',
      type: 'relationship',
      relationTo: 'players',
      label: '選手',
      required: true,
      index: true, // 選手別スコア・出場大会履歴（補-3-9-2）で引く
      admin: { description: '3-1 対象選手' },
    },
    {
      name: 'position',
      type: 'number',
      label: '順位',
      min: 1,
      admin: { description: '補-3-1-1 リーダーボードの順位' },
    },
    {
      name: 'positionTied',
      type: 'checkbox',
      label: 'タイ順位',
      defaultValue: false,
      admin: { description: '補-3-1-4 同スコア時の T 表記に使用' },
    },
    {
      name: 'toPar',
      type: 'number',
      label: 'トータル（対パー）',
      required: true,
      defaultValue: 0,
      admin: { description: '補-3-1-1 Total (To Par)' },
    },
    {
      name: 'strokes',
      type: 'number',
      label: '総ストローク',
      required: true,
      min: 0,
      admin: { description: '3-1' },
    },
    {
      name: 'thru',
      type: 'number',
      label: 'Thru（消化ホール数）',
      min: 0,
      max: 18,
      admin: { description: '補-3-1-1 Thru 列。18 で当該ラウンド終了' },
    },
    {
      name: 'today',
      type: 'number',
      label: 'Today（当日の対パー）',
      admin: { description: '補-3-1-1 Today 列' },
    },
    {
      name: 'status',
      type: 'select',
      label: '状態',
      required: true,
      defaultValue: 'playing',
      index: true,
      options: [
        { label: 'プレー中', value: 'playing' },
        { label: '終了', value: 'finished' },
        { label: '予選落ち（CUT）', value: 'cut' },
        { label: '棄権（WD）', value: 'wd' },
        { label: '失格（DQ）', value: 'dq' },
      ],
      admin: { description: '補-3-1-4 CUT / WD / DQ のバッジ表示に使用' },
    },
    {
      name: 'cutProbability',
      type: 'number',
      label: 'カット通過確率（%）',
      min: 0,
      max: 100,
      admin: {
        position: 'sidebar',
        description:
          '補-4-14-1: 事前計算値。ラウンド終了ごとに CMS 側ジョブで算出する。補-4-14-2 によりアプリ側では 0/25/50/75/100% の 5 段階バッジに丸めて表示する',
      },
    },
    {
      name: 'holeScores',
      type: 'array',
      label: 'ホール別スコア',
      minRows: 0,
      maxRows: 18,
      labels: { singular: 'ホール', plural: 'ホール' },
      admin: {
        description:
          '3-2 Hole-by-Hole（18 ホール分）。補-3-2-1 の色分け、補-3-2-2 の OUT/IN 小計はこの配列から算出する',
      },
      fields: [
        {
          name: 'hole',
          type: 'number',
          label: 'ホール',
          required: true,
          min: 1,
          max: 18,
        },
        { name: 'par', type: 'number', label: 'パー', required: true, min: 3, max: 5 },
        { name: 'strokes', type: 'number', label: 'ストローク', required: true, min: 1 },
        { name: 'toPar', type: 'number', label: '対パー', required: true, defaultValue: 0 },
        {
          name: 'result',
          type: 'select',
          label: '結果',
          required: true,
          options: [
            { label: 'イーグル以上', value: 'eagle' },
            { label: 'バーディ', value: 'birdie' },
            { label: 'パー', value: 'par' },
            { label: 'ボギー', value: 'bogey' },
            { label: 'ダブルボギー以上', value: 'double_or_worse' },
          ],
          admin: { description: '補-3-2-1 の色分け区分' },
        },
      ],
    },
    {
      name: 'stats',
      type: 'group',
      label: 'スタッツ',
      admin: { description: '3-6 / 補-3-6-1: 選手別スタッツ 6 指標' },
      fields: [
        {
          name: 'drivingDistance',
          type: 'number',
          label: '平均飛距離（ヤード）',
          min: 0,
          admin: { description: '補-3-6-1' },
        },
        {
          name: 'fairwayHitRate',
          type: 'number',
          label: 'フェアウェイキープ率（%）',
          min: 0,
          max: 100,
          admin: { description: '補-3-6-1' },
        },
        {
          name: 'greenInRegulation',
          type: 'number',
          label: 'パーオン率（%）',
          min: 0,
          max: 100,
          admin: { description: '補-3-6-1' },
        },
        {
          name: 'puttsPerRound',
          type: 'number',
          label: '平均パット数',
          min: 0,
          admin: { description: '補-3-6-1' },
        },
        {
          name: 'sandSaveRate',
          type: 'number',
          label: 'サンドセーブ率（%）',
          min: 0,
          max: 100,
          admin: { description: '補-3-6-1' },
        },
        {
          name: 'scrambleRate',
          type: 'number',
          label: 'スクランブリング率（%）',
          min: 0,
          max: 100,
          admin: { description: '補-3-6-1' },
        },
      ],
    },
  ],
}

export default Scores
