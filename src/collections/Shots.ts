import type { CollectionBeforeChangeHook, CollectionConfig, SelectField } from 'payload'

import { anyone, operatorOnly } from '../access'
import { locationField } from '../fields'

/** 使用クラブ（3-3 速報でクラブ名を出すための選択肢） */
const CLUB_OPTIONS: SelectField['options'] = [
  { label: 'ドライバー (1W)', value: 'driver' },
  { label: '3番ウッド (3W)', value: '3w' },
  { label: '5番ウッド (5W)', value: '5w' },
  { label: 'ユーティリティ (UT)', value: 'utility' },
  { label: '3番アイアン (3I)', value: '3i' },
  { label: '4番アイアン (4I)', value: '4i' },
  { label: '5番アイアン (5I)', value: '5i' },
  { label: '6番アイアン (6I)', value: '6i' },
  { label: '7番アイアン (7I)', value: '7i' },
  { label: '8番アイアン (8I)', value: '8i' },
  { label: '9番アイアン (9I)', value: '9i' },
  { label: 'ピッチングウェッジ (PW)', value: 'pw' },
  { label: 'アプローチウェッジ (AW)', value: 'aw' },
  { label: 'サンドウェッジ (SW)', value: 'sw' },
  { label: 'ロブウェッジ (LW)', value: 'lw' },
  { label: 'パター (PT)', value: 'putter' },
]

/** ライ（打点／着地点の状況） */
const LIE_OPTIONS: SelectField['options'] = [
  { label: 'ティー', value: 'tee' },
  { label: 'フェアウェイ', value: 'fairway' },
  { label: 'ラフ', value: 'rough' },
  { label: 'バンカー', value: 'bunker' },
  { label: 'グリーン', value: 'green' },
  { label: 'ハザード', value: 'hazard' },
  { label: 'OB', value: 'ob' },
]

const CLUB_LABEL_JA: Record<string, string> = {
  driver: 'ドライバー',
  '3w': '3番ウッド',
  '5w': '5番ウッド',
  utility: 'ユーティリティ',
  '3i': '3番アイアン',
  '4i': '4番アイアン',
  '5i': '5番アイアン',
  '6i': '6番アイアン',
  '7i': '7番アイアン',
  '8i': '8番アイアン',
  '9i': '9番アイアン',
  pw: 'ピッチングウェッジ',
  aw: 'アプローチウェッジ',
  sw: 'サンドウェッジ',
  lw: 'ロブウェッジ',
  putter: 'パター',
}

const LIE_LABEL_JA: Record<string, string> = {
  tee: 'ティーイングエリア',
  fairway: 'フェアウェイ',
  rough: 'ラフ',
  bunker: 'バンカー',
  green: 'グリーン',
  hazard: 'ハザード',
  ob: 'OB',
}

/**
 * AI 解説のテンプレート生成（補-1-40-1 / ADR-003）
 * 実 LLM は呼ばず、ショット属性から 1 文を組み立てる（補-1-40-2）。
 */
const buildAiCommentary = (d: Record<string, unknown>): string => {
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

  const shotType = str(d.shotType)
  const club = CLUB_LABEL_JA[str(d.club) ?? ''] ?? undefined
  const distance = num(d.distanceYards)
  const remaining = num(d.remainingYards)
  const endLie = LIE_LABEL_JA[str(d.endLie) ?? ''] ?? undefined
  const hole = num(d.hole)
  const shotNo = num(d.shotNo)

  const head = hole && shotNo ? `${hole}番ホール${shotNo}打目、` : ''

  if (shotType === 'putt') {
    const tail = remaining !== undefined ? `残り${remaining}ヤードからの` : ''
    return `${head}${tail}パットをグリーン上のラインを読み切って丁寧に転がした一打。`
  }
  if (shotType === 'penalty') {
    return `${head}${endLie ?? 'コース外'}へ運んでしまいペナルティとなった痛恨の一打。`
  }

  const clubPart = club ? `${club}で` : ''
  const distancePart = distance !== undefined ? `${distance}ヤードを` : ''
  const endPart = endLie ? `${endLie}へ運んだ` : '狙い通りに運んだ'
  const remainPart = remaining !== undefined ? `残り${remaining}ヤードに付ける` : ''

  return `${head}${distancePart}${clubPart}${endPart}${remainPart ? `、${remainPart}` : ''}精度の高いショット。`
}

/**
 * 保存時に AI 解説を自動生成する（補-1-40-1）。
 * `aiCommentary` が空のときだけ生成し、運営が上書き入力した場合は
 * `aiCommentaryGenerated` を false にして以後の自動上書きを行わない。
 */
const generateAiCommentary: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const d = data as Record<string, unknown>
  const current = typeof d.aiCommentary === 'string' ? d.aiCommentary.trim() : ''

  if (current === '') {
    d.aiCommentary = buildAiCommentary(d)
    d.aiCommentaryGenerated = true
    return d
  }

  const previous = (originalDoc as Record<string, unknown> | undefined)?.aiCommentary
  if (typeof previous === 'string' && previous !== d.aiCommentary) {
    // CMS で書き換えられた＝手動入力
    d.aiCommentaryGenerated = false
  }
  return d
}

/**
 * ショット（1 打ごと） — 要求 3-3, 1-37, 1-38, 1-40, 1-42, 1-46
 * docs/02-data-model.md C章 `shots` に対応。
 */
