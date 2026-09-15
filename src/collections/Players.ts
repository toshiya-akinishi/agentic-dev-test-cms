import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'

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
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
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
          '8-14 / 補-8-14-1: 正方形 1:1・最小 800×800 の高解像度画像。未登録時はアプリ側でイニシャル表示',
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
