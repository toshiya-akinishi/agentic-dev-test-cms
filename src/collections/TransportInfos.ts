import type { CollectionConfig } from 'payload'

import { anyone, staffOnly } from '../access'
import { locationField } from '../fields'

/**
 * 交通情報（ギャラリーバス・駐車場・シャトルバス）
 * 要求 1-15, 1-16 / 補-1-15-1, 補-1-16-1, 補-1-16-2, 補-1-17-1
 */
export const TransportInfos: CollectionConfig = {
  slug: 'transport-infos',
  labels: { singular: '交通情報', plural: '交通情報' },
  admin: {
    group: '現地情報',
    useAsTitle: 'name',
    defaultColumns: ['name', 'tournament', 'type', 'occupancyStatus', 'capacity'],
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
    },
    {
      name: 'type',
      type: 'select',
      label: '種別',
      required: true,
      index: true,
      options: [
        { label: 'ギャラリーバス', value: 'gallery_bus' },
        { label: '駐車場', value: 'parking' },
        { label: 'シャトルバス', value: 'shuttle' },
      ],
      admin: {
        description: '1-15 / 1-16 / 補-1-17-1。シャトルバスはアクセス画面のシャトル節に表示します',
      },
    },
    { name: 'name', type: 'text', label: '名称', required: true },
    locationField('location', '位置（緯度経度）', {
      description: '補-1-15-1 の乗降場所ピン / 補-1-16-1 の駐車場ピン',
    }),
    {
      name: 'timetable',
      type: 'array',
      label: '時刻表',
      admin: { description: '補-1-15-1。アプリ側で「次の発車」を強調表示します' },
      fields: [
        { name: 'time', type: 'text', label: '時刻', required: true },
        { name: 'note', type: 'text', label: '備考（往路 / 復路 など）' },
      ],
    },
    {
      name: 'capacity',
      type: 'number',
      label: '収容台数',
      min: 0,
      admin: { description: '補-1-16-1。駐車場の収容台数' },
    },
    {
      name: 'occupancyStatus',
      type: 'select',
      label: '混雑ステータス',
      options: [
        { label: '空き', value: 'vacant' },
        { label: '混雑', value: 'crowded' },
        { label: '満車', value: 'full' },
      ],
      admin: {
        description:
          '補-1-16-2。満車情報は自動計測せず CMS から手動更新します（主に type=parking で使用）',
      },
    },
    {
      name: 'fee',
      type: 'text',
      label: '料金',
      admin: { description: '補-1-15-1 の運賃 / 補-1-16-1 の駐車料金' },
    },
    {
      name: 'note',
      type: 'richText',
      label: '利用方法・備考',
      admin: { description: '補-1-16-1' },
    },
  ],
}

export default TransportInfos
