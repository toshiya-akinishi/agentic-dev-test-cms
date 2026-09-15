import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'
import { locationField } from '../fields'

/**
 * 会場（要求 1-17, 1-22 / 補-1-14-1, 補-1-17-1）
 */
export const Venues: CollectionConfig = {
  slug: 'venues',
  labels: { singular: '会場', plural: '会場' },
  admin: {
    group: '会場・コース',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'address'],
  },
  access: {
    read: anyone,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    { name: 'name', type: 'text', label: '会場名', required: true },
    {
      name: 'slug',
      type: 'text',
      label: 'スラッグ',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'URL 用の一意な識別子' },
    },
    { name: 'address', type: 'text', label: '住所' },
    locationField('location', '位置（緯度経度）', {
      required: true,
      description: '1-17。会場マップ（1-22）の中心座標としても使用します',
    }),
    {
      name: 'accessTrain',
      type: 'richText',
      label: 'アクセス（電車）',
      admin: { description: '補-1-17-1。アクセスは 電車 / 車 / シャトルバス の 3 セクション' },
    },
    {
      name: 'accessCar',
      type: 'richText',
      label: 'アクセス（車）',
      admin: { description: '補-1-17-1' },
    },
    {
      name: 'shuttleTimetable',
      type: 'array',
      label: 'シャトルバス時刻表',
      admin: {
        description:
          '補-1-17-1。大会ごとのシャトル運行は transport-infos（type=shuttle）を使用し、ここは会場常設の運行を記載します',
      },
      fields: [
        { name: 'time', type: 'text', label: '時刻', required: true },
        { name: 'from', type: 'text', label: '出発地' },
        { name: 'to', type: 'text', label: '到着地' },
        { name: 'note', type: 'text', label: '備考' },
      ],
    },
    {
      name: 'venueMapImage',
      type: 'upload',
      relationTo: 'media',
      label: '会場マップ画像',
      admin: { description: '1-22' },
    },
    {
      name: 'googleMapUrl',
      type: 'text',
      label: 'Google マップ URL',
      admin: { description: '1-14 / 補-1-14-1。外部マップ起動と QR 表示に使用します' },
    },
  ],
}

export default Venues
