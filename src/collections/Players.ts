import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { anyone, editorOnly } from '../access'
import { cutProbabilityEndpoint } from '../endpoints/cutProbability'

/** 推奨レギュレーションの最小辺（px）。補-8-14-3 */
const MIN_PHOTO_PX = 800
/** 正方形とみなす縦横比の許容誤差 */
const SQUARE_TOLERANCE = 0.05

/**
 * 選手写真のレギュレーション（補-8-14-3: 1:1 / 800px 以上 / 背景統一 / 顔が中央 40%）を
 * サーバ側でチェックし、`photoRegulationWarning` に警告文を記録する。
 * 保存はブロックしない（「バリデーションで警告する」＝非ブロッキング）。
 * 背景統一・顔の位置は自動判定できないため、フィールド説明文でのガイドラインに留める。
 */
const checkPhotoRegulation: CollectionBeforeChangeHook = async ({ data, req }) => {
  const d = data as Record<string, unknown>
  const photo = d.photo as string | number | { id?: string | number } | null | undefined

  if (!photo) {
    d.photoRegulationWarning = null
    return d
  }

  const mediaId = typeof photo === 'object' ? photo?.id : photo
  if (mediaId === undefined || mediaId === null) return d

  try {
    const media = await req.payload.findByID({
      collection: 'media',
      id: mediaId,
      depth: 0,
      overrideAccess: true,
    })
    const width = typeof media?.width === 'number' ? media.width : undefined
    const height = typeof media?.height === 'number' ? media.height : undefined

    if (width === undefined || height === undefined) {
      d.photoRegulationWarning = null
      return d
    }

    const warnings: string[] = []
    if (width < MIN_PHOTO_PX || height < MIN_PHOTO_PX) {
      warnings.push(
        `推奨サイズ ${MIN_PHOTO_PX}×${MIN_PHOTO_PX}px 以上を下回っています（実際: ${width}×${height}px）`,
      )
    }
    const ratioDiff = Math.abs(width - height) / Math.max(width, height)
    if (ratioDiff > SQUARE_TOLERANCE) {
      warnings.push(`正方形（1:1）ではありません（実際: ${width}×${height}px）`)
    }

    d.photoRegulationWarning = warnings.length > 0 ? `補-8-14-3: ${warnings.join(' / ')}` : null
  } catch {
    // メディア参照エラーで保存自体をブロックしない
  }

  return d
}

/**
 * 選手（要求 4-1, 4-6, 4-7, 8-14）
 * docs/02-data-model.md C章 `players` に対応。
 */
