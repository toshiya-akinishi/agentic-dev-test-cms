import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'
import { locationField } from '../fields'

/**
 * ホール（要求 1-19, 1-20, 1-42）
 * `bounds` と `hazards` は 2D ショットビュー（補-1-42-1）の描画に使用する。
 */
export const Holes: CollectionConfig = {
  slug: 'holes',
  labels: { singular: 'ホール', plural: 'ホール' },
  admin: {
    group: '会場・コース',
    useAsTitle: 'number',
    defaultColumns: ['number', 'course', 'par', 'yards', 'handicap'],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      label: 'コース',
      required: true,
      index: true,
    },
    {
      name: 'number',
      type: 'number',
      label: 'ホール番号',
      required: true,
      index: true,
      min: 1,
      max: 18,
      admin: { description: '補-1-19-1。1〜18' },
    },
    { name: 'par', type: 'number', label: 'パー', required: true, min: 3, max: 5 },
    { name: 'yards', type: 'number', label: 'ヤード', required: true, min: 0 },
    {
      name: 'handicap',
      type: 'number',
      label: 'ハンディキャップ',
      min: 1,
      max: 18,
      admin: { description: '補-1-19-1。ホール難易度順位' },
    },
    {
      name: 'description',
      type: 'richText',
      label: '攻略ポイント',
      admin: { description: '補-1-19-2。ホール詳細に表示する攻略ポイント' },
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      label: 'ホール全景（写真）',
      admin: { description: '補-1-20-1。写真とイラストはタブで切替' },
    },
    {
      name: 'illustration',
      type: 'upload',
      relationTo: 'media',
      label: 'ホール全景（イラスト）',
      admin: { description: '補-1-20-1' },
    },
    locationField('teeLocation', 'ティー位置', {
      description: '1-42。ショットビューの起点',
    }),
    locationField('greenLocation', 'グリーン位置', {
      description: '1-42。ショットビューの着地目標',
    }),
    {
      name: 'bounds',
      type: 'group',
      label: '描画範囲（バウンディングボックス）',
      admin: {
        description:
          '補-1-42-1。2D ショットビューで緯度経度 → SVG 座標へ線形変換するための矩形。南西 (sw) と北東 (ne) の 2 点で指定します',
      },
      fields: [
        {
          name: 'swLat',
          type: 'number',
          label: '南西 緯度',
          min: -90,
          max: 90,
          admin: { step: 0.0000001 },
        },
        {
          name: 'swLng',
          type: 'number',
          label: '南西 経度',
          min: -180,
          max: 180,
          admin: { step: 0.0000001 },
        },
        {
          name: 'neLat',
          type: 'number',
          label: '北東 緯度',
          min: -90,
          max: 90,
          admin: { step: 0.0000001 },
        },
        {
          name: 'neLng',
          type: 'number',
          label: '北東 経度',
          min: -180,
          max: 180,
          admin: { step: 0.0000001 },
        },
      ],
    },
    {
      name: 'hazards',
      type: 'array',
      label: 'ハザード',
      admin: {
        description: '補-1-42-1。ショットビューに重畳するポリゴン（バンカー / 池 / OB / 樹木）',
      },
      fields: [
        {
          name: 'type',
          type: 'select',
          label: '種別',
          required: true,
          options: [
            { label: 'バンカー', value: 'bunker' },
            { label: '池・ウォーターハザード', value: 'water' },
            { label: 'OB', value: 'ob' },
            { label: '樹木', value: 'tree' },
          ],
        },
        {
          name: 'polygon',
          type: 'json',
          label: 'ポリゴン座標',
          admin: {
            description: '[[緯度, 経度], ...] の配列。閉じた多角形として描画します（補-1-42-1）',
          },
        },
      ],
    },
  ],
}

export default Holes