export const Shots: CollectionConfig = {
  slug: 'shots',
  labels: { singular: 'ショット', plural: 'ショット' },
  admin: {
    group: 'スコア・ショット',
    useAsTitle: 'resultText',
    defaultColumns: ['player', 'round', 'hole', 'shotNo', 'shotType', 'club', 'occurredAt'],
    description: '1 打ごとのショットデータ（3-3 Play-by-play / 1-42 ショットビュー）',
  },
  // docs/02-data-model.md ロール別アクセス制御: ショットは operator（admin/operator）の CRUD 対象（補-8-9-1）
  access: {
    read: anyone,
    create: operatorOnly,
    update: operatorOnly,
    delete: operatorOnly,
  },
  hooks: {
    beforeChange: [generateAiCommentary],
  },
  fields: [
    {
      name: 'round',
      type: 'relationship',
      relationTo: 'rounds',
      label: 'ラウンド',
      required: true,
      index: true, // Play-by-play フィードはラウンド単位で引く
      admin: { description: '3-3 対象ラウンド' },
    },
    {
      name: 'player',
      type: 'relationship',
      relationTo: 'players',
      label: '選手',
      required: true,
      index: true, // 補-3-3-3 お気に入り選手フィルタで引く
      admin: { description: '3-3 対象選手' },
    },
    {
      name: 'hole',
      type: 'number',
      label: 'ホール',
      required: true,
      min: 1,
      max: 18,
      index: true,
      admin: { description: '3-3 / 補-1-46-1 ホール切替' },
    },
    {
      name: 'shotNo',
      type: 'number',
      label: '打数（何打目）',
      required: true,
      min: 1,
      admin: { description: '補-3-3-1 「ホール × ショット順」の時系列フィード' },
    },
    {
      name: 'shotType',
      type: 'select',
      label: 'ショット種別',
      required: true,
      options: [
        { label: 'ティーショット', value: 'tee' },
        { label: 'アプローチ', value: 'approach' },
        { label: 'バンカーショット', value: 'bunker' },
        { label: 'リカバリー', value: 'recovery' },
        { label: 'パット', value: 'putt' },
        { label: 'ペナルティ', value: 'penalty' },
      ],
      admin: { description: '補-1-42-2 弾道の高さ係数の決定にも使用' },
    },
    {
      name: 'club',
      type: 'select',
      label: '使用クラブ',
      options: CLUB_OPTIONS,
      admin: { description: '3-3 速報表示（使用クラブ）' },
    },
    {
      name: 'distanceYards',
      type: 'number',
      label: '飛距離（ヤード）',
      min: 0,
      admin: { description: '3-3 / 1-42 飛距離ラベル' },
    },
    {
      name: 'carryYards',
      type: 'number',
      label: 'キャリー（ヤード）',
      min: 0,
      admin: { description: '1-42 弾道表示の補助値' },
    },
    locationField('startLocation', '打点座標', {
      required: true,
      description: '1-42 / 補-1-42-1: 弾道の始点（point は SQLite 非対応のため lat/lng の group）',
    }),
    locationField('endLocation', '停止点座標', {
      required: true,
      description: '1-46 / 補-1-42-1: ボールの落下・停止地点',
    }),
    {
      name: 'startLie',
      type: 'select',
      label: '打点のライ',
      options: LIE_OPTIONS,
      admin: { description: '3-3 速報テキストの生成に使用' },
    },
    {
      name: 'endLie',
      type: 'select',
      label: '着地のライ',
      options: LIE_OPTIONS,
      admin: { description: '補-3-3-1 「着地ライ」の表示' },
    },
    {
      name: 'remainingYards',
      type: 'number',
      label: '残り距離（ヤード）',
      min: 0,
      admin: { description: '補-3-3-1 「残り距離 → 飛距離 → 着地ライ」の表示' },
    },
    {
      name: 'resultText',
      type: 'text',
      label: '結果テキスト（速報文）',
      admin: {
        description:
          '3-3 / 補-3-3-2: CMS 入力を優先し、未入力時はアプリ側で属性からテンプレート生成する（例: 1H 2打目 7I 152y → グリーン 残り3.5m）',
      },
    },
    {
      name: 'aiCommentary',
      type: 'textarea',
      label: 'AI 解説',
      admin: {
        description:
          '1-40 / 補-1-40-1: 保存時フックでショット属性からテンプレート生成（実 LLM 呼び出しなし・ADR-003）。CMS で上書き編集可。補-1-40-2 で 40〜80 文字程度・1 文',
      },
    },
    {
      name: 'aiCommentaryGenerated',
      type: 'checkbox',
      label: 'AI 解説は自動生成',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: '補-1-40-1: 自動生成された文のままなら true。CMS で上書きすると false になる',
      },
    },
    {
      name: 'occurredAt',
      type: 'date',
      label: '打球時刻',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: '3-3 / 補-3-3-4: 時系列フィードの並び順と 15 秒ポーリングの差分取得に使用',
      },
    },
    {
      name: 'trackman',
      type: 'group',
      label: 'Trackman 計測データ',
      admin: {
        description:
          '1-39 / 補-1-39-1: 値が存在するショットのみ計測データパネルを表示する（MOCK・補-1-39-2 により値のないショットが多い）',
      },
      fields: [
        { name: 'ballSpeed', type: 'number', label: 'ボール初速（m/s）', min: 0 },
        { name: 'launchAngle', type: 'number', label: '打ち出し角（度）' },
        { name: 'spinRate', type: 'number', label: 'スピン量（rpm）', min: 0 },
        { name: 'apexHeight', type: 'number', label: '最高到達点（m）', min: 0 },
      ],
    },
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'videos',
      label: 'ショット動画',
      admin: {
        description:
          '1-38 / 3-8: 補-3-8-2 により動画が無いショットには導線を表示しない（グレーアウトではなく非表示）',
      },
    },
  ],
}

export default Shots