export const Players: CollectionConfig = {
  slug: 'players',
  labels: { singular: '選手', plural: '選手' },
  admin: {
    group: '選手',
    useAsTitle: 'name',
    defaultColumns: ['name', 'nameEn', 'turnedProYear', 'isActive', 'updatedAt'],
    description: '選手マスタ（4-1 / 4-6 / 4-7 / 8-14）',
  },
  // GET /api/players/cut-probability（4-14 / 補-4-14-1, 補-4-14-2 / T-13-7）。
  // ルート登録だと先頭セグメント `players` が players コレクションの `/:id` に奪われるため、
  // rankings.ts と同様にコレクション自身の endpoints に相対パスで登録する
  endpoints: [cutProbabilityEndpoint],
  // docs/02-data-model.md ロール別アクセス制御: 選手は editor（admin/editor）の CRUD 対象（補-8-9-1）
  access: {
    read: anyone,
    create: editorOnly,
    update: editorOnly,
    delete: editorOnly,
  },
  hooks: {
    beforeChange: [checkPhotoRegulation],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: '選手名',
      required: true,
      index: true,
      admin: { description: '4-7 プロフィール（和名）' },
    },
    {
      name: 'nameEn',
      type: 'text',
      label: '選手名（英字）',
      admin: { description: '補-4-7-2 氏名（和/英）' },
    },
    {
      name: 'slug',
      type: 'text',
      label: 'スラッグ',
      required: true,
      unique: true,
      index: true,
      admin: { description: '4-1 選手詳細の URL 識別子' },
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      label: '顔写真',
      admin: {
        description:
          '8-14 / 補-8-14-1, 補-8-14-3: 推奨レギュレーション = 正方形（1:1）・800×800px 以上・' +
          '背景統一・顔が中央 40% に収まるよう撮影。800px 未満または非正方形の場合は保存後に' +
          '下の「写真レギュレーション警告」に表示されます（保存はブロックされません）。' +
          '未登録時はアプリ側でイニシャル表示のプレースホルダを出します（写真なしの空欄を作らない）',
      },
    },
    {
      name: 'photoRegulationWarning',
      type: 'text',
      label: '写真レギュレーション警告',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          '補-8-14-3。保存時に自動チェックされます（800px 未満 / 非正方形の場合に表示）。' +
          '背景統一・顔の中央配置は自動判定できないため目視で確認してください',
        condition: (data) => Boolean(data?.photoRegulationWarning),
      },
    },
    {
      name: 'birthDate',
      type: 'date',
      label: '生年月日',
      admin: { description: '補-4-7-2（年齢は生年月日から算出）' },
    },
    {
      name: 'height',
      type: 'number',
      label: '身長（cm）',
      min: 0,
      admin: { description: '補-4-7-2' },
    },
    {
      name: 'weight',
      type: 'number',
      label: '体重（kg）',
      min: 0,
      admin: { description: '補-4-7-2' },
    },
    {
      name: 'birthPlace',
      type: 'text',
      label: '出身地',
      admin: { description: '補-4-7-2' },
    },
    {
      name: 'turnedProYear',
      type: 'number',
      label: 'プロ転向年',
      min: 1900,
      max: 2100,
      admin: { description: '補-4-7-2' },
    },
    {
      name: 'bio',
      type: 'richText',
      label: 'プロフィール本文',
      admin: { description: '4-7 選手詳細のプロフィールタブ' },
    },
    {
      name: 'careerHighlights',
      type: 'array',
      label: '経歴ハイライト',
      labels: { singular: '経歴', plural: '経歴' },
      admin: { description: '補-4-7-2 経歴ハイライト' },
      fields: [
        { name: 'year', type: 'number', label: '年', required: true, min: 1900, max: 2100 },
        { name: 'title', type: 'text', label: '内容', required: true },
      ],
    },
    {
      name: 'equipment',
      type: 'array',
      label: '使用ギア',
      labels: { singular: 'ギア', plural: 'ギア' },
      admin: {
        description:
          '4-6 / 補-4-6-1: カテゴリごとにブランド・モデル・写真。補-4-6-2 で users.golfClubSetting と突き合わせて「自分と同じ」バッジを出す',
      },
      fields: [
        {
          name: 'category',
          type: 'select',
          label: 'カテゴリ',
          required: true,
          options: [
            { label: 'ドライバー', value: 'driver' },
            { label: 'アイアン', value: 'iron' },
            { label: 'ウェッジ', value: 'wedge' },
            { label: 'パター', value: 'putter' },
            { label: 'ボール', value: 'ball' },
            { label: 'ウェア', value: 'wear' },
            { label: 'シューズ', value: 'shoes' },
          ],
        },
        { name: 'brand', type: 'text', label: 'ブランド', required: true },
        { name: 'model', type: 'text', label: 'モデル' },
        { name: 'photo', type: 'upload', relationTo: 'media', label: '写真' },
      ],
    },
    {
      name: 'sponsors',
      type: 'relationship',
      relationTo: 'sponsors',
      hasMany: true,
      label: 'スポンサー',
      admin: { description: '8-3 選手に紐づくスポンサー' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      label: '現役',
      defaultValue: true,
      admin: { position: 'sidebar', description: '4-1 選手一覧の表示対象' },
    },
  ],
}

export default Players
